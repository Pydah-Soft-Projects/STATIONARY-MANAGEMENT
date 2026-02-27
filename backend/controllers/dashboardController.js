const asyncHandler = require('express-async-handler');
const { Transaction } = require('../models/transactionModel');
const { Product } = require('../models/productModel');
const { getMySqlPool } = require('../config/mysql');
const mongoose = require('mongoose');

// @desc    Get dashboard statistics
// @route   GET /api/dashboard/stats
// @access  Private/Admin
const getDashboardStats = asyncHandler(async (req, res) => {
  const { collegeId } = req.query;
  const filter = {};
  
  if (collegeId) {
    filter.collegeId = new mongoose.Types.ObjectId(collegeId);
  }

  // --- MySQL Stats (Students) ---
  const pool = getMySqlPool();
  let totalStudents = 0;
  
  if (pool) {
    const tableName = process.env.DB_STUDENTS_TABLE || 'students';
    try {
      // For now, only total count is feasible without complex dues join here
      // We can add "paid" vs "unpaid" if we have a way to track it efficiently in SQL
      const [rows] = await pool.query(`SELECT COUNT(*) as total FROM \`${tableName}\``);
      totalStudents = rows[0]?.total || 0;
    } catch (err) {
      console.error('MySQL Dashboard Error:', err);
    }
  }

  // --- MongoDB Stats (Transactions & Revenue) ---
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Revenue Aggregation
  const revenueStats = await Transaction.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: { $cond: [{ $eq: ['$isPaid', true] }, '$totalAmount', 0] } },
        pendingRevenue: { $sum: { $cond: [{ $eq: ['$isPaid', false] }, '$totalAmount', 0] } },
        totalTransactions: { $sum: 1 },
        todayRevenue: { 
          $sum: { 
            $cond: [
              { $and: [{ $eq: ['$isPaid', true] }, { $gte: ['$transactionDate', today] }] }, 
              '$totalAmount', 
              0
            ] 
          } 
        },
        todayTransactions: {
          $sum: { $cond: [{ $gte: ['$transactionDate', today] }, 1, 0] }
        }
      }
    }
  ]);

  const rev = revenueStats[0] || {
    totalRevenue: 0,
    pendingRevenue: 0,
    totalTransactions: 0,
    todayRevenue: 0,
    todayTransactions: 0
  };

  // --- Product & Stock Stats ---
  const totalProducts = await Product.countDocuments();
  
  // Low Stock Count
  const lowStockItems = await Product.countDocuments({
    $expr: { $lt: ['$stock', { $ifNull: ['$lowStockThreshold', 10] }] }
  });

  // --- Recent Transactions ---
  const recentTransactions = await Transaction.find(filter)
    .sort({ transactionDate: -1 })
    .limit(5)
    .lean();

  // --- Zero-Stock Dues List ---
  const zeroStockDuesList = await Transaction.aggregate([
    { 
      $match: { 
        ...filter, 
        isPaid: true, 
        'items.status': 'partial' 
      } 
    },
    {
      $project: {
        student: 1,
        items: 1,
        transactionDate: 1
      }
    },
    { $sort: { transactionDate: -1 } }
  ]);

  // Transform zeroStockDuesList to match frontend expectation
  const zeroStockMap = new Map();
  zeroStockDuesList.forEach(txn => {
    const sId = txn.student?.sqlId || txn.student?.studentId;
    if (!sId) return;

    const partialItems = (txn.items || [])
      .filter(i => i.status === 'partial')
      .map(i => i.name);

    if (partialItems.length === 0) return;

    if (!zeroStockMap.has(sId)) {
      zeroStockMap.set(sId, {
        student: txn.student,
        studentId: sId,
        items: new Set(partialItems),
        transactionDate: txn.transactionDate
      });
    } else {
      partialItems.forEach(name => zeroStockMap.get(sId).items.add(name));
    }
  });

  const zeroStockDuesData = Array.from(zeroStockMap.values()).map(entry => ({
    ...entry,
    items: Array.from(entry.items)
  }));

  const zeroStockDuesStudents = zeroStockDuesData.length;

  res.json({
    totalStudents,
    paidStudents: 0, // Placeholder till SQL logic refined
    unpaidStudents: 0, // Placeholder till SQL logic refined
    totalTransactions: rev.totalTransactions,
    totalRevenue: rev.totalRevenue,
    pendingRevenue: rev.pendingRevenue,
    totalProducts,
    totalStockValue: 0, // Can be calculated if needed, likely heavy
    lowStockItems,
    todayTransactions: rev.todayTransactions,
    todayRevenue: rev.todayRevenue,
    zeroStockDuesStudents,
    zeroStockDuesData,
    recentTransactions
  });
});

module.exports = {
  getDashboardStats
};
