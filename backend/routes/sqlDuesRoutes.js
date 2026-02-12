const express = require('express');
const { getStudentDues } = require('../controllers/sqlDuesController');

const router = express.Router();

router.get('/dues', getStudentDues);

module.exports = router;
