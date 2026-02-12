const express = require('express');
const { getSqlStudents, syncSqlStudents, getStudentById } = require('../controllers/sqlStudentController');

const router = express.Router();

router.get('/students', getSqlStudents);
router.get('/students/:id', getStudentById);
router.post('/students/sync', syncSqlStudents);

module.exports = router;


