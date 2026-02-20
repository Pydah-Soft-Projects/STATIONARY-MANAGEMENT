const express = require('express');
const { getEmployees, getEmployeeById, getDepartments, getDivisions } = require('../controllers/employeeController');

const router = express.Router();

router.get('/', getEmployees);
router.get('/metadata/departments', getDepartments);
router.get('/metadata/divisions', getDivisions);
router.get('/:id', getEmployeeById);

module.exports = router;
