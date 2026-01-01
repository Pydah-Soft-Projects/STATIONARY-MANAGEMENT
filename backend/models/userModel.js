const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Define the schema for a user/student
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide your name'],
      trim: true,
    },
    semester: {
      type: Number,
      min: 1,
      default: null,
    },
    email: {
      type: String,
      required: [true, 'Please provide your email'],
      unique: true,
      match: [/.+\@.+\..+/, 'Please fill a valid email address'],
    },
    password: {
      type: String,
      required: [true, 'Please provide a password'],
      select: false,
    },
    studentId: {
      type: String,
      required: [true, 'Please provide your student ID'],
      unique: true,
      trim: true,
    },
    course: {
      type: String,
      required: [true, 'Please provide your course'],
      trim: true,
    },
    branch: {
      type: String,
      trim: true,
      default: '',
    },
    year: {
      type: Number,
      required: [true, 'Please provide your year of study'],
      min: [1, 'Year must be at least 1'],
    },
    // Items assigned to a student (key-value map of itemCategory -> boolean)
    items: {
      type: Object,
      default: {},
    },
    phoneNumber: {
      type: String,
      trim: true,
      default: '',
    },
    // Whether the student has paid or not
    paid: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Middleware to hash password before saving the user document
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Single collection for all users; filter by course field when needed
const User = mongoose.model('User', userSchema);

module.exports = { User };