const mongoose = require('mongoose');

// Define the schema for a transaction
const transactionSchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    // Transaction type: 'student', 'branch_transfer' (legacy), 'college_transfer'
    transactionType: {
      type: String,
      enum: ['student', 'branch_transfer', 'college_transfer'],
      default: 'student',
    },
    // The college where this transaction took place (deduct stock from here)
    collegeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College',
      required: false,
    },
    // Legacy support
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'College',
      required: false,
    },
    student: {
      userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        required: function() { return this.transactionType === 'student'; },
        ref: 'User' 
      },
      name: { type: String, required: function() { return this.transactionType === 'student'; } },
      studentId: { type: String, required: function() { return this.transactionType === 'student'; } },
      course: { type: String, required: function() { return this.transactionType === 'student'; } },
      year: { type: Number, required: function() { return this.transactionType === 'student'; } },
      branch: { type: String, default: '' },
      semester: { type: Number, default: null },
    },
    // College transfer details
    collegeTransfer: {
      collegeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'College',
        required: function() { return this.transactionType === 'college_transfer'; },
      },
      collegeName: {
        type: String,
        required: function() { return this.transactionType === 'college_transfer'; },
      },
      collegeLocation: {
        type: String,
        default: '',
      },
    },
    // Legacy Branch transfer details
    branchTransfer: {
      branchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'College',
        required: function() { return this.transactionType === 'branch_transfer'; },
      },
      branchName: {
        type: String,
        required: function() { return this.transactionType === 'branch_transfer'; },
      },
      branchLocation: {
        type: String,
        default: '',
      },
    },
    items: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
          ref: 'Product',
        },
        name: { type: String, required: true },
        quantity: { type: Number, required: true, min: 1 },
        price: { type: Number, required: true, min: 0 },
        total: { type: Number, required: true, min: 0 },
        isSet: { type: Boolean, default: false },
        status: {
          type: String,
          enum: ['fulfilled', 'partial'],
          default: 'fulfilled',
        },
        setComponents: [
          {
            productId: {
              type: mongoose.Schema.Types.ObjectId,
              ref: 'Product',
            },
            name: { type: String, required: false, trim: true },
            quantity: { type: Number, min: 0, default: 0 },
            taken: { type: Boolean, default: true },
            reason: { type: String, trim: true, default: '' },
          },
        ],
      },
    ],
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      required: true,
      enum: ['cash', 'online', 'transfer'],
      default: 'cash',
    },
    isPaid: {
      type: Boolean,
      required: true,
      default: false,
    },
    paidAt: {
      type: Date,
    },
    transactionDate: {
      type: Date,
      default: Date.now,
    },
    remarks: {
      type: String,
      trim: true,
      default: '',
    },
    stockDeducted: {
      type: Boolean,
      required: true,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
transactionSchema.index({ 'student.userId': 1 });
transactionSchema.index({ 'student.course': 1 });
transactionSchema.index({ transactionId: 1 });
transactionSchema.index({ transactionDate: -1 });
transactionSchema.index({ transactionType: 1 });
transactionSchema.index({ 'branchTransfer.branchId': 1 });
transactionSchema.index({ branchId: 1 });
// Compound indexes for Reports / list queries (college + date, date range)
transactionSchema.index({ collegeId: 1, transactionDate: -1 });
transactionSchema.index({ transactionDate: -1, transactionType: 1 });

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = { Transaction };

