const { GeneralDistribution } = require('../models/generalDistributionModel');
const { GeneralProduct } = require('../models/generalProductModel');
const { College } = require('../models/collegeModel');
const asyncHandler = require('express-async-handler');

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
  getDistributionById,
  updateDistribution,
  deleteDistribution,
};
