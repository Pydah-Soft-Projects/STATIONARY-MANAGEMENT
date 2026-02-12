const asyncHandler = require('express-async-handler');
const { getMySqlPool } = require('../config/mysql');

const getCourses = asyncHandler(async (req, res) => {
  const pool = getMySqlPool();
  if (!pool) {
    res.status(500);
    throw new Error('MySQL pool is not configured.');
  }

  try {
    // improved: fetch courses and branches in parallel or join
    // For simplicity and to match the expected structure, let's fetch both and map in JS
    const [courses] = await pool.query(
      "SELECT id, name, total_years, is_active FROM courses WHERE is_active = 1 ORDER BY name ASC"
    );
    
    // Fetch all active branches
    const [branches] = await pool.query(
       "SELECT id, course_id, name, is_active FROM course_branches WHERE is_active = 1 ORDER BY name ASC"
    );

    // Map branches to courses
    const result = courses.map(course => {
      const courseBranches = branches.filter(b => b.course_id === course.id).map(b => b.name);
      
      // Generate years array [1, 2, ..., total_years]
      const years = Array.from({ length: course.total_years }, (_, i) => i + 1);

      return {
        id: course.id,
        name: course.name,
        displayName: course.name, // Compatibility for frontend
        total_years: course.total_years,
        years,
        branches: courseBranches
      };
    });

    res.json(result);
  } catch (error) {
    console.error('[MySQL] Failed to fetch courses:', error);
    res.status(500);
    throw new Error('Failed to fetch courses from MySQL.');
  }
});

const getBranches = asyncHandler(async (req, res) => {
  const pool = getMySqlPool();
  if (!pool) {
    res.status(500);
    throw new Error('MySQL pool is not configured.');
  }

  const { courseId } = req.query;

  try {
    let query = "SELECT id, course_id, name, is_active FROM course_branches WHERE is_active = 1";
    const params = [];

    if (courseId) {
      query += " AND course_id = ?";
      params.push(courseId);
    }

    query += " ORDER BY name ASC";

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('[MySQL] Failed to fetch branches:', error);
    res.status(500);
    throw new Error('Failed to fetch branches from MySQL.');
  }
});

module.exports = {
  getCourses,
  getBranches,
};
