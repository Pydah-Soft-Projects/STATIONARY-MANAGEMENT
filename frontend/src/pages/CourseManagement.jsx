import { useEffect, useState } from 'react';
import { School, Check, Save, AlertCircle, BookOpen, GraduationCap, X, Plus, Trash2, Edit2, MapPin, XCircle, CheckCircle } from 'lucide-react';
import { apiUrl } from '../utils/api';
import { hasFullAccess } from '../utils/permissions';

const CourseManagement = ({ currentUser }) => {
  const isSuperAdmin = currentUser?.role === 'Administrator';
  // Permission check - reusing 'courses' permission but contextually it's 'college-courses'
  const canEdit = isSuperAdmin;

  // State
  const [colleges, setColleges] = useState([]);
  const [allCourses, setAllCourses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [selectedCollegeId, setSelectedCollegeId] = useState(null);
  const [selectedCourseCodes, setSelectedCourseCodes] = useState(new Set());

  // College Management State
  const [showCollegeModal, setShowCollegeModal] = useState(false);
  const [showEditCollegeModal, setShowEditCollegeModal] = useState(false);
  const [editingCollege, setEditingCollege] = useState(null);
  const [collegeFormData, setCollegeFormData] = useState({
    name: '',
    location: '',
    description: '',
  });
  const [collegeSubmitting, setCollegeSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ type: '', message: '' });

  // Initial Data Fetch
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Fetch Colleges (MongoDB)
        const collegeRes = await fetch(apiUrl('/api/stock-transfers/colleges?activeOnly=false')); // fetch all to manage
        if (!collegeRes.ok) {
          throw new Error(`Failed to load colleges (${collegeRes.status})`);
        }
        const collegeData = await collegeRes.json();

        // Fetch All Configured Courses (MySQL)
        const courseRes = await fetch(apiUrl('/api/sql/academic/courses'));
        let courseData = [];
        if (courseRes.ok) {
          courseData = await courseRes.json();
        }

        setColleges(Array.isArray(collegeData) ? collegeData : []);
        setAllCourses(Array.isArray(courseData) ? courseData : []);

      } catch (err) {
        console.error("Failed to load data", err);
        setError(err.message || "Failed to load colleges or courses configuration.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Handle College Selection
  const handleSelectCollege = (college) => {
    setSelectedCollegeId(college._id);
    // Initialize checked state from college's existing courses
    // stored as array of strings (course codes/names)
    const existing = new Set(college.courses || []);
    setSelectedCourseCodes(existing);
    setError('');
  };

  // Handle Checkbox Toggle
  const toggleCourse = (courseName) => {
    const next = new Set(selectedCourseCodes);
    if (next.has(courseName)) {
      next.delete(courseName);
    } else {
      next.add(courseName);
    }
    setSelectedCourseCodes(next);
  };

  // Save Mapping
  const handleSave = async () => {
    if (!selectedCollegeId) return;

    try {
      setSaving(true);
      setError('');

      const college = colleges.find(c => c._id === selectedCollegeId);
      if (!college) return;

      const coursesArray = Array.from(selectedCourseCodes);

      const response = await fetch(apiUrl(`/api/stock-transfers/colleges/${selectedCollegeId}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courses: coursesArray
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update college courses');
      }

      const updatedCollege = await response.json();

      // Update local state
      setColleges(prev => prev.map(c => c._id === updatedCollege._id ? updatedCollege : c));

      // Show success message
      setStatusMsg({ type: 'success', message: 'Course mapping updated successfully!' });
      setTimeout(() => setStatusMsg({ type: '', message: '' }), 3000);

    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  // --- College Management Handlers ---

  const handleCreateCollege = async (e) => {
    e.preventDefault();

    if (!collegeFormData.name || !collegeFormData.name.trim()) {
      setStatusMsg({ type: 'error', message: 'College name is required' });
      setTimeout(() => setStatusMsg({ type: '', message: '' }), 3000);
      return;
    }

    setCollegeSubmitting(true);
    try {
      const res = await fetch(apiUrl('/api/stock-transfers/colleges'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(collegeFormData),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to create college');
      }

      const newCollege = await res.json();
      setColleges(prev => [...prev, newCollege].sort((a, b) => a.name.localeCompare(b.name)));
      setShowCollegeModal(false);
      setCollegeFormData({ name: '', location: '', description: '' });
      setStatusMsg({ type: 'success', message: 'College created successfully' });
      setTimeout(() => setStatusMsg({ type: '', message: '' }), 3000);
    } catch (error) {
      console.error('Error creating college:', error);
      setStatusMsg({ type: 'error', message: error.message || 'Failed to create college' });
      setTimeout(() => setStatusMsg({ type: '', message: '' }), 3000);
    } finally {
      setCollegeSubmitting(false);
    }
  };

  const handleEditCollege = (college, e) => {
    e.stopPropagation(); // Prevent selection
    setEditingCollege(college);
    setCollegeFormData({
      name: college.name || '',
      location: college.location || '',
      description: college.description || '',
    });
    setShowEditCollegeModal(true);
  };

  const handleUpdateCollege = async (e) => {
    e.preventDefault();

    if (!collegeFormData.name || !collegeFormData.name.trim()) {
      setStatusMsg({ type: 'error', message: 'College name is required' });
      setTimeout(() => setStatusMsg({ type: '', message: '' }), 3000);
      return;
    }

    setCollegeSubmitting(true);
    try {
      const res = await fetch(apiUrl(`/api/stock-transfers/colleges/${editingCollege._id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(collegeFormData),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to update college');
      }

      const updatedCollege = await res.json();
      setColleges(prev => prev.map(c => c._id === editingCollege._id ? updatedCollege : c).sort((a, b) => a.name.localeCompare(b.name)));
      // If updated college was selected, update selection too
      if (selectedCollegeId === editingCollege._id) {
        // Re-trigger selection logic if needed, but simple update is fine
      }
      setShowEditCollegeModal(false);
      setEditingCollege(null);
      setCollegeFormData({ name: '', location: '', description: '' });
      setStatusMsg({ type: 'success', message: 'College updated successfully' });
      setTimeout(() => setStatusMsg({ type: '', message: '' }), 3000);
    } catch (error) {
      console.error('Error updating college:', error);
      setStatusMsg({ type: 'error', message: error.message || 'Failed to update college' });
      setTimeout(() => setStatusMsg({ type: '', message: '' }), 3000);
    } finally {
      setCollegeSubmitting(false);
    }
  };

  const handleDeleteCollege = async (collegeId, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this college? This action cannot be undone if the college is not used in any transfers.')) {
      return;
    }

    try {
      const res = await fetch(apiUrl(`/api/stock-transfers/colleges/${collegeId}`), {
        method: 'DELETE',
      });

      if (res.ok) {
        setColleges(prev => prev.filter(c => c._id !== collegeId));
        if (selectedCollegeId === collegeId) setSelectedCollegeId(null);
        setStatusMsg({ type: 'success', message: 'College deleted successfully' });
        setTimeout(() => setStatusMsg({ type: '', message: '' }), 3000);
      } else {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to delete college');
      }
    } catch (error) {
      console.error('Error deleting college:', error);
      setStatusMsg({ type: 'error', message: error.message || 'Error deleting college' });
      setTimeout(() => setStatusMsg({ type: '', message: '' }), 3000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">Loading Configuration...</p>
        </div>
      </div>
    );
  }

  const selectedCollege = colleges.find(c => c._id === selectedCollegeId);

  return (
    <div className="min-h-screen bg-gray-50 p-6 flex flex-col">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <School className="text-blue-600" />
            College & Course Management
          </h1>
          <p className="text-gray-600 mt-1">Manage colleges and their course offerings.</p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowCollegeModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
          >
            <Plus size={20} />
            Add College
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-6 flex items-center gap-2 border border-red-200">
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      {statusMsg.message && (
        <div
          className={`px-4 py-3 mb-6 rounded-lg border flex items-center gap-2 ${statusMsg.type === 'success'
            ? 'bg-green-50 border-green-200 text-green-700'
            : 'bg-red-50 border-red-200 text-red-700'
            }`}
        >
          {statusMsg.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          {statusMsg.message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        {/* Left Column: Colleges List */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex-1">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 font-semibold text-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <School size={18} />
                Select College
              </div>
              {canEdit && (
                <button
                  onClick={() => setShowCollegeModal(true)}
                  className="p-1 hover:bg-gray-200 rounded-lg text-blue-600 transition-colors"
                  title="Add New College"
                >
                  <Plus size={18} />
                </button>
              )}
            </div>
            <div className="divide-y divide-gray-100 max-h-[calc(100vh-250px)] overflow-y-auto">
              {colleges.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">No colleges found</div>
              ) : (
                colleges.map(college => {
                  const isActive = college._id === selectedCollegeId;
                  const assignedCount = (college.courses || []).length;
                  return (
                    <button
                      key={college._id}
                      onClick={() => handleSelectCollege(college)}
                      className={`w-full text-left px-4 py-4 flex items-center justify-between transition-colors group
                               ${isActive ? 'bg-blue-50 border-l-4 border-blue-600' : 'hover:bg-gray-50 border-l-4 border-transparent'}
                             `}
                    >
                      <div>
                        <div className={`font-medium ${isActive ? 'text-blue-900' : 'text-gray-900'}`}>
                          {college.name}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {college.location || 'No location'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`px-2 py-1 rounded text-xs font-medium 
                                ${assignedCount > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}
                              `}>
                          {assignedCount}
                        </div>
                        {canEdit && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => handleEditCollege(college, e)}
                              className="p-1.5 hover:bg-blue-100 text-blue-600 rounded-md"
                              title="Edit College"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={(e) => handleDeleteCollege(college._id, e)}
                              className="p-1.5 hover:bg-red-100 text-red-600 rounded-md"
                              title="Delete College"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Course Selection */}
        <div className="lg:col-span-8 flex flex-col">
          {selectedCollege ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex-1 flex flex-col">
              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{selectedCollege.name}</h2>
                  <p className="text-sm text-gray-500">Manage allowed courses for this college</p>
                </div>

                {canEdit && (
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm font-medium"
                  >
                    {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={18} />}
                    Save Changes
                  </button>
                )}
              </div>

              {/* Course Grid */}
              <div className="p-6 flex-1 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {allCourses.map(course => {
                    const isSelected = selectedCourseCodes.has(course.name);
                    const courseName = course.displayName || course.name;

                    return (
                      <label
                        key={course.name}
                        className={`
                                 flex items-start gap-3 p-4 rounded-xl border transition-all cursor-pointer select-none
                                 ${isSelected
                            ? 'bg-blue-50 border-blue-200 shadow-sm ring-1 ring-blue-200'
                            : 'bg-white border-gray-200 hover:border-blue-200 hover:bg-gray-50'}
                               `}
                      >
                        <div className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors
                                   ${isSelected ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}
                                `}>
                          {isSelected && <Check size={12} className="text-white" />}
                        </div>
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={isSelected}
                          onChange={() => canEdit && toggleCourse(course.name)}
                          disabled={!canEdit}
                        />
                        <div className="flex-1">
                          <div className={`font-medium ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                            {courseName}
                          </div>
                          <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-1">
                            <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 border border-gray-200">
                              {(course.years || []).length} Years
                            </span>
                            <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 border border-gray-200">
                              {(course.branches || []).length} Branches
                            </span>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>

                {allCourses.length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    No courses found in MySQL configuration.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-500">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <School size={24} className="text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900">No College Selected</h3>
              <p className="max-w-xs mx-auto mt-2">Select a college from the left to configure its course mappings.</p>
            </div>
          )}
        </div>
      </div>


      {/* Master Course List (Read Only) */}
      <div className="mt-8 pt-8 border-t border-gray-200">
        <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <BookOpen size={20} className="text-gray-500" />
          MySQL Course Configuration
        </h2>
        <p className="text-sm text-gray-500 mb-4">Read-only view of courses configured in the application database.</p>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3">Course Code</th>
                  <th className="px-6 py-3">Display Name</th>
                  <th className="px-6 py-3">Years</th>
                  <th className="px-6 py-3">Branches</th>
                  <th className="px-6 py-3 text-right">Mapping Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {allCourses.map(course => {
                  const mappedColleges = colleges.filter(c => (c.courses || []).includes(course.name));
                  return (
                    <tr key={course.name} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3 font-medium text-gray-900">{course.name}</td>
                      <td className="px-6 py-3 text-gray-600">{course.displayName || course.name}</td>
                      <td className="px-6 py-3 text-gray-600">
                        <div className="flex flex-wrap gap-1">
                          {(course.years || []).map(y => (
                            <span key={y} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-green-50 text-green-700 border border-green-100">
                              Year {y}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-3 text-gray-600">
                        <div className="flex flex-wrap gap-1">
                          {(course.branches || []).map(b => (
                            <span key={b} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-700 border border-blue-100">
                              {b}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-3 text-right">
                        {mappedColleges.length > 0 ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                            <Check size={12} />
                            Mapped to {mappedColleges.length} {mappedColleges.length === 1 ? 'College' : 'Colleges'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200">
                            Unassigned
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {allCourses.length === 0 && (
                  <tr>
                    <td colSpan="5" className="px-6 py-8 text-center text-gray-400">
                      No global courses configured in MySQL.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add College Modal */}
      {
        showCollegeModal && (
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }} onClick={() => setShowCollegeModal(false)}>
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">Add New College</h2>
                <button onClick={() => setShowCollegeModal(false)} className="text-gray-400 hover:text-gray-600">
                  <XCircle size={24} />
                </button>
              </div>
              <form onSubmit={handleCreateCollege} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">College Name *</label>
                  <input
                    type="text"
                    required
                    value={collegeFormData.name}
                    onChange={(e) => setCollegeFormData({ ...collegeFormData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Pydah College of Engineering"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="text"
                      value={collegeFormData.location}
                      onChange={(e) => setCollegeFormData({ ...collegeFormData, location: e.target.value })}
                      className="w-full pl-9 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., Kakinada"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCollegeModal(false)}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={collegeSubmitting}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {collegeSubmitting ? 'Creating...' : 'Create College'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )
      }

      {/* Edit College Modal */}
      {
        showEditCollegeModal && (
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }} onClick={() => setShowEditCollegeModal(false)}>
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">Edit College</h2>
                <button onClick={() => setShowEditCollegeModal(false)} className="text-gray-400 hover:text-gray-600">
                  <XCircle size={24} />
                </button>
              </div>
              <form onSubmit={handleUpdateCollege} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">College Name *</label>
                  <input
                    type="text"
                    required
                    value={collegeFormData.name}
                    onChange={(e) => setCollegeFormData({ ...collegeFormData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                  <input
                    type="text"
                    value={collegeFormData.location}
                    onChange={(e) => setCollegeFormData({ ...collegeFormData, location: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowEditCollegeModal(false)}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={collegeSubmitting}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {collegeSubmitting ? 'Updating...' : 'Update College'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )
      }
    </div >
  );
};

export default CourseManagement;
