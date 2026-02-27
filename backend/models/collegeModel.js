const mongoose = require('mongoose');

// College stock schema - tracks product stock at each college
const collegeStockSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Product',
    },
    quantity: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  { _id: false }
);

// College schema for stock transfer locations (campuses/stations)
const collegeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide college name'],
      trim: true,
      unique: true,
    },
    location: {
      type: String,
      trim: true,
      default: '',
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Stock inventory for this college - array of {product, quantity}
    stock: {
      type: [collegeStockSchema],
      default: [],
    },
    // General product stock inventory for this college
    generalStock: {
      type: [collegeStockSchema],
      default: [],
    },
    // Allowed courses for this college
    courses: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);


collegeSchema.index({ isActive: 1 });
collegeSchema.index({ 'stock.product': 1 });
collegeSchema.index({ 'generalStock.product': 1 });

const College = mongoose.model('College', collegeSchema);

module.exports = { College };
