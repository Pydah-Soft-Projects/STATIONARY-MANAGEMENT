const mongoose = require('mongoose');
require('dotenv').config();
const { Product } = require('../models/productModel');
const { Transaction } = require('../models/transactionModel');
const { College } = require('../models/collegeModel');

// Toggles for execution
const DRY_RUN = false; // Set to false to perform the actual database updates

// Target product configuration for the "DAIM II - I" kit
const TARGET_CONFIG = [
  { productId: '6916a749813125747178bc16', name: 'NOTE BOOKS', targetQty: 5 },
  { productId: '6916a7bb813125747178bc1a', name: 'RECORD BOOKS', targetQty: 4 },
  { productId: '6916a76d813125747178bc18', name: 'OBSERVATION BOOKS', targetQty: 4 },
  { productId: '6916a725813125747178bc14', name: 'ASSIGNMENT BOOKS', targetQty: 5 }
];

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('Error: MONGO_URI is not set in backend/.env');
    process.exit(1);
  }

  try {
    console.log(`==================================================`);
    console.log(`     KIT STOCK & TRANSACTION UPDATE SCRIPT        `);
    console.log(`     MODE: ${DRY_RUN ? 'DRY RUN (NO DB CHANGES)' : 'LIVE UPDATE (WRITES TO DB)'} `);
    console.log(`==================================================\n`);

    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 15000,
    });
    console.log('Connected to MongoDB ✅\n');

    // 1. Fetch the kit
    const kitName = 'DAIM II - I';
    const kits = await Product.find({
      name: { $regex: new RegExp(`^${kitName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i') }
    });

    if (kits.length === 0) {
      console.log(`❌ No kit found with name matching "${kitName}".`);
      return;
    }

    const kit = kits[0];
    console.log(`📦 Found Kit: "${kit.name}" (ID: ${kit._id})`);
    console.log(`   Catalog Price: ₹${kit.price}`);
    console.log(`   Academic Years: [${(kit.academicYears || []).join(', ')}]`);

    // Compare and prepare update for the kit product
    console.log('\n--- 1. Set/Kit Configuration Update ---');
    const updatedSetItems = [];
    let kitNeedsUpdate = false;

    for (const target of TARGET_CONFIG) {
      const existingItem = (kit.setItems || []).find(
        item => item.product.toString() === target.productId
      );

      const oldQty = existingItem ? existingItem.quantity : 0;
      console.log(`   * ${target.name}: Old Qty: ${oldQty} → New Qty: ${target.targetQty}`);

      if (oldQty !== target.targetQty) {
        kitNeedsUpdate = true;
      }

      updatedSetItems.push({
        product: new mongoose.Types.ObjectId(target.productId),
        quantity: target.targetQty,
        productNameSnapshot: target.name,
        productPriceSnapshot: existingItem ? existingItem.productPriceSnapshot : 0
      });
    }

    if (kitNeedsUpdate) {
      if (DRY_RUN) {
        console.log(`   [DRY RUN] Will update kit setItems configuration.`);
      } else {
        kit.setItems = updatedSetItems;
        await kit.save();
        console.log(`   ✅ Kit configuration successfully updated in DB.`);
      }
    } else {
      console.log(`   Kit configuration is already up-to-date.`);
    }

    // 2. Fetch related transactions
    console.log('\n--- 2. Related Transactions Update ---');
    const transactions = await Transaction.find({
      $or: [
        { 'items.productId': kit._id },
        { 'items.name': kit.name }
      ]
    }).sort({ transactionDate: -1 });

    console.log(`   Found ${transactions.length} transactions associated with this kit.`);

    // We will accumulate stock adjustments by college:
    // collegeId => { productId => delta } (delta will be negative representing stock deduction)
    const collegeStockAdjustments = new Map();

    for (const txn of transactions) {
      const collegeId = txn.collegeId || txn.branchId;
      if (!collegeId) {
        console.warn(`   ⚠️ Warning: Transaction ${txn.transactionId} has no collegeId/branchId. Skipping stock adjustment for it.`);
        continue;
      }

      const collegeIdStr = collegeId.toString();
      if (!collegeStockAdjustments.has(collegeIdStr)) {
        collegeStockAdjustments.set(collegeIdStr, {
          collegeId: collegeId,
          adjustments: new Map()
        });
      }

      const collegeRecord = collegeStockAdjustments.get(collegeIdStr);
      
      // Find the kit item in the transaction
      const kitItemIndex = txn.items.findIndex(
        item => String(item.productId) === String(kit._id) || item.name === kit.name
      );

      if (kitItemIndex === -1) continue;

      const kitItem = txn.items[kitItemIndex];
      const purchaseQty = kitItem.quantity || 1;

      console.log(`\n   Transaction: ${txn.transactionId} | Date: ${txn.transactionDate.toISOString().split('T')[0]}`);
      console.log(`   Student: "${txn.student.name}" (ID: ${txn.student.studentId}) | College: ${collegeIdStr}`);
      console.log(`   Kit Purchase Qty: ${purchaseQty}`);

      // Update setComponents inside the transaction
      const updatedSetComponents = [];
      
      for (const target of TARGET_CONFIG) {
        // Find existing component in transaction snapshot
        const existingComp = (kitItem.setComponents || []).find(
          comp => comp.productId && comp.productId.toString() === target.productId
        );

        const currentQty = existingComp ? existingComp.quantity : 1; // Default to 1 if it was missing/1 each
        const taken = existingComp ? existingComp.taken : true;

        const newCompQty = target.targetQty * purchaseQty;
        const currentCompQty = currentQty; 
        const delta = newCompQty - currentCompQty; // The additional quantity that was given to the student

        console.log(`     - Component "${target.name}": Current Qty in Txn: ${currentCompQty} → Target Qty: ${newCompQty} (Delta: +${delta}, Taken: ${taken})`);

        if (taken && delta > 0) {
          // Accumulate the deduction for this product (negative delta because we are removing from stock)
          const currentDelta = collegeRecord.adjustments.get(target.productId) || 0;
          collegeRecord.adjustments.set(target.productId, currentDelta - delta);
        }

        updatedSetComponents.push({
          productId: new mongoose.Types.ObjectId(target.productId),
          name: target.name,
          quantity: newCompQty,
          taken: taken,
          reason: existingComp ? existingComp.reason : ''
        });
      }

      // Update the transaction's item
      if (!DRY_RUN) {
        txn.items[kitItemIndex].setComponents = updatedSetComponents;
        // Mark modified since mongoose sometimes doesn't auto-detect nested changes in mixed/array fields
        txn.markModified('items');
        await txn.save();
        console.log(`     ✅ Transaction ${txn.transactionId} updated in DB.`);
      } else {
        console.log(`     [DRY RUN] Will update transaction components.`);
      }
    }

    // 3. College Stock adjustments
    console.log('\n--- 3. College Stock Adjustments ---');
    if (collegeStockAdjustments.size === 0) {
      console.log('   No stock adjustments to make.');
    } else {
      for (const [collegeIdStr, record] of collegeStockAdjustments.entries()) {
        const college = await College.findById(record.collegeId);
        if (!college) {
          console.error(`   ❌ College with ID ${collegeIdStr} not found!`);
          continue;
        }

        console.log(`\n   🏫 College: "${college.name}" (ID: ${college._id})`);
        
        // Map current stock for lookup
        const collegeStockMap = new Map();
        if (college.stock) {
          college.stock.forEach(item => {
            collegeStockMap.set(item.product.toString(), item.quantity);
          });
        }

        // Prepare updated stock array
        const updatedStockArray = [];
        const changeLogs = [];

        // We iterate through all products currently in college stock
        // and also ensure any new products can be added if they weren't in college stock yet.
        const allProductIds = new Set([
          ...collegeStockMap.keys(),
          ...record.adjustments.keys()
        ]);

        for (const prodId of allProductIds) {
          const currentQty = collegeStockMap.get(prodId) || 0;
          const adjustment = record.adjustments.get(prodId) || 0;
          const targetItem = TARGET_CONFIG.find(t => t.productId === prodId);
          const prodName = targetItem ? targetItem.name : `Product ID: ${prodId}`;

          if (adjustment !== 0) {
            const newQty = currentQty + adjustment; // Adjustment is negative
            changeLogs.push(`     * ${prodName}: Stock ${currentQty} → ${newQty} (Adjustment: ${adjustment})`);
            updatedStockArray.push({
              product: new mongoose.Types.ObjectId(prodId),
              quantity: newQty
            });
          } else {
            updatedStockArray.push({
              product: new mongoose.Types.ObjectId(prodId),
              quantity: currentQty
            });
          }
        }

        if (changeLogs.length > 0) {
          changeLogs.forEach(log => console.log(log));
          if (DRY_RUN) {
            console.log(`     [DRY RUN] Will update stock array for college "${college.name}".`);
          } else {
            college.stock = updatedStockArray;
            await college.save();
            console.log(`     ✅ Stock for college "${college.name}" updated successfully in DB.`);
          }
        } else {
          console.log('     No stock adjustments needed for this college.');
        }
      }
    }

    console.log(`\n==================================================`);
    console.log(`     FINISHED: ${DRY_RUN ? 'DRY RUN COMPLETE' : 'LIVE UPDATE COMPLETE'} `);
    console.log(`==================================================`);

  } catch (error) {
    console.error('An error occurred during execution:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

main();
