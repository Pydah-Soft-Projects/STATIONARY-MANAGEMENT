const mongoose = require('mongoose');
const { getCourseConnection } = require('../config/db');

// Define the schema for a product
const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a product name'],
      trim: true,
    },
    description: {
      type: String,
      maxlength: [250, 'Description cannot exceed 250 characters'],
      trim: true,
      default: '',
    },
    price: {
      type: Number,
      required: [true, 'Please provide a product price'],
      min: [0, 'Price cannot be negative'],
    },
    category: {
      type: String,
      required: [true, 'Please specify a category'],
      enum: ['Notebooks', 'Pens', 'Art Supplies', 'Electronics', 'Other'],
    },
    // Which course this product belongs to (e.g., b.tech, diploma, degree). If blank, it's global
    forCourse: {
      type: String,
      trim: true,
      default: '',
    },
    // New: Unique SQL ID for the course to resolve name ambiguity
    forCourseId: {
      type: Number,
      default: null,
    },
    // Which years this product applies to (array of years: [1,2,3,4]). Empty array means applies to all years
    years: {
      type: [Number],
      default: [],
      validate: {
        validator: function(v) {
          return v.every(year => year >= 0 && year <= 10);
        },
        message: 'Each year must be between 0 and 10'
      }
    },
    // Keep year field for backward compatibility (will be deprecated)
    year: {
      type: Number,
      min: 0,
      max: 10,
      default: 0,
    },
    // Optional branch applicability (e.g., CSE, ECE) - array for multiple branches
    branch: {
      type: [String],
      default: [],
      validate: {
        validator: function(v) {
          return Array.isArray(v) && v.every(b => typeof b === 'string' && b.trim().length > 0);
        },
        message: 'Branch must be an array of non-empty strings'
      }
    },
    // New: Unique SQL IDs for the branches
    branchIds: {
      type: [Number],
      default: [],
    },
    // Kit intake academic year label (e.g. "2025-26"). Admin metadata; not tied to SQL student batch.
    academicYears: {
      type: [String],
      default: [],
      validate: {
        validator: function (v) {
          return Array.isArray(v) && v.every((y) => typeof y === 'string' && y.trim().length > 0);
        },
        message: 'Each academic year must be a non-empty string',
      },
    },
    // Optional semester applicability (e.g., 1, 2) - array for multiple semesters
    // If empty, applies to all semesters in the selected year(s)
    semesters: {
      type: [Number],
      default: [],
      validate: {
        validator: function(v) {
          return v.every(sem => sem === 1 || sem === 2);
        },
        message: 'Semester must be 1 or 2'
      }
    },
    stock: {
      type: Number,
      required: true,
      default: 0,
    },
    lowStockThreshold: {
      type: Number,
      default: 10,
      min: [0, 'Threshold cannot be negative'],
    },
    imageUrl: {
      type: String,
    },
    // Remarks for internal/admin notes
    remarks: {
      type: String,
      trim: true,
      default: '',
    },
    // Set/Bundled product metadata
    isSet: {
      type: Boolean,
      default: false,
    },
    setItems: {
      type: [{
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product',
          required: true,
        },
        quantity: {
          type: Number,
          min: [1, 'Quantity must be at least 1'],
          default: 1,
        },
        productNameSnapshot: {
          type: String,
          default: '',
          trim: true,
        },
        productPriceSnapshot: {
          type: Number,
          min: 0,
          default: 0,
        },
      }],
      default: [],
    },
    // Price management fields
    lastPriceUpdated: {
      type: Date,
      default: Date.now,
    },
    // Price history log (optional future enhancement)
    priceHistory: [{
      price: { type: Number, required: true },
      updatedAt: { type: Date, default: Date.now },
      updatedBy: { type: String, default: 'System' },
    }],
    // Applicability Mode: 'rules' (Course/Year/Branch) or 'students' (Specific list)
    applicabilityMode: {
      type: String,
      enum: ['rules', 'students'],
      default: 'rules',
    },
    // List of specific students this product applies to (if mode is 'students')
    applicableStudents: {
      type: [String],
      default: [],
    },
  },
  {
    // Automatically add 'createdAt' and 'updatedAt' fields
    timestamps: true,
  }
);

// Factory function to get Product model for a specific course
const getProductModel = async (course) => {
  try {
    // Sanitize course name and await the connection
    const connection = await getCourseConnection(course.replace(/\./g, ''));
    return connection.model('Product', productSchema);
  } catch (error) {
    console.error(`Error getting Product model for course ${course}:`, error);
    throw error;
  }
};

// Pre-save middleware to ensure lastPriceUpdated is set on new products
productSchema.pre('save', function(next) {
  // If this is a new product and lastPriceUpdated is not set, set it to now
  if (this.isNew && !this.lastPriceUpdated) {
    this.lastPriceUpdated = new Date();
  }
  next();
});

// Default model for main database (backward compatibility)
const Product = mongoose.model('Product', productSchema);

module.exports = { Product, getProductModel };