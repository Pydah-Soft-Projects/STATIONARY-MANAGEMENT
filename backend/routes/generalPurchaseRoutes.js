const express = require('express');
const router = express.Router();
const {
  createPurchase,
  getAllPurchases,
  getPurchaseById,
  updatePurchase,
  deletePurchase,
} = require('../controllers/generalPurchaseController');

// Purchase routes
router.post('/', createPurchase);
router.get('/', getAllPurchases);
router.get('/:id', getPurchaseById);
router.put('/:id', updatePurchase);
router.delete('/:id', deletePurchase);

module.exports = router;
