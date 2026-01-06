const express = require('express');
const router = express.Router();
const {
  createTransaction,
  getAllTransactions,
  getTransactionById,
  updateTransaction,
  deleteTransaction,
  getTransactionsByStudent,
  getStudentDuesReport,
} = require('../controllers/transactionController');

// @route   POST /api/transactions
// @route   GET /api/transactions
router.route('/').post(createTransaction).get(getAllTransactions);

// @route   GET /api/transactions/student/:studentId
router.get('/student/:studentId', getTransactionsByStudent);

// @route   GET /api/transactions/reports/dues
router.get('/reports/dues', getStudentDuesReport);

// @route   GET /api/transactions/:id
// @route   PUT /api/transactions/:id
// @route   DELETE /api/transactions/:id
router.route('/:id').get(getTransactionById).put(updateTransaction).delete(deleteTransaction);

module.exports = router;

