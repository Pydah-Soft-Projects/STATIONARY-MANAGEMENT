const mongoose = require('mongoose');

// Purchase item schema
const purchaseItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'GeneralProduct',
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    purchasePrice: {
      type: Number,
      required: true,
      min: 0,
    },
    gstPercent: {
      type: Number,
      required: false,
      default: 0,
      min: 0,
    },
  },
  { _id: false }
);

// General purchase schema - for vendor-based purchases (adds stock)
const generalPurchaseSchema = new mongoose.Schema(
  {
    purchaseId: {
      type: String,
      required: true,
      unique: true,
    },
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Vendor',
    },
    invoiceNumber: {
      type: String,
      trim: true,
      default: '',
    },
    invoiceDate: {
      type: Date,
      default: Date.now,
    },
    college: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College',
      default: null, // null = Central Warehouse
    },
    items: [purchaseItemSchema],
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    remarks: {
      type: String,
      trim: true,
      default: '',
    },
    createdBy: {
      type: String,
      trim: true,
      default: 'System',
    },
    stockAdded: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
generalPurchaseSchema.index({ vendor: 1 });
generalPurchaseSchema.index({ college: 1 });
generalPurchaseSchema.index({ invoiceDate: -1 });
generalPurchaseSchema.index({ createdAt: -1 });

const GeneralPurchase = mongoose.model('GeneralPurchase', generalPurchaseSchema);

module.exports = { GeneralPurchase };
