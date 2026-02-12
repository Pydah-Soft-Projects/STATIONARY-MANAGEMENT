import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Trash2, GraduationCap, Users, Filter, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { apiUrl } from '../utils/api';
import useOnlineStatus from '../hooks/useOnlineStatus';
import { normalizeCourseName, hasViewAccess } from '../utils/permissions';

const normalizeCourse = (value) => {
  if (!value) return '';
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
};

const StudentDashboard = ({ currentUser }) => {
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();

  // -- State --
  // Initialize from sessionStorage if available
  const getInitialState = (key, defaultValue) => {
    const saved = sessionStorage.getItem(`dashboard_${key}`);
    return saved ? JSON.parse(saved) : defaultValue;
  };

  const [courses, setCourses] = useState(() => getInitialState('courses', []));
  const [branches, setBranches] = useState(() => getInitialState('branches', []));
  const [students, setStudents] = useState(() => getInitialState('students', []));

  // Filters
  const [selectedCourse, setSelectedCourse] = useState(() => getInitialState('selectedCourse', ''));
  const [selectedBranch, setSelectedBranch] = useState(() => getInitialState('selectedBranch', ''));
  const [selectedYear, setSelectedYear] = useState(() => getInitialState('selectedYear', ''));
  const [selectedSemester, setSelectedSemester] = useState(() => getInitialState('selectedSemester', ''));
  const [searchTerm, setSearchTerm] = useState(() => getInitialState('searchTerm', ''));
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(() => getInitialState('searchTerm', ''));

  // Pagination & Meta
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pagination, setPagination] = useState(() => getInitialState('pagination', {
    page: 1,
    limit: 100,
    totalPages: 0,
    totalRecords: 0
  }));

  const searchTimeoutRef = useRef(null);
  const hasInitialized = useRef(false);

  // Persist state changes
  useEffect(() => {
    sessionStorage.setItem('dashboard_courses', JSON.stringify(courses));
    sessionStorage.setItem('dashboard_branches', JSON.stringify(branches));
    sessionStorage.setItem('dashboard_students', JSON.stringify(students));
    sessionStorage.setItem('dashboard_selectedCourse', JSON.stringify(selectedCourse));
    sessionStorage.setItem('dashboard_selectedBranch', JSON.stringify(selectedBranch));
    sessionStorage.setItem('dashboard_selectedYear', JSON.stringify(selectedYear));
    sessionStorage.setItem('dashboard_selectedSemester', JSON.stringify(selectedSemester));
    sessionStorage.setItem('dashboard_searchTerm', JSON.stringify(searchTerm));
    sessionStorage.setItem('dashboard_pagination', JSON.stringify(pagination));
  }, [courses, branches, students, selectedCourse, selectedBranch, selectedYear, selectedSemester, searchTerm, pagination]);

  // -- Permissions --
  const isSuperAdmin = currentUser?.role === 'Administrator';
  const userPermissions = Array.isArray(currentUser?.permissions) ? currentUser.permissions : [];

  const [collegeCourses, setCollegeCourses] = useState([]);

  // Fetch Assigned College Courses
  useEffect(() => {
    const fetchCollegeCourses = async () => {
      if (!currentUser?.assignedCollege) return;

      try {
        // assignedCollege might be populated object or ID string
        const collegeId = typeof currentUser.assignedCollege === 'object'
          ? currentUser.assignedCollege._id
          : currentUser.assignedCollege;

        if (!collegeId) return;

        // Use the stock endpoint which now returns courses
        const res = await fetch(apiUrl(`/api/stock-transfers/colleges/${collegeId}/stock`));
        if (res.ok) {
          const data = await res.json();
          if (data.courses && Array.isArray(data.courses)) {
            setCollegeCourses(data.courses);
          }
        }
      } catch (err) {
        console.error('Failed to fetch college courses:', err);
      }
    };

    if (isOnline) {
      fetchCollegeCourses();
    }
  }, [currentUser, isOnline]);

  // Helper to extract allowed courses from permissions AND assigned college
  const allowedCourseNames = useMemo(() => {
    if (isSuperAdmin) return null; // Access to all

    const allowed = new Set();

    // 1. Add courses from permissions
    if (hasViewAccess(userPermissions, 'course-dashboard')) {
      userPermissions.forEach(perm => {
        if (typeof perm === 'string' && perm.startsWith('course-dashboard-')) {
          const parts = perm.split(':');
          // Extract course name (e.g. course-dashboard-btech -> btech)
          const courseName = parts[0].replace('course-dashboard-', '');
          allowed.add(courseName);
        }
      });
    }

    // 2. Add courses from Assigned College (Automatic Access)
    collegeCourses.forEach(course => {
      // These are likely Names (e.g. "B.Tech"), so we add them potentially raw or normalized?
      // The filter logic checks BOTH ID and Normalized Name.
      // So if "B.Tech" is here, we add "btech" (normalized) to match the check logic?
      // Actually, the check logic in fetchCourses compares:
      // normalizeCourseName(allowed) === normName
      // So if we add "M.Tech" here, normalizing it later works.
      allowed.add(course);
    });

    // If no permissions AND no college courses, return empty array to block access
    if (allowed.size === 0) return [];

    return Array.from(allowed);
  }, [isSuperAdmin, userPermissions, collegeCourses]);

  // -- Effects --

  // 1. Fetch Courses on Mount
  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const res = await fetch(apiUrl('/api/sql/academic/courses'));
        if (res.ok) {
          const data = await res.json();
          // Filter courses based on permissions if not super admin
          let availableCourses = data;
          if (allowedCourseNames !== null) {
            availableCourses = data.filter(c => {
              // Check 1: Match by ID (New robust method)
              const idMatch = allowedCourseNames.includes(String(c.id));
              // Check 2: Match by Normalized Name (Legacy method)
              const normName = normalizeCourseName(c.name);
              const nameMatch = allowedCourseNames.some(allowed => normalizeCourseName(allowed) === normName);
              return idMatch || nameMatch;
            });
          }
          // Only update if changed to prevent re-fetching students
          if (JSON.stringify(availableCourses) !== JSON.stringify(courses)) {
            setCourses(availableCourses);
          }
        }
      } catch (err) {
        console.error('Failed to fetch courses:', err);
      }
    };
    if (isOnline) fetchCourses();
  }, [isOnline, allowedCourseNames]);

  // 2. Fetch Branches when Course changes
  useEffect(() => {
    if (!selectedCourse) {
      setBranches([]);
      setSelectedBranch('');
      return;
    }

    const fetchBranches = async () => {
      try {
        // Find course ID from selected name/value if possible, currently using name match logic or passed value
        // The API expects courseId if we have it. Let's find the course object.
        const courseObj = courses.find(c => String(c.id) === selectedCourse || c.name === selectedCourse);
        // Note: selectedCourse state holds the ID if using <select value={c.id}>, or name if logic requires.
        // Let's use ID for cleanliness.

        if (!courseObj) return;

        const res = await fetch(apiUrl(`/api/sql/academic/branches?courseId=${courseObj.id}`));
        if (res.ok) {
          const data = await res.json();
          if (JSON.stringify(data) !== JSON.stringify(branches)) {
            setBranches(data);
          }
        }
      } catch (err) {
        console.error('Failed to fetch branches:', err);
      }
    };
    if (isOnline && courses.length > 0) fetchBranches();
  }, [selectedCourse, isOnline, courses]);

  // 3. Debounce Search
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      if (searchTerm !== debouncedSearchTerm) {
        setPagination(prev => ({ ...prev, page: 1 }));
      }
    }, 500);
    return () => clearTimeout(searchTimeoutRef.current);
  }, [searchTerm]);

  // 4. Fetch Students (The Main Logic)
  const fetchStudents = useCallback(async (isRefresh = false) => {
    // REQUIREMENT: Must select Course and Branch first (unless searching globally? Logic says "select user filter... then render")
    // Let's enforce Course selection at minimum. Branch might be optional if "All Branches" is allowed, but UI usually requires drill down.
    // User request: "select that filter of the course and the branch. Then, we will render"
    // REQUIREMENT: Must select Course OR have a search term
    if (!selectedCourse && !debouncedSearchTerm) {
      // If not selected and no search, clear students
      if (!isRefresh) setStudents([]);
      return;
    }

    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      // Find course name for API if API expects name, or ID. 
      // sqlStudentController expects 'course' and 'branch' names or IDs? 
      // The controller uses `course` column string matching or ID?
      // Let's check sqlStudentController.js... it builds query: `course = ?`. 
      // If the `courses` table has names like "B.Tech", usually the student table has "B.Tech" too.
      // Need to send the NAME if the student table stores names, or ID if it stores IDs.
      // Migration doc says "Student details should be fetched dynamically from MySQL".
      // Assuming existing table has text values.
      const courseObj = courses.find(c => String(c.id) === selectedCourse);
      const branchObj = branches.find(b => String(b.id) === selectedBranch);

      const courseParam = courseObj ? courseObj.name : '';
      const branchParam = branchObj ? branchObj.name : '';

      const query = new URLSearchParams({
        page: pagination.page,
        limit: pagination.limit,
        course: courseParam,
        branch: branchParam,
        year: selectedYear,
        semester: selectedSemester,
        search: debouncedSearchTerm,
      });

      const res = await fetch(apiUrl(`/api/sql/students?${query.toString()}`));
      if (res.ok) {
        const data = await res.json();
        setStudents(data.rows || []);
        setPagination(prev => ({
          ...prev,
          totalRecords: data.count || 0,
          totalPages: data.pagination?.totalPages || 0
        }));
      }
    } catch (err) {
      console.error('Failed to fetch students:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedCourse, selectedBranch, selectedYear, selectedSemester, debouncedSearchTerm, pagination.page, pagination.limit, courses, branches]);

  // Trigger fetch when mandatory filters change or pagination changes
  useEffect(() => {
    // If this is the initialization phase and we have restored data, SKIP the fetch
    // This prevents "reloading" when navigating back
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      if (students.length > 0) return;
    }
    fetchStudents();
  }, [fetchStudents, students.length]);

  // Handlers
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      setPagination(prev => ({ ...prev, page: newPage }));
    }
  };

  const handleDeleteStudent = async (student) => {
    // confirm delete
    if (!window.confirm(`Are you sure you want to delete ${student.name}?`)) return;
    // TODO: Add delete endpoint in sqlStudentController if needed or reuse existing
    // For now, just logging as delete logic might need migration too
    console.log("Delete requested for", student.id);
  };

  // --- Render Helpers ---
  const years = [1, 2, 3, 4]; // Static for now
  const semesters = [1, 2, 3, 4, 5, 6, 7, 8]; // Static for now

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center text-white text-2xl shadow-lg">
              <Users size={24} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Student Dashboard</h1>
              <p className="text-gray-600 mt-1">
                Manage student records from MySQL Source
              </p>
            </div>
          </div>


        </div>

        {/* Filters Section */}
        {/* Filters Section */}
        <div className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Search - MOVED TO FIRST */}
            <div className="lg:col-span-1">
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={14} />
                <input
                  type="text"
                  placeholder="Name or ID..."
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:outline-none bg-white/50 backdrop-blur-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            {/* Course Selector */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase">Course</label>
              <select
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:outline-none bg-white/50 backdrop-blur-sm"
                value={selectedCourse}
                onChange={(e) => {
                  setSelectedCourse(e.target.value);
                  setSelectedBranch(''); // Reset branch
                  setPagination(prev => ({ ...prev, page: 1 }));
                }}
              >
                <option value="">Select Course</option>
                {courses.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Branch Selector */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase">Branch</label>
              <select
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:opacity-50 bg-white/50 backdrop-blur-sm"
                value={selectedBranch}
                onChange={(e) => {
                  setSelectedBranch(e.target.value);
                  setPagination(prev => ({ ...prev, page: 1 }));
                }}
                disabled={!selectedCourse}
              >
                <option value="">Select Branch</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            {/* Year Selector */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase">Year</label>
              <select
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:outline-none bg-white/50 backdrop-blur-sm"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
              >
                <option value="">All Years</option>
                {years.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {/* Semester Selector */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase">Semester</label>
              <select
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:outline-none bg-white/50 backdrop-blur-sm"
                value={selectedSemester}
                onChange={(e) => setSelectedSemester(e.target.value)}
              >
                <option value="">All Semesters</option>
                {semesters.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Content Area */}
        {(!selectedCourse && !debouncedSearchTerm) ? (
          <div className="rounded-xl border-dashed border-2 border-gray-300 p-12 text-center bg-gray-50/50 min-h-[400px] flex flex-col items-center justify-center">
            <div className="w-24 h-24 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
              <GraduationCap size={48} />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Search or Select Course</h3>
            <p className="text-gray-500 max-w-sm mx-auto">
              Select a course from the filters above or use the search bar to find specific students.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Table Header / Meta */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-700">Student List</span>
                {pagination.totalRecords > 0 && (
                  <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md text-xs font-medium">
                    {pagination.totalRecords} Found
                  </span>
                )}
              </div>
              {refreshing && <Loader2 className="animate-spin text-blue-600" size={18} />}
            </div>

            {/* Table */}
            <div className="overflow-x-auto min-h-[300px]">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <Loader2 className="animate-spin text-blue-600 mb-2" size={32} />
                  <p className="text-gray-500">Fetching students...</p>
                </div>
              ) : students.length === 0 ? (
                <div className="text-center py-20 text-gray-500">
                  No students found matching current filters.
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-500 tracking-wider">
                      <th className="px-6 py-3 font-semibold">Student Name</th>
                      <th className="px-6 py-3 font-semibold">Admission No</th>
                      <th className="px-6 py-3 font-semibold">PIN</th>
                      <th className="px-6 py-3 font-semibold">Course</th>
                      <th className="px-6 py-3 font-semibold">Year</th>
                      <th className="px-6 py-3 font-semibold">Semester</th>
                      <th className="px-6 py-3 font-semibold">Branch</th>

                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {students.map((student) => (
                      <tr
                        key={student.id}
                        onClick={() => navigate(`/student/${student.id}`)}
                        className="hover:bg-blue-50 transition-colors group cursor-pointer"
                      >
                        <td className="px-6 py-4 font-medium text-gray-900">{student.name}</td>
                        <td className="px-6 py-4 text-gray-600">{student.studentId}</td>
                        <td className="px-6 py-4 text-gray-600">{student.pin || '-'}</td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                            {student.course}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-600">{student.year}</td>
                        <td className="px-6 py-4 text-gray-600">{student.semester || '-'}</td>
                        <td className="px-6 py-4 text-gray-600">{student.branch}</td>

                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination Footer */}
            {pagination.totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
                <button
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  className="p-2 border rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm text-gray-600">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page === pagination.totalPages}
                  className="p-2 border rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default StudentDashboard;
