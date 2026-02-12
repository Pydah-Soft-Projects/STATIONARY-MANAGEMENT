require('dotenv').config();
const mongoose = require('mongoose');
const { getMySqlPool } = require('../config/mysql');
const { Transaction } = require('../models/transactionModel');

// --- Standalone DB Connection ---
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

const mapTransactionsToSqlStudents = async () => {
    try {
        await connectDB();
        const pool = await getMySqlPool();
        
        console.log('\n--- Starting Transaction Migration ---');

        // 1. Fetch all students from MySQL
        console.log('[Migration] Fetching all MySQL students...');
        const [sqlStudents] = await pool.query(`
            SELECT id, admission_number, admission_no, pin_no, student_name, course, branch
            FROM students
        `);
        console.log(`[Migration] Found ${sqlStudents.length} MySQL students.`);

        // 2. Build Lookup Maps
        const idMap = new Map(); // Maps standardized ID (Admission/PIN) -> SQL ID
        const sqlIdSet = new Set(); // Stores valid SQL IDs to check for direct matches
        const nameMap = new Map(); // Maps Normalized Name -> SQL ID

        sqlStudents.forEach(s => {
            sqlIdSet.add(String(s.id));
            if (s.admission_number) idMap.set(String(s.admission_number).trim(), s.id);
            if (s.admission_no) idMap.set(String(s.admission_no).trim(), s.id);
            if (s.pin_no) idMap.set(String(s.pin_no).trim(), s.id);

            // Build Name Map
            if (s.student_name) {
                const normName = String(s.student_name).trim().toLowerCase();
                if (nameMap.has(normName)) {
                    nameMap.set(normName, 'AMBIGUOUS'); // Mark duplicate names as ambiguous
                } else {
                    nameMap.set(normName, s.id);
                }
            }
        });

        // 3. Fetch all Mongo Transactions
        console.log('[Migration] Fetching all MongoDB transactions...');
        const transactions = await Transaction.find({}).select('transactionId student transactionDate totalAmount');
        console.log(`[Migration] Found ${transactions.length} transactions to process.`);

        const stats = {
            total: transactions.length,
            success: 0,
            skipped: 0,
            failed: 0,
            updates: []
        };

        const bulkOps = [];

        for (const txn of transactions) {
            const studentData = txn.student;
            const admissionNo = studentData.studentId ? String(studentData.studentId).trim() : 'Unknown';
            const studentName = studentData.name || 'Unknown';
            const key = `${studentName} (${admissionNo})`;

            // Initialize stats for this student if not exists
            if (!stats.updates[key]) {
                stats.updates[key] = {
                    total: 0,
                    mapped: 0,
                    failed: 0,
                    sqlId: null,
                    method: null,
                    failedTxns: [] // Track specific transaction IDs
                };
            }
            stats.updates[key].total++;
            
            // Skip if already has sqlId
            if (studentData.sqlId) {
                stats.skipped++;
                stats.updates[key].mapped++;
                stats.updates[key].sqlId = studentData.sqlId; // Already present
                stats.updates[key].method = 'Existing';
                continue;
            }

            let sqlId = null;
            let method = null;

            // Strategy 1: Look up by Admission Number / PIN
            if (admissionNo && idMap.has(admissionNo)) {
                sqlId = idMap.get(admissionNo);
                method = 'Admission/PIN Map';
            }
            // Strategy 2: Check if the 'Admission Number' is actually the SQL ID itself
            else if (sqlIdSet.has(admissionNo)) {
                sqlId = admissionNo; // It was the SQL ID all along!
                method = 'Direct SQL ID Match';
            }
            // Strategy 3: Name Match (Fallback - Exact)
            else {
                const normName = String(studentName).trim().toLowerCase();
                if (nameMap.has(normName)) {
                    const mappedId = nameMap.get(normName);
                    if (mappedId !== 'AMBIGUOUS') {
                        sqlId = mappedId;
                        method = 'Name Match (Exact)';
                    } else {
                        method = 'Name Match Failed (Ambiguous)'; 
                    }
                } 
                // Strategy 4: Fuzzy Name Match
                else if (normName.length > 3) { // Only fuzzy match if name has reasonable length
                    let bestMatchId = null;
                    let bestDist = Infinity;
                    let bestMatchName = '';
                    
                    // Iterate over all known names in the map
                    for (const [knownName, knownId] of nameMap.entries()) {
                         if (knownId === 'AMBIGUOUS') continue;

                         const dist = getLevenshteinDistance(normName, knownName);
                         // Threshold: Allow 1 error per 4 characters roughly, or fixed max distance of 3-4
                         const allowedDist = Math.floor(normName.length * 0.3) + 1; 

                         if (dist <= allowedDist && dist < bestDist) {
                             bestDist = dist;
                             bestMatchId = knownId;
                             bestMatchName = knownName;
                         }
                    }

                    if (bestMatchId) {
                        sqlId = bestMatchId;
                        method = `Fuzzy Match (~${bestMatchName})`;
                    }
                }
            }

            if (sqlId) {
                bulkOps.push({
                    updateOne: {
                        filter: { _id: txn._id },
                        update: { $set: { 'student.sqlId': String(sqlId) } }
                    }
                });
                stats.success++;
                stats.updates[key].mapped++;
                stats.updates[key].sqlId = sqlId;
                stats.updates[key].method = method;
            } else {
                stats.failed++;
                stats.updates[key].failed++;
                stats.updates[key].failedTxns.push(txn.transactionId); // Track failed txn ID
                if (!stats.updates[key].method) stats.updates[key].method = method || 'No Match'; 
            }
        }

        // 4. Perform Bulk Updates
        if (bulkOps.length > 0) {
            console.log(`[Migration] Committing ${bulkOps.length} updates to MongoDB...`);
            const res = await Transaction.bulkWrite(bulkOps);
            console.log(`[Migration] Bulk Write Result: Matched ${res.matchedCount}, Modified ${res.modifiedCount}`);
        } else {
            console.log('[Migration] No updates needed.');
        }

        console.log('\n--- Detailed Student Statistics ---');
        const failedList = [];
        Object.entries(stats.updates).forEach(([studentKey, data]) => {
            const methodInfo = data.method ? `(${data.method})` : '';
            if (data.failed > 0) {
                const status = 'PARTIAL/FAILED';
                console.log(`[${status}] ${studentKey}: ${data.mapped}/${data.total} mapped. SQL ID: ${data.sqlId || 'N/A'} ${methodInfo}`);
                failedList.push({ key: studentKey, reason: data.method || 'No Match', txns: data.failedTxns });
            } else {
                 // Optional: Don't print OK ones to reduce noise if there are many
                 // console.log(`[OK] ${studentKey}: ${data.mapped}/${data.total} mapped. ${methodInfo}`);
            }
        });
        
        if (failedList.length > 0) {
            console.log('\n--- FAILED IDs DEBUG INFO ---');
            console.log('The following Mongo Students (and their transaction IDs) could not be found in MySQL:');
            failedList.forEach(item => {
                console.log(` - ${item.key}`);
                console.log(`   * Failed Count: ${item.count}`);
                console.log(`   * Reason: ${item.reason}`);
                // If we tracked specific transaction IDs for failures, we could list them here.
                // Since we didn't store successful/failed IDs separately in `stats`, we can't list individual IDs easily without modifying the main loop.
                // However, the main goal is to explain the COUNT discrepancy.
            });
        }

        console.log('\n=============================================');
        console.log('       TRANSACTION MIGRATION SUMMARY        ');
        console.log('=============================================');
        console.log(`Total Transactions Processed   : ${stats.total}`);
        console.log(`Successfully Mapped            : ${stats.success}`);
        console.log(`Skipped (Already Linked)       : ${stats.skipped}`);
        console.log(`Failed (No SQL Match)          : ${stats.failed}`);
        console.log('=============================================');
        
        // Disconnect
        await mongoose.disconnect();
        process.exit(0);

    } catch (error) {
        console.error('[Migration Error]', error);
        process.exit(1);
    }
};

/**
 * Levenshtein Distance Algorithm for Fuzzy Matching
 */
function getLevenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];

    // increment along the first column of each row
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    // increment each column in the first row
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    // Fill in the rest of the matrix
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    Math.min(
                        matrix[i][j - 1] + 1, // insertion
                        matrix[i - 1][j] + 1 // deletion
                    )
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

// Run the script
mapTransactionsToSqlStudents();
