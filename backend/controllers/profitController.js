const asyncHandler = require('express-async-handler');
const { Transaction } = require('../models/transactionModel');
const { StockEntry } = require('../models/stockEntryModel');
const mongoose = require('mongoose');

// @desc    Get profit statistics
// @route   GET /api/profit/stats
// @access  Private/Admin
const getProfitStats = asyncHandler(async (req, res) => {
  const { startDate, endDate, collegeId } = req.query;
  const filter = { isPaid: true }; // Only paid transactions count for profit

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

  // Get unique product IDs to fetch stock entry history
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

  // Helper to find COGS for an item at a specific date
  const getCOGSForItem = (productId, date) => {
    const entry = stockEntries.find(e => 
      e.product.toString() === productId.toString() && 
      new Date(e.createdAt) <= new Date(date)
    );
    return entry ? entry.purchasePrice : 0;
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
        item.setComponents.forEach(comp => {
          const compUnitCOGS = getCOGSForItem(comp.productId, txn.transactionDate);
          rowCOGS += compUnitCOGS * (comp.quantity || 0) * (item.quantity || 0);
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
      monthlyMap.set(monthKey, { month: monthKey, revenue: 0, cogs: 0, profit: 0, count: 0 });
    }
    const monthData = monthlyMap.get(monthKey);
    monthData.revenue += txnRevenue;
    monthData.cogs += txnCOGS;
    monthData.profit += (txnRevenue - txnCOGS);
    monthData.count += 1;
  });

  // Convert daily maps back to arrays
  const dailyArray = Array.from(dailyMap.values()).map(day => ({
    ...day,
    items: Array.from(day.items.values()).sort((a, b) => b.profit - a.profit)
  }));

  res.json({
    summary: {
      totalRevenue,
      totalCOGS,
      grossProfit: totalRevenue - totalCOGS,
      margin: totalRevenue > 0 ? ((totalRevenue - totalCOGS) / totalRevenue) * 100 : 0,
      totalTransactions: transactions.length
    },
    monthly: Array.from(monthlyMap.values()).sort((a, b) => b.month.localeCompare(a.month)),
    daily: dailyArray.sort((a, b) => b.date.localeCompare(a.date))
  });
});

module.exports = {
  getProfitStats
};
