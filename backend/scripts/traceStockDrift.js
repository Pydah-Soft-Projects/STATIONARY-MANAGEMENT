const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

const { Product } = require('../models/productModel');
const { College } = require('../models/collegeModel');
const { StockEntry } = require('../models/stockEntryModel');
const { StockTransfer } = require('../models/stockTransferModel');
const { Transaction } = require('../models/transactionModel');

const arg = (name) => {
  const key = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(key));
  return hit ? hit.slice(key.length) : '';
};

const toKey = (v) => {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (v._id) return String(v._id);
  if (v.toString) return String(v.toString());
  return String(v);
};

const parseAsOf = () => {
  const raw = arg('as-of');
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid --as-of date: ${raw}`);
  d.setHours(23, 59, 59, 999);
  return d;
};

async function connect() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI must be defined');
  await mongoose.connect(process.env.MONGO_URI);
}

async function resolveCollege() {
  const collegeId = arg('college-id');
  const collegeName = arg('college-name');

  if (collegeId) {
    const c = await College.findById(collegeId).select('_id name stock').lean();
    if (!c) throw new Error(`College not found: ${collegeId}`);
    return c;
  }
  if (collegeName) {
    const c = await College.findOne({ name: collegeName }).select('_id name stock').lean();
    if (!c) throw new Error(`College not found by name: ${collegeName}`);
    return c;
  }
  throw new Error('Provide --college-id or --college-name');
}

async function resolveProduct() {
  const productId = arg('product-id');
  const productName = arg('product-name');

  if (productId) {
    const p = await Product.findById(productId).select('_id name').lean();
    if (!p) throw new Error(`Product not found: ${productId}`);
    return p;
  }
  if (productName) {
    const p = await Product.findOne({ name: productName }).select('_id name').lean();
    if (!p) throw new Error(`Product not found by name: ${productName}`);
    return p;
  }
  throw new Error('Provide --product-id or --product-name');
}

function pushEvent(events, date, type, delta, ref, details) {
  events.push({
    date: new Date(date),
    type,
    delta: Number(delta) || 0,
    ref,
    details,
  });
}

async function buildEvents(collegeId, productId, asOfDate) {
  const events = [];

  // 1) Stock entries into this college
  const collegeEntries = await StockEntry.find({
    college: collegeId,
    product: productId,
    ...(asOfDate ? { createdAt: { $lte: asOfDate } } : {}),
  })
    .select('_id quantity createdAt invoiceNumber')
    .lean();
  collegeEntries.forEach((e) => {
    pushEvent(events, e.createdAt, 'stock_entry_college_in', e.quantity, `StockEntry:${e._id}`, {
      invoiceNumber: e.invoiceNumber || '',
    });
  });

  // 2) Transfers: in/out
  const transfers = await StockTransfer.find({
    status: 'completed',
    'items.product': productId,
    $or: [{ toCollege: collegeId }, { fromCollege: collegeId }],
    ...(asOfDate ? { transferDate: { $lte: asOfDate } } : {}),
  })
    .select('_id transferDate toCollege fromCollege items')
    .lean();

  transfers.forEach((t) => {
    const item = (t.items || []).find((i) => toKey(i.product) === toKey(productId));
    const qty = Number(item?.quantity) || 0;
    const isIn = toKey(t.toCollege) === toKey(collegeId);
    const isOut = toKey(t.fromCollege) === toKey(collegeId);
    if (isIn) {
      pushEvent(events, t.transferDate || t.createdAt, 'stock_transfer_in', qty, `StockTransfer:${t._id}`, {});
    }
    if (isOut) {
      pushEvent(events, t.transferDate || t.createdAt, 'stock_transfer_out', -qty, `StockTransfer:${t._id}`, {});
    }
  });

  // 3) Student/employee deductions for this college + product
  const txns = await Transaction.find({
    stockDeducted: true,
    isPaid: true,
    transactionType: { $in: ['student', 'employee'] },
    $or: [{ collegeId: collegeId }, { branchId: collegeId }],
    ...(asOfDate ? { transactionDate: { $lte: asOfDate } } : {}),
  })
    .select('_id transactionId transactionDate items')
    .lean();

  txns.forEach((tx) => {
    (tx.items || []).forEach((item) => {
      if (item.isSet && Array.isArray(item.setComponents) && item.setComponents.length > 0) {
        item.setComponents.forEach((comp) => {
          if (comp.taken === false) return;
          if (toKey(comp.productId) !== toKey(productId)) return;
          pushEvent(
            events,
            tx.transactionDate,
            'transaction_deduction_set_component',
            -(Number(comp.quantity) || 0),
            `Transaction:${tx.transactionId || tx._id}`,
            { itemName: item.name || '', componentName: comp.name || '' }
          );
        });
      } else if (toKey(item.productId) === toKey(productId)) {
        pushEvent(
          events,
          tx.transactionDate,
          'transaction_deduction_item',
          -(Number(item.quantity) || 0),
          `Transaction:${tx.transactionId || tx._id}`,
          { itemName: item.name || '' }
        );
      }
    });
  });

  events.sort((a, b) => a.date - b.date);
  return events;
}

async function run() {
  const asOfDate = parseAsOf();
  await connect();

  const college = await resolveCollege();
  const product = await resolveProduct();
  const collegeId = toKey(college._id);
  const productId = toKey(product._id);
  const actual = Number((college.stock || []).find((s) => toKey(s.product) === productId)?.quantity || 0);

  const events = await buildEvents(collegeId, productId, asOfDate);

  let running = 0;
  const timeline = events.map((e) => {
    running += e.delta;
    return {
      date: e.date.toISOString(),
      type: e.type,
      delta: e.delta,
      runningExpected: running,
      ref: e.ref,
      details: e.details,
    };
  });

  const expected = running;
  const drift = actual - expected;

  console.log('\n=== STOCK DRIFT TRACE ===');
  console.log(`College: ${college.name} (${collegeId})`);
  console.log(`Product: ${product.name} (${productId})`);
  if (asOfDate) console.log(`As of: ${asOfDate.toISOString()}`);
  console.log(`Events considered: ${timeline.length}`);
  console.log(`Expected (reconstructed): ${expected}`);
  console.log(`Actual (current college stock): ${actual}`);
  console.log(`Drift (actual - expected): ${drift}`);

  if (timeline.length > 0) {
    console.log('\n--- First 20 events ---');
    timeline.slice(0, 20).forEach((t) => {
      console.log(`${t.date} | ${t.type} | delta=${t.delta} | run=${t.runningExpected} | ${t.ref}`);
    });

    console.log('\n--- Last 20 events ---');
    timeline.slice(-20).forEach((t) => {
      console.log(`${t.date} | ${t.type} | delta=${t.delta} | run=${t.runningExpected} | ${t.ref}`);
    });
  }

  console.log('\n=== RAW JSON TRACE ===');
  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        asOfDate: asOfDate ? asOfDate.toISOString() : null,
        college: { id: collegeId, name: college.name },
        product: { id: productId, name: product.name },
        expected,
        actual,
        drift,
        events: timeline,
      },
      null,
      2
    )
  );
}

run()
  .catch((err) => {
    console.error('Trace failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  });
