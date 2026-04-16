const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

const { Product } = require('../models/productModel');
const { College } = require('../models/collegeModel');
const { StockEntry } = require('../models/stockEntryModel');
const { StockTransfer } = require('../models/stockTransferModel');
const { Transaction } = require('../models/transactionModel');

function parseAsOfDate() {
  const arg = process.argv.find((a) => a.startsWith('--as-of='));
  if (!arg) return null;
  const raw = arg.split('=')[1];
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid --as-of date: ${raw}. Use YYYY-MM-DD format.`);
  }
  // Include the entire day in local time.
  parsed.setHours(23, 59, 59, 999);
  return parsed;
}

const toKey = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value._id) return String(value._id);
  if (value.toString) return String(value.toString());
  return String(value);
};

const incMap = (map, key, delta) => {
  if (!key || !Number.isFinite(delta) || delta === 0) return;
  map.set(key, (map.get(key) || 0) + delta);
};

const mapToObject = (map) => {
  const obj = {};
  map.forEach((val, key) => {
    obj[key] = val;
  });
  return obj;
};

async function connect() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI must be defined');
  }
  await mongoose.connect(process.env.MONGO_URI);
}

async function buildMetadata() {
  const [products, colleges] = await Promise.all([
    Product.find({}).select('_id name stock').lean(),
    College.find({}).select('_id name stock').lean(),
  ]);

  const productNameById = new Map(products.map((p) => [toKey(p._id), p.name || 'Unknown Product']));
  const productActualCentral = new Map(products.map((p) => [toKey(p._id), Number(p.stock) || 0]));
  const collegeNameById = new Map(colleges.map((c) => [toKey(c._id), c.name || 'Unknown College']));
  const collegeActualStock = new Map();

  colleges.forEach((college) => {
    const colKey = toKey(college._id);
    const stockMap = new Map();
    (college.stock || []).forEach((item) => {
      incMap(stockMap, toKey(item.product), Number(item.quantity) || 0);
    });
    collegeActualStock.set(colKey, stockMap);
  });

  return {
    productNameById,
    productActualCentral,
    collegeNameById,
    collegeActualStock,
  };
}

function ensureNestedMap(rootMap, key) {
  if (!rootMap.has(key)) rootMap.set(key, new Map());
  return rootMap.get(key);
}

async function buildExpectedCollegeStock(asOfDate) {
  const expectedByCollege = new Map();
  const warnings = [];
  const asOfFilter = asOfDate ? { createdAt: { $lte: asOfDate } } : {};

  // 1) Add all college stock entries
  const collegeEntries = await StockEntry.find({ college: { $ne: null }, ...asOfFilter })
    .select('college product quantity')
    .lean();
  collegeEntries.forEach((entry) => {
    const collegeId = toKey(entry.college);
    const productId = toKey(entry.product);
    const qty = Number(entry.quantity) || 0;
    const productMap = ensureNestedMap(expectedByCollege, collegeId);
    incMap(productMap, productId, qty);
  });

  // 2) Apply completed stock transfers (incoming/outgoing)
  const completedTransfers = await StockTransfer.find({
    status: 'completed',
    ...(asOfDate ? { transferDate: { $lte: asOfDate } } : {}),
  })
    .select('toCollege fromCollege items')
    .lean();

  completedTransfers.forEach((transfer) => {
    const toCollegeId = toKey(transfer.toCollege);
    const fromCollegeId = toKey(transfer.fromCollege);
    (transfer.items || []).forEach((item) => {
      const productId = toKey(item.product);
      const qty = Number(item.quantity) || 0;
      if (toCollegeId) {
        incMap(ensureNestedMap(expectedByCollege, toCollegeId), productId, qty);
      }
      if (fromCollegeId) {
        incMap(ensureNestedMap(expectedByCollege, fromCollegeId), productId, -qty);
      }
    });
  });

  // 3) Apply stock-deducted paid transactions (student/employee issuances)
  const stockDeductedTxns = await Transaction.find({
    stockDeducted: true,
    isPaid: true,
    transactionType: { $in: ['student', 'employee'] },
    ...(asOfDate ? { transactionDate: { $lte: asOfDate } } : {}),
  })
    .select('transactionId collegeId branchId items')
    .lean();

  stockDeductedTxns.forEach((txn) => {
    const collegeId = toKey(txn.collegeId || txn.branchId);
    if (!collegeId) {
      warnings.push({
        type: 'transaction_missing_college',
        transactionId: txn.transactionId,
        message: 'Stock deducted transaction has no collegeId/branchId',
      });
      return;
    }

    const productMap = ensureNestedMap(expectedByCollege, collegeId);
    (txn.items || []).forEach((item) => {
      const isSet = Boolean(item.isSet);
      const hasComponents = Array.isArray(item.setComponents) && item.setComponents.length > 0;

      if (isSet && hasComponents) {
        item.setComponents.forEach((comp) => {
          if (comp.taken === false) return;
          const compId = toKey(comp.productId);
          const compQty = Number(comp.quantity) || 0;
          incMap(productMap, compId, -compQty);
        });
      } else if (isSet && !hasComponents) {
        warnings.push({
          type: 'set_without_components',
          transactionId: txn.transactionId,
          productId: toKey(item.productId),
          message: 'Set item missing setComponents; deduction cannot be fully reconstructed',
        });
      } else {
        incMap(productMap, toKey(item.productId), -(Number(item.quantity) || 0));
      }
    });
  });

  return { expectedByCollege, warnings };
}

async function buildExpectedCentralStock(asOfDate) {
  const expected = new Map();
  const asOfFilter = asOfDate ? { createdAt: { $lte: asOfDate } } : {};

  // 1) Central stock entries
  const centralEntries = await StockEntry.find({
    $or: [{ college: null }, { college: { $exists: false } }],
    ...asOfFilter,
  })
    .select('product quantity')
    .lean();
  centralEntries.forEach((entry) => {
    incMap(expected, toKey(entry.product), Number(entry.quantity) || 0);
  });

  // 2) Completed transfers deducted from central warehouse
  const transfers = await StockTransfer.find({
    status: 'completed',
    $or: [{ fromCollege: null }, { fromCollege: { $exists: false } }],
    ...(asOfDate ? { transferDate: { $lte: asOfDate } } : {}),
  })
    .select('deductFromCentral items')
    .lean();

  transfers.forEach((transfer) => {
    const shouldDeduct = transfer.deductFromCentral !== false;
    if (!shouldDeduct) return;
    (transfer.items || []).forEach((item) => {
      incMap(expected, toKey(item.product), -(Number(item.quantity) || 0));
    });
  });

  return expected;
}

function diffMaps(expected, actual) {
  const keys = new Set([...expected.keys(), ...actual.keys()]);
  const diffs = [];
  keys.forEach((key) => {
    const expectedQty = expected.get(key) || 0;
    const actualQty = actual.get(key) || 0;
    const delta = actualQty - expectedQty;
    if (delta !== 0) {
      diffs.push({ key, expectedQty, actualQty, delta });
    }
  });
  return diffs.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

async function runAudit() {
  const asOfDate = parseAsOfDate();
  await connect();
  console.log('Connected to MongoDB');
  if (asOfDate) {
    console.log(`Running as-of audit up to: ${asOfDate.toISOString()}`);
  }

  const metadata = await buildMetadata();
  const { expectedByCollege, warnings } = await buildExpectedCollegeStock(asOfDate);
  const expectedCentral = await buildExpectedCentralStock(asOfDate);

  const collegeIds = new Set([
    ...expectedByCollege.keys(),
    ...metadata.collegeActualStock.keys(),
  ]);

  const collegeMismatches = [];
  collegeIds.forEach((collegeId) => {
    const expected = expectedByCollege.get(collegeId) || new Map();
    const actual = metadata.collegeActualStock.get(collegeId) || new Map();
    const diffs = diffMaps(expected, actual);
    if (diffs.length === 0) return;

    collegeMismatches.push({
      collegeId,
      collegeName: metadata.collegeNameById.get(collegeId) || 'Unknown College',
      mismatchCount: diffs.length,
      items: diffs.map((d) => ({
        productId: d.key,
        productName: metadata.productNameById.get(d.key) || 'Unknown Product',
        expectedQty: d.expectedQty,
        actualQty: d.actualQty,
        delta: d.delta,
      })),
    });
  });

  const centralDiffs = diffMaps(expectedCentral, metadata.productActualCentral);
  const centralMismatches = centralDiffs.map((d) => ({
    productId: d.key,
    productName: metadata.productNameById.get(d.key) || 'Unknown Product',
    expectedQty: d.expectedQty,
    actualQty: d.actualQty,
    delta: d.delta,
  }));

  const summary = {
    generatedAt: new Date().toISOString(),
    asOfDate: asOfDate ? asOfDate.toISOString() : null,
    totals: {
      collegesChecked: collegeIds.size,
      collegesWithMismatch: collegeMismatches.length,
      centralProductsWithMismatch: centralMismatches.length,
      warnings: warnings.length,
    },
    collegeMismatches,
    centralMismatches,
    warnings,
    debugExpectedCentral: mapToObject(expectedCentral),
  };

  console.log('\n=== STOCK AUDIT SUMMARY ===');
  console.log(`Colleges checked: ${summary.totals.collegesChecked}`);
  console.log(`Colleges with mismatch: ${summary.totals.collegesWithMismatch}`);
  console.log(`Central products with mismatch: ${summary.totals.centralProductsWithMismatch}`);
  console.log(`Warnings: ${summary.totals.warnings}`);

  if (collegeMismatches.length > 0) {
    console.log('\n--- College mismatches (top 5 colleges) ---');
    collegeMismatches.slice(0, 5).forEach((college) => {
      console.log(`\n${college.collegeName} (${college.collegeId}) -> ${college.mismatchCount} mismatched products`);
      college.items.slice(0, 5).forEach((item) => {
        console.log(
          `  - ${item.productName}: expected=${item.expectedQty}, actual=${item.actualQty}, delta=${item.delta}`
        );
      });
    });
  }

  if (centralMismatches.length > 0) {
    console.log('\n--- Central mismatches (top 10) ---');
    centralMismatches.slice(0, 10).forEach((item) => {
      console.log(
        `  - ${item.productName}: expected=${item.expectedQty}, actual=${item.actualQty}, delta=${item.delta}`
      );
    });
  }

  if (warnings.length > 0) {
    console.log('\n--- Warnings (top 10) ---');
    warnings.slice(0, 10).forEach((w) => {
      console.log(`  - [${w.type}] ${w.message} (${w.transactionId || 'N/A'})`);
    });
  }

  console.log('\n=== RAW JSON REPORT ===');
  console.log(JSON.stringify(summary, null, 2));
}

runAudit()
  .catch((error) => {
    console.error('Audit failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  });
