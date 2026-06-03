const mongoose = require('mongoose');
const { GeneralDistribution } = require('../models/generalDistributionModel');
const { GeneralProduct } = require('../models/generalProductModel');
const { College } = require('../models/collegeModel');
const asyncHandler = require('express-async-handler');

function buildDistributionReportMatch(query) {
  const { collegeId, startDate, endDate } = query;
  const match = {};
  if (collegeId) {
    if (!mongoose.Types.ObjectId.isValid(collegeId)) {
      return { error: 'Invalid college ID' };
    }
    match.collegeId = new mongoose.Types.ObjectId(collegeId);
  }
  if (startDate || endDate) {
    match.distributionDate = {};
    if (startDate) match.distributionDate.$gte = new Date(startDate);
    if (endDate) match.distributionDate.$lte = new Date(`${endDate}T23:59:59.999`);
  }
  return { match };
}

function mergeGroupedReport(distributionCounts, itemStats, keyName) {
  const countMap = Object.fromEntries(
    distributionCounts.map((d) => [d._id, d.distributionCount])
  );
  const itemsMap = Object.fromEntries(
    itemStats.map((d) => [d._id, d.items || []])
  );
  const allKeys = new Set([...Object.keys(countMap), ...Object.keys(itemsMap)]);
  const rows = [...allKeys].map((key) => {
    const items = itemsMap[key] || [];
    const totalItemQuantity = items.reduce((s, it) => s + (it.quantity || 0), 0);
    return {
      [keyName]: key,
      distributionCount: countMap[key] || 0,
      totalItemQuantity,
      items,
    };
  });
  rows.sort((a, b) => b.totalItemQuantity - a.totalItemQuantity);
  return rows;
}

function mergeByItemReport(itemDistributionCounts, itemAuthRecipientStats) {
  const countMap = Object.fromEntries(
    (itemDistributionCounts || []).map((d) => [d._id, d.distributionCount])
  );

  const itemMap = {};
  for (const row of itemAuthRecipientStats || []) {
    const itemName = row._id?.itemName;
    const authorizedBy = row._id?.authorizedBy;
    if (!itemName || !authorizedBy) continue;

    if (!itemMap[itemName]) {
      itemMap[itemName] = { itemName, authorizedBy: [], totalItemQuantity: 0 };
    }

    const recipients = (row.recipients || [])
      .map((r) => ({ name: r.name, quantity: r.quantity || 0 }))
      .sort((a, b) => b.quantity - a.quantity);

    const authTotal = recipients.reduce((s, r) => s + r.quantity, 0);
    itemMap[itemName].authorizedBy.push({
      authorizedBy,
      distributionCount: row.distributionCount || 0,
      totalItemQuantity: row.totalItemQuantity ?? authTotal,
      recipients,
    });
    itemMap[itemName].totalItemQuantity += authTotal;
  }

  const rows = Object.values(itemMap).map((item) => ({
    itemName: item.itemName,
    distributionCount: countMap[item.itemName] || 0,
    totalItemQuantity: item.totalItemQuantity,
    authorizedBy: item.authorizedBy.sort((a, b) => b.totalItemQuantity - a.totalItemQuantity),
  }));
  rows.sort((a, b) => b.totalItemQuantity - a.totalItemQuantity);
  return rows;
}

/**
 * @desc    Create a new distribution (deducts stock)
 * @route   POST /api/general-distributions
 * @access  Public
 */
const createDistribution = asyncHandler(async (req, res) => {
  const { recipientName, department, authorizedBy, contactNumber, items, remarks, collegeId, distributionDate } = req.body;

  if (!recipientName || !department || !authorizedBy || !items || !Array.isArray(items) || items.length === 0) {
    res.status(400);
    throw new Error('Recipient name, department, authorized by, and items are required');
  }

  if (!collegeId) {
    res.status(400);
    throw new Error('College ID is required');
  }

  const college = await College.findById(collegeId);
  if (!college) {
    res.status(404);
    throw new Error('College not found');
  }

  // Validate and calculate total
  let totalAmount = 0;
  const validatedItems = [];
  const stockChanges = new Map();

  for (const item of items) {
    if (!item.productId || item.quantity === undefined) {
      res.status(400);
      throw new Error('Each item must have productId and quantity');
    }

    const product = await GeneralProduct.findById(item.productId);
    if (!product) {
      res.status(404);
      throw new Error(`Product not found: ${item.productId}`);
    }

    const requestedQuantity = Number(item.quantity);
    const price = item.price !== undefined ? Number(item.price) : 0;
    const itemTotal = requestedQuantity * price;

    // Check stock availability (Distribution always deducts stock now)
    const stockEntry = college.generalStock.find(
      s => s.product.toString() === product._id.toString()
    );
    const currentStock = stockEntry ? stockEntry.quantity : 0;
    const currentDeduction = stockChanges.get(product._id.toString()) || 0;
    const projectedStock = currentStock - currentDeduction;

    if (projectedStock < requestedQuantity) {
      res.status(400);
      throw new Error(`Insufficient stock for ${product.name}. Available: ${projectedStock}, Requested: ${requestedQuantity}`);
    }

    stockChanges.set(product._id.toString(), currentDeduction + requestedQuantity);

    totalAmount += itemTotal;
    validatedItems.push({
      productId: item.productId,
      name: item.name || product.name,
      quantity: requestedQuantity,
      price: price,
      total: itemTotal,
    });
  }

  // Deduct stock
  if (stockChanges.size > 0) {
    for (const [productId, quantity] of stockChanges.entries()) {
      const stockIndex = college.generalStock.findIndex(
        s => s.product.toString() === productId
      );

      if (stockIndex >= 0) {
        college.generalStock[stockIndex].quantity -= quantity;
      }
    }
    await college.save();
  }

  // Generate unique distribution ID
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const distributionId = `GD-${timestamp}-${randomStr}`;

  // Create distribution
  const distribution = await GeneralDistribution.create({
    distributionId,
    recipientName,
    department,
    authorizedBy,
    contactNumber: contactNumber || '',
    items: validatedItems,
    totalAmount,
    paymentMethod: 'cash',
    isPaid: true,
    paidAt: new Date(),
    remarks: remarks || '',
    stockDeducted: true,
    distributionDate: distributionDate || new Date(),
    collegeId,
  });

  res.status(201).json(distribution);
});

/**
 * @desc    Get all distributions
 * @route   GET /api/general-distributions
 * @access  Public
 */
const getAllDistributions = asyncHandler(async (req, res) => {
  const { recipientName, department, isPaid, startDate, endDate, collegeId } = req.query;

  const filter = {};

  if (recipientName) {
    filter.recipientName = { $regex: recipientName, $options: 'i' };
  }

  if (department) {
    filter.department = { $regex: department, $options: 'i' };
  }

  if (isPaid !== undefined && isPaid !== '') {
    filter.isPaid = isPaid === 'true';
  }

  if (collegeId) {
    filter.collegeId = collegeId;
  }

  if (startDate || endDate) {
    filter.distributionDate = {};
    if (startDate) filter.distributionDate.$gte = new Date(startDate);
    if (endDate) filter.distributionDate.$lte = new Date(endDate + 'T23:59:59');
  }

  const distributions = await GeneralDistribution.find(filter)
    .populate('items.productId', 'name price imageUrl')
    .populate('collegeId', 'name')
    .sort({ distributionDate: -1 });

  res.status(200).json(distributions);
});

/**
 * @desc    Report: by authorizedBy, department, item, and recipient (nested breakdowns)
 * @route   GET /api/general-distributions/reports/summary
 * @access  Public
 */
const getDistributionReportsSummary = asyncHandler(async (req, res) => {
  const built = buildDistributionReportMatch(req.query);
  if (built.error) {
    res.status(400);
    throw new Error(built.error);
  }
  const { match } = built;

  const [facetResult] = await GeneralDistribution.aggregate([
    { $match: match },
    {
      $addFields: {
        departmentNorm: {
          $let: {
            vars: {
              d: { $trim: { input: { $ifNull: ['$department', ''] } } },
            },
            in: {
              $cond: {
                if: { $eq: ['$$d', ''] },
                then: '—',
                else: '$$d',
              },
            },
          },
        },
      },
    },
    {
      $facet: {
        authDistributionCounts: [
          { $group: { _id: '$authorizedBy', distributionCount: { $sum: 1 } } },
          { $sort: { distributionCount: -1 } },
        ],
        authItemStats: [
          { $unwind: '$items' },
          {
            $group: {
              _id: { authorizedBy: '$authorizedBy', itemName: '$items.name' },
              quantity: { $sum: '$items.quantity' },
            },
          },
          { $sort: { quantity: -1 } },
          {
            $group: {
              _id: '$_id.authorizedBy',
              items: { $push: { name: '$_id.itemName', quantity: '$quantity' } },
            },
          },
        ],
        deptDistributionCounts: [
          { $group: { _id: '$departmentNorm', distributionCount: { $sum: 1 } } },
          { $sort: { distributionCount: -1 } },
        ],
        deptItemStats: [
          { $unwind: '$items' },
          {
            $group: {
              _id: { department: '$departmentNorm', itemName: '$items.name' },
              quantity: { $sum: '$items.quantity' },
            },
          },
          { $sort: { quantity: -1 } },
          {
            $group: {
              _id: '$_id.department',
              items: { $push: { name: '$_id.itemName', quantity: '$quantity' } },
            },
          },
        ],
        personDistributionCounts: [
          { $group: { _id: '$recipientName', distributionCount: { $sum: 1 } } },
          { $sort: { distributionCount: -1 } },
        ],
        personItemStats: [
          { $unwind: '$items' },
          {
            $group: {
              _id: { recipientName: '$recipientName', itemName: '$items.name' },
              quantity: { $sum: '$items.quantity' },
            },
          },
          { $sort: { quantity: -1 } },
          {
            $group: {
              _id: '$_id.recipientName',
              items: { $push: { name: '$_id.itemName', quantity: '$quantity' } },
            },
          },
        ],
        itemDistributionCounts: [
          { $unwind: '$items' },
          {
            $group: {
              _id: '$items.name',
              distributionIds: { $addToSet: '$_id' },
            },
          },
          {
            $project: {
              _id: 1,
              distributionCount: { $size: '$distributionIds' },
            },
          },
          { $sort: { distributionCount: -1 } },
        ],
        itemAuthRecipientStats: [
          { $unwind: '$items' },
          {
            $group: {
              _id: {
                itemName: '$items.name',
                authorizedBy: '$authorizedBy',
                recipientName: '$recipientName',
                distributionId: '$_id',
              },
              quantity: { $sum: '$items.quantity' },
            },
          },
          {
            $group: {
              _id: {
                itemName: '$_id.itemName',
                authorizedBy: '$_id.authorizedBy',
                recipientName: '$_id.recipientName',
              },
              quantity: { $sum: '$quantity' },
              distributionIds: { $addToSet: '$_id.distributionId' },
            },
          },
          { $sort: { quantity: -1 } },
          {
            $group: {
              _id: { itemName: '$_id.itemName', authorizedBy: '$_id.authorizedBy' },
              recipients: {
                $push: { name: '$_id.recipientName', quantity: '$quantity' },
              },
              totalItemQuantity: { $sum: '$quantity' },
              distributionIds: { $push: '$distributionIds' },
            },
          },
          {
            $addFields: {
              distributionIds: {
                $reduce: {
                  input: '$distributionIds',
                  initialValue: [],
                  in: { $setUnion: ['$$value', '$$this'] },
                },
              },
            },
          },
          {
            $addFields: {
              distributionCount: { $size: '$distributionIds' },
            },
          },
          { $project: { distributionIds: 0 } },
        ],
      },
    },
  ]);

  const fr = facetResult || {};
  const byAuthorizedBy = mergeGroupedReport(
    fr.authDistributionCounts || [],
    fr.authItemStats || [],
    'authorizedBy'
  );
  const byDepartment = mergeGroupedReport(
    fr.deptDistributionCounts || [],
    fr.deptItemStats || [],
    'department'
  );
  const byPerson = mergeGroupedReport(
    fr.personDistributionCounts || [],
    fr.personItemStats || [],
    'recipientName'
  );
  const byItem = mergeByItemReport(
    fr.itemDistributionCounts || [],
    fr.itemAuthRecipientStats || []
  );

  res.status(200).json({ byAuthorizedBy, byDepartment, byPerson, byItem });
});

/**
 * @desc    Get distribution by ID
 * @route   GET /api/general-distributions/:id
 * @access  Public
 */
const getDistributionById = asyncHandler(async (req, res) => {
  const distribution = await GeneralDistribution.findById(req.params.id)
    .populate('items.productId', 'name price imageUrl')
    .populate('collegeId', 'name');

  if (!distribution) {
    res.status(404);
    throw new Error('Distribution not found');
  }

  res.status(200).json(distribution);
});

/**
 * @desc    Update a distribution
 * @route   PUT /api/general-distributions/:id
 * @access  Public
 */
const updateDistribution = asyncHandler(async (req, res) => {
  const distribution = await GeneralDistribution.findById(req.params.id);

  if (!distribution) {
    res.status(404);
    throw new Error('Distribution not found');
  }

  const { remarks } = req.body;

  if (remarks !== undefined) distribution.remarks = remarks;

  const updatedDistribution = await distribution.save();
  res.status(200).json(updatedDistribution);
});

/**
 * @desc    Delete a distribution
 * @route   DELETE /api/general-distributions/:id
 * @access  Public
 */
const deleteDistribution = asyncHandler(async (req, res) => {
  const distribution = await GeneralDistribution.findById(req.params.id);

  if (!distribution) {
    res.status(404);
    throw new Error('Distribution not found');
  }

  // Restore stock if it was deducted
  if (distribution.stockDeducted) {
    const college = await College.findById(distribution.collegeId);
    if (college) {
      for (const item of distribution.items) {
        const stockIndex = college.generalStock.findIndex(
          s => s.product.toString() === item.productId.toString()
        );
        if (stockIndex >= 0) {
          college.generalStock[stockIndex].quantity += item.quantity;
        } else {
          college.generalStock.push({
            product: item.productId,
            quantity: item.quantity,
          });
        }
      }
      await college.save();
    }
  }

  await GeneralDistribution.findByIdAndDelete(req.params.id);
  res.status(200).json({ message: 'Distribution deleted successfully' });
});

module.exports = {
  createDistribution,
  getAllDistributions,
  getDistributionReportsSummary,
  getDistributionById,
  updateDistribution,
  deleteDistribution,
};
