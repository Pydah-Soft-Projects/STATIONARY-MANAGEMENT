/**
 * Fix wrong product on employee transaction M9SI7T (PADATALA JYOTHIRMAYEE).
 *
 * The transaction was billed with the wrong "RECORDS / KKD" product. This script:
 *  1. INSPECT MODE (default, read-only):
 *     - Finds the employee's transactions and prints the target transaction items.
 *     - Lists all candidate "record" products with their central stock and the
 *       stock at the transaction's college (where the deduction happened).
 *  2. APPLY MODE (--apply --new-product-id=<id>):
 *     - Replaces the wrong item's productId/name with the correct product.
 *     - Reconciles college stock: +qty back to the wrong product, -qty from the
 *       correct product (same college the original deduction hit).
 *     - Item price/total and transaction totalAmount are left unchanged
 *       (the employee already paid ₹360 cash).
 *
 * Usage:
 *   cd backend
 *   node scripts/fixWrongRecordProduct.js                                  # inspect only (safe)
 *   node scripts/fixWrongRecordProduct.js --new-product-id=<id>            # dry-run of the fix
 *   node scripts/fixWrongRecordProduct.js --new-product-id=<id> --apply    # actually write changes
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

const { Transaction } = require('../models/transactionModel');
const { Product } = require('../models/productModel');
const { College } = require('../models/collegeModel');

// ------------------------- CONFIG -------------------------
const EMPLOYEE_NAME = 'PADATALA JYOTHIRMAYEE';
const TRANSACTION_ID = 'M9SI7T'; // stored without the leading '#'
const WRONG_ITEM_NAME_MATCH = /RECORDS\s*\/\s*KKD/i; // the wrongly billed item
const CANDIDATE_PRODUCT_MATCH = /record/i; // to list possible correct products
// -----------------------------------------------------------

const APPLY = process.argv.includes('--apply');
const newProductIdArg = process.argv.find((a) => a.startsWith('--new-product-id='));
const NEW_PRODUCT_ID = newProductIdArg ? newProductIdArg.split('=')[1] : null;

const fmt = (n) => `₹${Number(n || 0).toFixed(2)}`;

async function connect() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI must be defined in backend/.env');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');
}

function getCollegeStockQty(college, productId) {
  const entry = (college.stock || []).find(
    (s) => s.product && s.product.toString() === productId.toString()
  );
  return entry ? entry.quantity : 0;
}

async function findEmployeeTransactions() {
  console.log(`\n=== Transactions for employee "${EMPLOYEE_NAME}" ===`);
  const txns = await Transaction.find({
    transactionType: 'employee',
    'employee.name': { $regex: new RegExp(EMPLOYEE_NAME.trim().replace(/\s+/g, '\\s+'), 'i') },
  })
    .sort({ transactionDate: -1 })
    .lean();

  console.log(`Found ${txns.length} transaction(s).`);
  txns.forEach((txn) => {
    console.log(`\n#${txn.transactionId}  ${new Date(txn.transactionDate).toLocaleString('en-IN')}`);
    console.log(`  employee: ${txn.employee?.name} (empNo: ${txn.employee?.empNo}, id: ${txn.employee?.id})`);
    console.log(`  collegeId: ${txn.collegeId || txn.branchId || 'NONE'}`);
    console.log(`  isPaid: ${txn.isPaid} | stockDeducted: ${txn.stockDeducted} | payment: ${txn.paymentMethod} | total: ${fmt(txn.totalAmount)}`);
    txn.items.forEach((item, idx) => {
      console.log(`  item[${idx}]: "${item.name}" x${item.quantity} @ ${fmt(item.price)} = ${fmt(item.total)}`);
      console.log(`           productId: ${item.productId} | isSet: ${item.isSet} | status: ${item.status}`);
    });
  });

  return txns;
}

async function showCandidateProducts(collegeId) {
  console.log(`\n=== Candidate products matching ${CANDIDATE_PRODUCT_MATCH} ===`);
  const products = await Product.find({ name: CANDIDATE_PRODUCT_MATCH })
    .select('_id name price stock isSet forCourse category')
    .lean();

  const college = collegeId
    ? await College.findById(collegeId).select('name stock').lean()
    : null;

  if (college) {
    console.log(`(college stock shown for: ${college.name} - ${collegeId})`);
  } else {
    console.log('(no collegeId on transaction; only central stock shown)');
  }

  products.forEach((p) => {
    const collegeQty = college ? getCollegeStockQty(college, p._id) : 'n/a';
    console.log(`\n- ${p.name}`);
    console.log(`    _id: ${p._id}`);
    console.log(`    price: ${fmt(p.price)} | isSet: ${p.isSet} | course: ${p.forCourse || 'global'} | category: ${p.category}`);
    console.log(`    central stock (Product.stock): ${p.stock}`);
    console.log(`    college stock: ${collegeQty}`);
  });

  if (products.length === 0) console.log('No products matched.');
  return products;
}

async function fixTransaction() {
  const txn = await Transaction.findOne({
    transactionId: { $regex: new RegExp(`^#?${TRANSACTION_ID}$`, 'i') },
  });
  if (!txn) throw new Error(`Transaction ${TRANSACTION_ID} not found`);

  const itemIndex = txn.items.findIndex((it) => WRONG_ITEM_NAME_MATCH.test(it.name));
  if (itemIndex === -1) {
    throw new Error(
      `No item matching ${WRONG_ITEM_NAME_MATCH} on #${txn.transactionId}. Items: ${txn.items
        .map((i) => i.name)
        .join(', ')}`
    );
  }
  const item = txn.items[itemIndex];

  if (item.isSet || (item.setComponents && item.setComponents.length > 0)) {
    throw new Error('Wrong item is a SET product; this script only handles plain items. Aborting.');
  }

  const newProduct = await Product.findById(NEW_PRODUCT_ID);
  if (!newProduct) throw new Error(`New product ${NEW_PRODUCT_ID} not found`);
  if (newProduct._id.toString() === item.productId.toString()) {
    throw new Error('New product is the same as the wrongly billed product. Aborting.');
  }
  if (newProduct.isSet) {
    throw new Error('New product is a SET; this script only handles plain products. Aborting.');
  }

  const oldProduct = await Product.findById(item.productId).select('name').lean();
  const collegeId = txn.collegeId || txn.branchId;
  const qty = item.quantity;

  console.log(`\n=== FIX PLAN for #${txn.transactionId} ===`);
  console.log(`Replace item[${itemIndex}] "${item.name}" (${item.productId})`);
  console.log(`   with "${newProduct.name}" (${newProduct._id})`);
  console.log(`Quantity: ${qty} | item price stays ${fmt(item.price)} (total ${fmt(item.total)})`);
  if (Number(newProduct.price) !== Number(item.price)) {
    console.log(
      `NOTE: correct product's current price is ${fmt(newProduct.price)}, but the billed price is kept as-is since payment was already collected.`
    );
  }

  const shouldReconcileStock = Boolean(txn.isPaid && txn.stockDeducted && collegeId);
  if (shouldReconcileStock) {
    const college = await College.findById(collegeId);
    if (!college) throw new Error(`College ${collegeId} not found`);

    const oldQtyBefore = getCollegeStockQty(college, item.productId);
    const newQtyBefore = getCollegeStockQty(college, newProduct._id);
    console.log(`\nStock reconciliation at college "${college.name}":`);
    console.log(`  ${oldProduct?.name || 'wrong product'}: ${oldQtyBefore} -> ${oldQtyBefore + qty} (restore +${qty})`);
    console.log(`  ${newProduct.name}: ${newQtyBefore} -> ${newQtyBefore - qty} (deduct -${qty})`);
    if (newQtyBefore - qty < 0) {
      console.log('  WARNING: correct product stock will go negative at this college.');
    }

    if (APPLY) {
      const stockMap = new Map();
      (college.stock || []).forEach((s) => stockMap.set(s.product.toString(), s.quantity));
      stockMap.set(item.productId.toString(), (stockMap.get(item.productId.toString()) || 0) + qty);
      stockMap.set(newProduct._id.toString(), (stockMap.get(newProduct._id.toString()) || 0) - qty);
      college.stock = Array.from(stockMap.entries()).map(([product, quantity]) => ({ product, quantity }));
      await college.save();
      console.log('  College stock updated.');
    }
  } else {
    console.log(
      `\nSkipping stock reconciliation (isPaid=${txn.isPaid}, stockDeducted=${txn.stockDeducted}, collegeId=${collegeId || 'NONE'}).`
    );
  }

  if (APPLY) {
    txn.items[itemIndex].productId = newProduct._id;
    txn.items[itemIndex].name = newProduct.name;
    txn.remarks = `${txn.remarks ? txn.remarks + ' | ' : ''}Product corrected from "${oldProduct?.name || item.name}" to "${newProduct.name}" via fixWrongRecordProduct.js on ${new Date().toISOString()}`;
    await txn.save();
    console.log('\nTransaction updated. DONE.');
  } else {
    console.log('\nDRY RUN ONLY — nothing was written. Re-run with --apply to execute.');
  }
}

async function run() {
  await connect();

  const txns = await findEmployeeTransactions();
  const target = txns.find((t) => t.transactionId.replace(/^#/, '').toUpperCase() === TRANSACTION_ID);
  await showCandidateProducts(target ? target.collegeId || target.branchId : null);

  if (NEW_PRODUCT_ID) {
    await fixTransaction();
  } else {
    console.log(
      '\nInspect complete. Pick the correct product _id from the list above, then run:\n' +
        '  node scripts/fixWrongRecordProduct.js --new-product-id=<id>          (dry-run)\n' +
        '  node scripts/fixWrongRecordProduct.js --new-product-id=<id> --apply  (execute)'
    );
  }
}

run()
  .catch((err) => {
    console.error('\nFAILED:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  });
