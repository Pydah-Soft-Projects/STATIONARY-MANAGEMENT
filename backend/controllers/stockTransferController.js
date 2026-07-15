const { StockTransfer } = require('../models/stockTransferModel');
const { College } = require('../models/collegeModel');
const { Product } = require('../models/productModel');
const { Transaction } = require('../models/transactionModel');
const asyncHandler = require('express-async-handler');

/**
 * @desc    Get all transfer colleges (campuses/stations)
 * @route   GET /api/stock-transfers/colleges
 * @access  Public
 */
const getColleges = asyncHandler(async (req, res) => {
  const { activeOnly, withStock } = req.query;
  const filter = {};
  
  if (activeOnly === 'true') {
    filter.isActive = true;
  }

  let query = College.find(filter);

  if (withStock === 'true') {
    query = query.populate('stock.product', 'name price category');
  }

  const colleges = await query.sort({ name: 1 });

  res.json(colleges);
});

/**
 * @desc    Get college stock for a specific product
 * @route   GET /api/stock-transfers/colleges/:id/stock/:productId
 * @access  Public
 */
const getCollegeStock = asyncHandler(async (req, res) => {
  const college = await College.findById(req.params.id)
    .populate('stock.product', 'name price category');

  if (!college) {
    res.status(404);
    throw new Error('College not found');
  }

  const { productId } = req.params;
  const stockEntry = college.stock.find((s) => {
    if (!s.product) return false;
    const sProdId = s.product._id ? s.product._id.toString() : s.product.toString();
    return sProdId === productId;
  });

  res.json({
    college: college.name,
    productId,
    quantity: stockEntry ? stockEntry.quantity : 0,
    product: stockEntry ? stockEntry.product : null,
  });
});

/**
 * @desc    Get all products stock for a college
 * @route   GET /api/stock-transfers/colleges/:id/stock
 * @access  Public
 */
const getCollegeStockAll = asyncHandler(async (req, res) => {
  const college = await College.findById(req.params.id)
    .populate('stock.product', 'name price category stock');

  if (!college) {
    res.status(404);
    throw new Error('College not found');
  }

  res.json({
    college: {
      _id: college._id,
      name: college.name,
      location: college.location,
    },
    stock: college.stock || [],
    courses: college.courses || [], // Explicitly return allowed courses
  });
});

/**
 * @desc    Create a new transfer college (campus/station)
 * @route   POST /api/stock-transfers/colleges
 * @access  Public
 */
const createCollege = asyncHandler(async (req, res) => {
  const { name, location, description } = req.body;

  if (!name || !name.trim()) {
    res.status(400);
    throw new Error('College name is required');
  }

  // Check if college with same name already exists
  const existingCollege = await College.findOne({ 
    name: name.trim() 
  });

  if (existingCollege) {
    res.status(400);
    throw new Error('College with this name already exists');
  }

  const college = new College({
    name: name.trim(),
    location: location?.trim() || '',
    description: description?.trim() || '',
    courses: req.body.courses || [],
    isActive: true,
  });

  const createdCollege = await college.save();
  res.status(201).json(createdCollege);
});

/**
 * @desc    Update a transfer college
 * @route   PUT /api/stock-transfers/colleges/:id
 * @access  Public
 */
const updateCollege = asyncHandler(async (req, res) => {
  const college = await College.findById(req.params.id);

  if (!college) {
    res.status(404);
    throw new Error('College not found');
  }

  const { name, location, description, isActive, courses } = req.body;

  if (name !== undefined && name.trim()) {
    // Check if another college with this name exists
    const existingCollege = await College.findOne({ 
      name: name.trim(),
      _id: { $ne: req.params.id }
    });

    if (existingCollege) {
      res.status(400);
      throw new Error('College with this name already exists');
    }

    college.name = name.trim();
  }

  if (location !== undefined) college.location = location.trim();
  if (description !== undefined) college.description = description.trim();
  if (isActive !== undefined) college.isActive = Boolean(isActive);
  if (courses !== undefined && Array.isArray(courses)) college.courses = courses;

  const updated = await college.save();
  res.json(updated);
});

/**
 * @desc    Delete a transfer college
 * @route   DELETE /api/stock-transfers/colleges/:id
 * @access  Public
 */
const deleteCollege = asyncHandler(async (req, res) => {
  const college = await College.findById(req.params.id);

  if (!college) {
    res.status(404);
    throw new Error('College not found');
  }

  // Check if college is used in any transfers
  const transfersCount = await StockTransfer.countDocuments({
    toCollege: req.params.id
  });

  if (transfersCount > 0) {
    res.status(400);
    throw new Error(`Cannot delete college. It is used in ${transfersCount} transfer(s).`);
  }

  // Check if college has any stock
  if (college.stock && college.stock.length > 0) {
    const totalStock = college.stock.reduce((sum, item) => sum + (item.quantity || 0), 0);
    if (totalStock > 0) {
      res.status(400);
      throw new Error(`Cannot delete college. It has ${totalStock} items in stock. Please transfer or clear stock first.`);
    }
  }

  await College.findByIdAndDelete(req.params.id);
  res.json({ message: 'College deleted successfully' });
});

/**
 * @desc    Create a new stock transfer (from central stock to college)
 * @route   POST /api/stock-transfers
 * @access  Public
 */
const createStockTransfer = asyncHandler(async (req, res) => {
  const { items, toCollege, fromCollege, transferDate, isPaid, deductFromCentral, includeInRevenue, remarks, createdBy } = req.body;

  // Validate required fields
  if (!items || !Array.isArray(items) || items.length === 0) {
    res.status(400);
    throw new Error('At least one product item is required');
  }

  if (!toCollege) {
    res.status(400);
    throw new Error('Destination college is required');
  }

  // Verify college exists and is active
  const toCollegeDoc = await College.findById(toCollege);
  if (!toCollegeDoc || !toCollegeDoc.isActive) {
    res.status(404);
    throw new Error('Destination college not found or inactive');
  }

  // Validate fromCollege if provided
  let fromCollegeDoc = null;
  if (fromCollege) {
    if (fromCollege === toCollege) {
      res.status(400);
      throw new Error('Source and Destination colleges cannot be the same');
    }
    fromCollegeDoc = await College.findById(fromCollege);
    if (!fromCollegeDoc || !fromCollegeDoc.isActive) {
      res.status(404);
      throw new Error('Source college not found or inactive');
    }
  }

  // Validate and verify products
  const productIds = items.map(item => item.product).filter(Boolean);
  if (productIds.length !== items.length) {
    res.status(400);
    throw new Error('All items must have a product ID');
  }

  const productDocs = await Product.find({ _id: { $in: productIds } });
  if (productDocs.length !== productIds.length) {
    res.status(404);
    throw new Error('One or more products not found');
  }

  const productMap = new Map(productDocs.map(p => [p._id.toString(), p]));

  // Validate quantities and check stock
  const transferItems = [];
  const shouldDeductStock = deductFromCentral !== undefined ? Boolean(deductFromCentral) : true;
  
  for (const item of items) {
    const quantity = Number(item.quantity);
    if (!quantity || quantity < 1) {
      res.status(400);
      throw new Error(`Invalid quantity for product ${item.product}`);
    }

    const product = productMap.get(item.product.toString());
    if (!product) {
      res.status(404);
      throw new Error(`Product ${item.product} not found`);
    }

    // Only check stock if we're going to deduct
    // Case 1: Deduct from Source College
    if (fromCollegeDoc) {
      const stockEntry = fromCollegeDoc.stock.find(s => s.product.toString() === item.product.toString());
      const available = stockEntry ? stockEntry.quantity : 0;
      if (available < quantity) {
        res.status(400);
        throw new Error(`Insufficient stock for ${product.name} at ${fromCollegeDoc.name}. Available: ${available}, Requested: ${quantity}`);
      }
    }
    // Case 2: Deduct from Central (only if fromCollege is NOT set and deductFromCentral is true)
    else if (shouldDeductStock && product.stock < quantity) {
      res.status(400);
      throw new Error(`Insufficient stock for ${product.name}. Available: ${product.stock}, Requested: ${quantity}`);
    }

    transferItems.push({
      product: product._id,
      quantity,
    });
  }

  // Create transfer (status: pending)
  const stockTransfer = new StockTransfer({
    items: transferItems,
    toCollege,
    transferDate: transferDate ? new Date(transferDate) : new Date(),
    isPaid: isPaid !== undefined ? Boolean(isPaid) : false,
    deductFromCentral: deductFromCentral !== undefined ? Boolean(deductFromCentral) : true,
    includeInRevenue: includeInRevenue !== undefined ? Boolean(includeInRevenue) : true,
    remarks: remarks?.trim() || '',
    createdBy: createdBy?.trim() || 'System',
    status: 'pending',
    fromCollege: fromCollege || null,
  });

  const createdTransfer = await stockTransfer.save();

  // Populate the products and colleges for response (fromCollege so UI shows selected source, not "Central Warehouse")
  await createdTransfer.populate('items.product', 'name price stock category');
  await createdTransfer.populate('toCollege', 'name location');
  if (createdTransfer.fromCollege) {
    await createdTransfer.populate('fromCollege', 'name location');
  }

  res.status(201).json(createdTransfer);
});

/**
 * @desc    Get all stock transfers
 * @route   GET /api/stock-transfers
 * @access  Public
 */
const getStockTransfers = asyncHandler(async (req, res) => {
  const { product, toCollege, status, isPaid, startDate, endDate } = req.query;
  const filter = {};

  if (product) filter['items.product'] = product;
  if (toCollege) filter.toCollege = toCollege;
  if (status) filter.status = status;
  if (isPaid !== undefined && isPaid !== '') filter.isPaid = isPaid === 'true';
  if (startDate || endDate) {
    filter.transferDate = {};
    if (startDate) filter.transferDate.$gte = new Date(startDate);
    if (endDate) filter.transferDate.$lte = new Date(endDate + 'T23:59:59');
  }

  // Sort primarily by creation time so the newest transfers appear first,
  // with transferDate as a secondary sort key for stable ordering when needed.
  const stockTransfers = await StockTransfer.find(filter)
    .populate('items.product', 'name price stock category')
    .populate('toCollege', 'name location')
    .populate('fromCollege', 'name location')
    .populate('transactionId', 'transactionId totalAmount paymentMethod isPaid transactionType collegeTransfer branchTransfer')
    .sort({ createdAt: -1, transferDate: -1 });

  res.json(stockTransfers);
});

/**
 * @desc    Get a single stock transfer by ID
 * @route   GET /api/stock-transfers/:id
 * @access  Public
 */
const getStockTransferById = asyncHandler(async (req, res) => {
  const stockTransfer = await StockTransfer.findById(req.params.id)
    .populate('items.product', 'name price stock category')
    .populate('toCollege', 'name location description')
    .populate('fromCollege', 'name location')
    .populate('transactionId', 'transactionId totalAmount paymentMethod isPaid transactionType createdAt');

  if (!stockTransfer) {
    res.status(404);
    throw new Error('Stock transfer not found');
  }

  res.json(stockTransfer);
});

/**
 * @desc    Update a stock transfer (mark as completed or cancelled)
 * @route   PUT /api/stock-transfers/:id
 * @access  Public
 */
const updateStockTransfer = asyncHandler(async (req, res) => {
  const stockTransfer = await StockTransfer.findById(req.params.id);
  
  if (!stockTransfer) {
    res.status(404);
    throw new Error('Stock transfer not found');
  }

  const { status, isPaid, remarks, deductFromCentral, includeInRevenue } = req.body;

  // Validate status transitions - prevent invalid transitions
  if (status && ['pending', 'completed', 'cancelled'].includes(status)) {
    const oldStatus = stockTransfer.status;
    
    // Prevent invalid status transitions
    if (oldStatus === 'completed' && status === 'pending') {
      res.status(400);
      throw new Error('Cannot change status from completed to pending');
    }
    if (oldStatus === 'cancelled' && status === 'pending') {
      res.status(400);
      throw new Error('Cannot change status from cancelled to pending');
    }
    if (oldStatus === 'completed' && status === 'cancelled') {
      res.status(400);
      throw new Error('Cannot cancel a completed transfer');
    }
    
    stockTransfer.status = status;

    // Set completion or cancellation timestamp
    if (status === 'completed' && oldStatus !== 'completed') {
      stockTransfer.completedAt = new Date();
    } else if (status === 'cancelled' && oldStatus !== 'cancelled') {
      stockTransfer.cancelledAt = new Date();
    }

    // If completing a transfer, we can optionally update product stock here
    // For now, we'll just record the transfer status
    // Future enhancement: Implement college-specific stock tracking
  }

  if (isPaid !== undefined) {
    stockTransfer.isPaid = Boolean(isPaid);
    
    // Also update the associated transaction if it exists
    if (stockTransfer.transactionId) {
      await Transaction.findByIdAndUpdate(stockTransfer.transactionId, { 
        isPaid: Boolean(isPaid),
        paidAt: Boolean(isPaid) ? new Date() : null
      });
    }
  }

  if (deductFromCentral !== undefined) {
    // Prevent changing deductFromCentral if transfer is already completed
    if (stockTransfer.status === 'completed') {
      res.status(400);
      throw new Error('Cannot modify deductFromCentral for completed transfers');
    }
    stockTransfer.deductFromCentral = Boolean(deductFromCentral);
  }

  if (includeInRevenue !== undefined) {
    // Prevent changing includeInRevenue if transfer is already completed
    if (stockTransfer.status === 'completed') {
      res.status(400);
      throw new Error('Cannot modify includeInRevenue for completed transfers');
    }
    stockTransfer.includeInRevenue = Boolean(includeInRevenue);
  }

  if (remarks !== undefined) {
    stockTransfer.remarks = remarks.trim();
  }

  const updated = await stockTransfer.save();
  await updated.populate('items.product', 'name price stock category');
  await updated.populate('toCollege', 'name location');
  if (updated.fromCollege) {
    await updated.populate('fromCollege', 'name location');
  }
  await updated.populate('transactionId', 'transactionId totalAmount paymentMethod isPaid transactionType');

  res.json(updated);
});

/**
 * @desc    Delete a stock transfer and revert stock changes if completed
 * @route   DELETE /api/stock-transfers/:id
 * @access  Public
 */
const deleteStockTransfer = asyncHandler(async (req, res) => {
  const stockTransfer = await StockTransfer.findById(req.params.id)
    .populate('items.product')
    .populate('toCollege');
  
  if (!stockTransfer) {
    res.status(404);
    throw new Error('Stock transfer not found');
  }

  // If transfer is completed, revert stock changes
  if (stockTransfer.status === 'completed') {
    const shouldDeductStock = stockTransfer.deductFromCentral !== false; // Default to true if not set
    const toCollege = stockTransfer.toCollege;
    
    // Revert central stock (add back if it was deducted)
    // Revert stock changes
    if (stockTransfer.fromCollege && stockTransfer.items && stockTransfer.items.length > 0) {
      // Revert to Source College
      const fromCollege = await College.findById(stockTransfer.fromCollege);
      if (fromCollege) {
         const collegeStock = fromCollege.stock || [];
         const productStockMap = new Map();
         collegeStock.forEach(s => productStockMap.set(s.product.toString(), s.quantity));

         for (const item of stockTransfer.items) {
           const pid = item.product.toString();
           const qty = productStockMap.get(pid) || 0;
           productStockMap.set(pid, qty + item.quantity);
         }
         
         fromCollege.stock = Array.from(productStockMap.entries()).map(([p, q]) => ({ product: p, quantity: q }));
         await fromCollege.save();
      }
    } else if (shouldDeductStock && stockTransfer.items && stockTransfer.items.length > 0) {
      // Revert central stock (add back if it was deducted)
      const stockReverts = [];
      
      for (const item of stockTransfer.items) {
        const product = item.product;
        const quantity = item.quantity;
        
        if (product && quantity > 0) {
          stockReverts.push({
            updateOne: {
              filter: { _id: product._id },
              update: { $inc: { stock: quantity } }, // Add back the stock
            },
          });
        }
      }
      
      if (stockReverts.length > 0) {
        await Product.bulkWrite(stockReverts);
      }
    }
    
    // Revert college stock (remove if it was added)
    if (toCollege && toCollege.stock && stockTransfer.items && stockTransfer.items.length > 0) {
      const collegeStock = toCollege.stock || [];
      const productStockMap = new Map();
      
      // Create a map of existing stock
      for (const stockItem of collegeStock) {
        const productId = stockItem.product?.toString() || stockItem.product;
        if (productId) {
          productStockMap.set(productId, stockItem.quantity || 0);
        }
      }
      
      // Subtract the transferred quantities
      for (const item of stockTransfer.items) {
        const productId = item.product?._id?.toString() || item.product?.toString();
        if (productId) {
          const currentQty = productStockMap.get(productId) || 0;
          const newQty = Math.max(0, currentQty - item.quantity); // Ensure non-negative
          if (newQty > 0) {
            productStockMap.set(productId, newQty);
          } else {
            productStockMap.delete(productId); // Remove if quantity becomes 0
          }
        }
      }
      
      // Convert map back to array format
      const updatedCollegeStock = Array.from(productStockMap.entries()).map(([productId, quantity]) => ({
        product: productId,
        quantity,
      }));
      
      toCollege.stock = updatedCollegeStock;
      await toCollege.save();
    }
    
    // Delete associated transaction if exists
    if (stockTransfer.transactionId) {
      await Transaction.findByIdAndDelete(stockTransfer.transactionId);
    }
  }

  // Delete the transfer
  await StockTransfer.findByIdAndDelete(req.params.id);

  res.json({ message: 'Stock transfer deleted successfully. Stock changes have been reverted.' });
});

/**
 * @desc    Complete a stock transfer (deduct from central stock, create transaction)
 * @route   POST /api/stock-transfers/:id/complete
 * @access  Public
 */
const completeStockTransfer = asyncHandler(async (req, res) => {
  const stockTransfer = await StockTransfer.findById(req.params.id)
    .populate('items.product')
    .populate('toCollege');
  
  if (!stockTransfer) {
    res.status(404);
    throw new Error('Stock transfer not found');
  }

  if (stockTransfer.status !== 'pending') {
    res.status(400);
    throw new Error(`Transfer is already ${stockTransfer.status}`);
  }

  const toCollege = stockTransfer.toCollege;
  const shouldDeductStock = stockTransfer.deductFromCentral !== false;
  const shouldIncludeInRevenue = stockTransfer.includeInRevenue !== false;
  
  // Re-fetch products to get latest stock values
  const productIds = stockTransfer.items.map(item => item.product?._id || item.product).filter(Boolean);
  const currentProducts = await Product.find({ _id: { $in: productIds } });
  const productMap = new Map(currentProducts.map(p => [p._id.toString(), p]));
  
  const stockUpdates = [];
  const collegeStockUpdates = [];
  const transactionItems = [];
  let totalAmount = 0;

  // 1. Prepare Data & Validate Central Stock (if needed)
  for (const item of stockTransfer.items) {
    const productId = item.product._id?.toString() || item.product?.toString();
    const product = productMap.get(productId);
    const quantity = item.quantity;

    if (!product) {
      res.status(404);
      throw new Error(`Product not found: ${productId}`);
    }

    // Prepare Central Stock Update (only if NO Source College AND Deduct is TRUE)
    if (!stockTransfer.fromCollege && shouldDeductStock) {
        if (product.stock < quantity) {
            res.status(400);
            throw new Error(`Insufficient stock for ${product.name}. Available: ${product.stock}, Required: ${quantity}`);
        }
        stockUpdates.push({
            updateOne: {
            filter: { 
                _id: product._id,
                stock: { $gte: quantity } 
            },
            update: { $inc: { stock: -quantity } },
            },
        });
    }

    // Prepare Destination College Update (Always)
    collegeStockUpdates.push({
      productId: product._id.toString(),
      quantity,
    });

    // Prepare Transaction Item
    const itemTotal = product.price * quantity;
    totalAmount += itemTotal;
    transactionItems.push({
      productId: product._id,
      name: product.name,
      quantity,
      price: product.price,
      total: itemTotal,
      isSet: false,
      status: 'fulfilled',
    });
  }

  // 2. Execute Deduction
  if (stockTransfer.fromCollege) {
      // Deduct from Source College
      const fromCollege = await College.findById(stockTransfer.fromCollege);
      if (!fromCollege) throw new Error('Source college not found');
      
      const collegeStock = fromCollege.stock || [];
      const productStockMap = new Map();
      collegeStock.forEach(s => productStockMap.set(s.product.toString(), s.quantity));

      for (const item of stockTransfer.items) {
        const pid = item.product._id?.toString() || item.product?.toString();
        const currentQty = productStockMap.get(pid) || 0;
        if (currentQty < item.quantity) {
             throw new Error(`Insufficient stock at ${fromCollege.name} for product ${item.product.name}`);
        }
        productStockMap.set(pid, currentQty - item.quantity);
      }
      
      fromCollege.stock = Array.from(productStockMap.entries())
        .map(([p, q]) => ({ product: p, quantity: q }))
        .filter(x => x.quantity > 0);
      await fromCollege.save();

  } else if (shouldDeductStock && stockUpdates.length > 0) {
    // Deduct from Central Stock
    const bulkResult = await Product.bulkWrite(stockUpdates, { ordered: false });
    
    // Check if all updates were successful
    const failedUpdates = stockUpdates.length - (bulkResult.modifiedCount || 0);
    if (failedUpdates > 0) {
      // Re-fetch and throw specific error
      const productIds = stockTransfer.items.map(item => item.product?._id || item.product).filter(Boolean);
      const currentProducts = await Product.find({ _id: { $in: productIds } });
      const productMap = new Map(currentProducts.map(p => [p._id.toString(), p]));
      
      const insufficientStock = [];
      for (const item of stockTransfer.items) {
        const prodId = (item.product?._id || item.product)?.toString();
        const product = prodId ? productMap.get(prodId) : null;
        if (product && product.stock < item.quantity) {
          insufficientStock.push(`${product.name} (Available: ${product.stock}, Required: ${item.quantity})`);
        }
      }
      res.status(400);
      throw new Error(`Insufficient stock detected. ${insufficientStock.join(', ')}`);
    }
  }

  // 3. Add to Destination College
  const collegeStock = toCollege.stock || [];
  const productStockMap = new Map();
  
  for (const stockItem of collegeStock) {
    const productId = stockItem.product?.toString() || stockItem.product;
    if (productId) {
      productStockMap.set(productId, stockItem.quantity || 0);
    }
  }
  
  for (const update of collegeStockUpdates) {
    const currentQty = productStockMap.get(update.productId) || 0;
    productStockMap.set(update.productId, currentQty + update.quantity);
  }
  
  const updatedCollegeStock = Array.from(productStockMap.entries()).map(([productId, quantity]) => ({
    product: productId,
    quantity,
  }));
  
  toCollege.stock = updatedCollegeStock;
  await toCollege.save();

  // 4. Create Transaction
  let createdTransaction = null;
  if (transactionItems.length > 0) {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
    const transactionId = `TXN-${timestamp}-${randomStr}`;
    
    const transaction = new Transaction({
      transactionId,
      transactionType: 'college_transfer',
      collegeId: stockTransfer.fromCollege || null, // Source College
      collegeTransfer: {
        collegeId: toCollege._id,
        collegeName: toCollege.name,
        collegeLocation: toCollege.location || '',
      },
      collegeId: stockTransfer.fromCollege || null, // Record source college if applicable
      items: transactionItems,
      totalAmount,
      paymentMethod: 'transfer',
      isPaid: stockTransfer.isPaid || false,
      paidAt: stockTransfer.isPaid ? new Date() : null,
      transactionDate: new Date(),
      remarks: `Stock transfer ${stockTransfer.fromCollege ? `from ${stockTransfer.fromCollege} ` : ''}to ${toCollege.name}${stockTransfer.remarks ? ` - ${stockTransfer.remarks}` : ''}${shouldIncludeInRevenue ? '' : ' (Not included in revenue)'}`,
    });

    createdTransaction = await transaction.save();

    // Update transfer with transaction reference
    stockTransfer.transactionId = createdTransaction._id;
  }

  // 5. Update Transfer Status
  stockTransfer.status = 'completed';
  stockTransfer.completedAt = new Date();
  
  const updated = await stockTransfer.save();
  await updated.populate('items.product', 'name price stock category');
  await updated.populate('toCollege', 'name location');
  if (stockTransfer.fromCollege) {
      await updated.populate('fromCollege', 'name location');
  }
  if (createdTransaction) {
    await updated.populate('transactionId', 'transactionId totalAmount paymentMethod isPaid transactionType');
  }

  res.json(updated);
});

module.exports = {
  getColleges,
  createCollege,
  updateCollege,
  deleteCollege,
  getCollegeStock,
  getCollegeStockAll,
  createStockTransfer,
  getStockTransfers,
  getStockTransferById,
  updateStockTransfer,
  deleteStockTransfer,
  completeStockTransfer,
};
