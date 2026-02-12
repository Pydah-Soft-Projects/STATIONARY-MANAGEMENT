const express = require('express');
const { getCourses, getBranches } = require('../controllers/sqlAcademicController');

const router = express.Router();

router.get('/courses', getCourses);
router.get('/branches', getBranches);

module.exports = router;
