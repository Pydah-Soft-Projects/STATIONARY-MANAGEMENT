const mongoose = require('mongoose');
const { Transaction } = require('./models/transactionModel');
require('dotenv').config();

async function debug() {
  try {
    if (!process.env.MONGO_URI) {
      console.error('MONGO_URI not found in .env');
      return;
    }
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    console.log('Querying all transactions...');
    const allTxns = await Transaction.find({}).limit(5);
    console.log(`Debug: Found ${allTxns.length} total transactions in DB.`);

    const txns = await Transaction.find({ 'items.status': 'partial' })
      .sort({ createdAt: -1 })
      .limit(10);

    console.log(`Found ${txns.length} transactions with partial items.`);

    txns.forEach(t => {
      console.log(`Transaction ID: ${t.transactionId}`);
      console.log(`Student Data:`, JSON.stringify(t.student, null, 2));
      console.log('---');
    });

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected');
  }
}

debug();
