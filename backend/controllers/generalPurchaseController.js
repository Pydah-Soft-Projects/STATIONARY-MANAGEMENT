const { GeneralPurchase } = require('../models/generalPurchaseModel');
const { GeneralProduct } = require('../models/generalProductModel');
const { College } = require('../models/collegeModel');
const asyncHandler = require('express-async-handler');

/**
 * @desc    Create a new general purchase (vendor-based, adds stock)
 * @route   POST /api/general-purchases
 * @access  Public
 */
const createPurchase = asyncHandler(async (req, res) => {
  const { vendor, invoiceNumber, invoiceDate, college, items, remarks, createdBy } = req.body;

  if (!vendor || !items || !Array.isArray(items) || items.length === 0) {
    res.status(400);
    throw new Error('Vendor and items are required');
  }

  // Validate items and calculate total
  let totalAmount = 0;
  for (const item of items) {
    if (!item.product || !item.quantity || item.purchasePrice === undefined) {
      res.status(400);
      throw new Error('Each item must have product, quantity, and purchasePrice');
    }

    const product = await GeneralProduct.findById(item.product);
    if (!product) {
      res.status(404);
      throw new Error(`Product not found: ${item.product}`);
    }

    const itemQty = Number(item.quantity);
    const itemPrice = Number(item.purchasePrice);
    const itemGst = Number(item.gstPercent) || 0;
    
    totalAmount += itemQty * itemPrice * (1 + itemGst / 100);
  }

  // Generate unique purchase ID
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const purchaseId = `GP-${timestamp}-${randomStr}`;

  // Create purchase
  const purchase = await GeneralPurchase.create({
    purchaseId,
    vendor,
    invoiceNumber: invoiceNumber || '',
    invoiceDate: invoiceDate || new Date(),
    college: college || null,
    items,
    totalAmount,
    remarks: remarks || '',
    createdBy: createdBy || 'System',
    stockAdded: false,
  });

  // Add stock to college or central
  if (college) {
    const collegeDoc = await College.findById(college);
    if (!collegeDoc) {
      res.status(404);
      throw new Error('College not found');
    }

    for (const item of items) {
      const stockIndex = collegeDoc.generalStock.findIndex(
        s => s.product.toString() === item.product.toString()
      );

      if (stockIndex >= 0) {
        collegeDoc.generalStock[stockIndex].quantity += Number(item.quantity);
      } else {
        collegeDoc.generalStock.push({
          product: item.product,
          quantity: Number(item.quantity),
        });
      }
    }

    await collegeDoc.save();
  }
  // Note: Central warehouse stock not implemented for general products yet

  purchase.stockAdded = true;
  await purchase.save();

  res.status(201).json(purchase);
});

/**
 * @desc    Get all general purchases
 * @route   GET /api/general-purchases
 * @access  Public
 */
const getAllPurchases = asyncHandler(async (req, res) => {
  const { vendor, college, startDate, endDate } = req.query;

  const filter = {};

  if (vendor) filter.vendor = vendor;
  if (college) filter.college = college;

  if (startDate || endDate) {
    filter.invoiceDate = {};
    if (startDate) filter.invoiceDate.$gte = new Date(startDate);
    if (endDate) filter.invoiceDate.$lte = new Date(endDate + 'T23:59:59');
  }

  const purchases = await GeneralPurchase.find(filter)
    .populate('vendor', 'name')
    .populate('college', 'name')
    .populate('items.product', 'name price')
    .sort({ invoiceDate: -1 });

  res.status(200).json(purchases);
});

/**
 * @desc    Get purchase by ID
 * @route   GET /api/general-purchases/:id
 * @access  Public
 */
const getPurchaseById = asyncHandler(async (req, res) => {
  const purchase = await GeneralPurchase.findById(req.params.id)
    .populate('vendor', 'name contactPerson phone email')
    .populate('college', 'name')
    .populate('items.product', 'name price');

  if (!purchase) {
    res.status(404);
    throw new Error('Purchase not found');
  }

  res.status(200).json(purchase);
});

/**
 * @desc    Update a purchase (all fields + item quantities with stock adjustment)
 * @route   PUT /api/general-purchases/:id
 * @access  Public
 */
const updatePurchase = asyncHandler(async (req, res) => {
  const purchase = await GeneralPurchase.findById(req.params.id);

  if (!purchase) {
    res.status(404);
    throw new Error('Purchase not found');
  }

  const { vendor, invoiceNumber, invoiceDate, remarks, items } = req.body;

  // Update scalar fields if provided
  if (vendor !== undefined && vendor) purchase.vendor = vendor;
  if (invoiceNumber !== undefined) purchase.invoiceNumber = invoiceNumber;
  if (invoiceDate !== undefined) purchase.invoiceDate = new Date(invoiceDate);
  if (remarks !== undefined) purchase.remarks = remarks;

  if (items && Array.isArray(items) && items.length > 0) {
    if (purchase.college) {
      // Has a college — adjust stock
      const collegeDoc = await College.findById(purchase.college);
      if (!collegeDoc) {
        res.status(404);
        throw new Error('College not found for this purchase');
      }

      // Step 1: Reverse the old stock additions
      for (const oldItem of purchase.items) {
        const stockIndex = collegeDoc.generalStock.findIndex(
          s => s.product.toString() === oldItem.product.toString()
        );
        if (stockIndex >= 0) {
          collegeDoc.generalStock[stockIndex].quantity -= Number(oldItem.quantity);
          if (collegeDoc.generalStock[stockIndex].quantity < 0) {
            collegeDoc.generalStock[stockIndex].quantity = 0;
          }
        }
      }

      // Step 2: Build map of new quantities by product id
      // NOTE: product from frontend may be a populated object {_id, name,...} or raw ObjectId
      const newItemsMap = {};
      for (const newItem of items) {
        const productId = (newItem.product?._id || newItem.product || '').toString();
        if (!productId) continue;
        newItemsMap[productId] = {
          quantity: Number(newItem.quantity),
          purchasePrice: newItem.purchasePrice !== undefined ? Number(newItem.purchasePrice) : null,
          gstPercent: newItem.gstPercent !== undefined ? Number(newItem.gstPercent) : null,
        };
      }

      // Step 3: Apply new stock additions and build updated items
      let newTotalAmount = 0;
      const updatedItems = [];
      for (const oldItem of purchase.items) {
        const productId = oldItem.product.toString();
        const newData = newItemsMap[productId];
        const newQty = newData ? newData.quantity : oldItem.quantity;
        const newPrice = newData?.purchasePrice !== null && newData?.purchasePrice !== undefined
          ? newData.purchasePrice
          : oldItem.purchasePrice;
        const newGst = newData?.gstPercent !== null && newData?.gstPercent !== undefined
          ? newData.gstPercent
          : (oldItem.gstPercent || 0);

        if (newQty < 1) {
          res.status(400);
          throw new Error(`Quantity must be at least 1`);
        }

        // Add new quantity to stock
        const stockIndex = collegeDoc.generalStock.findIndex(
          s => s.product.toString() === productId
        );
        if (stockIndex >= 0) {
          collegeDoc.generalStock[stockIndex].quantity += newQty;
        } else {
          collegeDoc.generalStock.push({ product: oldItem.product, quantity: newQty });
        }

        const itemTotal = newQty * newPrice * (1 + newGst / 100);
        newTotalAmount += itemTotal;

        updatedItems.push({
          product: oldItem.product,
          quantity: newQty,
          purchasePrice: newPrice,
          gstPercent: newGst,
        });
      }

      await collegeDoc.save();
      purchase.items = updatedItems;
      purchase.totalAmount = newTotalAmount;

    } else {
      // No college (central warehouse) — just update item data, no stock adjustment
      const newItemsMap = {};
      for (const newItem of items) {
        const productId = (newItem.product?._id || newItem.product || '').toString();
        if (!productId) continue;
        newItemsMap[productId] = {
          quantity: Number(newItem.quantity),
          purchasePrice: newItem.purchasePrice !== undefined ? Number(newItem.purchasePrice) : null,
          gstPercent: newItem.gstPercent !== undefined ? Number(newItem.gstPercent) : null,
        };
      }

      let newTotalAmount = 0;
      const updatedItems = [];
      for (const oldItem of purchase.items) {
        const productId = oldItem.product.toString();
        const newData = newItemsMap[productId];
        const newQty = newData ? newData.quantity : oldItem.quantity;
        const newPrice = newData?.purchasePrice !== null && newData?.purchasePrice !== undefined
          ? newData.purchasePrice
          : oldItem.purchasePrice;
        const newGst = newData?.gstPercent !== null && newData?.gstPercent !== undefined
          ? newData.gstPercent
          : (oldItem.gstPercent || 0);

        if (newQty < 1) {
          res.status(400);
          throw new Error(`Quantity must be at least 1`);
        }

        const itemTotal = newQty * newPrice * (1 + newGst / 100);
        newTotalAmount += itemTotal;

        updatedItems.push({
          product: oldItem.product,
          quantity: newQty,
          purchasePrice: newPrice,
          gstPercent: newGst,
        });
      }

      purchase.items = updatedItems;
      purchase.totalAmount = newTotalAmount;
    }
  }

  const updatedPurchase = await purchase.save();
  res.status(200).json(updatedPurchase);
});

/**
 * @desc    Delete a purchase
 * @route   DELETE /api/general-purchases/:id
 * @access  Public
 */
const deletePurchase = asyncHandler(async (req, res) => {
  const purchase = await GeneralPurchase.findById(req.params.id);

  if (!purchase) {
    res.status(404);
    throw new Error('Purchase not found');
  }

  // Restore stock if it was added
  if (purchase.stockAdded && purchase.college) {
    const collegeDoc = await College.findById(purchase.college);
    if (collegeDoc) {
      for (const item of purchase.items) {
        const stockIndex = collegeDoc.generalStock.findIndex(
          s => s.product.toString() === item.product.toString()
        );

        if (stockIndex >= 0) {
          collegeDoc.generalStock[stockIndex].quantity -= Number(item.quantity);
          if (collegeDoc.generalStock[stockIndex].quantity <= 0) {
            collegeDoc.generalStock.splice(stockIndex, 1);
          }
        }
      }
      await collegeDoc.save();
    }
  }

  await GeneralPurchase.findByIdAndDelete(req.params.id);
  res.status(200).json({ message: 'Purchase deleted successfully' });
});

module.exports = {
  createPurchase,
  getAllPurchases,
  getPurchaseById,
  updatePurchase,
  deletePurchase,
};
