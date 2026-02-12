const mongoose = require('mongoose');
const { SubAdmin } = require('../models/subAdminModel');
const { College } = require('../models/collegeModel');
const dotenv = require('dotenv');

dotenv.config();

const debugSubAdmins = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    //console.log(`MongoDB Connected: ${conn.connection.host}`);

    console.log('\n--- COLLEGE COURSES ---');
    const colleges = await College.find({});
    colleges.forEach(c => {
      console.log(`College: ${c.name}, Courses: ${JSON.stringify(c.courses)}`);
    });

    console.log('\n--- SUB-ADMINS ---');
    const admins = await SubAdmin.find({}).populate('assignedCollege', 'name');
    
    if (admins.length === 0) {
      console.log('No Sub-Admins found.');
    } else {
      admins.forEach(admin => {
        console.log(`\nName: ${admin.name}`);
        console.log(`Role: ${admin.role}`);
        console.log(`Assigned College: ${admin.assignedCollege ? admin.assignedCollege.name : 'NONE'}`);
        console.log(`Permissions:`);
        // Filter for course permissions to highlight them
        const coursePerms = admin.permissions.filter(p => p.startsWith('course-dashboard-'));
        if (coursePerms.length > 0) {
           coursePerms.forEach(p => console.log(`  - ${p}`));
        } else {
           console.log(`  (No course-dashboard permissions)`);
        }
        console.log(`Total Permissions: ${admin.permissions.length}`);
      });
    }

    process.exit();
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

debugSubAdmins();
