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
      "SELECT id, name, total_years, semesters_per_year, is_active FROM courses WHERE is_active = 1 ORDER BY name ASC"
    );
    
    // Fetch all active branches
    const [branches] = await pool.query(
       "SELECT id, course_id, name, total_years, semesters_per_year, is_active FROM course_branches WHERE is_active = 1 ORDER BY name ASC"
    );

    // Map branches to courses
    const result = courses.map(course => {
      const courseBranches = branches
        .filter(b => b.course_id === course.id)
        .map(b => {
          const bTotalYears = b.total_years || course.total_years;
          const bSemsPerYear = b.semesters_per_year || course.semesters_per_year;
          return {
            id: b.id,
            name: b.name,
            total_years: bTotalYears,
            semesters_per_year: bSemsPerYear,
            years: Array.from({ length: bTotalYears }, (_, i) => i + 1),
            semesters: Array.from({ length: bTotalYears * bSemsPerYear }, (_, i) => i + 1)
          };
        });
      
      const totalYears = course.total_years;
      const semsPerYear = course.semesters_per_year || 2; // Default to 2 if missing

      return {
        id: course.id,
        name: course.name,
        displayName: course.name, // Compatibility for frontend
        total_years: totalYears,
        semesters_per_year: semsPerYear,
        years: Array.from({ length: totalYears }, (_, i) => i + 1),
        semesters: Array.from({ length: totalYears * semsPerYear }, (_, i) => i + 1),
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
    let query = "SELECT id, course_id, name, total_years, semesters_per_year, is_active FROM course_branches WHERE is_active = 1";
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
