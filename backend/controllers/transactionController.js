const { Transaction } = require('../models/transactionModel');
// const { User } = require('../models/userModel'); // REMOVED
const { Product } = require('../models/productModel');
const { College } = require('../models/collegeModel');
const { SubAdmin } = require('../models/subAdminModel');
const { StockTransfer } = require('../models/stockTransferModel');
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');

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
const applyStockChanges = async (changeMap, collegeId, session = null) => {
  if (!changeMap || changeMap.size === 0 || !collegeId) return;

  const college = await College.findById(collegeId).session(session);
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
    const newQty = current + delta; // Allow negative
    collegeStockMap.set(productId, newQty);
  });

  // Re-construct the stock array
  const updatedStock = [];
  collegeStockMap.forEach((qty, productId) => {
    // Keep items in the array even if stock is 0 or negative
    updatedStock.push({ product: productId, quantity: qty });
  });

  college.stock = updatedStock;
  await college.save({ session });
};

const loadCollegeStock = async (collegeId, productIds, session = null) => {
  if (!collegeId) return new Map();
  
  const college = await College.findById(collegeId).select('stock').session(session);
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
const { getMySqlPool } = require('../config/mysql');

// DEFAULT_STUDENT_TABLE constant should match sqlStudentController
const DEFAULT_STUDENT_TABLE = 'students';

/**
 * @desc    Create a new transaction
 * @route   POST /api/transactions
 * @access  Public
 */
const createTransaction = asyncHandler(async (req, res) => {
  const { studentId, employeeId, items, paymentMethod, isPaid, remarks, cashAmount, onlineAmount } = req.body;
  let { collegeId, branchId } = req.body;
  
  // Consolidate to collegeId
  if (!collegeId && branchId) {
    collegeId = branchId;
  }

  if ((!studentId && !employeeId) || !items || !Array.isArray(items) || items.length === 0) {
    res.status(400);
    throw new Error('Student/Employee ID and items are required');
  }

  const transactionType = employeeId ? 'employee' : 'student';

  let transactionEntity = null; // Will hold either student or employee record for transaction object

  if (transactionType === 'student') {
    // Find the student via MySQL
    const pool = getMySqlPool();
    if (!pool) {
      res.status(500);
      throw new Error('MySQL pool is not configured.');
    }

    const tableName = process.env.DB_STUDENTS_TABLE || DEFAULT_STUDENT_TABLE;
    let studentData = null;

    try {
      const [rows] = await pool.query(
        `SELECT * FROM ${tableName} WHERE id = ? LIMIT 1`,
        [studentId]
      );

      if (rows.length > 0) {
        studentData = rows[0];
      } else {
        // Fallback: search by admission_number, admission_no, or pin_no
        const [rowsFallback] = await pool.query(
          `SELECT * FROM ${tableName} WHERE admission_number = ? OR admission_no = ? OR pin_no = ? LIMIT 1`,
          [studentId, studentId, studentId]
        );
        if (rowsFallback.length > 0) {
          studentData = rowsFallback[0];
        }
      }
    } catch (error) {
      console.error('MySQL Error during student lookup:', error);
      res.status(500);
      throw new Error('Database error during student lookup');
    }

    if (!studentData) {
      res.status(404);
      throw new Error('Student not found');
    }

    // Construct student object for transaction
    const deriveValue = (record, possibleKeys, fallback = null) => {
      for (const key of possibleKeys) {
        if (key in record && record[key] !== null && record[key] !== undefined) {
          return record[key];
        }
      }
      return fallback;
    };

    const firstName = deriveValue(studentData, ['first_name', 'firstName', 'fname', 'first']);
    const lastName = deriveValue(studentData, ['last_name', 'lastName', 'lname', 'last']);
    const combinedName = [firstName, lastName].filter(Boolean).join(' ').trim();

    transactionEntity = {
      sqlId: String(studentData.id),
      name: deriveValue(studentData, ['name', 'student_name', 'studentName', 'full_name', 'fullName']) || combinedName || 'Unknown',
      studentId: deriveValue(studentData, ['admission_number', 'admission_no', 'student_id', 'studentId', 'roll_no', 'rollNo', 'pin_no', 'pinNo']) || 'N/A',
      course: deriveValue(studentData, ['course', 'course_name', 'courseName', 'program', 'programme'], 'N/A'),
      year: parseInt(deriveValue(studentData, ['year', 'year_of_study', 'yearOfStudy', 'current_year', 'stud_year', 'semester_year'], 1)) || 1,
      branch: deriveValue(studentData, ['branch', 'department', 'dept', 'department_name'], 'N/A'),
      semester: parseInt(deriveValue(studentData, ['semester', 'current_semester', 'semester_no', 'sem', 'sem_no'], null)) || null,
      pin: deriveValue(studentData, ['pin', 'pin_no', 'pinNo', 'university_id'], ''),
    };
  } else {
    // Handle Employee lookup from MongoDB
    const { getEmployeeConnection } = require('../config/employeeDb');
    const conn = getEmployeeConnection();
    if (!conn) {
      res.status(500);
      throw new Error('Employee database connection not established.');
    }
    const Employee = conn.models.Employee || conn.model('Employee', new mongoose.Schema({}, { strict: false, collection: 'employees' }));
    
    // Use aggregation to resolve metadata names
    const pipeline = [
      { $match: { _id: new mongoose.Types.ObjectId(employeeId) } },
      {
        $lookup: {
          from: 'departments',
          localField: 'department_id', // Corrected from department
          foreignField: '_id',
          as: 'dept_info'
        }
      },
      {
        $lookup: {
          from: 'designations',
          localField: 'designation_id', // Corrected from designation
          foreignField: '_id',
          as: 'desig_info'
        }
      },
      {
        $lookup: {
          from: 'divisions',
          localField: 'division_id', // Corrected from division
          foreignField: '_id',
          as: 'div_info'
        }
      },
      { $unwind: { path: '$dept_info', preserveNullAndEmptyArrays: true } },
      { $unwind: { path: '$desig_info', preserveNullAndEmptyArrays: true } },
      { $unwind: { path: '$div_info', preserveNullAndEmptyArrays: true } }
    ];

    const results = await Employee.aggregate(pipeline);
    
    if (results.length === 0) {
      res.status(404);
      throw new Error('Employee not found');
    }

    const emp = results[0];
    const dynamic = emp.dynamicFields || {};
    transactionEntity = {
      id: String(emp._id),
      name: emp.employee_name || 'Unknown',
      empNo: emp.emp_no || 'N/A',
      division: (emp.div_info && emp.div_info.name) || dynamic.division_name || emp.division_name || 'N/A',
      department: (emp.dept_info && emp.dept_info.name) || dynamic.department_name || emp.department_name || 'N/A',
      designation: (emp.desig_info && emp.desig_info.name) || dynamic.designation_name || emp.designation_name || 'N/A',
    };
  }

  // Determine College context
  let targetCollegeId = collegeId;
  const entityCourse = transactionType === 'student' ? transactionEntity.course : null;

  // If no collegeId in body, and we have a user (staff) in request
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
  if (!targetCollegeId && entityCourse) {
    console.log('[DEBUG] createTransaction: Attempting backup lookup for course:', entityCourse);
    const backupCollege = await College.findOne({ courses: entityCourse });
    if (backupCollege) {
      console.log('[DEBUG] createTransaction: Backup found college:', backupCollege.name);
      targetCollegeId = backupCollege._id;
    }
  }

  if (!targetCollegeId) {
    res.status(400);
    throw new Error('Transaction must be associated with a College. Please ensure Staff is assigned to a College.');
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

    const explicitStatus = item.status;
    let itemStatus = explicitStatus || 'fulfilled';
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
            if (explicitStatus !== 'fulfilled') itemStatus = 'partial';
            reason = `Insufficient stock at college (required ${required}, available ${Math.max(available, 0)})`;
          } 
          
          // Always deduct stock if paid, even if it goes negative
          accumulateStockChange(stockChanges, componentId, -required);

          componentDetails.push({
            productId: component._id,
            name: component.name,
            quantity: required,
            taken,
            reason: taken ? undefined : reason,
          });
        } else {
          componentDetails.push({
            productId: component._id,
            name: component.name,
            quantity: required,
            taken: true,
          });
        }
      }
    } else {
      // CHECK COLLEGE STOCK IF PAID
      if (isPaid) {
        const available = getProjectedStock(productId, collegeStockMap, stockChanges);
        accumulateStockChange(stockChanges, productId, -requestedQuantity);
        if (available < requestedQuantity) {
          if (explicitStatus !== 'fulfilled') itemStatus = 'partial'; // Mark as partial if stock is insufficient even if paid
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
  const transactionData = {
    transactionId,
    transactionType,
    collegeId: targetCollegeId,
    items: validatedItems,
    totalAmount,
    paymentMethod: paymentMethod || 'cash',
    isPaid: isPaid || false,
    paidAt: isPaid ? new Date() : null,
    stockDeducted: Boolean(isPaid && stockChanges.size > 0),
    transactionDate: new Date(),
    remarks: remarks || '',
    cashAmount: paymentMethod === 'split' ? (Number(cashAmount) || 0) : (paymentMethod === 'cash' ? totalAmount : 0),
    onlineAmount: paymentMethod === 'split' ? (Number(onlineAmount) || 0) : (paymentMethod === 'online' ? totalAmount : 0),
  };

  if (transactionType === 'student') {
    transactionData.student = transactionEntity;
  } else if (transactionType === 'employee') {
    transactionData.employee = transactionEntity;
  }

  const transaction = await Transaction.create(transactionData);

  // Updated student items are NOT saved to MongoDB anymore.
  // They are calculated dynamically by sqlStudentController.

  res.status(201).json(transaction);
});

/**
 * @desc    Get all transactions
 * @route   GET /api/transactions
 * @access  Public
 */
/**
 * @desc    Get all transactions
 * @route   GET /api/transactions
 * @access  Public
 */
const getAllTransactions = asyncHandler(async (req, res) => {
  const { course, studentId, transactionType, paymentMethod, isPaid, startDate, endDate, collegeId, limit } = req.query;
  
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
  
  if (transactionType === 'employee') {
    if (studentId) {
      filter.$or = [
        { 'employee.id': studentId },
        { 'employee.empNo': studentId }
      ];
    }
  } else if (!transactionType || transactionType === 'student') {
    if (course) {
      filter['student.course'] = course;
    }
    
    if (studentId) {
      // Logic update: 'studentId' param can be either sqlId, legacy userId, or the string studentId (Admission No)
      filter.$or = [
        { 'student.sqlId': studentId },
        { 'student.studentId': studentId },
        { 'student.userId': studentId } // Keep legacy support just in case
      ];
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

  const maxLimit = Math.min(parseInt(limit, 10) || 5000, 10000);
  const transactions = await Transaction.find(filter)
    .populate('items.productId', 'name price imageUrl')
    // removed populate('student.userId') as we are not using the ref for student data anymore
    // data is embedded in student object inside transaction
    .populate('collegeTransfer.collegeId', 'name location')
    .sort({ transactionDate: -1 })
    .limit(maxLimit)
    .lean();

  // For college/branch transfers, attach transferDate from StockTransfer so reports group by transfer date, not completed-at
  const transferTxIds = transactions
    .filter(t => t.transactionType === 'college_transfer' || t.transactionType === 'branch_transfer')
    .map(t => t._id);
  if (transferTxIds.length > 0) {
    const transfers = await StockTransfer.find({ transactionId: { $in: transferTxIds } })
      .select('transactionId transferDate')
      .lean();
    const txIdToTransferDate = new Map();
    transfers.forEach(t => {
      const txId = t.transactionId && t.transactionId.toString ? t.transactionId.toString() : t.transactionId;
      if (txId && t.transferDate) txIdToTransferDate.set(txId, t.transferDate);
    });
    transactions.forEach(t => {
      if (t.transactionType === 'college_transfer' || t.transactionType === 'branch_transfer') {
        const txId = t._id && t._id.toString ? t._id.toString() : t._id;
        if (txIdToTransferDate.has(txId)) {
          t.transferDate = txIdToTransferDate.get(txId);
        }
      }
    });
  }

  res.status(200).json(transactions);
});

/**
 * @desc    Get transaction by ID
 * @route   GET /api/transactions/:id
 * @access  Public
 */
const getTransactionById = asyncHandler(async (req, res) => {
  const transaction = await Transaction.findById(req.params.id)
    .populate('items.productId', 'name price imageUrl description')
    .lean();

  if (!transaction) {
    res.status(404);
    throw new Error('Transaction not found');
  }

  if (transaction.transactionType === 'college_transfer' || transaction.transactionType === 'branch_transfer') {
    const transfer = await StockTransfer.findOne({ transactionId: req.params.id }).select('transferDate').lean();
    if (transfer && transfer.transferDate) transaction.transferDate = transfer.transferDate;
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

  const { items, paymentMethod, isPaid, remarks, cashAmount, onlineAmount } = req.body;

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
    const { productMap: newProductMap } = await loadProductsWithComponents(newProductIds);
    const txCollegeId = transaction.collegeId || transaction.branchId;
    const newCollegeStockMap = await loadCollegeStock(txCollegeId, newProductIds);

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

      const explicitStatus = item.status;
      let itemStatus = 'fulfilled'; // optimistic default
      let componentDetails = [];
      let anyComponentNotTaken = false;

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
            if (targetIsPaid) {
              accumulateStockChange(stockChanges, componentId, -required);
            }
          } else {
            anyComponentNotTaken = true;
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
        
        // Auto-upgrade logic for sets
        if (explicitStatus === 'fulfilled') {
          itemStatus = 'fulfilled';
        } else if (anyComponentNotTaken) {
          itemStatus = 'partial';
        } else {
          itemStatus = 'fulfilled';
        }
      } else {
        if (targetIsPaid) {
          const available = getProjectedStock(productId, newCollegeStockMap, stockChanges);
          accumulateStockChange(stockChanges, productId, -requestedQuantity);
          if (available < requestedQuantity) {
            if (explicitStatus !== 'fulfilled') itemStatus = 'partial';
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
    transaction.stockDeducted = Boolean(targetIsPaid && stockChanges.size > 0);

    transaction.items = validatedItems;
    transaction.totalAmount = totalAmount;

    transaction.items = validatedItems;
    transaction.totalAmount = totalAmount;

    // Updated student items are NOT saved to MongoDB anymore.
    // They are calculated dynamically by sqlStudentController.
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
              
              // Always deduct even if insufficient
              if (getProjectedStock(compId, stockMap, stockChanges) < req) {
                 // Note: we can't easily change item status here without more logic, 
                 // but the stock deduction is the priority
              }
              accumulateStockChange(stockChanges, compId, -req);
            }
          } else {
            // Always deduct even if insufficient
            accumulateStockChange(stockChanges, productId, -item.quantity);
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

    // REMOVED: We no longer update student.paid status on the MongoDB User model.
    // This is now derived dynamically from transaction history in sqlStudentController.
  }

  if (remarks !== undefined) {
    transaction.remarks = remarks;
  }

  if (cashAmount !== undefined || onlineAmount !== undefined || paymentMethod !== undefined) {
    const finalMethod = paymentMethod !== undefined ? paymentMethod : transaction.paymentMethod;
    const finalTotal = items ? transaction.totalAmount : transaction.totalAmount; // totalAmount was updated above if items was provided

    if (finalMethod === 'split') {
      if (cashAmount !== undefined) transaction.cashAmount = Number(cashAmount) || 0;
      if (onlineAmount !== undefined) transaction.onlineAmount = Number(onlineAmount) || 0;
    } else if (finalMethod === 'cash') {
      transaction.cashAmount = transaction.totalAmount;
      transaction.onlineAmount = 0;
    } else if (finalMethod === 'online') {
      transaction.cashAmount = 0;
      transaction.onlineAmount = transaction.totalAmount;
    } else {
      transaction.cashAmount = 0;
      transaction.onlineAmount = 0;
    }
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
  const { studentId } = req.params;
  
  // Check if studentId is a valid ObjectId (MongoDB _id)
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(studentId);

  let filter = {};

  if (isObjectId) {
      // If ObjectId, assume it's a Mongo User ID
      filter = { 'student.userId': studentId };
  } else {
      // If not ObjectId, assume it's a MySQL ID (sqlId) or Admission No (studentId)
      const cleanId = studentId.replace(/^["']|["']$/g, '');
      
      // We want to match either sqlId OR studentId (Admission No)
      // Since we migrated, sqlId should be the primary key.
      filter = { 
          $or: [
              { 'student.sqlId': cleanId },
              { 'student.studentId': cleanId }
          ] 
      };
  }

  const transactions = await Transaction.find(filter)
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
