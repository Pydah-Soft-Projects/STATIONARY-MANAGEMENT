const asyncHandler = require('express-async-handler');
const { getMySqlPool } = require('../config/mysql'); // Use your MySQL config path
const { Product } = require('../models/productModel'); // MongoDB Product
const { Transaction } = require('../models/transactionModel'); // MongoDB Transaction
const { normalizeStudentRow } = require('./sqlStudentController');
const { productAppliesToStudent } = require('../utils/productApplicability');

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
        kitId, // single kit filter (legacy)
        kitIds, // multiple kit filter
        limit = 50,
        page = 1,
        includeSummary = 'false', // to return total counts
    } = req.query;

    console.log('getStudentDues params:', { course, branch, year, page, kitId, kitIds });

    // Handle kitIds (could be string or array)
    let selectedKitIds = [];
    if (kitIds) {
        selectedKitIds = Array.isArray(kitIds) ? kitIds : String(kitIds).split(',');
    } else if (kitId) {
        selectedKitIds = [kitId];
    }

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

    if (course && course !== 'all') {
        conditions.push(`course = ?`);
        params.push(course);
    }
    if (branch && branch !== 'all') {
        const bLower = branch.toLowerCase().trim();
        let branchOptions = [bLower];
        
        if (bLower === 'cse' || bLower.includes('computer science')) {
            branchOptions = ['cse', 'computer science', 'computer science engineering', 'computer science and engineering'];
        } else if (bLower === 'ece' || bLower.includes('electronics')) {
            branchOptions = ['ece', 'electronics', 'electronics & communication engineering', 'electronics and communication engineering', 'electronics and communications engineering'];
        } else if (bLower === 'eee' || bLower.includes('electrical')) {
            branchOptions = ['eee', 'electrical', 'electrical and electronics engineering', 'electrical & electronics engineering', 'electrical & electronics', 'electrical and electronics'];
        } else if (bLower === 'mech' || bLower.includes('mechanical')) {
            branchOptions = ['mech', 'mechanical', 'mechanical engineering'];
        } else if (bLower === 'civil') {
            branchOptions = ['civil', 'civil engineering'];
        } else if (bLower === 'it' || bLower.includes('information technology')) {
            branchOptions = ['it', 'information technology'];
        }

        const placeholders = branchOptions.map(() => '?').join(',');
        conditions.push(`(branch IN (${placeholders}) OR branch LIKE ? OR ? LIKE CONCAT('%', branch, '%'))`);
        params.push(...branchOptions, `%${bLower}%`, bLower);
    }
    if (year && year !== 'all') {
        const yStr = String(year).trim();
        let yearOptions = [yStr];
        
        if (yStr === '1') yearOptions.push('I');
        else if (yStr === '2') yearOptions.push('II');
        else if (yStr === '3') yearOptions.push('III');
        else if (yStr === '4') yearOptions.push('IV');
        
        const placeholders = yearOptions.map(() => '?').join(',');
        conditions.push(`current_year IN (${placeholders})`);
        params.push(...yearOptions);
    }
    if (semester && semester !== 'all') {
        const sStr = String(semester).trim();
        let semOptions = [sStr];
        
        if (sStr === '1') semOptions.push('I');
        else if (sStr === '2') semOptions.push('II');
        else if (sStr === '3') semOptions.push('III');
        else if (sStr === '4') semOptions.push('IV');
        
        const placeholders = semOptions.map(() => '?').join(',');
        conditions.push(`current_semester IN (${placeholders})`);
        params.push(...semOptions);
    }
    if (search) {
        const searchPattern = `%${search}%`;
        conditions.push(`(student_name LIKE ? OR admission_number LIKE ? OR student_mobile LIKE ?)`);
        params.push(searchPattern, searchPattern, searchPattern);
    }

    // Filter out cancelled/withdrawn students in memory since 'status' column might not exist in SQL
    // conditions.push(`(status IS NULL OR LOWER(status) NOT LIKE '%cancel%' AND LOWER(status) NOT LIKE '%withdrawn%')`);

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // NOTE: To ensure correct pagination of "Students with Dues" (since "Paid" students are filtered out),
    // and to provide correct "Total Pending Amount" stats, we must fetch ALL matching candidates from SQL,
    // process their dues, and THEN paginate the resulting list.

    // 1. Fetch ALL matching students (No Limit/Offset in SQL)
    const sql = `SELECT * FROM \`${tableName}\` ${whereClause} ORDER BY admission_number DESC`;
    const sqlParams = [...params];

    // 2. Prepare Product Query (Mongo)
    const productQuery = {};
    if (course) {
        productQuery.forCourse = { $in: [course, course.toLowerCase().trim(), course.toUpperCase().trim()] };
    }

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
                    console.log(`   Applicability: Years [${p.years?.join(',') || ''}], Batches [${p.academicYears?.join(',') || ''}], Sems [${p.semesters?.join(',') || ''}]`);
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

        // 3. Fetch Transactions (Paid + Credit)
        const sqlIds = allStudents.map(s => String(s.id));
        const admNos = allStudents.map(s => String(s.studentId));
        const distinctIds = [...new Set([...sqlIds, ...admNos])];

        console.time('FetchTransactions');
        const transactions = await Transaction.find({
            $or: [
                { 'student.sqlId': { $in: distinctIds } },
                { 'student.studentId': { $in: distinctIds } }
            ]
        })
            .select('student items isPaid createdAt') 
            .lean();
        console.timeEnd('FetchTransactions');

        // Pre-calculate Kit Component Map for Implicit Kit Satisfaction
        const kitMap = new Map();
        allProducts.forEach(p => {
            if (p.isSet && p.setItems) {
                kitMap.set(String(p._id), p.setItems.map(item => String(item.product)));
            }
        });

        // Build Transaction Map: StudentID -> Set<ItemKey>
        const studentItemsMap = {};
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
                    // Logic Update: Only count fulfilled items as Received.
                    // Items with 'partial' status (out of stock) are NOT considered received.
                    if (item.status === 'partial') return;

                    if (sqlId) {
                        addItem(sqlId, item.name);
                        if (item.productId) addItem(sqlId, `id:${item.productId}`);
                        
                        // NEW: If it's a kit, also mark components as received
                        if (item.isSet && item.setComponents) {
                            item.setComponents.forEach(comp => {
                                if (comp.taken && comp.productId) addItem(sqlId, `id:${comp.productId}`);
                                if (comp.taken && comp.name) addItem(sqlId, comp.name);
                            });
                        }
                    }
                    if (admNo) {
                        addItem(admNo, item.name);
                        if (item.productId) addItem(admNo, `id:${item.productId}`);

                        // NEW: If it's a kit, also mark components as received
                        if (item.isSet && item.setComponents) {
                            item.setComponents.forEach(comp => {
                                if (comp.taken && comp.productId) addItem(admNo, `id:${comp.productId}`);
                                if (comp.taken && comp.name) addItem(admNo, comp.name);
                            });
                        }
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
            const applicableProducts = allProducts.filter((product) =>
                productAppliesToStudent(product, student)
            );

            // Identify Missing items
            const pendingItems = [];
            let pendingCost = 0;

            applicableProducts.forEach(prod => {
                const receivedByName = studentReceivedItems.has(prod._key);
                const receivedById = prod._id && studentReceivedItems.has(`id:${prod._id}`);
                
                let isReceived = receivedByName || receivedById;

                // NEW: Implicit Kit Satisfaction Check
                // If a student received all components of a kit individually, mark the kit as satisfied.
                if (!isReceived && prod.isSet) {
                    const componentIds = kitMap.get(String(prod._id)) || [];
                    if (componentIds.length > 0) {
                        const allComponentsReceived = componentIds.every(compId => 
                            studentReceivedItems.has(`id:${compId}`)
                        );
                        if (allComponentsReceived) {
                            isReceived = true;
                        }
                    }
                }

                if (!isReceived) {
                    // If specific KITS are filtered, only add to pending if it's one of them
                    if (selectedKitIds.length > 0 && !selectedKitIds.includes(String(prod._id))) {
                        return;
                    }

                    pendingItems.push({
                        _id: prod._id,
                        name: prod.name,
                        price: prod.price,
                        type: prod.isSet ? 'Kit' : 'Item',
                        _key: prod._key
                    });
                    pendingCost += (Number(prod.price) || 0);
                }
            });

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
        console.timeEnd(timerLabel);

        // 5. Calculate Stats (Global and Branch-wise)
        const totalStudentsWithDues = dueReports.length;
        const totalEnrolled = allStudents.length;
        const paidStudents = totalEnrolled - totalStudentsWithDues;

        const totalPendingAmount = dueReports.reduce((sum, r) => sum + r.totalDue, 0);
        const totalPendingItems = dueReports.reduce((sum, r) => sum + r.itemsCount, 0);
        const impactedCourses = new Set(dueReports.map(r => r.course)).size;

        // NEW: Calculate Branch-wise Stats
        const branchStatsMap = {};
        
        allStudents.forEach(s => {
            const b = (s.branch || 'Common / No Branch').toUpperCase();
            if (!branchStatsMap[b]) branchStatsMap[b] = { total: 0, unpaid: 0, paid: 0 };
            branchStatsMap[b].total++;
        });

        dueReports.forEach(r => {
            const b = (r.student.branch || 'Common / No Branch').toUpperCase();
            if (branchStatsMap[b]) {
                branchStatsMap[b].unpaid++;
            }
        });

        // Calculate paid for each branch
        Object.keys(branchStatsMap).forEach(b => {
            branchStatsMap[b].paid = branchStatsMap[b].total - branchStatsMap[b].unpaid;
        });

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
                impactedCourses,
                branchStats: branchStatsMap
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
