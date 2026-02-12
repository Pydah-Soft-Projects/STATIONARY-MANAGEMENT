import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Search, Users, RefreshCw, ChevronDown, ChevronUp, Filter, Upload, ChevronLeft, ChevronRight, X, Edit2 } from 'lucide-react';
import { apiUrl } from '../utils/api';
import { hasFullAccess } from '../utils/permissions';

const StudentManagement = ({ currentUser }) => {
  // Check access level
  const isSuperAdmin = currentUser?.role === 'Administrator';

  const [searchTerm, setSearchTerm] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [sqlStudents, setSqlStudents] = useState([]);
  const [sqlLoading, setSqlLoading] = useState(false);
  const [sqlLoaded, setSqlLoaded] = useState(false);
  const [sqlError, setSqlError] = useState('');
  const [sqlMeta, setSqlMeta] = useState(null);
  const [colleges, setColleges] = useState([]);
  const [selectedCollege, setSelectedCollege] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [config, setConfig] = useState(null);

  // Sync State
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState(null);
  const [syncStats, setSyncStats] = useState(null);
  const [expandedDetails, setExpandedDetails] = useState(null);
  const [syncPreviewCount, setSyncPreviewCount] = useState(0);
  const [isSyncPreviewLoading, setIsSyncPreviewLoading] = useState(false);
  const [syncFilters, setSyncFilters] = useState({
    course: '',
    branch: '',
    year: '',
  });

  const cancelSqlFetchRef = useRef(false);

  useEffect(() => {
    if (currentUser?.assignedCollege) {
      const collegeId = typeof currentUser.assignedCollege === 'object'
        ? currentUser.assignedCollege._id
        : currentUser.assignedCollege;
      setSelectedCollege(collegeId);
    }
  }, [currentUser]);

  useEffect(() => {
    (async () => {
      try {
        const configRes = await fetch(apiUrl('/api/config/academic'));
        const collegeRes = await fetch(apiUrl('/api/stock-transfers/colleges?activeOnly=true'));

        if (configRes.ok && collegeRes.ok) {
          const configData = await configRes.json();
          const collegeData = await collegeRes.json();
          setConfig(configData);
          setColleges(Array.isArray(collegeData) ? collegeData : []);
        }
      } catch (err) {
        console.error('Failed to load metadata:', err);
      }
    })();
  }, []);

  // Load SQL students on mount
  useEffect(() => {
    fetchSqlStudents();
  }, []);

  useEffect(() => {
    cancelSqlFetchRef.current = false;
    return () => {
      cancelSqlFetchRef.current = true;
    };
  }, []);

  const fetchSqlStudents = useCallback(
    async ({ forceRefresh = false, page = 1, limit = 25 } = {}) => {
      setSqlLoading(true);
      setSqlError('');

      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        search: searchTerm,
        course: courseFilter !== 'all' ? courseFilter : '',
        year: yearFilter !== 'all' ? yearFilter : '',
        forceRefresh: forceRefresh ? 'true' : 'false',
      });

      try {
        const url = apiUrl(`/api/sql/students?${params.toString()}`);
        const res = await fetch(url);

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(errorText || `Failed with status ${res.status}`);
        }

        const data = await res.json();
        if (!cancelSqlFetchRef.current) {
          const rows = Array.isArray(data?.rows) ? data.rows : [];
          setSqlStudents(rows);

          setSqlMeta({
            table: data?.table,
            count: data?.pagination?.total || data?.count || 0,
            page: data?.pagination?.page || 1,
            totalPages: data?.pagination?.totalPages || 1,
            availableCourses: data?.availableCourses || [],
            availableYears: data?.availableYears || [],
          });
          setSqlLoaded(true);
        }
      } catch (error) {
        if (!cancelSqlFetchRef.current) {
          console.error('Failed to fetch MySQL students:', error);
          setSqlError(error.message || 'Unable to load external students.');
          setSqlLoaded(false);
          setSqlStudents([]);
        }
      } finally {
        if (!cancelSqlFetchRef.current) {
          setSqlLoading(false);
        }
      }
    },
    [searchTerm, courseFilter, yearFilter]
  );

  // Trigger fetch when filters or page change
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSqlStudents({ page: currentPage, limit: pageSize });
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchSqlStudents, currentPage, pageSize]);

  // Sync Logic
  useEffect(() => {
    if (!showSyncModal) return;

    const fetchPreviewCount = async () => {
      setIsSyncPreviewLoading(true);
      try {
        const params = new URLSearchParams({
          page: '1',
          limit: '1',
          course: syncFilters.course,
          branch: syncFilters.branch,
          year: syncFilters.year,
        });

        const url = apiUrl(`/api/sql/students?${params.toString()}`);
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setSyncPreviewCount(data?.pagination?.total || data?.count || 0);
        }
      } catch (error) {
        console.error('Failed to fetch sync preview count:', error);
      } finally {
        setIsSyncPreviewLoading(false);
      }
    };

    const timer = setTimeout(fetchPreviewCount, 300);
    return () => clearTimeout(timer);
  }, [showSyncModal, syncFilters]);

  const handleSyncToMongo = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncFeedback(null);
    setSyncStats(null);

    try {
      const filters = {
        courses: syncFilters.course ? [syncFilters.course] : [],
        branches: syncFilters.branch ? [syncFilters.branch] : [],
        years: syncFilters.year ? [Number(syncFilters.year)] : [],
      };

      const res = await fetch(apiUrl('/api/sql/students/sync'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filters,
          forceRefresh: true,
          noCache: true,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message = data?.message || res.statusText || 'Failed to sync students.';
        throw new Error(message);
      }

      const {
        inserted = 0,
        updated = 0,
        skipped = 0,
        total = 0,
        filtered = 0,
        errors = [],
        insertedDetails = [],
        updatedDetails = [],
        skippedDetails = [],
        message = 'Sync complete.',
      } = data || {};

      setSyncFeedback({
        type: 'success',
        message: `${message}${filtered !== total ? ` (Filtered: ${filtered} of ${total} students)` : ''}`,
      });
      setSyncStats({
        inserted,
        updated,
        skipped,
        total,
        filtered: filtered || total,
        table: data?.table,
        errors: errors?.length || 0,
        insertedDetails: insertedDetails || [],
        updatedDetails: updatedDetails || [],
        skippedDetails: skippedDetails || [],
        timestamp: new Date().toISOString(),
      });
      setExpandedDetails(null);
      setSyncFilters({ course: '', branch: '', year: '' });

      // Close modal after successful sync (optional, keeping open to show stats)
      // setShowSyncModal(false); 

      // Refresh SQL UI
      await fetchSqlStudents({ forceRefresh: true });

    } catch (error) {
      setSyncFeedback({
        type: 'error',
        message: error.message || 'Unable to sync students from MySQL.',
      });
      setSyncStats(null);
    } finally {
      setSyncing(false);
    }
  };

  const totalPages = sqlMeta?.totalPages || 1;
  const safeCurrentPage = Math.min(currentPage, totalPages);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-8">
        <div className="flex items-center gap-4 mb-4 lg:mb-0">
          <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
            <Users className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Student Management</h1>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-gray-600">View student records from MySQL Database</p>
              {isSuperAdmin && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">
                  Read Only / Sync Mode
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Sync Button (Super Admin Only) */}
        {isSuperAdmin && (
          <button
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-md hover:shadow-lg whitespace-nowrap"
            onClick={() => setShowSyncModal(true)}
            disabled={syncing || sqlLoading}
          >
            <Upload size={18} />
            Sync to Stationery DB
          </button>
        )}
      </div>

      {/* Info Banner */}
      <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex-1">
            <h3 className="text-base font-semibold mb-1">External Database View</h3>
            <p>
              Showing {sqlMeta?.count ?? sqlStudents.length} records from table{' '}
              <span className="font-medium">{sqlMeta?.table ?? 'students'}</span> in the configured MySQL
              database.
            </p>
          </div>
          <button
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-md hover:shadow-lg text-sm font-medium shrink-0"
            onClick={() => fetchSqlStudents({ forceRefresh: true })}
            disabled={sqlLoading}
            title="Refresh SQL students data"
          >
            <RefreshCw size={16} className={sqlLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Sync Status Feedback (Outside Modal for visibility if needed) */}
      {syncFeedback && !showSyncModal && (
        <div className={`mb-6 rounded-xl border p-4 text-sm ${syncFeedback.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'
          }`}>
          {syncFeedback.message}
        </div>
      )}

      {sqlError && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
          <h3 className="text-base font-semibold mb-1">Could not load MySQL records</h3>
          <p>{sqlError}</p>
        </div>
      )}

      {/* Filters Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
          <div className="flex-1 w-full lg:w-auto relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search by name or student ID..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-3 w-full lg:w-auto">
            <select
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Courses</option>
              {(() => {
                const sqlCourses = sqlMeta?.availableCourses || [];
                return sqlCourses.map(c => (
                  <option key={c} value={c}>{c.toUpperCase()}</option>
                ));
              })()}
            </select>
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Years</option>
              {(() => {
                const sqlYears = sqlMeta?.availableYears || [];
                return sqlYears.sort((a, b) => Number(a) - Number(b)).map(y => (
                  <option key={y} value={y}>Year {y}</option>
                ));
              })()}
            </select>
          </div>
        </div>
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <h3 className="text-lg font-semibold text-gray-900">All Students</h3>
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
              <span className="bg-gray-100 px-2 py-1 rounded-full">{sqlMeta?.count || sqlStudents.length} students</span>
              {sqlStudents.length > 0 && (
                <>
                  <div className="flex items-center gap-2">
                    <span>Rows per page:</span>
                    <select
                      className="border border-gray-300 rounded-lg px-2 py-1 text-sm"
                      value={pageSize}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        setPageSize(value);
                        setCurrentPage(1);
                      }}
                    >
                      {[10, 25, 50, 100].map(size => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </div>
                  <span>
                    Page {safeCurrentPage} of {totalPages}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Course</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Year</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Semester</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Branch</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone Number</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sqlStudents.map(student => (
                <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-semibold text-sm mr-3">
                        {String(student.name || '?').charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-900">{student.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {student.studentId}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                      {student.course?.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      {student.year ? `Year ${student.year}` : 'Year N/A'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                      {student.semester ? `Sem ${student.semester}` : 'Sem N/A'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {student.branch || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {student.phoneNumber || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded-lg">
                      Read only
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sqlLoading && (
            <div className="py-10 text-center text-sm text-gray-500">Loading students from MySQL...</div>
          )}
          {!sqlLoading && sqlStudents.length === 0 && (
            <div className="py-10 text-center text-sm text-gray-500">
              No students match the current filters.
            </div>
          )}
        </div>
      </div>

      {/* Pagination Controls */}
      {sqlStudents.length > 0 && (
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mt-6">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <button
              className="flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={safeCurrentPage <= 1}
            >
              <ChevronLeft size={16} />
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {safeCurrentPage} of {totalPages}
            </span>
            <button
              className="flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={safeCurrentPage >= totalPages}
            >
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Sync Modal (Keep stats view similar to before mainly for feedback) */}
      {showSyncModal && (
        <div className="fixed inset-0 flex items-center justify-center p-4 z-50 overflow-y-auto" onClick={() => setShowSyncModal(false)}>
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl my-auto border border-gray-200" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white z-10 border-b border-gray-200 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Filter className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-semibold text-gray-900">Sync Students from MySQL</h3>
                    <p className="text-xs sm:text-sm text-gray-600">Apply filters to sync specific students</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowSyncModal(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0 ml-2"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            <div className="px-6 py-4 space-y-5">
              {/* Syncing Overlay State or Filter Input */}
              {syncing ? (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin flex-shrink-0"></div>
                    <div>
                      <p className="text-sm font-medium text-blue-900">Syncing students...</p>
                      <p className="text-xs text-blue-700 mt-1">Please wait while students are being synced to MongoDB.</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Filters for Sync */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Course</label>
                    <select
                      value={syncFilters.course}
                      onChange={(e) => setSyncFilters(prev => ({ ...prev, course: e.target.value, branch: '', year: '' }))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="">All Courses</option>
                      {(sqlMeta?.availableCourses || []).map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Year</label>
                    <select
                      value={syncFilters.year}
                      onChange={(e) => setSyncFilters(prev => ({ ...prev, year: e.target.value }))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="">All Years</option>
                      {(sqlMeta?.availableYears || []).sort().map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                {isSyncPreviewLoading ? (
                  <span className="flex items-center gap-2">
                    <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                    calculating...
                  </span>
                ) : (
                  <span>~{syncPreviewCount} students selected</span>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowSyncModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100"
                  disabled={syncing}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSyncToMongo}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  disabled={syncing || isSyncPreviewLoading}
                >
                  {syncing ? 'Syncing...' : 'Start Sync'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentManagement;