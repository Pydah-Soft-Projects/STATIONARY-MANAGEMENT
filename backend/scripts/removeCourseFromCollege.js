const mongoose = require('mongoose');
const { College } = require('../models/collegeModel');
const dotenv = require('dotenv');

dotenv.config();

// --- CONFIGURATION ---
const TARGET_COLLEGE_NAME = 'Pydah College of Engineering';
// ---------------------

const removeAllCourses = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);

    const college = await College.findOne({ name: TARGET_COLLEGE_NAME });

    if (!college) {
      console.log(`Error: College "${TARGET_COLLEGE_NAME}" not found.`);
      process.exit(1);
    }

    console.log(`Found College: ${college.name}`);
    console.log(`Current Courses: ${JSON.stringify(college.courses)}`);

    if (college.courses.length === 0) {
      console.log(`College has no courses to remove.`);
      process.exit(0);
    }

    // Remove ALL courses
    college.courses = [];
    await college.save();

    console.log(`\nSuccess! Removed ALL courses from ${college.name}`);
    console.log(`Updated Courses: ${JSON.stringify(college.courses)}`);

    process.exit();
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

removeAllCourses();
