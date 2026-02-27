const mongoose = require('mongoose');
const { Transaction } = require('./models/transactionModel');
require('dotenv').config();

async function fulfillAll() {
  try {
    if (!process.env.MONGO_URI) {
      console.error('MONGO_URI not found in .env');
      return;
    }
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Find all transactions that are paid but have partial items
    const txns = await Transaction.find({
      isPaid: true,
      'items.status': 'partial'
    });

    console.log(`Found ${txns.length} partial transactions to fulfill.`);

    let updatedCount = 0;
    for (const txn of txns) {
      let modified = false;

      // Update items
      txn.items.forEach(item => {
        if (item.status === 'partial') {
          item.status = 'fulfilled';
          modified = true;
        }

        // Update set components if any
        if (item.isSet && Array.isArray(item.setComponents)) {
          item.setComponents.forEach(comp => {
            if (comp.taken === false) {
              comp.taken = true;
              delete comp.reason;
              modified = true;
            }
          });
        }
      });

      if (modified) {
        await txn.save();
        updatedCount++;
      }
    }

    console.log(`Successfully fulfilled ${updatedCount} transactions.`);

  } catch (err) {
    console.error('Error during fulfillment:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

fulfillAll();
