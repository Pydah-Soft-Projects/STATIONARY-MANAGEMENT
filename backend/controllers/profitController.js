const asyncHandler = require('express-async-handler');
const { Transaction } = require('../models/transactionModel');
const { StockEntry } = require('../models/stockEntryModel');
const { Product } = require('../models/productModel');
const mongoose = require('mongoose');

// @desc    Get profit statistics
// @route   GET /api/profit/stats
// @access  Private/Admin
const getProfitStats = asyncHandler(async (req, res) => {
  const { startDate, endDate, collegeId } = req.query;
  const filter = {
    isPaid: true,
    transactionType: { $nin: ['college_transfer', 'branch_transfer'] }
  }; // Only paid transactions count for profit, exclude stock transfers

  if (collegeId) {
    filter.collegeId = new mongoose.Types.ObjectId(collegeId);
  }

  if (startDate || endDate) {
    filter.transactionDate = {};
    if (startDate) filter.transactionDate.$gte = new Date(startDate);
    if (endDate) filter.transactionDate.$lte = new Date(endDate);
  }

  // Fetch all relevant transactions
  const transactions = await Transaction.find(filter).lean();

  if (!transactions.length) {
    return res.json({ monthly: [], daily: [], summary: { totalRevenue: 0, totalCOGS: 0, grossProfit: 0 } });
  }

  // Get unique product IDs to fetch stock entry history and product prices
  const productIds = new Set();
  transactions.forEach(txn => {
    txn.items.forEach(item => {
      if (item.productId) productIds.add(item.productId.toString());
      // Also collect IDs from set components for multi-product sets
      if (item.isSet && item.setComponents && item.setComponents.length > 0) {
        item.setComponents.forEach(comp => {
          if (comp.productId) productIds.add(comp.productId.toString());
        });
      }
    });
  });

  // Fetch stock entries for these products to determine COGS
  // In a real-world scenario, we'd want the price at the time of transaction.
  // For now, we'll take the most recent purchase price before or at the transaction date.
  // This is an approximation.
  const stockEntries = await StockEntry.find({
    product: { $in: Array.from(productIds) }
  }).sort({ createdAt: -1 }).lean();

  // Fetch the products to get their original selling prices for component-level revenue mapping
  const products = await Product.find({
    _id: { $in: Array.from(productIds) }
  }).lean();

  // Helper to find COGS for an item at a specific date
  const getCOGSForItem = (productId, date) => {
    const entry = stockEntries.find(e =>
      e.product.toString() === productId.toString() &&
      new Date(e.createdAt) <= new Date(date)
    );
    if (!entry) return 0;
    if (entry.totalCost && entry.quantity) {
      return entry.totalCost / entry.quantity;
    }
    const gst = Number(entry.gstPercent) || 0;
    return (entry.purchasePrice || 0) * (1 + gst / 100);
  };

  // Helper to find selling price for an item
  const getRevenueForItem = (productId) => {
    const product = products.find(p => p._id.toString() === productId.toString());
    return product ? product.price : 0;
  };

  const dailyMap = new Map();
  const monthlyMap = new Map();
  let totalRevenue = 0;
  let totalCOGS = 0;

  transactions.forEach(txn => {
    const date = new Date(txn.transactionDate);
    const dayKey = date.toISOString().split('T')[0];
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    let txnRevenue = txn.totalAmount || 0;
    let txnCOGS = 0;

    txn.items.forEach(item => {
      let itemTotalCOGS = 0;
      if (item.isSet && item.setComponents && item.setComponents.length > 0) {
        // For sets, sum COGS of all components
        item.setComponents.forEach(comp => {
          const compUnitCOGS = getCOGSForItem(comp.productId, txn.transactionDate);
          itemTotalCOGS += compUnitCOGS * (comp.quantity || 0) * (item.quantity || 0);
        });
      } else {
        // Regular product
        const unitCOGS = getCOGSForItem(item.productId, txn.transactionDate);
        itemTotalCOGS = unitCOGS * (item.quantity || 0);
      }
      txnCOGS += itemTotalCOGS;
    });

    totalRevenue += txnRevenue;
    totalCOGS += txnCOGS;

    // Update daily stats
    if (!dailyMap.has(dayKey)) {
      dailyMap.set(dayKey, { date: dayKey, revenue: 0, cogs: 0, profit: 0, count: 0, items: new Map() });
    }
    const dayData = dailyMap.get(dayKey);
    dayData.revenue += txnRevenue;
    dayData.cogs += txnCOGS;
    dayData.profit += (txnRevenue - txnCOGS);
    dayData.count += 1;

    // Item-level daily breakdown
    txn.items.forEach(item => {
      const productId = item.productId?.toString();
      if (!productId) return;

      if (!dayData.items.has(productId)) {
        dayData.items.set(productId, {
          productId,
          name: item.name || 'Unknown Product',
          quantity: 0,
          revenue: 0,
          cogs: 0,
          profit: 0,
          isSet: !!item.isSet
        });
      }

      const itemData = dayData.items.get(productId);
      let rowCOGS = 0;

      if (item.isSet && item.setComponents && item.setComponents.length > 0) {
        if (!itemData.components) itemData.components = new Map();

        item.setComponents.forEach(comp => {
          const compId = comp.productId?.toString() || comp.name;
          if (!itemData.components.has(compId)) {
            itemData.components.set(compId, {
              name: comp.name || 'Unknown Component',
              quantity: 0,
              revenue: 0,
              cogs: 0,
              profit: 0
            });
          }

          const compData = itemData.components.get(compId);
          const compUnitCOGS = getCOGSForItem(comp.productId, txn.transactionDate);
          const compTotalCOGS = compUnitCOGS * (comp.quantity || 0) * (item.quantity || 0);

          const compUnitRev = getRevenueForItem(comp.productId);
          const compTotalRev = compUnitRev * (comp.quantity || 0) * (item.quantity || 0);

          compData.quantity += (comp.quantity || 0) * (item.quantity || 0);
          compData.revenue += compTotalRev;
          compData.cogs += compTotalCOGS;
          compData.profit += (compTotalRev - compTotalCOGS);

          rowCOGS += compTotalCOGS;
        });
      } else {
        const unitCOGS = getCOGSForItem(item.productId, txn.transactionDate);
        rowCOGS = unitCOGS * (item.quantity || 0);
      }

      const rowRevenue = (item.price || 0) * (item.quantity || 0);

      itemData.quantity += (item.quantity || 0);
      itemData.revenue += rowRevenue;
      itemData.cogs += rowCOGS;
      itemData.profit += (rowRevenue - rowCOGS);
    });

    // Update monthly stats
    if (!monthlyMap.has(monthKey)) {
      monthlyMap.set(monthKey, { month: monthKey, revenue: 0, cogs: 0, profit: 0, count: 0, items: new Map() });
    }
    const monthData = monthlyMap.get(monthKey);
    monthData.revenue += txnRevenue;
    monthData.cogs += txnCOGS;
    monthData.profit += (txnRevenue - txnCOGS);
    monthData.count += 1;

    // Item-level monthly breakdown (extracting set components as individual sold products)
    txn.items.forEach(item => {
      if (item.isSet && item.setComponents && item.setComponents.length > 0) {
        item.setComponents.forEach(comp => {
          const compId = comp.productId?.toString() || comp.name;
          if (!monthData.items.has(compId)) {
            monthData.items.set(compId, {
              productId: comp.productId,
              name: comp.name || 'Unknown Component',
              quantity: 0,
              revenue: 0,
              cogs: 0,
              profit: 0
            });
          }
          const compData = monthData.items.get(compId);
          const compUnitCOGS = getCOGSForItem(comp.productId, txn.transactionDate);
          const compTotalCOGS = compUnitCOGS * (comp.quantity || 0) * (item.quantity || 0);

          const compUnitRev = getRevenueForItem(comp.productId);
          const compTotalRev = compUnitRev * (comp.quantity || 0) * (item.quantity || 0);

          compData.quantity += (comp.quantity || 0) * (item.quantity || 0);
          compData.revenue += compTotalRev;
          compData.cogs += compTotalCOGS;
          compData.profit += (compTotalRev - compTotalCOGS);
        });
      } else {
        const productId = item.productId?.toString();
        if (!productId) return;

        if (!monthData.items.has(productId)) {
          monthData.items.set(productId, {
            productId,
            name: item.name || 'Unknown Product',
            quantity: 0,
            revenue: 0,
            cogs: 0,
            profit: 0
          });
        }
        const itemData = monthData.items.get(productId);
        const unitCOGS = getCOGSForItem(item.productId, txn.transactionDate);
        const rowCOGS = unitCOGS * (item.quantity || 0);
        const rowRevenue = (item.price || 0) * (item.quantity || 0);

        itemData.quantity += (item.quantity || 0);
        itemData.revenue += rowRevenue;
        itemData.cogs += rowCOGS;
        itemData.profit += (rowRevenue - rowCOGS);
      }
    });
  });

  // Convert daily maps back to arrays
  const dailyArray = Array.from(dailyMap.values()).map(day => ({
    ...day,
    items: Array.from(day.items.values()).map(item => ({
      ...item,
      components: item.components ? Array.from(item.components.values()) : []
    })).sort((a, b) => b.profit - a.profit)
  }));

  // Get all unique months that have data for the filter
  const availableMonthsData = await Transaction.aggregate([
    {
      $match: {
        isPaid: true,
        transactionType: { $nin: ['college_transfer', 'branch_transfer'] }
      }
    },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m", date: "$transactionDate" }
        }
      }
    },
    { $sort: { "_id": -1 } }
  ]);
  const availableMonths = availableMonthsData.map(m => m._id);

  const monthlyArray = Array.from(monthlyMap.values()).map(month => ({
    ...month,
    items: Array.from(month.items.values()).sort((a, b) => b.quantity - a.quantity)
  })).sort((a, b) => b.month.localeCompare(a.month));

  res.json({
    summary: {
      totalRevenue,
      totalCOGS,
      grossProfit: totalRevenue - totalCOGS,
      margin: totalRevenue > 0 ? ((totalRevenue - totalCOGS) / totalRevenue) * 100 : 0,
      totalTransactions: transactions.length
    },
    availableMonths,
    monthly: monthlyArray,
    daily: dailyArray.sort((a, b) => b.date.localeCompare(a.date))
  });
});

module.exports = {
  getProfitStats
};
