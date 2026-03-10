const mongoose = require('mongoose');

// Distribution item schema
const distributionItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'GeneralProduct',
    },
    name: {
      type: String,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    price: {
      type: Number,
      required: false,
      default: 0,
      min: 0,
    },
    total: {
      type: Number,
      required: false,
      default: 0,
      min: 0,
    },
  },
  { _id: false }
);

// General distribution schema - for tracking product distributions to individuals
const generalDistributionSchema = new mongoose.Schema(
  {
    distributionId: {
      type: String,
      required: true,
      unique: true,
    },
    recipientName: {
      type: String,
      required: true,
      trim: true,
    },
    department: {
      type: String,
      required: true,
      trim: true,
    },
    authorizedBy: {
      type: String,
      required: true,
      trim: true,
    },
    contactNumber: {
      type: String,
      trim: true,
      default: '',
    },
    collegeId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'College',
    },
    items: [distributionItemSchema],
    totalAmount: {
      type: Number,
      required: false,
      default: 0,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'online'],
      default: 'cash',
    },
    isPaid: {
      type: Boolean,
      default: false,
    },
    paidAt: {
      type: Date,
    },
    remarks: {
      type: String,
      trim: true,
      default: '',
    },
    stockDeducted: {
      type: Boolean,
      default: false,
    },
    distributionDate: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
// generalDistributionSchema.index({ distributionId: 1 }); // Removed duplicate index
generalDistributionSchema.index({ recipientName: 1 });
generalDistributionSchema.index({ department: 1 });
generalDistributionSchema.index({ distributionDate: -1 });
generalDistributionSchema.index({ isPaid: 1 });
generalDistributionSchema.index({ collegeId: 1 });

const GeneralDistribution = mongoose.model('GeneralDistribution', generalDistributionSchema);

module.exports = { GeneralDistribution };
