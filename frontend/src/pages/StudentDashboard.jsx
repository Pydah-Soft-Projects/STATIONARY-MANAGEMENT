import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, GraduationCap, Users, ChevronLeft, ChevronRight, Loader2, X, RefreshCw } from 'lucide-react';
import { apiUrl } from '../utils/api';
import useOnlineStatus from '../hooks/useOnlineStatus';
import { normalizeCourseName, hasViewAccess } from '../utils/permissions';

const normalizeCourse = (value) => {
  if (!value) return '';
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
};

const TableSkeleton = () => (
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
        <th className="px-6 py-3 font-semibold">Status</th>
      </tr>
    </thead>
    <tbody className="divide-y divide-gray-100 animate-pulse">
      {[...Array(6)].map((_, i) => (
        <tr key={i} className="hover:bg-gray-50">
          <td className="px-6 py-4">
            <div className="h-4 bg-gray-200 rounded w-36"></div>
          </td>
          <td className="px-6 py-4">
            <div className="h-4 bg-gray-200 rounded w-24"></div>
          </td>
          <td className="px-6 py-4">
            <div className="h-4 bg-gray-200 rounded w-20"></div>
          </td>
          <td className="px-6 py-4">
            <div className="h-5 bg-indigo-100 rounded-full w-16"></div>
          </td>
          <td className="px-6 py-4">
            <div className="h-4 bg-gray-200 rounded w-8"></div>
          </td>
          <td className="px-6 py-4">
            <div className="h-4 bg-gray-200 rounded w-8"></div>
          </td>
          <td className="px-6 py-4">
            <div className="h-4 bg-gray-200 rounded w-24"></div>
          </td>
          <td className="px-6 py-4">
            <div className="h-5 bg-gray-200 rounded-full w-16"></div>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

const StudentDashboard = ({ currentUser }) => {
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();

  // -- State --
  // Initialize from sessionStorage if available
  const getInitialState = (key, defaultValue) => {
    try {
      const saved = sessionStorage.getItem(`dashboard_${key}`);
      return saved ? JSON.parse(saved) : defaultValue;
    } catch (e) {
      console.warn(`Failed to parse dashboard_${key} from sessionStorage`, e);
      return defaultValue;
    }
  };

  const [courses, setCourses] = useState(() => {
    const val = getInitialState('courses', []);
    return Array.isArray(val) ? val : [];
  });
  const [branches, setBranches] = useState(() => {
    const val = getInitialState('branches', []);
    return Array.isArray(val) ? val : [];
  });
  const [allStudents, setAllStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [selectedCourse, setSelectedCourse] = useState(() => getInitialState('selectedCourse', ''));
  const [selectedBranch, setSelectedBranch] = useState(() => getInitialState('selectedBranch', ''));
  const [selectedYear, setSelectedYear] = useState(() => getInitialState('selectedYear', ''));
  const [selectedSemester, setSelectedSemester] = useState(() => getInitialState('selectedSemester', ''));
  const [searchTerm, setSearchTerm] = useState(() => getInitialState('searchTerm', ''));

  // Pagination
  const [page, setPage] = useState(() => getInitialState('page', 1));
  const limit = 50;

  // Lightweight session storage persistence
  useEffect(() => {
    try {
      sessionStorage.setItem('dashboard_selectedCourse', JSON.stringify(selectedCourse));
      sessionStorage.setItem('dashboard_selectedBranch', JSON.stringify(selectedBranch));
      sessionStorage.setItem('dashboard_selectedYear', JSON.stringify(selectedYear));
      sessionStorage.setItem('dashboard_selectedSemester', JSON.stringify(selectedSemester));
      sessionStorage.setItem('dashboard_searchTerm', JSON.stringify(searchTerm));
      sessionStorage.setItem('dashboard_page', JSON.stringify(page));
    } catch (e) {
      console.warn('Failed to save dashboard state to sessionStorage', e);
    }
  }, [selectedCourse, selectedBranch, selectedYear, selectedSemester, searchTerm, page]);

  // Reset page to 1 on any filter or search change
  useEffect(() => {
    setPage(1);
  }, [selectedCourse, selectedBranch, selectedYear, selectedSemester, searchTerm]);

  // -- Permissions --
  const isSuperAdmin = currentUser?.role === 'Administrator';
  const userPermissions = Array.isArray(currentUser?.permissions) ? currentUser.permissions : [];

  const [collegeCourses, setCollegeCourses] = useState([]);

  // Fetch Assigned College Courses
  useEffect(() => {
    const fetchCollegeCourses = async () => {
      if (!currentUser?.assignedCollege) return;

      try {
        const collegeId = typeof currentUser.assignedCollege === 'object'
          ? currentUser.assignedCollege._id
          : currentUser.assignedCollege;

        if (!collegeId) return;

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
    if (isSuperAdmin) return null;

    const allowed = new Set();

    if (hasViewAccess(userPermissions, 'course-dashboard')) {
      userPermissions.forEach(perm => {
        if (typeof perm === 'string' && perm.startsWith('course-dashboard-')) {
          const parts = perm.split(':');
          const courseName = parts[0].replace('course-dashboard-', '');
          allowed.add(courseName);
        }
      });
    }

    collegeCourses.forEach(course => {
      allowed.add(course);
    });

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
          let availableCourses = Array.isArray(data) ? data : [];

          if (availableCourses.length > 0 && allowedCourseNames !== null) {
            availableCourses = availableCourses.filter(c => {
              const idMatch = allowedCourseNames.includes(String(c.id));
              const normName = normalizeCourseName(c.name);
              const nameMatch = allowedCourseNames.some(allowed => normalizeCourseName(allowed) === normName);
              return idMatch || nameMatch;
            });
          }
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
        const courseObj = (courses || []).find(c => String(c.id) === selectedCourse || c.name === selectedCourse);
        if (!courseObj) return;

        const res = await fetch(apiUrl(`/api/sql/academic/branches?courseId=${courseObj.id}`));
        if (res.ok) {
          const data = await res.json();
          const validBranches = Array.isArray(data) ? data : [];
          if (JSON.stringify(validBranches) !== JSON.stringify(branches)) {
            setBranches(validBranches);
          }
        }
      } catch (err) {
        console.error('Failed to fetch branches:', err);
        setBranches([]);
      }
    };
    if (isOnline && (courses || []).length > 0) fetchBranches();
  }, [selectedCourse, isOnline, courses]);

  // 3. Fetch All Students into Memory on Mount
  const fetchAllStudents = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await fetch(apiUrl('/api/sql/students?all=true'));
      if (res.ok) {
        const data = await res.json();
        const rows = Array.isArray(data.rows) ? data.rows : [];
        setAllStudents(rows);
      } else {
        setAllStudents([]);
      }
    } catch (err) {
      console.error('Failed to fetch students from MySQL:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isOnline) {
      fetchAllStudents();
    }
  }, [isOnline, fetchAllStudents]);

  // Handlers
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // --- Render Helpers ---
  const years = [1, 2, 3, 4];
  const semesters = [1, 2, 3, 4, 5, 6, 7, 8];

  // 0ms Instant Client-Side In-Memory Filtering across all students
  const filteredStudents = useMemo(() => {
    if (!allStudents || allStudents.length === 0) return [];

    const query = searchTerm.trim().toLowerCase();
    const cleanQuery = query.replace(/[^a-z0-9]/g, '');

    const selectedCourseObj = selectedCourse ? (courses || []).find(c => String(c.id) === String(selectedCourse)) : null;
    const courseNameTarget = selectedCourseObj ? selectedCourseObj.name.toLowerCase() : (selectedCourse ? String(selectedCourse).toLowerCase() : '');

    const selectedBranchObj = selectedBranch ? (branches || []).find(b => String(b.id) === String(selectedBranch)) : null;
    const branchNameTarget = selectedBranchObj ? selectedBranchObj.name.toLowerCase() : (selectedBranch ? String(selectedBranch).toLowerCase() : '');

    return allStudents.filter(student => {
      // Course filter
      if (selectedCourse) {
        const sCourse = (student.course || '').toLowerCase();
        const cMatch = String(student.courseId) === String(selectedCourse) || 
                       sCourse === courseNameTarget ||
                       normalizeCourse(student.course) === normalizeCourse(courseNameTarget);
        if (!cMatch) return false;
      }

      // Branch filter
      if (selectedBranch) {
        const sBranch = (student.branch || '').toLowerCase();
        const bMatch = String(student.branchId) === String(selectedBranch) || 
                       sBranch === branchNameTarget ||
                       sBranch.startsWith(branchNameTarget);
        if (!bMatch) return false;
      }

      // Year filter
      if (selectedYear) {
        if (String(student.year) !== String(selectedYear)) return false;
      }

      // Semester filter
      if (selectedSemester) {
        if (String(student.semester) !== String(selectedSemester)) return false;
      }

      // Search query (Name, PIN, Admission Number, Mobile)
      if (query) {
        const name = (student.name || '').toLowerCase();
        const pin = (student.pin || '').toLowerCase();
        const studentId = (student.studentId || '').toLowerCase();
        const phone = String(student.phoneNumber || '');

        const cleanName = name.replace(/[^a-z0-9]/g, '');
        const cleanPin = pin.replace(/[^a-z0-9]/g, '');
        const cleanId = studentId.replace(/[^a-z0-9]/g, '');

        const matched = 
          name.includes(query) ||
          pin.includes(query) ||
          studentId.includes(query) ||
          phone.includes(query) ||
          (cleanQuery.length > 1 && (
            cleanName.includes(cleanQuery) ||
            cleanPin.includes(cleanQuery) ||
            cleanId.includes(cleanQuery)
          ));

        if (!matched) return false;
      }

      return true;
    });
  }, [allStudents, selectedCourse, selectedBranch, selectedYear, selectedSemester, searchTerm, courses, branches]);

  // Paginated students for active page display
  const totalRecords = filteredStudents.length;
  const totalPages = Math.ceil(totalRecords / limit) || 1;

  const displayStudents = useMemo(() => {
    const start = (page - 1) * limit;
    return filteredStudents.slice(start, start + limit);
  }, [filteredStudents, page, limit]);

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
        <div className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Search */}
            <div className="lg:col-span-1">
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase">Search</label>
              <div className="relative">
                {loading ? (
                  <Loader2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-blue-600 animate-spin" size={15} />
                ) : (
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={15} />
                )}
                <input
                  type="text"
                  placeholder="Name, PIN, or Admission No..."
                  className="w-full pl-9 pr-8 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:outline-none bg-white/50 backdrop-blur-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setPage(1);
                    }}
                    className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded-full hover:bg-gray-100 transition-colors"
                    title="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
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
                  setSelectedBranch('');
                }}
              >
                <option value="">All Courses</option>
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
                onChange={(e) => setSelectedBranch(e.target.value)}
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden relative">
          {/* Animated Top Progress Line during fetch */}
          {refreshing && (
            <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-600 animate-pulse"></div>
          )}

          {/* Table Header / Meta */}
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-700">Student List</span>
              {refreshing ? (
                <span className="bg-amber-50 text-amber-700 border border-amber-200/80 px-2 py-0.5 rounded-md text-xs font-medium flex items-center gap-1.5 animate-pulse">
                  <Loader2 className="animate-spin text-amber-600" size={11} />
                  Syncing records...
                </span>
              ) : (
                <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md text-xs font-medium">
                  {totalRecords} Found
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchAllStudents(true)}
                disabled={refreshing || loading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors shadow-sm"
                title="Refresh student records from MySQL"
              >
                <RefreshCw size={13} className={refreshing ? 'animate-spin text-blue-600' : 'text-gray-500'} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto min-h-[300px]">
            {loading ? (
              <TableSkeleton />
            ) : displayStudents.length === 0 ? (
              <div className="text-center py-20 text-gray-500 flex flex-col items-center justify-center">
                <GraduationCap size={40} className="mb-3 text-gray-300" />
                <p className="font-medium text-gray-700">No students found matching current filters.</p>
                <p className="text-xs text-gray-400 mt-1">Try adjusting your search query or course filters.</p>
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
                    <th className="px-6 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {displayStudents.map((student) => (
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
                      <td className="px-6 py-4">
                        {student.status ? (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            student.status?.toLowerCase() === 'active' ? 'bg-green-100 text-green-800' :
                            student.status?.toLowerCase() === 'inactive' ? 'bg-gray-100 text-gray-800' :
                            student.status?.toLowerCase() === 'graduated' ? 'bg-blue-100 text-blue-800' :
                            student.status?.toLowerCase() === 'cancelled' ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {student.status}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
              <div className="text-xs text-gray-500">
                Showing {totalRecords > 0 ? (page - 1) * limit + 1 : 0} to {Math.min(page * limit, totalRecords)} of {totalRecords} students
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page === 1}
                  className="p-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm font-medium text-gray-700 px-2">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page === totalPages}
                  className="p-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default StudentDashboard;
