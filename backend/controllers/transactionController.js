const { Transaction } = require('../models/transactionModel');
const { User } = require('../models/userModel');
const { Product } = require('../models/productModel');
const { College } = require('../models/collegeModel');
const { SubAdmin } = require('../models/subAdminModel');
const asyncHandler = require('express-async-handler');

// Helpers for stock management (supports set products)
const accumulateStockChange = (changeMap, productId, delta) => {
  if (!productId || !Number.isFinite(delta)) return;
  const key = productId.toString();
  const currentDelta = changeMap.get(key) || 0;
  changeMap.set(key, currentDelta + delta);
};

// Helper: Get projected stock for a product from a specific college
// stockMap: Map<productId, quantity> (from college stock)
// changeMap: Map<productId, delta> (pending changes in this transaction)
const getProjectedStock = (productId, stockMap, changeMap) => {
  const key = productId.toString();
  const baseStock = stockMap.has(key) ? stockMap.get(key) : 0;
  const pending = changeMap.has(key) ? changeMap.get(key) : 0;
  return baseStock + pending;
};

// Helper: Apply stock changes to the College (not global Product)
// changeMap: Map<productId, delta> (negative delta means deduction)
// collegeId: ObjectId of the college to update
const applyStockChanges = async (changeMap, collegeId) => {
  if (!changeMap || changeMap.size === 0 || !collegeId) return;

  const college = await College.findById(collegeId);
  if (!college) throw new Error('College not found during stock update');

  // Convert map to array for easier processing
  // College stock structure is array of { product: ObjectId, quantity: Number }
  // We need to update this array efficiently
  
  // First, map existing stock for easier lookup
  const collegeStockMap = new Map();
  if (college.stock) {
    college.stock.forEach(item => {
      collegeStockMap.set(item.product.toString(), item.quantity);
    });
  }

  // Apply changes
  changeMap.forEach((delta, productId) => {
    const current = collegeStockMap.get(productId) || 0;
    const newQty = Math.max(0, current + delta); // Prevent negative
    collegeStockMap.set(productId, newQty);
  });

  // Re-construct the stock array
  const updatedStock = [];
  collegeStockMap.forEach((qty, productId) => {
    if (qty > 0) { // Optional: remove items with 0 stock to keep array clean? Or keep as 0? 
      // Keeping as 0 allows tracking out-of-stock items explicitly if needed, but removing saves space.
      updatedStock.push({ product: productId, quantity: qty });
    }
  });

  college.stock = updatedStock;
  await college.save();
};

const loadCollegeStock = async (collegeId, productIds) => {
  if (!collegeId) return new Map();
  
  const college = await College.findById(collegeId).select('stock');
  if (!college) return new Map();

  const stockMap = new Map();
  if (college.stock) {
    college.stock.forEach(item => {
      stockMap.set(item.product.toString(), item.quantity);
    });
  }
  return stockMap;
};

const loadProductsWithComponents = async (productIds) => {
  const ids = Array.from(productIds || [])
    .filter(Boolean)
    .map((id) => id.toString());

  if (ids.length === 0) {
    return {
      productMap: new Map(),
      stockMap: new Map(),
    };
  }

  const products = await Product.find({ _id: { $in: ids } }).populate({
    path: 'setItems.product',
    select: 'name stock price isSet setItems',
  });

  const productMap = new Map();
  const stockMap = new Map();

  products.forEach((prod) => {
    const prodId = prod._id.toString();
    productMap.set(prodId, prod);
    stockMap.set(prodId, prod.stock ?? 0);

    if (prod.isSet && Array.isArray(prod.setItems)) {
      prod.setItems.forEach((setItem) => {
        const component = setItem?.product;
        if (!component) return;
        const componentId = component._id.toString();
        stockMap.set(componentId, component.stock ?? 0);
        if (!productMap.has(componentId)) {
          productMap.set(componentId, component);
        }
      });
    }
  });

  if (productMap.size < ids.length) {
    const missing = ids.filter((id) => !productMap.has(id));
    throw new Error(`Product not found: ${missing.join(', ')}`);
  }

  return { productMap, stockMap };
};

/**
 * @desc    Create a new transaction
 * @route   POST /api/transactions
 * @access  Public
 */
const createTransaction = asyncHandler(async (req, res) => {
  // Check for branchId in input (legacy compat) or collegeId
  const { studentId, items, paymentMethod, isPaid, remarks } = req.body;
  let { collegeId, branchId } = req.body;
  
  // Consolidate to collegeId
  if (!collegeId && branchId) {
    collegeId = branchId;
  }

  if (!studentId || !items || !Array.isArray(items) || items.length === 0) {
    res.status(400);
    throw new Error('Student ID and items are required');
  }

  // Find the student
  const student = await User.findById(studentId);
  if (!student) {
    res.status(404);
    throw new Error('Student not found');
  }

  // Determine College context
  // If `staffId` is provided (e.g., from auth middleware), check assignedCollege
  // For now, assume the request *might* include `collegeId` directly or we lookup based on logged-in user if available
  // To make this robust without full auth middleware context in this snippet, we'll check body first then fallback
  let targetCollegeId = collegeId;

  // If no collegeId in body, and we have a user (staff) in request (if auth middleware attached it)
  if (!targetCollegeId && req.user && req.user.assignedCollege) {
    targetCollegeId = req.user.assignedCollege;
  }
  
  // If still no collegeId, check if `createdBy` is passed (admin ID) and lookup
  if (!targetCollegeId && req.body.createdBy) {
     const admin = await SubAdmin.findById(req.body.createdBy);
     if (admin && admin.assignedCollege) {
       targetCollegeId = admin.assignedCollege;
     }
  }

  // Backup: If still no collegeId, find college associated with student's course
  if (!targetCollegeId && student.course) {
    console.log('[DEBUG] createTransaction: Attempting backup lookup for course:', student.course);
    const backupCollege = await College.findOne({ courses: student.course });
    if (backupCollege) {
      console.log('[DEBUG] createTransaction: Backup found college:', backupCollege.name);
      targetCollegeId = backupCollege._id;
    } else {
      console.log('[DEBUG] createTransaction: No college found for course:', student.course);
    }
  }

  // Critical: If college-wise management is active, we MUST have a collegeId for stock deduction
  // unless we decide to fallback to Global Stock (which defeats the purpose).
  // For safety during migration, if no collegeId is found, we might throw Error or fallback.
  // Let's enforce College ID.
  if (!targetCollegeId) {
    res.status(400);
    throw new Error('Transaction must be associated with a College for stock deduction. Please ensure Staff is assigned to a College.');
  }

  const requestedProductIds = new Set(items.map((item) => item.productId));
  // Load product definitions (for names, sets, prices) - Global
  const { productMap, stockMap: globalStockMap } = await loadProductsWithComponents(requestedProductIds);
  
  // Load College Stock - Local
  const collegeStockMap = await loadCollegeStock(targetCollegeId, requestedProductIds);

  // Calculate total and validate items
  let totalAmount = 0;
  const validatedItems = [];
  const stockChanges = new Map();

  for (const item of items) {
    if (!item.productId || item.quantity === undefined || item.price === undefined) {
      res.status(400);
      throw new Error('Each item must have productId, quantity, and price');
    }

    const productId = item.productId.toString();
    const product = productMap.get(productId);

    if (!product) {
      res.status(404);
      throw new Error(`Product not found: ${item.productId}`);
    }

    const requestedQuantity = Number(item.quantity);

    let itemStatus = 'fulfilled';
    let componentDetails = [];

    if (product.isSet) {
      if (!product.setItems || product.setItems.length === 0) {
        res.status(400);
        throw new Error(`Set ${product.name} has no component items configured.`);
      }

      for (const setItem of product.setItems) {
        const component = setItem.product;
        if (!component) {
          res.status(400);
          throw new Error(`Set ${product.name} contains an invalid item reference.`);
        }

        const componentId = component._id.toString();
        const required = requestedQuantity * (Number(setItem.quantity) || 1);
        
        // CHECK COLLEGE STOCK IF PAID
        if (isPaid) {
          const available = getProjectedStock(componentId, collegeStockMap, stockChanges);
          let taken = true;
          let reason;

          if (available < required) {
            taken = false;
            itemStatus = 'partial';
            reason = `Insufficient stock at college (required ${required}, available ${Math.max(available, 0)})`;
          } else {
            accumulateStockChange(stockChanges, componentId, -required);
          }

          componentDetails.push({
            productId: component._id,
            name: component.name,
            quantity: required,
            taken,
            reason: taken ? undefined : reason,
          });
        } else {
          // IF UNPAID, we allow it even if stock is low, and don't deduct yet
          componentDetails.push({
            productId: component._id,
            name: component.name,
            quantity: required,
            taken: true, // Mark as taken by default in the transaction record if unpaid? 
            // Or maybe false if we want them to mark it manually later?
            // "allow for creation even when out of stock" suggests they are PLANNING to give it.
            // Let's set taken: true as the "desired" state, but we don't deduct stock yet.
          });
        }
      }
    } else {
      // CHECK COLLEGE STOCK IF PAID
      if (isPaid) {
        if (getProjectedStock(productId, collegeStockMap, stockChanges) >= requestedQuantity) {
          accumulateStockChange(stockChanges, productId, -requestedQuantity);
        } else {
          itemStatus = 'partial'; // Mark as partial if stock is insufficient even if paid
        }
      }
    }

    const itemTotal = requestedQuantity * Number(item.price);
    totalAmount += itemTotal;
    const transactionItem = {
      productId: item.productId,
      name: item.name || product.name,
      quantity: requestedQuantity,
      price: Number(item.price),
      total: itemTotal,
      status: itemStatus,
      isSet: Boolean(product.isSet),
    };

    if (product.isSet) {
      transactionItem.setComponents = componentDetails;
    }

    validatedItems.push(transactionItem);
  }

  // Apply stock changes after validation to the COLLEGE only if PAID
  if (isPaid && stockChanges.size > 0) {
    await applyStockChanges(stockChanges, targetCollegeId);
  }

  // Generate unique transaction ID
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const transactionId = `TXN-${timestamp}-${randomStr}`;

  // Create transaction
  const transaction = await Transaction.create({
    transactionId,
    transactionType: 'student', // Explicitly set for student transactions
    collegeId: targetCollegeId, // Record the college
    student: {
      userId: student._id,
      name: student.name,
      studentId: student.studentId,
      course: student.course,
      year: student.year,
      branch: student.branch || '',
      semester: student.semester || null,
    },
    items: validatedItems,
    totalAmount,
    paymentMethod: paymentMethod || 'cash',
    isPaid: isPaid || false,
    paidAt: isPaid ? new Date() : null,
    stockDeducted: (isPaid && stockChanges.size > 0 && Array.from(stockChanges.values()).every(v => v < 0)) || false, 
    // Wait, the logic for stockDeducted should be: did we actually apply changes?
    // Let's refine this below.
    transactionDate: new Date(),
    remarks: remarks || '',
  });

  // Re-evaluate stockDeducted based on whether applyStockChanges was called
  if (isPaid && stockChanges.size > 0) {
    await applyStockChanges(stockChanges, targetCollegeId);
    transaction.stockDeducted = true;
    await transaction.save();
  }

  // Update student's items map based on transaction items
  const updatedItems = { ...(student.items || {}) };
  validatedItems.forEach(item => {
    // Only mark as received if the item is fully fulfilled
    if (item.status !== 'partial') {
      const productName = item.name;
      const key = productName.toLowerCase().replace(/\s+/g, '_');
      updatedItems[key] = true;
    }
  });

  // Update student's paid status if transaction is paid
  if (isPaid && !student.paid) {
    student.paid = true;
  }

  // Update student's items map
  student.items = updatedItems;
  await student.save();

  res.status(201).json(transaction);
});

/**
 * @desc    Get all transactions
 * @route   GET /api/transactions
 * @access  Public
 */
const getAllTransactions = asyncHandler(async (req, res) => {
  const { course, studentId, transactionType, paymentMethod, isPaid, startDate, endDate, collegeId } = req.query;
  
  const filter = {};

  if (collegeId) {
    filter.$or = [
      { collegeId: collegeId },
      { branchId: collegeId }, // Keep support for legacy branchId field
      { 'collegeTransfer.collegeId': collegeId }
    ];
  }
  
  if (transactionType) {
    // Legacy support: if 'branch_transfer', assume 'college_transfer' or handle legacy data
    if (transactionType === 'branch_transfer') {
      filter.transactionType = { $in: ['branch_transfer', 'college_transfer'] };
    } else {
      filter.transactionType = transactionType;
    }
  }
  
  // Only apply student-related filters if transaction type is student or not specified
  if (!transactionType || transactionType === 'student') {
    if (course) {
      filter['student.course'] = course;
    }
    
    if (studentId) {
      const student = await User.findById(studentId);
      if (student) {
        filter['student.userId'] = student._id;
      }
    }
  }
  
  if (paymentMethod) {
    filter.paymentMethod = paymentMethod;
  }
  
  if (isPaid !== undefined && isPaid !== '') {
    filter.isPaid = isPaid === 'true';
  }

  if (startDate || endDate) {
    filter.transactionDate = {};
    if (startDate) filter.transactionDate.$gte = new Date(startDate);
    if (endDate) filter.transactionDate.$lte = new Date(endDate + 'T23:59:59');
  }

  const transactions = await Transaction.find(filter)
    .populate('items.productId', 'name price imageUrl')
    .populate('student.userId', 'name studentId course year branch')
    .populate('collegeTransfer.collegeId', 'name location')
    .sort({ transactionDate: -1 });

  res.status(200).json(transactions);
});

/**
 * @desc    Get transaction by ID
 * @route   GET /api/transactions/:id
 * @access  Public
 */
const getTransactionById = asyncHandler(async (req, res) => {
  const transaction = await Transaction.findById(req.params.id)
    .populate('items.productId', 'name price imageUrl description');

  if (!transaction) {
    res.status(404);
    throw new Error('Transaction not found');
  }

  res.status(200).json(transaction);
});

/**
 * @desc    Update a transaction
 * @route   PUT /api/transactions/:id
 * @access  Public
 */
const updateTransaction = asyncHandler(async (req, res) => {
  const transaction = await Transaction.findById(req.params.id);

  if (!transaction) {
    res.status(404);
    throw new Error('Transaction not found');
  }

  const { items, paymentMethod, isPaid, remarks } = req.body;

  // If items are being updated, recalculate total and handle stock
  if (items && Array.isArray(items) && items.length > 0) {
    // Use targetIsPaid to determine if we should deduct stock for NEW items
    const targetIsPaid = isPaid !== undefined ? isPaid : transaction.isPaid;

    // First, restore stock from old transaction items ONLY if it was deducted
    if (transaction.stockDeducted && transaction.items && transaction.items.length > 0) {
      const restoreIds = new Set(transaction.items.map((oldItem) => oldItem.productId));
      const { productMap: restoreProductMap } = await loadProductsWithComponents(restoreIds);
      const restoreChanges = new Map();

      for (const oldItem of transaction.items) {
        const productId = oldItem.productId.toString();
        const product = restoreProductMap.get(productId);
        if (!product) continue;

        if (
          product.isSet &&
          Array.isArray(oldItem.setComponents) &&
          oldItem.setComponents.length > 0
        ) {
          oldItem.setComponents.forEach((component) => {
            if (!component?.taken) return;
            if (!component?.productId) return;
            const qty = Number(component.quantity) || 0;
            if (qty > 0) {
              accumulateStockChange(restoreChanges, component.productId, qty);
            }
          });
        } else if (product.isSet && product.setItems?.length) {
          for (const setItem of product.setItems) {
            const component = setItem?.product;
            if (!component) continue;
            const componentId = component._id.toString();
            const restoredQty = oldItem.quantity * (Number(setItem.quantity) || 1);
            accumulateStockChange(restoreChanges, componentId, restoredQty);
          }
        } else {
          accumulateStockChange(restoreChanges, productId, oldItem.quantity);
        }
      }

      // Check if transaction has collegeId, if not fallback to transaction.branchId
      const colId = transaction.collegeId || transaction.branchId;
      await applyStockChanges(restoreChanges, colId);
    }

    const newProductIds = new Set(items.map((item) => item.productId));
    const { productMap: newProductMap, stockMap: newStockMap } = await loadProductsWithComponents(newProductIds);

    let totalAmount = 0;
    const validatedItems = [];
    const stockChanges = new Map();

    for (const item of items) {
      if (!item.productId || item.quantity === undefined || item.price === undefined) {
        res.status(400);
        throw new Error('Each item must have productId, quantity, and price');
      }

      const productId = item.productId.toString();
      const product = newProductMap.get(productId);

      if (!product) {
        res.status(404);
        throw new Error(`Product not found: ${item.productId}`);
      }

      const requestedQuantity = Number(item.quantity);

      let itemStatus = 'fulfilled';
      let componentDetails = [];

      if (product.isSet) {
        if (!product.setItems || product.setItems.length === 0) {
          res.status(400);
          throw new Error(`Set ${product.name} has no component items configured.`);
        }

        const desiredComponents = new Map();
        (Array.isArray(item.setComponents) ? item.setComponents : []).forEach((comp) => {
          if (!comp) return;
          const id =
            (comp.productId && comp.productId.toString) ? comp.productId.toString() :
            comp.productId ? String(comp.productId) :
            comp.product && comp.product._id && comp.product._id.toString
              ? comp.product._id.toString()
              : comp.product && comp.product._id
              ? String(comp.product._id)
              : undefined;
          if (!id) return;
          desiredComponents.set(id, comp);
        });

        for (const setItem of product.setItems) {
          const component = setItem.product;
          if (!component) {
            res.status(400);
            throw new Error(`Set ${product.name} contains an invalid item reference.`);
          }

          const componentId = component._id.toString();
          const required = requestedQuantity * (Number(setItem.quantity) || 1);
          const desiredComponent = desiredComponents.get(componentId);
          const hasTakenFlag =
            desiredComponent && Object.prototype.hasOwnProperty.call(desiredComponent, 'taken');
          const desiredTaken = hasTakenFlag ? Boolean(desiredComponent.taken) : true;

          let taken = desiredTaken;
          let reason = desiredComponent?.reason;

          if (taken) {
            // ONLY check and deduct stock if PAID
            if (targetIsPaid) {
              if (getProjectedStock(componentId, newStockMap, stockChanges) >= required) {
              accumulateStockChange(stockChanges, componentId, -required);
            } else {
              itemStatus = 'partial';
            }
            }
          } else {
            itemStatus = 'partial';
            if (!reason) {
              reason = hasTakenFlag ? 'Marked as not taken' : 'Insufficient stock at issuance';
            }
          }

          componentDetails.push({
            productId: component._id,
            name: component.name,
            quantity: required,
            taken,
            reason: taken ? undefined : reason,
          });
        }
      } else {
        if (targetIsPaid) {
          if (getProjectedStock(productId, newStockMap, stockChanges) >= requestedQuantity) {
            accumulateStockChange(stockChanges, productId, -requestedQuantity);
          } else {
            itemStatus = 'partial';
          }
        }
      }

      const itemTotal = requestedQuantity * Number(item.price);
      totalAmount += itemTotal;
      const transactionItem = {
        productId: item.productId,
        name: item.name || product.name,
        quantity: requestedQuantity,
        price: Number(item.price),
        total: itemTotal,
        status: itemStatus,
        isSet: Boolean(product.isSet),
      };

      if (product.isSet) {
        transactionItem.setComponents = componentDetails;
      }

      validatedItems.push(transactionItem);
    }

    const colId = transaction.collegeId || transaction.branchId;
    if (targetIsPaid && stockChanges.size > 0) {
      await applyStockChanges(stockChanges, colId);
    }
    transaction.stockDeducted = targetIsPaid;

    transaction.items = validatedItems;
    transaction.totalAmount = totalAmount;

    // Update student's items map
    const student = await User.findById(transaction.student.userId);
    if (student) {
      const updatedItems = { ...(student.items || {}) };
      validatedItems.forEach(item => {
        // Only mark as received if the item is fully fulfilled
        if (item.status !== 'partial') {
          const productName = item.name;
          const key = productName.toLowerCase().replace(/\s+/g, '_');
          updatedItems[key] = true;
        }
      });
      student.items = updatedItems;
      await student.save();
    }
  }

  if (paymentMethod !== undefined) {
    transaction.paymentMethod = paymentMethod;
  }

  if (isPaid !== undefined) {
    const prevPaid = transaction.isPaid;
    const prevDeducted = transaction.stockDeducted;
    
    transaction.isPaid = isPaid;
    transaction.paidAt = isPaid ? new Date() : null;

    // Handle stock deduction transition if items were NOT updated above
    // (If items WERE updated, stockDeducted was already handled)
    const itemsUpdated = items && Array.isArray(items) && items.length > 0;
    
    if (!itemsUpdated) {
      if (isPaid && !prevDeducted) {
        // Mark as paid, need to deduct stock
        const currentProductIds = new Set(transaction.items.map(i => i.productId));
        const { productMap, stockMap } = await loadProductsWithComponents(currentProductIds);
        const stockChanges = new Map();

        for (const item of transaction.items) {
          const productId = item.productId.toString();
          const product = productMap.get(productId);
          if (!product) continue;

          if (product.isSet && item.setComponents?.length) {
            for (const comp of item.setComponents) {
              if (!comp.taken) continue;
              const compId = comp.productId.toString();
              const req = Number(comp.quantity) || 0;
              if (getProjectedStock(compId, stockMap, stockChanges) >= req) {
                accumulateStockChange(stockChanges, compId, -req);
              }
            }
          } else {
            if (getProjectedStock(productId, stockMap, stockChanges) >= item.quantity) {
              accumulateStockChange(stockChanges, productId, -item.quantity);
            }
          }
        }

        const colId = transaction.collegeId || transaction.branchId;
        if (stockChanges.size > 0) {
          await applyStockChanges(stockChanges, colId);
          transaction.stockDeducted = true;
        }
      } else if (!isPaid && prevDeducted) {
        // Mark as unpaid, need to restore stock
        const currentProductIds = new Set(transaction.items.map(i => i.productId));
        const { productMap } = await loadProductsWithComponents(currentProductIds);
        const restoreChanges = new Map();

        for (const item of transaction.items) {
          const productId = item.productId.toString();
          const product = productMap.get(productId);
          if (!product) continue;

          if (product.isSet && item.setComponents?.length) {
            for (const comp of item.setComponents) {
              if (!comp.taken) continue;
              accumulateStockChange(restoreChanges, comp.productId.toString(), Number(comp.quantity) || 0);
            }
          } else {
            accumulateStockChange(restoreChanges, productId, item.quantity);
          }
        }

        const colId = transaction.collegeId || transaction.branchId;
        await applyStockChanges(restoreChanges, colId);
        transaction.stockDeducted = false;
      }
    }

    // Update student's paid status
    const student = await User.findById(transaction.student.userId);
    if (student) {
      student.paid = isPaid;
      await student.save();
    }
  }

  if (remarks !== undefined) {
    transaction.remarks = remarks;
  }

  const updatedTransaction = await transaction.save();
  res.status(200).json(updatedTransaction);
});

/**
 * @desc    Delete a transaction
 * @route   DELETE /api/transactions/:id
 * @access  Public
 */
const deleteTransaction = asyncHandler(async (req, res) => {
  const transaction = await Transaction.findById(req.params.id);

  if (!transaction) {
    res.status(404);
    throw new Error('Transaction not found');
  }

  // Restore product stock when deleting transaction ONLY if stock was deducted
  if (transaction.stockDeducted && transaction.items && transaction.items.length > 0) {
    const restoreIds = new Set(transaction.items.map((item) => item.productId));
    const { productMap: restoreProductMap } = await loadProductsWithComponents(restoreIds);
    const restoreChanges = new Map();

    for (const item of transaction.items) {
      const productId = item.productId.toString();
      const product = restoreProductMap.get(productId);
      if (!product) continue;

      if (
        product.isSet &&
        Array.isArray(item.setComponents) &&
        item.setComponents.length > 0
      ) {
        item.setComponents.forEach((component) => {
          if (!component?.taken) return;
          if (!component?.productId) return;
          const qty = Number(component.quantity) || 0;
          if (qty > 0) {
            accumulateStockChange(restoreChanges, component.productId, qty);
          }
        });
      } else if (product.isSet && product.setItems?.length) {
        for (const setItem of product.setItems) {
          const component = setItem?.product;
          if (!component) continue;
          const componentId = component._id.toString();
          const restoredQty = item.quantity * (Number(setItem.quantity) || 1);
          accumulateStockChange(restoreChanges, componentId, restoredQty);
        }
      } else {
        accumulateStockChange(restoreChanges, productId, item.quantity);
      }
    }

    const colId = transaction.collegeId || transaction.branchId;
    await applyStockChanges(restoreChanges, colId);
  }

  await Transaction.findByIdAndDelete(req.params.id);
  res.status(200).json({ message: 'Transaction deleted successfully' });
});

/**
 * @desc    Get student dues report (identifies missing items based on student mapping)
 * @route   GET /api/transactions/reports/dues
 * @access  Public
 */
const getStudentDuesReport = asyncHandler(async (req, res) => {
  const { course, year, branch, semester, kitId } = req.query;

  if (!course) {
    res.status(400);
    throw new Error('Course is required for dues report');
  }

  // 1. Fetch Students
  const studentFilter = { course: course.trim() };
  if (year && year !== '0') studentFilter.year = Number(year);
  if (branch && branch !== '') studentFilter.branch = branch;
  if (semester && semester !== '0') studentFilter.semester = Number(semester);
  
  const students = await User.find(studentFilter).lean();

  // 2. Fetch All Products for this course
  const products = await Product.find({ forCourse: course.trim() }).lean();

  // 3. Helper for keys (mirroring frontend)
  const getItemKey = (name) => name ? name.toLowerCase().trim().replace(/\s+/g, '_') : '';

  // 4. Precompute product metadata
  const processedProducts = products.map(p => ({
    ...p,
    _key: getItemKey(p.name),
    _years: Array.isArray(p.years) ? p.years : (p.year && p.year !== 0 ? [p.year] : []),
    _normalizedBranches: (p.branch || []).map(b => b.toLowerCase().trim()),
    _semesters: p.semesters || []
  }));

  // 5. Calculate Dues for each student
  const duesReport = students.map(student => {
    const studentYear = Number(student.year);
    const studentBranch = student.branch?.toLowerCase().trim() || '';
    const studentSemester = Number(student.semester);
    const itemsMap = student.items || {};

    // Determine applicable products
    const applicableProducts = processedProducts.filter(p => {
      // Logic same as frontend StudentDue.jsx
      if (p._years.length > 0 && !p._years.includes(studentYear)) return false;
      if (p._normalizedBranches.length > 0 && studentBranch && !p._normalizedBranches.includes(studentBranch)) return false;
      if (p._semesters.length > 0 && studentSemester && !p._semesters.includes(studentSemester)) return false;
      return true;
    });

    // Identify pending items
    const pendingItems = applicableProducts.filter(p => !itemsMap[p._key]);

    // Calculate values
    const pendingValue = pendingItems.reduce((sum, p) => sum + (p.price || 0), 0);
    const issuedCount = applicableProducts.length - pendingItems.length;
    const issuedValue = applicableProducts
      .filter(p => itemsMap[p._key])
      .reduce((sum, p) => sum + (p.price || 0), 0);

    return {
      student: {
        _id: student._id,
        name: student.name,
        studentId: student.studentId,
        course: student.course,
        year: student.year,
        branch: student.branch,
        semester: student.semester,
        phoneNumber: student.phoneNumber,
        items: itemsMap // For kit filtering below
      },
      mappedProducts: applicableProducts.map(p => ({ _id: p._id, name: p.name, price: p.price, isSet: p.isSet })),
      pendingItems: pendingItems.map(p => ({ _id: p._id, name: p.name, price: p.price, isSet: p.isSet, _key: p._key })),
      pendingCount: pendingItems.length,
      issuedCount,
      pendingValue,
      issuedValue,
      completion: applicableProducts.length > 0 
        ? Math.round((issuedCount / applicableProducts.length) * 100) 
        : 0
    };
  });

  // 6. Apply Kit/Set filter if requested
  let filteredReport = duesReport;
  if (kitId) {
    const kit = processedProducts.find(p => p._id.toString() === kitId);
    if (!kit) {
      res.status(404);
      throw new Error('Kit not found');
    }

    const kitComponentsKeys = kit.isSet
      ? (kit.setItems || []).map(si => getItemKey(si.productNameSnapshot || ''))
      : [kit._key];

    filteredReport = duesReport.filter(record => {
      // Student must have at least one item from this kit pending
      return kitComponentsKeys.some(key => !record.student.items[key]);
    });
  }

  // Remove full items map from response to save bandwidth
  const cleanedReport = filteredReport.map(r => {
    const { items, ...studentInfo } = r.student;
    return { ...r, student: studentInfo };
  });

  res.status(200).json(cleanedReport.filter(r => r.pendingCount > 0));
});

/**
 * @desc    Get transactions by student ID
 * @route   GET /api/transactions/student/:studentId
 * @access  Public
 */
const getTransactionsByStudent = asyncHandler(async (req, res) => {
  const student = await User.findById(req.params.studentId);

  if (!student) {
    res.status(404);
    throw new Error('Student not found');
  }

  const transactions = await Transaction.find({ 'student.userId': student._id })
    .populate('items.productId', 'name price imageUrl')
    .sort({ transactionDate: -1 });

  res.status(200).json(transactions);
});

module.exports = {
  createTransaction,
  getAllTransactions,
  getTransactionById,
  updateTransaction,
  deleteTransaction,
  getTransactionsByStudent,
  getStudentDuesReport,
};
