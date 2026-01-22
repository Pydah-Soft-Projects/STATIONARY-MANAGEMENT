const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { StockTransfer } = require('../models/stockTransferModel');

const migrateTransfers = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB");
        
        // Find transfers that have toBranch but missing toCollege
        const legacyTransfers = await StockTransfer.find({ 
            toCollege: { $exists: false },
            toBranch: { $exists: true }
        });
        
        console.log(`Found ${legacyTransfers.length} legacy transfers to migrate.`);
        
        if (legacyTransfers.length > 0) {
            // We need to use updateOne/updateMany directly or modify the object and save bypassing validation?
            // Actually, if we just rename the field in Mongo using updateMany, it's safest.
            const result = await StockTransfer.collection.updateMany(
                { toCollege: { $exists: false }, toBranch: { $exists: true } },
                { $rename: { "toBranch": "toCollege" } }
            );
            
            console.log("Migration result:", result);
            console.log("Successfully renamed 'toBranch' to 'toCollege' in legacy fields.");
        }

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await mongoose.disconnect();
    }
};

migrateTransfers();
