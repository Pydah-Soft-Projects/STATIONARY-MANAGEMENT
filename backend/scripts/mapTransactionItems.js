const mongoose = require('mongoose');
require('dotenv').config();
const { Transaction } = require('../models/transactionModel');
const { Product } = require('../models/productModel');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

const mapTransactionItems = async () => {
    await connectDB();
    console.log('\n--- Analyzing Unmapped Transaction Items ---');

    // 1. Fetch all Products
    const products = await Product.find({}).lean();
    console.log(`Reference: Found ${products.length} Products in DB.`);
    // products.forEach(p => console.log(`  Product: "${p.name}" (ID: ${p._id})`));

    // 2. Scan Transactions
    const transactions = await Transaction.find({}).select('items');
    const unmappedCounts = {};
    let totalUnmapped = 0;

    for (const txn of transactions) {
        if (!txn.items) continue;
        for (const item of txn.items) {
            if (!item.productId) {
                const name = item.name.trim();
                unmappedCounts[name] = (unmappedCounts[name] || 0) + 1;
                totalUnmapped++;
            }
        }
    }

    console.log(`\nFound ${totalUnmapped} total unmapped items across ${transactions.length} transactions.`);
    
    // 3. Show Top Frequency Items
    const sortedItems = Object.entries(unmappedCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50);

    console.log('\n--- Top 50 Unmapped Item Names ---');
    console.log('(Name -> Frequency)');
    sortedItems.forEach(([name, count]) => {
        console.log(`"${name}" -> ${count}`);
    });

    console.log('\n--- Suggestion ---');
    console.log('Use this list to create a hardcoded mapping in the script.');
    
    console.log('\n--- Done ---');
    process.exit();
};

mapTransactionItems();
