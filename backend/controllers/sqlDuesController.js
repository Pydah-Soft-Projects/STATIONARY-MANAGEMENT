const asyncHandler = require('express-async-handler');
const { getMySqlPool } = require('../config/mysql'); // Use your MySQL config path
const { Product } = require('../models/productModel'); // MongoDB Product
const { Transaction } = require('../models/transactionModel'); // MongoDB Transaction
const { normalizeStudentRow } = require('./sqlStudentController');

const DEFAULT_STUDENT_TABLE = 'students';

/**
 * Get Student Dues Report
 * Fetches students from MySQL based on filters, then calculates dues based on MongoDB Products and Transactions.
 * optimized to perform heavy lifting on backend.
 */
const getStudentDues = asyncHandler(async (req, res) => {
    // Ensure unique label for concurrent requests or just use a simple time log
    const timerLabel = `TotalDuration-${Date.now()}`;
    console.time(timerLabel);
    const pool = getMySqlPool();
    if (!pool) {
        res.status(500);
        throw new Error('MySQL pool is not configured.');
    }

    const {
        course,
        branch,
        year,
        semester,
        search,
        kitId, // specific kit filter
        limit = 50,
        page = 1,
        includeSummary = 'false', // to return total counts
    } = req.query;

    console.log('getStudentDues params:', { course, branch, year, page });

    // OPTIMIZATION: Require Course Selection
    // Fetching ALL students from SQL is too heavy. We enforce selecting a course first.
    if (!course) {
        return res.json({
            students: [],
            total: 0,
            stats: {
                totalStudents: 0,
                totalPendingItems: 0,
                totalPendingAmount: 0,
                impactedCourses: 0
            },
            page: 1,
            totalPages: 0,
            message: 'Please select a course to view dues.'
        });
    }

    // 1. Build MySQL Query to fetch students matching filters
    const tableName = process.env.DB_STUDENTS_TABLE || DEFAULT_STUDENT_TABLE;
    const conditions = [];
    const params = [];

    if (course) {
        conditions.push(`LOWER(course) = LOWER(?)`);
        params.push(course);
    }
    if (branch) {
        conditions.push(`LOWER(branch) = LOWER(?)`);
        params.push(branch);
    }
    if (year) {
        conditions.push(`CAST(current_year AS CHAR) = ?`);
        params.push(String(year));
    }
    if (semester) {
        conditions.push(`CAST(current_semester AS CHAR) = ?`);
        params.push(String(semester));
    }
    if (search) {
        const searchPattern = `%${search}%`;
        conditions.push(`(student_name LIKE ? OR admission_number LIKE ? OR student_mobile LIKE ?)`);
        params.push(searchPattern, searchPattern, searchPattern);
    }

    // Filter out cancelled/withdrawn students in memory since 'status' column might not exist in SQL
    // conditions.push(\`(status IS NULL OR LOWER(status) NOT LIKE '%cancel%' AND LOWER(status) NOT LIKE '%withdrawn%')\`);

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // NOTE: To ensure correct pagination of "Students with Dues" (since "Paid" students are filtered out),
    // and to provide correct "Total Pending Amount" stats, we must fetch ALL matching candidates from SQL,
    // process their dues, and THEN paginate the resulting list.

    // 1. Fetch ALL matching students (No Limit/Offset in SQL)
    // Optimization: Select only necessary columns
    const sql = `SELECT id, admission_number, pin_no, student_name, course, branch, current_year, current_semester, student_mobile, student_status FROM \`${tableName}\` ${whereClause} ORDER BY admission_number DESC`;
    const sqlParams = [...params];

    // 2. Prepare Product Query (Mongo)
    const productQuery = {};
    if (course) productQuery.forCourse = { $regex: new RegExp(`^${course}$`, 'i') }; // Case insensitive match

    try {
        // Execute SQL and Product Fetch in Parallel
        console.time('FetchData');
        const [sqlResult, allProducts] = await Promise.all([
            pool.query(sql, sqlParams),
            Product.find(productQuery).lean().then(products => {
                console.log(`[Dues] Debug: Found ${products.length} products matching query:`, JSON.stringify(productQuery));
                products.forEach(p => {
                    console.log(` - ${p.name} (${p._id})`);
                    console.log(`   forCourse: '${p.forCourse}'`);
                    console.log(`   Applicability: Years [${p.years?.join(',') || ''}], Sems [${p.semesters?.join(',') || ''}]`);
                    console.log(`   Mode: ${p.applicabilityMode}`);
                });
                return products;
            })
        ]);
        console.timeEnd('FetchData');

        const [rows] = sqlResult;

        console.log(`[Dues] Debug: SQL Query returned ${rows?.length || 0} rows.`);

        let allStudents = Array.isArray(rows) ? rows.map(normalizeStudentRow) : [];

        // Filter out withdrawn/cancelled students
        allStudents = allStudents.filter(student => {
            const status = String(student.status || '').toLowerCase();
            return !status.includes('cancel') && !status.includes('withdrawn') && !status.includes('discontinued');
        });

        console.log(`[Dues] Debug: After filtering active students: ${allStudents.length}`);

        if (allStudents.length === 0) {
            return res.json({
                students: [],
                total: 0,
                stats: {
                    totalStudents: 0,
                    totalPendingItems: 0,
                    totalPendingAmount: 0,
                    impactedCourses: 0
                },
                page: parseInt(page),
                totalPages: 0
            });
        }

        // 3. Fetch Paid Transactions (Optimized Batching)
        const CHUNK_SIZE = 500;
        const transactionPromises = [];

        for (let i = 0; i < allStudents.length; i += CHUNK_SIZE) {
            const chunk = allStudents.slice(i, i + CHUNK_SIZE);
            const chunkSqlIds = chunk.map(s => String(s.id));
            const chunkAdmNos = chunk.map(s => String(s.studentId));

            // Combine IDs to query 'student.sqlId' effectively (it might hold either ID type during migration)
            const distinctIds = [...new Set([...chunkSqlIds, ...chunkAdmNos])];

            transactionPromises.push(
                Transaction.find({
                    isPaid: true,
                    $or: [
                        { 'student.sqlId': { $in: distinctIds } },
                        { 'student.studentId': { $in: chunkAdmNos } } // Check legacy admission numbers too
                    ]
                })
                    .select('student items isPaid') // OPTIMIZATION: Projection
                    .lean()
            );
        }

        console.time('FetchTransactions');
        const transactionResults = await Promise.all(transactionPromises);
        const transactions = transactionResults.flat();
        console.timeEnd('FetchTransactions');

        // Build Transaction Map: StudentID -> Set<ItemKey>
        const studentItemsMap = {};
        // Helper to add item
        const addItem = (sid, itemName) => {
            if (!studentItemsMap[sid]) studentItemsMap[sid] = new Set();
            const key = itemName.toLowerCase().replace(/\s+/g, '_');
            studentItemsMap[sid].add(key);
        };

        transactions.forEach(txn => {
            const sqlId = txn.student?.sqlId ? String(txn.student.sqlId).trim() : null;
            const admNo = txn.student?.studentId ? String(txn.student.studentId).trim() : null;

            if (!sqlId && !admNo) return;

            if (txn.items) {
                txn.items.forEach(item => {
                    // Logic Update: Count 'partial' items as Received for DUES purposes.
                    // If the transaction is PAID, the student does not owe money for this item,
                    // even if they haven't collected all components yet.
                    // if (item.status === 'partial') return; // REMOVED checking partial status

                    // Add to BOTH keys to ensure we find it regardless of which ID the student record has
                    if (sqlId) {
                        addItem(sqlId, item.name);
                        if (item.productId) addItem(sqlId, `id:${item.productId}`);
                    }
                    if (admNo) {
                        addItem(admNo, item.name);
                        if (item.productId) addItem(admNo, `id:${item.productId}`);
                    }
                });
            }
        });

        console.time('CalculateDues');
        // 4. Calculate Dues for each student
        const dueReports = allStudents.map(student => {
            const sid1 = String(student.id);
            const sid2 = String(student.studentId);
            const studentReceivedItems = new Set([
                ...(studentItemsMap[sid1] || []),
                ...(studentItemsMap[sid2] || [])
            ]);

            // Filter Applicable Products for *this* student
            const applicableProducts = allProducts.filter(product => {
                // Normalize Helper (Match frontend StudentDetail: remove special chars)
                const norm = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');

                // 1. Add-on Check (frontend: isAddOnProduct)
                // If forCourse is empty, it's an add-on -> Not a Due.
                // Unless applicabilityMode is students (handled below)
                if (product.applicabilityMode !== 'students' && !product.forCourse) return false;

                // Course Mismatch
                if (product.forCourse && norm(product.forCourse) !== norm(student.course)) return false;

                // Mode: Students
                if (product.applicabilityMode === 'students') {
                    // Check if student ID is in list
                    const allowedIds = (product.applicableStudents || []).map(String);
                    return allowedIds.includes(sid1) || allowedIds.includes(sid2);
                }

                // Mode: Rules (Year/Semester/Branch)

                // Year Check
                const productYears = Array.isArray(product.years) ? product.years : (product.year ? [product.year] : []);
                const studentYear = Number(student.year);

                // DEBUG: Log first few students to check their year
                if (allStudents.indexOf(student) < 5 && product.name.includes("M.TECH")) {
                    console.log(`[Dues Debug] Student: ${student.name}, Year: "${student.year}" (Parsed: ${studentYear}) vs Product Years: [${productYears}]`);
                }

                if (productYears.length > 0 && !productYears.includes(studentYear)) return false;

                // Semester Check (Optional in product)
                const productSemesters = product.semesters || [];
                const studentSemester = Number(student.semester);
                if (productSemesters.length > 0) {
                    if (!studentSemester || !productSemesters.includes(studentSemester)) return false;
                }

                // Branch Check
                const productBranches = Array.isArray(product.branch) ? product.branch : (product.branch ? [product.branch] : []);
                // Normalize branches
                const normProductBranches = productBranches.map(norm);
                const studentBranch = norm(student.branch);

                if (normProductBranches.length > 0 && !normProductBranches.includes(studentBranch)) return false;

                return true;
            });

            // Identify Missing items
            const pendingItems = [];
            let pendingCost = 0;

            // Kit Filter Logic (if applied)
            if (kitId) {
                // If a specific KIT is filtered, we only care if they are missing THAT kit (or parts of it).
                // But usually the report lists all pending items.
                // If kitId is supplied, we probably only want students having THAT kit valid & pending.
                // If kitId is supplied, we probably only want students having THAT kit valid & pending.
                const targetKit = applicableProducts.find(p => String(p._id) === kitId);
                if (!targetKit) return null; // Invalid kit filter or kit not applicable to student

                // Check if pending
                const receivedByName = studentReceivedItems.has(targetKit._key);
                const receivedById = targetKit._id && studentReceivedItems.has(`id:${targetKit._id}`);

                if (!receivedByName && !receivedById) {
                    pendingItems.push({
                        _id: targetKit._id,
                        name: targetKit.name,
                        price: targetKit.price,
                        type: targetKit.isSet ? 'Kit' : 'Item',
                        _key: targetKit._key
                    });
                    pendingCost += (Number(targetKit.price) || 0);
                }

            } else {
                // Standard Check for all applicable
                applicableProducts.forEach(prod => {
                    const receivedByName = studentReceivedItems.has(prod._key);
                    const receivedById = prod._id && studentReceivedItems.has(`id:${prod._id}`);

                    if (!receivedByName && !receivedById) {
                        pendingItems.push({
                            _id: prod._id,
                            name: prod.name,
                            price: prod.price,
                            type: prod.isSet ? 'Kit' : 'Item',
                            _key: prod._key // Include key for potential frontend debugging
                        });
                        pendingCost += (Number(prod.price) || 0);
                    }
                });
            }

            if (pendingItems.length === 0 && !req.query.showAll) return null; // Skip if no dues (unless showing all)

            const issuedCount = applicableProducts.length - pendingItems.length;
            const completion = applicableProducts.length > 0 ? (issuedCount / applicableProducts.length) * 100 : 100;

            return {
                student: {
                    _id: student.id,
                    id: student.id,
                    studentId: student.studentId,
                    name: student.name,
                    course: student.course,
                    branch: student.branch,
                    year: student.year,
                    semester: student.semester,
                    pin: student.pin,
                    phoneNumber: student.phoneNumber,
                },
                pendingItems,
                totalDue: pendingCost,
                itemsCount: pendingItems.length,
                // Frontend expects these for progress bar:
                mappedProducts: applicableProducts,
                issuedCount: issuedCount,
                pendingCount: pendingItems.length,
                completion: completion
            };

        }).filter(Boolean); // Remove nulls
        console.timeEnd('CalculateDues');
        console.timeEnd('TotalDuration'); // This was mismatching.
        console.timeEnd(timerLabel);

        // 5. Calculate Stats (Global for this filter)
        const totalStudentsWithDues = dueReports.length;
        const totalEnrolled = allStudents.length;
        const paidStudents = totalEnrolled - totalStudentsWithDues;

        const totalPendingAmount = dueReports.reduce((sum, r) => sum + r.totalDue, 0);
        const totalPendingItems = dueReports.reduce((sum, r) => sum + r.itemsCount, 0);
        const impactedCourses = new Set(dueReports.map(r => r.course)).size;

        // 6. Paginate Results
        let paginatedReports = [];
        let totalPages = 0;

        if (limit === 'all') {
            paginatedReports = dueReports;
            totalPages = 1;
        } else {
            const startIndex = (parseInt(page) - 1) * parseInt(limit);
            const endIndex = startIndex + parseInt(limit);
            paginatedReports = dueReports.slice(startIndex, endIndex);
            totalPages = Math.ceil(totalStudentsWithDues / parseInt(limit));
        }

        res.json({
            students: paginatedReports,
            total: totalStudentsWithDues, // Total students matching filters AND having dues
            stats: {
                totalStudents: totalStudentsWithDues, // Kept for backward compatibility (Pending Count)
                totalEnrolled, // New: Total matching filters
                paidStudents, // New: Total matching filters - Pending
                unpaidStudents: totalStudentsWithDues, // New: Alias for clarity
                totalPendingItems,
                totalPendingAmount,
                impactedCourses
            },
            page: parseInt(page),
            totalPages: totalPages
        });

    } catch (error) {
        console.error('[Dues Report] Error:', error);
        res.status(500);
        throw new Error(`Failed to calculate dues: ${error.message}`);
    }
});

module.exports = { getStudentDues };
