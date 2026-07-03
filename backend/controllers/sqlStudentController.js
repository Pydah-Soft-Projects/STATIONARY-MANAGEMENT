const asyncHandler = require('express-async-handler');
const { getMySqlPool } = require('../config/mysql');
const { User } = require('../models/userModel');
const { AcademicConfig } = require('../models/academicConfigModel');
const { Transaction } = require('../models/transactionModel');

const DEFAULT_STUDENT_TABLE = 'students';

const deriveValue = (record, possibleKeys, fallback = null) => {
  for (const key of possibleKeys) {
    if (key in record && record[key] !== null && record[key] !== undefined) {
      return record[key];
    }
  }
  return fallback;
};

const normalizeStudentRow = (row) => {
  const id =
    deriveValue(row, ['id', 'ID', 'student_id', 'studentId', 'roll_no', 'rollNo']) ??
    deriveValue(row, ['uuid', 'userId', 'user_id']);

  const firstName = deriveValue(row, ['first_name', 'firstName', 'fname', 'first']);
  const lastName = deriveValue(row, ['last_name', 'lastName', 'lname', 'last']);
  const combinedName = [firstName, lastName].filter(Boolean).join(' ').trim();

  const name =
    deriveValue(row, ['name', 'student_name', 'studentName', 'full_name', 'fullName']) ||
    combinedName ||
    (typeof row === 'object' ? JSON.stringify(row) : 'Unknown');

  const pin =
    deriveValue(row, [
      'pin_number',
      'pinNumber',
      'pin_no',
      'pinNo',
      'pin',
      'PIN',
      'pin_num',
      'pinNum',
      'pin_nbr',
      'pinNbr',
    ]) || null;

  const secondaryId =
    deriveValue(row, ['admission_number', 'admission_no', 'student_id', 'studentId', 'roll_no', 'rollNo', 'registration_no', 'registrationNo']) ||
    id ||
    null;

  const preferredId = pin || secondaryId;

  const course = deriveValue(row, ['course', 'course_name', 'courseName', 'program', 'programme'], 'N/A');
  const courseId = deriveValue(row, ['course_id', 'courseId', 'program_id', 'programId'], null);
  const yearValue = deriveValue(row, ['year', 'year_of_study', 'yearOfStudy', 'current_year', 'stud_year', 'semester_year'], null);
  const semesterValue = deriveValue(row, ['semester', 'current_semester', 'semester_no', 'sem', 'sem_no'], null);
  const branch = deriveValue(row, ['branch', 'department', 'dept', 'department_name'], 'N/A');
  const branchId = deriveValue(row, ['branch_id', 'branchId', 'dept_id', 'department_id', 'departmentId'], null);
  const batch = deriveValue(row, ['batch', 'academic_year', 'academicYear', 'admission_batch', 'admissionBatch'], null);
  const status = deriveValue(row, ['status', 'admission_status', 'admissionStatus', 'student_status', 'studentStatus', 'admission_state'], null);
  const phoneNumber = deriveValue(row, ['student_mobile', 'parent_mobile1', 'parent_mobile2', 'mobile', 'phone', 'contact'], '');

  // Helper to normalize Year/Sem (handles Roman Numerals common in Indian colleges)
  const normalizeAcademicUnit = (val) => {
    if (val === null || val === undefined) return null;
    const s = String(val).trim().toUpperCase();
    if (s === 'I' || s === '1') return 1;
    if (s === 'II' || s === '2') return 2;
    if (s === 'III' || s === '3') return 3;
    if (s === 'IV' || s === '4') return 4;
    const num = parseInt(s, 10);
    return isNaN(num) ? s : num;
  };

  const year = normalizeAcademicUnit(yearValue) || yearValue; // Fallback to raw if logic fails
  const semester = normalizeAcademicUnit(semesterValue) || semesterValue;

  return {
    id: id ?? preferredId ?? `${name}-${course}`,
    name,
    studentId: preferredId ?? 'N/A',
    pin: pin || null,
    alternateId: secondaryId || null,
    course,
    courseId,
    year,
    semester,
    branch,
    branchId,
    batch: batch ? String(batch).trim() : null,
    academicYear: batch ? String(batch).trim() : null,
    status: status || null,
    phoneNumber: phoneNumber || '',
    _sourceRow: row,
  };
};

const getSqlStudents = asyncHandler(async (req, res) => {
  const pool = getMySqlPool();
  if (!pool) {
    res.status(500);
    throw new Error('MySQL pool is not configured. Check environment variables.');
  }

  const {
    page = 1,
    limit = 50,
    search = '',
    course = '',
    branch = '',
    year = '',
    semester = '',
    forceRefresh = false,
  } = req.query;

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.max(1, parseInt(limit, 10));
  const offset = (pageNum - 1) * limitNum;

  const tableName = process.env.DB_STUDENTS_TABLE || DEFAULT_STUDENT_TABLE;

  // Build WHERE clause
  const conditions = [];
  const params = [];

  if (search) {
    const searchPattern = `%${search}%`;
    conditions.push(`(student_name LIKE ? OR pin_no LIKE ?)`);
    params.push(searchPattern, searchPattern);
  }

  if (course && course !== 'all') {
    conditions.push(`course = ?`);
    params.push(course);

    // Strict Filtering: If courseId is provided, restrict to allowed branches for that specific course ID
    const { courseId } = req.query;
    if (courseId) {
      try {
        // Use MySQL pool to find allowed branches for this course ID
        const [branchRows] = await pool.query(
          'SELECT name FROM course_branches WHERE course_id = ? AND is_active = 1',
          [courseId]
        );
        
        const allowedBranches = branchRows.map(b => b.name);

        // Only apply strict filtering if specific branches are defined for the course
        // AND the user hasn't already selected a specific branch (which handles itself)
        if (allowedBranches.length > 0 && (!branch || branch === 'all')) {
          const placeholders = allowedBranches.map(() => '?').join(',');
          conditions.push(`branch IN (${placeholders})`);
          params.push(...allowedBranches);
        }
      } catch (err) {
        console.error('Error applying strict course filter (MySQL):', err);
        // Fallback to name-only filtering if query fails
      }
    }
  }

  if (branch && branch !== 'all') {
    const bLower = branch.toLowerCase().trim();
    let branchOptions = [bLower];
    
    if (bLower === 'cse' || bLower.includes('computer science')) {
        branchOptions = ['cse', 'computer science', 'computer science engineering', 'computer science and engineering'];
    } else if (bLower === 'ece' || bLower.includes('electronics')) {
        branchOptions = ['ece', 'electronics', 'electronics & communication engineering', 'electronics and communication engineering', 'electronics and communications engineering'];
    } else if (bLower === 'eee' || bLower.includes('electrical')) {
        branchOptions = ['eee', 'electrical', 'electrical and electronics engineering', 'electrical & electronics engineering', 'electrical & electronics', 'electrical and electronics'];
    } else if (bLower === 'mech' || bLower.includes('mechanical')) {
        branchOptions = ['mech', 'mechanical', 'mechanical engineering'];
    } else if (bLower === 'civil') {
        branchOptions = ['civil', 'civil engineering'];
    } else if (bLower === 'it' || bLower.includes('information technology')) {
        branchOptions = ['it', 'information technology'];
    }

    const placeholders = branchOptions.map(() => '?').join(',');
    conditions.push(`(branch IN (${placeholders}) OR branch LIKE ? OR ? LIKE CONCAT('%', branch, '%'))`);
    params.push(...branchOptions, `%${bLower}%`, bLower);
  }

  if (year && year !== 'all') {
    const yStr = String(year).trim();
    let yearOptions = [yStr];
    
    if (yStr === '1') yearOptions.push('I');
    else if (yStr === '2') yearOptions.push('II');
    else if (yStr === '3') yearOptions.push('III');
    else if (yStr === '4') yearOptions.push('IV');
    
    const placeholders = yearOptions.map(() => '?').join(',');
    conditions.push(`current_year IN (${placeholders})`);
    params.push(...yearOptions);
  }

  if (semester && semester !== 'all') {
    const sStr = String(semester).trim();
    let semOptions = [sStr];
    
    if (sStr === '1') semOptions.push('I');
    else if (sStr === '2') semOptions.push('II');
    else if (sStr === '3') semOptions.push('III');
    else if (sStr === '4') semOptions.push('IV');
    
    const placeholders = semOptions.map(() => '?').join(',');
    conditions.push(`current_semester IN (${placeholders})`);
    params.push(...semOptions);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count total records for pagination
  const countSql = `SELECT COUNT(*) as total FROM \`${tableName}\` ${whereClause}`;

  // Fetch paginated records
  const dataSql = forceRefresh
    ? `SELECT SQL_NO_CACHE * FROM \`${tableName}\` ${whereClause} ORDER BY admission_number DESC LIMIT ? OFFSET ?`
    : `SELECT * FROM \`${tableName}\` ${whereClause} ORDER BY admission_number DESC LIMIT ? OFFSET ?`;

  try {
    // Get total count
    const [countRows] = await pool.query(countSql, params);
    const total = countRows[0]?.total || 0;

    // Get paginated data
    // Append Limit and Offset to params
    const queryParams = [...params, limitNum, offset];
    const [rows] = await pool.query(dataSql, queryParams);

    // Normalize rows
    const students = Array.isArray(rows) ? rows.map(normalizeStudentRow) : [];

    // Build result
    res.json({
      rows: students,
      count: total,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
      debug: {
        tableName,
        conditions: conditions.length,
      },
    });
  } catch (error) {
    console.error('[MySQL] Fatal Error in getSqlStudents:', error);
    // Log additional context
    console.error('[MySQL] Query State:', {
      tableName,
      conditions,
      params,
      limitNum,
      offset
    });

    // Ensure we don't crash the process if something weird happened
    if (!res.headersSent) {
      res.status(500).json({
        message: 'Internal Student Dashboard error',
        error: error.message
      });
    }
  }
});



// ... existing imports ...

// Helper to normalize product names for the items map (must match transactionController logic)
const normalizeItemKey = (name) => {
  if (!name) return '';
  return name.toLowerCase().replace(/\s+/g, '_');
};

const getStudentById = asyncHandler(async (req, res) => {
  const pool = getMySqlPool();
  if (!pool) {
    res.status(500);
    throw new Error('MySQL pool is not configured.');
  }

  const { id } = req.params;
  const tableName = process.env.DB_STUDENTS_TABLE || DEFAULT_STUDENT_TABLE;

  let connection;
  try {
    connection = await pool.getConnection();

    // Try to find by id column first
    const [rows] = await connection.query(
      `SELECT * FROM ${tableName} WHERE id = ? LIMIT 1`,
      [id]
    );

    let student = null;

    if (rows.length === 0) {
      // Fallback: search by admission_number, admission_no, or pin_no
      const [rowsFallback] = await connection.query(
        `SELECT * FROM ${tableName} WHERE admission_number = ? OR admission_no = ? OR pin_no = ? LIMIT 1`,
        [id, id, id]
      );

      if (rowsFallback.length === 0) {
        res.status(404);
        throw new Error('Student not found');
      }
      student = normalizeStudentRow(rowsFallback[0]);
    } else {
      student = normalizeStudentRow(rows[0]);
    }

    // --- Dynamic Items Calculation (Migration Support) ---
    // Since MySQL student doesn't have 'items' map, we reconstruct it from Transaction history.
    // We look for transactions linked via sqlId (preferred) or legacy studentId.

    // 1. Find all PAID transactions for this student
    const studentSqlId = String(student.id); // Ensure string for matching
    const studentAdmissionNo = String(student.studentId);

    const transactions = await Transaction.find({
      $or: [
        { 'student.sqlId': studentSqlId }, // Direct SQL ID match
        { 'student.sqlId': studentAdmissionNo }, // Fallback to admission no if migration mapped it that way
        // Fallback for un-migrated legacy data (less likely now, but safe to include)
        { 'student.studentId': studentAdmissionNo, transactionType: 'student' }
      ],
      isPaid: true
    }).select('items');

    // 2. Aggregate items
    const itemsMap = {};
    let hasPaidTransaction = false;

    if (transactions && transactions.length > 0) {
      hasPaidTransaction = true;
      transactions.forEach(txn => {
        if (txn.items && Array.isArray(txn.items)) {
          txn.items.forEach(item => {
            // Only count fulfilled items (or non-partial if logic requires)
            if (item.status !== 'partial') {
              const key = normalizeItemKey(item.name);
              if (key) {
                itemsMap[key] = true;
              }
              if (item.productId) {
                itemsMap[`id:${item.productId}`] = true;
              }
            }
          });
        }
      });
    }

    // 3. Attach to student object
    student.items = itemsMap;
    student.paid = hasPaidTransaction; // Simple paid status derived from history

    res.json(student);

  } catch (error) {
    res.status(500);
    throw new Error(`SQL Error: ${error.message}`);
  } finally {
    if (connection) connection.release();
  }
});

const ensureString = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const isMeaningful = (value) => {
  if (value === null || value === undefined) return false;
  const str = String(value).trim();
  if (!str) return false;
  return str.toLowerCase() !== 'n/a';
};

const getDefaultPassword = () => process.env.SQL_STUDENT_DEFAULT_PASSWORD || 'Sync@123';
const getEmailDomain = () => process.env.SQL_STUDENT_EMAIL_DOMAIN || 'mysql-sync.pydah.com';

/**
 * Check if a student status indicates admission cancellation
 * @param {string|null|undefined} status - Student status value
 * @returns {boolean} - True if status indicates cancellation
 */
const isAdmissionCancelled = (status) => {
  if (!status) return false;

  const statusStr = String(status).trim().toLowerCase();

  // List of variations that indicate cancellation
  const cancelledPatterns = [
    'admission cancelled',
    'admission canceled',
    'cancelled admission',
    'canceled admission',
    'admission cancellation',
    'admission cancelation',
    'cancelled',
    'canceled',
    'cancellation',
    'cancel',
    'withdrawn',
    'withdrawal',
    'discontinued',
    'terminated',
    'inactive',
  ];

  // Check if status contains any cancellation pattern
  return cancelledPatterns.some(pattern => statusStr.includes(pattern));
};

/**
 * Update academic config with courses, branches, and years from synced students
 * @param {Array} normalizedStudents - Array of normalized student records
 */
const updateAcademicConfigFromStudents = async (normalizedStudents) => {
  try {
    // Collect unique courses, branches, and years from synced students
    const courseMap = new Map();

    normalizedStudents.forEach((student) => {
      const course = isMeaningful(student.course) ? ensureString(student.course).toLowerCase().trim() : null;
      if (!course || course === 'general') return;

      const branch = isMeaningful(student.branch) ? ensureString(student.branch).trim() : null;
      const rawYear = isMeaningful(student.year) ? student.year : null;
      const yearNumber = rawYear !== null && rawYear !== undefined ? Number.parseInt(rawYear, 10) : null;
      const year = yearNumber && Number.isFinite(yearNumber) && yearNumber > 0 ? yearNumber : null;

      if (!courseMap.has(course)) {
        // Format display name (e.g., "b.tech" -> "B.Tech", "diploma" -> "Diploma")
        const displayName = course
          .split(/[.\s_-]+/)
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join('.')
          .replace(/\.+/g, '.')
          .replace(/\.$/, '') || course.charAt(0).toUpperCase() + course.slice(1);

        courseMap.set(course, {
          name: course,
          displayName,
          branches: new Set(),
          years: new Set(),
        });
      }

      const courseData = courseMap.get(course);
      if (branch) {
        courseData.branches.add(branch);
      }
      if (year) {
        courseData.years.add(year);
      }
    });

    if (courseMap.size === 0) {
      return; // No valid courses to update
    }

    // Get or create academic config singleton
    let config = await AcademicConfig.findOne({});
    if (!config) {
      config = await AcademicConfig.create({ courses: [] });
    }

    let configUpdated = false;

    // Update or add courses
    for (const [courseName, courseData] of courseMap) {
      const existingCourseIndex = config.courses.findIndex((c) => c.name === courseName);

      if (existingCourseIndex >= 0) {
        // Update existing course
        const existingCourse = config.courses[existingCourseIndex];
        const updatedBranches = Array.from(new Set([...existingCourse.branches, ...courseData.branches]));
        const updatedYears = Array.from(new Set([...existingCourse.years, ...courseData.years])).sort((a, b) => a - b);

        if (
          JSON.stringify(existingCourse.branches.sort()) !== JSON.stringify(updatedBranches.sort()) ||
          JSON.stringify(existingCourse.years) !== JSON.stringify(updatedYears)
        ) {
          config.courses[existingCourseIndex].branches = updatedBranches;
          config.courses[existingCourseIndex].years = updatedYears;
          configUpdated = true;
        }
      } else {
        // Add new course
        config.courses.push({
          name: courseData.name,
          displayName: courseData.displayName,
          branches: Array.from(courseData.branches),
          years: Array.from(courseData.years).sort((a, b) => a - b),
        });
        configUpdated = true;
      }
    }

    if (configUpdated) {
      await config.save();
      console.log(`[MySQL Sync] Updated academic config with ${courseMap.size} course(s)`);
    }
  } catch (error) {
    console.error('[MySQL Sync] Failed to update academic config:', error);
    // Don't throw - this is a non-critical update
  }
};

const syncSqlStudents = asyncHandler(async (req, res) => {
  const pool = getMySqlPool();
  if (!pool) {
    res.status(500);
    throw new Error('MySQL pool is not configured. Check environment variables.');
  }

  // Extract filters and forceRefresh flag from request body
  const { filters = {}, forceRefresh = false, noCache = false } = req.body;
  const { courses = [], branches = [], years = [] } = filters;
  const hasFilters = (Array.isArray(courses) && courses.length > 0) ||
    (Array.isArray(branches) && branches.length > 0) ||
    (Array.isArray(years) && years.length > 0);

  const tableName = process.env.DB_STUDENTS_TABLE || DEFAULT_STUDENT_TABLE;
  // Use SQL_NO_CACHE hint to bypass MySQL query cache when forceRefresh is true
  const sql = (forceRefresh || noCache)
    ? `SELECT SQL_NO_CACHE * FROM \`${tableName}\``
    : `SELECT * FROM \`${tableName}\``;

  const summary = {
    table: tableName,
    total: 0,
    filtered: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    insertedDetails: [],
    updatedDetails: [],
    skippedDetails: [],
  };

  try {
    const [rows] = await pool.query(sql);
    if (!Array.isArray(rows) || rows.length === 0) {
      res.json({ ...summary, message: 'No records found in MySQL table.' });
      return;
    }

    let normalized = rows.map(normalizeStudentRow);
    summary.total = normalized.length;

    // Apply filters if provided
    if (hasFilters) {
      normalized = normalized.filter((student) => {
        // Course filter
        if (courses.length > 0) {
          const studentCourse = isMeaningful(student.course)
            ? ensureString(student.course).toLowerCase().trim()
            : null;
          const matchesCourse = courses.some(filterCourse => {
            const normalizedFilter = ensureString(filterCourse).toLowerCase().trim();
            return studentCourse === normalizedFilter;
          });
          if (!matchesCourse) return false;
        }

        // Branch filter
        if (branches.length > 0) {
          const studentBranch = isMeaningful(student.branch)
            ? ensureString(student.branch).trim()
            : null;
          const matchesBranch = branches.some(filterBranch => {
            const normalizedFilter = ensureString(filterBranch).trim();
            return studentBranch === normalizedFilter;
          });
          if (!matchesBranch) return false;
        }

        // Year filter
        if (years.length > 0) {
          const rawYear = isMeaningful(student.year) ? student.year : null;
          const yearNumber = rawYear !== null && rawYear !== undefined ? Number.parseInt(rawYear, 10) : null;
          const studentYear = yearNumber && Number.isFinite(yearNumber) && yearNumber > 0 ? yearNumber : null;
          const matchesYear = years.some(filterYear => {
            const filterYearNum = Number.parseInt(filterYear, 10);
            return Number.isFinite(filterYearNum) && studentYear === filterYearNum;
          });
          if (!matchesYear) return false;
        }

        return true;
      });
      summary.filtered = normalized.length;
    } else {
      summary.filtered = normalized.length;
    }

    // If no students match filters, return early
    if (normalized.length === 0) {
      res.json({
        ...summary,
        message: hasFilters
          ? 'No students match the selected filters.'
          : 'No records found in MySQL table.',
      });
      return;
    }

    const uniqueIds = new Set();
    normalized.forEach((student) => {
      const preferredId = ensureString(student.pin) || ensureString(student.studentId);
      const alternateId = ensureString(student.alternateId);
      if (preferredId) uniqueIds.add(preferredId);
      if (alternateId) uniqueIds.add(alternateId);
    });

    const existingUsers = await User.find({ studentId: { $in: Array.from(uniqueIds).filter(Boolean) } });
    const userMap = new Map(existingUsers.map((user) => [ensureString(user.studentId), user]));

    // Filter valid students and separate into existing vs new
    const bulkOps = [];
    const newStudents = [];

    // Pre-fetch all emails for new potential users to optimize uniqueness check
    // We'll do this after identifying which students are actually new

    for (const student of normalized) {
      const name = ensureString(student.name);
      const preferredId = ensureString(student.pin) || ensureString(student.studentId);
      const fallbackId = ensureString(student.alternateId);
      const studentId = preferredId || fallbackId;

      // Check for missing required fields
      if (!name || !studentId) {
        summary.skipped += 1;
        summary.skippedDetails.push({
          studentId: studentId || 'N/A',
          name: name || 'N/A',
          course: student.course || 'N/A',
          year: student.year || 'N/A',
          branch: student.branch || 'N/A',
          reason: 'Missing name or student ID',
        });
        continue;
      }

      // Filter out students with cancelled admission status
      if (isAdmissionCancelled(student.status)) {
        summary.skipped += 1;
        summary.skippedDetails.push({
          studentId,
          name,
          course: student.course || 'N/A',
          year: student.year || 'N/A',
          branch: student.branch || 'N/A',
          status: student.status || null,
          reason: `Admission cancelled (Status: ${student.status || 'N/A'})`,
        });
        continue;
      }

      const course = isMeaningful(student.course) ? ensureString(student.course) : 'General';
      const branch = isMeaningful(student.branch) ? ensureString(student.branch) : '';
      const rawYear = isMeaningful(student.year) ? student.year : 1;
      const yearNumber = Number.parseInt(rawYear, 10);
      const year = Number.isFinite(yearNumber) && yearNumber > 0 ? yearNumber : 1;
      const rawSemester = isMeaningful(student.semester) ? student.semester : null;
      const semesterNumber = rawSemester !== null ? Number.parseInt(rawSemester, 10) : null;
      const semester = semesterNumber && semesterNumber > 0 ? semesterNumber : null;

      let existing = userMap.get(studentId);
      if (!existing && fallbackId) {
        existing = userMap.get(fallbackId);
      }

      if (existing) {
        // UPDATE LOGIC
        let changed = false;
        const updates = {};
        const changes = [];

        if (existing.name !== name) {
          updates.name = name;
          changed = true;
        }
        if (course && existing.course !== course) {
          updates.course = course;
          changes.push(`Course: ${existing.course} -> ${course}`);
          changed = true;
        }
        if (existing.year !== year) {
          updates.year = year;
          changes.push(`Year: ${existing.year} -> ${year}`);
          changed = true;
        }
        if (existing.branch !== branch) {
          updates.branch = branch;
          changes.push(`Branch: ${existing.branch} -> ${branch}`);
          changed = true;
        }
        if (semester !== null && existing.semester !== semester) {
          updates.semester = semester;
          changes.push(`Semester: ${existing.semester} -> ${semester}`);
          changed = true;
        }
        if (preferredId && existing.studentId !== preferredId) {
          updates.studentId = preferredId;
          changes.push(`Id: ${existing.studentId} -> ${preferredId}`);
          changed = true;
        }
        if (student.phoneNumber !== undefined && existing.phoneNumber !== student.phoneNumber) {
          updates.phoneNumber = student.phoneNumber;
          changes.push(`Phone: ${existing.phoneNumber || 'N/A'} -> ${student.phoneNumber}`);
          changed = true;
        }

        if (changed) {
          bulkOps.push({
            updateOne: {
              filter: { _id: existing._id },
              update: { $set: updates },
            },
          });
          summary.updated += 1;
          summary.updatedDetails.push({
            studentId,
            name,
            course,
            year,
            branch,
            semester: semester || null,
            previousCourse: existing.course,
            previousYear: existing.year,
            previousBranch: existing.branch,
            previousSemester: existing.semester || null,
            previousPhoneNumber: existing.phoneNumber || '',
          });
          // Update the map wrapper so subsequent checks in same sync work (unlikely needed but good practice)
          Object.assign(existing, updates);
        } else {
          summary.skipped += 1;
          summary.skippedDetails.push({
            studentId,
            name,
            course,
            year,
            branch,
            reason: 'No changes detected',
          });
        }
      } else {
        // NEW STUDENT - Queue for bulk insert processing
        newStudents.push({
          name,
          studentId,
          course,
          year,
          branch,
          semester,
          phoneNumber: student.phoneNumber || '',
        });
      }
    }

    // PROCESS NEW STUDENTS
    if (newStudents.length > 0) {
      const emailDomain = getEmailDomain();
      const defaultPassword = getDefaultPassword();
      const studentIds = newStudents.map(s => s.studentId);
      const potentialEmails = studentIds.map(id => `${id}@${emailDomain}`.toLowerCase());

      // Find which default emails are already taken
      const takenUsers = await User.find({ email: { $in: potentialEmails } }).select('email');
      const takenEmails = new Set(takenUsers.map(u => u.email));

      for (const student of newStudents) {
        let email = `${student.studentId}@${emailDomain}`.toLowerCase();

        // If default email is taken, fallback to sequential search (slower but safe)
        if (takenEmails.has(email)) {
          let emailCounter = 1;
          while (await User.findOne({ email })) {
            email = `${student.studentId}+${emailCounter}@${emailDomain}`.toLowerCase();
            emailCounter += 1;
          }
        }

        bulkOps.push({
          insertOne: {
            document: {
              name: student.name,
              studentId: student.studentId,
              course: student.course,
              year: student.year,
              semester: student.semester,
              branch: student.branch,
              email: email,
              phoneNumber: student.phoneNumber,
              password: defaultPassword,
              role: 'Student', // Ensure role is set
            },
          },
        });

        summary.inserted += 1;
        summary.insertedDetails.push({
          studentId: student.studentId,
          name: student.name,
          course: student.course,
          year: student.year,
          branch: student.branch,
          semester: student.semester || null,
        });
      }
    }

    // EXECUTE ALL OPERATIONS
    if (bulkOps.length > 0) {
      try {
        const result = await User.bulkWrite(bulkOps, { ordered: false });
        if (result.hasWriteErrors()) {
          result.getWriteErrors().forEach((err) => {
            summary.errors.push({
              message: `Bulk write error: ${err.errmsg}`,
              index: err.index,
            });
            // Adjust counts if necessary, though bulkWrite result usually gives success counts
          });
        }
      } catch (error) {
        if (error.writeErrors) {
          error.writeErrors.forEach((err) => {
            summary.errors.push({
              message: `Bulk write error (partial): ${err.errmsg}`,
            });
          });
        } else {
          console.error('[MySQL Sync] Bulk write failed:', error);
          summary.errors.push({ message: `Critical bulk write failure: ${error.message}` });
        }
      }
    }

    // Update academic config with courses, branches, and years from synced students
    await updateAcademicConfigFromStudents(normalized);

    res.json({
      ...summary,
      message: `Sync complete for table "${tableName}".`,
    });
  } catch (error) {
    console.error('[MySQL] Failed to sync student records:', error);
    res.status(500);
    throw new Error(error.message || 'Failed to sync MySQL students.');
  }
});

module.exports = {
  getSqlStudents,
  syncSqlStudents,
  getStudentById,
  normalizeStudentRow,
};


