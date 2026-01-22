const asyncHandler = require('express-async-handler');
const { AuditLog } = require('../models/auditLogModel');
const { Product } = require('../models/productModel');
const { College } = require('../models/collegeModel');

// POST /api/audit-logs
const createAuditLog = asyncHandler(async (req, res) => {
  const { productId, beforeQuantity, afterQuantity, notes, createdBy, batchId, collegeId } = req.body || {};

  if (!productId) {
    res.status(400);
    throw new Error('Product ID is required');
  }

  const parsedBefore = Number(beforeQuantity);
  const parsedAfter = Number(afterQuantity);

  if (!Number.isFinite(parsedBefore) || parsedBefore < 0) {
    res.status(400);
    throw new Error('Valid beforeQuantity is required');
  }

  if (!Number.isFinite(parsedAfter) || parsedAfter < 0) {
    res.status(400);
    throw new Error('Valid afterQuantity is required');
  }

  const product = await Product.findById(productId);
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }
  
  // Validate College if provided
  if (collegeId) {
    const college = await College.findById(collegeId);
    if (!college) {
        res.status(404);
        throw new Error('College not found');
    }
  }

  const auditLog = await AuditLog.create({
    product: productId,
    college: collegeId || null,
    beforeQuantity: parsedBefore,
    afterQuantity: parsedAfter,
    notes: notes || '',
    createdBy: createdBy || 'System',
    batchId: batchId,
  });

  await auditLog.populate('product', 'name stock price forCourse branch');
  if (auditLog.college) {
    await auditLog.populate('college', 'name');
  }

  res.status(201).json(auditLog);
});

// GET /api/audit-logs?status=pending
// Optional query: collegeId (to filter logs for a specific college)
const listAuditLogs = asyncHandler(async (req, res) => {
  const { status, collegeId } = req.query;
  const filter = {};

  if (status && status !== 'all') {
    filter.status = status;
  }
  
  if (collegeId) {
    filter.college = collegeId;
  }

  const logs = await AuditLog.find(filter)
    .sort({ createdAt: -1 })
    .populate('product', 'name stock price forCourse branch isSet')
    .populate('college', 'name');

  res.json(logs);
});

// PATCH /api/audit-logs/:id/approve
const approveAuditLog = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { approvedBy, notes } = req.body || {};

  const auditLog = await AuditLog.findById(id);
  if (!auditLog) {
    res.status(404);
    throw new Error('Audit log not found');
  }

  if (auditLog.status !== 'pending') {
    res.status(400);
    throw new Error('Only pending audit logs can be approved');
  }

  // Handle Stock Update
  if (auditLog.college) {
    // Update College Stock
    const college = await College.findById(auditLog.college);
    if (!college) {
        res.status(404);
        throw new Error('College associated with this audit log not found');
    }

    // Find custom stock entry in college
    const stockIndex = college.stock.findIndex(s => s.product.toString() === auditLog.product.toString());
    
    if (stockIndex > -1) {
        college.stock[stockIndex].quantity = auditLog.afterQuantity;
    } else {
        // If product missing in college stock but audited, add it? 
        // Logic choice: yes, initialize it.
        college.stock.push({
            product: auditLog.product,
            quantity: auditLog.afterQuantity
        });
    }
    await college.save();

  } else {
    // Update Central Stock
    const product = await Product.findById(auditLog.product);
    if (!product) {
        res.status(404);
        throw new Error('Linked product no longer exists');
    }
    product.stock = auditLog.afterQuantity;
    await product.save();
  }

  auditLog.status = 'approved';
  auditLog.approvedBy = approvedBy || 'System';
  auditLog.approvedAt = new Date();
  if (notes) {
      auditLog.notes = notes;
  }
  await auditLog.save();

  await auditLog.populate('product', 'name stock price forCourse branch');
  if (auditLog.college) {
      await auditLog.populate('college', 'name');
  }

  res.json(auditLog);
});

// PATCH /api/audit-logs/:id/reject
const rejectAuditLog = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { approvedBy, notes } = req.body || {};

  const auditLog = await AuditLog.findById(id);
  if (!auditLog) {
    res.status(404);
    throw new Error('Audit log not found');
  }

  if (auditLog.status !== 'pending') {
    res.status(400);
    throw new Error('Only pending audit logs can be rejected');
  }

  auditLog.status = 'rejected';
  auditLog.approvedBy = approvedBy || 'System';
  auditLog.approvedAt = new Date();
  if (notes) {
    auditLog.notes = `${auditLog.notes ? `${auditLog.notes}\n` : ''}Rejected: ${notes}`;
  }
  await auditLog.save();

  await auditLog.populate('product', 'name stock price forCourse branch');
  if (auditLog.college) {
    await auditLog.populate('college', 'name');
  }

  res.json(auditLog);
});

module.exports = {
  createAuditLog,
  listAuditLogs,
  approveAuditLog,
  rejectAuditLog,
};

