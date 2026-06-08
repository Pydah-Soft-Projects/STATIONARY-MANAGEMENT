const express = require('express');
const { getCourses, getBranches, getAcademicBatches } = require('../controllers/sqlAcademicController');

const router = express.Router();

router.get('/courses', getCourses);
router.get('/branches', getBranches);
router.get('/batches', getAcademicBatches);

module.exports = router;
