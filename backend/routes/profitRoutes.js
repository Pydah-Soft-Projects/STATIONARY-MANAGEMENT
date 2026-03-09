const express = require('express');
const router = express.Router();
const { getProfitStats } = require('../controllers/profitController');

// All profit routes are protected by admin logic usually, but here we mount at /api/profit
// Middleware for auth can be added in server.js or here
router.get('/stats', getProfitStats);

module.exports = router;
