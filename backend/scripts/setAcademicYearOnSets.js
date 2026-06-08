/**
 * Set academicYears to 2025-26 on all kit/set products.
 * Usage (from backend/): node scripts/setAcademicYearOnSets.js
 * Optional: ACADEMIC_YEAR=2025-26 node scripts/setAcademicYearOnSets.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { Product } = require('../models/productModel');

const TARGET_BATCH = (process.env.ACADEMIC_YEAR || '2025-26').trim();

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is not set in backend/.env');
  }

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  console.log('Connected to MongoDB');

  const sets = await Product.find({ isSet: true }).select('name academicYears isSet').lean();
  console.log(`Found ${sets.length} set(s) to update.`);

  if (sets.length === 0) {
    console.log('Nothing to update.');
    return;
  }

  sets.forEach((p) => {
    const before = (p.academicYears || []).join(', ') || '(none)';
    console.log(`  - ${p.name}: ${before} → ${TARGET_BATCH}`);
  });

  const result = await Product.updateMany(
    { isSet: true },
    { $set: { academicYears: [TARGET_BATCH] } }
  );

  console.log(`\nUpdated ${result.modifiedCount} set(s) to academic year "${TARGET_BATCH}".`);
}

main()
  .catch((err) => {
    console.error('Failed:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  });
