const asyncHandler = require('express-async-handler');
const { getEmployeeConnection } = require('../config/employeeDb');
const mongoose = require('mongoose');

// Helper to normalize employee data based on the provided schema
const normalizeEmployeeRow = (emp) => {
    const dynamic = emp.dynamicFields || {};
    
    return {
        id: emp._id,
        empNo: emp.emp_no || 'N/A',
        name: emp.employee_name || 'Unknown',
        phoneNumber: emp.phone_number || 'N/A',
        // Preference: lookup result -> dynamicFields -> top level -> N/A
        division: (emp.div_info && emp.div_info.name) || dynamic.division_name || emp.division_name || 'N/A',
        department: (emp.dept_info && emp.dept_info.name) || dynamic.department_name || emp.department_name || 'N/A',
        designation: (emp.desig_info && emp.desig_info.name) || dynamic.designation_name || emp.designation_name || 'N/A',
        status: emp.is_active ? 'Active' : 'Inactive',
        doj: emp.doj ? (emp.doj.$date || emp.doj) : null,
        email: emp.email || 'N/A',
        gender: emp.gender || 'N/A',
        _source: emp
    };
};

// @desc    Get all employees from HRMS
// @route   GET /api/employees
const getEmployees = asyncHandler(async (req, res) => {
    const conn = getEmployeeConnection();
    if (!conn) {
        res.status(500);
        throw new Error('Employee database connection not established.');
    }

    const {
        page = 1,
        limit = 50,
        search = '',
        division = '',
        department = '',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));
    const skip = (pageNum - 1) * limitNum;

    const Employee = conn.models.Employee || conn.model('Employee', new mongoose.Schema({}, { strict: false, collection: 'employees' }));

    const matchQuery = {};

    if (search) {
        matchQuery.$or = [
            { employee_name: { $regex: search, $options: 'i' } },
            { emp_no: { $regex: search, $options: 'i' } }
        ];
    }

    // Build aggregation pipeline using _id suffixed fields as per schema provided
    const pipeline = [
        { $match: matchQuery },
        {
            $lookup: {
                from: 'departments',
                // Local fields are suffixed with _id as seen in user's schema
                localField: 'department_id',
                foreignField: '_id',
                as: 'dept_info'
            }
        },
        {
            $lookup: {
                from: 'designations',
                localField: 'designation_id',
                foreignField: '_id',
                as: 'desig_info'
            }
        },
        {
            $lookup: {
                from: 'divisions',
                localField: 'division_id',
                foreignField: '_id',
                as: 'div_info'
            }
        },
        { $unwind: { path: '$dept_info', preserveNullAndEmptyArrays: true } },
        { $unwind: { path: '$desig_info', preserveNullAndEmptyArrays: true } },
        { $unwind: { path: '$div_info', preserveNullAndEmptyArrays: true } }
    ];

    // Filtering based on joined names
    if (division && division !== 'all') {
        pipeline.push({ $match: { 'div_info.name': division } });
    }
    if (department && department !== 'all') {
        pipeline.push({ $match: { 'dept_info.name': department } });
    }

    try {
        const totalPipeline = [...pipeline, { $count: 'total' }];
        const countResult = await Employee.aggregate(totalPipeline);
        const total = countResult.length > 0 ? countResult[0].total : 0;

        const rows = await Employee.aggregate([
            ...pipeline,
            { $sort: { created_at: -1 } },
            { $skip: skip },
            { $limit: limitNum }
        ]);

        const normalized = rows.map(normalizeEmployeeRow);

        res.json({
            rows: normalized,
            count: total,
            pagination: {
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum),
            }
        });
    } catch (error) {
        console.error('[Employee DB] Error fetching employees:', error);
        res.status(500).json({ message: 'Error fetching employees from external database' });
    }
});

// @desc    Get single employee by ID
// @route   GET /api/employees/:id
const getEmployeeById = asyncHandler(async (req, res) => {
    const conn = getEmployeeConnection();
    if (!conn) {
        res.status(500);
        throw new Error('Employee database connection not established.');
    }

    const { id } = req.params;
    const Employee = conn.models.Employee || conn.model('Employee', new mongoose.Schema({}, { strict: false, collection: 'employees' }));

    try {
        const pipeline = [
            { $match: { _id: new mongoose.Types.ObjectId(id) } },
            {
                $lookup: {
                    from: 'departments',
                    localField: 'department_id',
                    foreignField: '_id',
                    as: 'dept_info'
                }
            },
            {
                $lookup: {
                    from: 'designations',
                    localField: 'designation_id',
                    foreignField: '_id',
                    as: 'desig_info'
                }
            },
            {
                $lookup: {
                    from: 'divisions',
                    localField: 'division_id',
                    foreignField: '_id',
                    as: 'div_info'
                }
            },
            { $unwind: { path: '$dept_info', preserveNullAndEmptyArrays: true } },
            { $unwind: { path: '$desig_info', preserveNullAndEmptyArrays: true } },
            { $unwind: { path: '$div_info', preserveNullAndEmptyArrays: true } }
        ];

        const results = await Employee.aggregate(pipeline);
        if (results.length === 0) {
            res.status(404);
            throw new Error('Employee not found');
        }

        res.json(normalizeEmployeeRow(results[0]));
    } catch (error) {
        res.status(500);
        throw new Error(`Error fetching employee: ${error.message}`);
    }
});

// @desc    Get all departments from HRMS
const getDepartments = asyncHandler(async (req, res) => {
    const conn = getEmployeeConnection();
    if (!conn) return res.json([]);
    try {
        const Dept = conn.models.Department || conn.model('Department', new mongoose.Schema({ name: String }, { collection: 'departments' }));
        const depts = await Dept.find({ isActive: true }).select('name').sort({ name: 1 }).lean();
        res.json(depts.map(d => d.name).filter(Boolean));
    } catch (err) {
        res.json([]);
    }
});

// @desc    Get all divisions from HRMS
const getDivisions = asyncHandler(async (req, res) => {
    const conn = getEmployeeConnection();
    if (!conn) return res.json([]);
    try {
        const Division = conn.models.Division || conn.model('Division', new mongoose.Schema({ name: String }, { collection: 'divisions' }));
        const divs = await Division.find({ isActive: true }).select('name').sort({ name: 1 }).lean();
        res.json(divs.map(d => d.name).filter(Boolean));
    } catch (err) {
        res.json([]);
    }
});

module.exports = {
    getEmployees,
    getEmployeeById,
    getDepartments,
    getDivisions
};
