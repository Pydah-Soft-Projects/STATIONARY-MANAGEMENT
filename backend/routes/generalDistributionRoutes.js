const express = require('express');
const router = express.Router();
const {
  createDistribution,
  getAllDistributions,
  getDistributionReportsSummary,
  getDistributionById,
  updateDistribution,
  deleteDistribution,
} = require('../controllers/generalDistributionController');

// Distribution routes
router.post('/', createDistribution);
router.get('/', getAllDistributions);
router.get('/reports/summary', getDistributionReportsSummary);
router.get('/:id', getDistributionById);
router.put('/:id', updateDistribution);
router.delete('/:id', deleteDistribution);

module.exports = router;
