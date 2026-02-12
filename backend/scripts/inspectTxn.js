const mongoose = require('mongoose');
require('dotenv').config();
const { Transaction } = require('../models/transactionModel');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

const inspectTxn = async () => {
    await connectDB();
    console.log('\n--- Inspecting Transaction ---');

    // Search for Karanam Swami
    const studentName = "Karanam Swami";
    console.log(`Searching for transactions for: ${studentName}`);

    const txns = await Transaction.find({
        "student.name": { $regex: new RegExp(studentName, 'i') }
    }).lean();

    console.log(`Found ${txns.length} transactions.`);

    txns.forEach(txn => {
        console.log(`\nTransaction ID: ${txn.transactionId}`);
        console.log(`Student ID: ${txn.student.studentId}, SQL ID: ${txn.student.sqlId}`);
        console.log('Items:');
        txn.items.forEach(item => {
            console.log(` - Name: "${item.name}"`);
            console.log(`   ProductId: ${item.productId}`);
            console.log(`   Status: ${item.status}`);
        });
    });

    console.log('\n--- Done ---');
    process.exit();
};

inspectTxn();
