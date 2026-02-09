/**
 * Fulfill Partial Transactions Script
 *
 * Step 1 (dry-run): Lists all student transactions that have partial status
 *   - Shows affected student names and total count
 *   - Does NOT modify any data
 *
 * Step 2 (with --yes): Marks those transactions as fulfilled and updates student items
 *   - Sets every item.status to 'fulfilled'
 *   - Sets every setComponent.taken to true
 *   - Updates each student's items map so they are marked as having received those items
 *
 * Usage (run from backend folder):
 *   node scripts/fulfillPartialTransactions.js          # Preview only (student names + count)
 *   node scripts/fulfillPartialTransactions.js --yes    # Apply changes (after you confirm)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const { Transaction } = require('../models/transactionModel');
const { User } = require('../models/userModel');

const RUN_APPLY = process.argv.includes('--yes');

function toItemKey(name) {
  return (name || '').toLowerCase().trim().replace(/\s+/g, '_');
}

async function connect() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI not set. Ensure backend/.env has MONGO_URI.');
  }
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  console.log('Connected to MongoDB\n');
}

async function main() {
  await connect();

  // Find student transactions that have at least one item with status 'partial'
  // or a set with any component taken: false
  const partialTransactions = await Transaction.find({
    transactionType: 'student',
    $or: [
      { 'items.status': 'partial' },
      { 'items.setComponents.taken': false },
    ],
  })
    .populate('student.userId', 'name studentId course year')
    .lean();

  const totalCount = partialTransactions.length;

  // Unique students (by userId)
  const studentIds = new Set();
  const studentNames = [];
  partialTransactions.forEach((tx) => {
    const uid = tx.student?.userId?._id?.toString() || tx.student?.userId?.toString();
    if (uid && !studentIds.has(uid)) {
      studentIds.add(uid);
      const name = tx.student?.userId?.name || tx.student?.name || 'Unknown';
      const studentId = tx.student?.userId?.studentId || tx.student?.studentId || '';
      const course = tx.student?.userId?.course || tx.student?.course || '';
      studentNames.push({ name, studentId, course, userId: uid });
    }
  });

  // ---- Preview: always show list and count ----
  console.log('=== Partial-status transactions (preview) ===\n');
  console.log('Total transactions with partial status:', totalCount);
  console.log('Unique students affected:', studentNames.length);
  console.log('\nAffected students:');
  console.log('------------------');
  if (studentNames.length === 0) {
    console.log('(none)');
  } else {
    studentNames.forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.name} (${s.studentId}) - ${s.course}`);
    });
  }

  if (!RUN_APPLY) {
    console.log('\n--- No changes made (dry-run). ---');
    console.log('To apply: mark these transactions as fulfilled and update student items, run:');
    console.log('  node scripts/fulfillPartialTransactions.js --yes\n');
    await mongoose.disconnect();
    process.exit(0);
    return;
  }

  // ---- Apply: mark fulfilled and update student items ----
  console.log('\n=== Applying changes (--yes) ===\n');

  let updatedTxCount = 0;
  const studentsToUpdate = new Map(); // userId -> Set of item keys to set true

  for (const tx of partialTransactions) {
    const items = tx.items || [];
    const newItems = items.map((it) => ({
      ...it,
      status: 'fulfilled',
      setComponents: (it.setComponents || []).map((c) => ({ ...c, taken: true })),
    }));

    await Transaction.updateOne({ _id: tx._id }, { $set: { items: newItems } });
    updatedTxCount++;

    const uid = tx.student?.userId?._id?.toString() || tx.student?.userId?.toString();
    if (uid) {
      items.forEach((item) => {
        const key = toItemKey(item.name);
        if (key) {
          if (!studentsToUpdate.has(uid)) studentsToUpdate.set(uid, new Set());
          studentsToUpdate.get(uid).add(key);
        }
      });
    }
  }

  // Update each student's items map
  let updatedStudents = 0;
  for (const [userId, keys] of studentsToUpdate) {
    const user = await User.findById(userId).lean();
    if (!user) continue;
    const current = user.items || {};
    const next = { ...current };
    keys.forEach((k) => { next[k] = true; });
    await User.updateOne({ _id: userId }, { $set: { items: next } });
    updatedStudents++;
  }

  console.log('Transactions updated (marked fulfilled):', updatedTxCount);
  console.log('Students updated (items map):', updatedStudents);
  console.log('\nDone.\n');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
