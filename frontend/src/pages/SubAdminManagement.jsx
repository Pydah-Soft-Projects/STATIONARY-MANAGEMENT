import React, { useState, useEffect } from 'react';
import { Users, Plus, Edit, Trash2, X, Eye, Edit2, AlertCircle } from 'lucide-react';
import { apiUrl } from '../utils/api';
import { parsePermission, permissionsToObject, objectToPermissions } from '../utils/permissions';

// Sidebar menu items for permissions
const SIDEBAR_ITEMS = [
  { path: '/', label: 'Dashboard', key: 'dashboard' },
  { path: '/students-dashboard', label: 'Student Dashboard', key: 'course-dashboard' },
  { path: '/employees-dashboard', label: 'Employee Dashboard', key: 'employee-dashboard' },
  {
    path: '/manage-stock',
    label: 'Manage Stock',
    key: 'manage-stock',
    children: [
      { label: 'Add Product', key: 'stock-products' },
      { label: 'Add Stock', key: 'stock-add' },
      { label: 'Stock Entries', key: 'stock-entries' },
      { label: 'Vendor Management', key: 'stock-vendors' },
    ],
  },
  { path: '/stock-transfers', label: 'Stock Transfers', key: 'stock-transfers' },
  {
    path: '/transactions',
    label: 'Reports',
    key: 'transactions',
    children: [
      { label: 'Daily Breakdown', key: 'reports-daily' },
      { label: 'Monthly Summary', key: 'reports-monthly' },
      { label: 'Academic Stock Report', key: 'reports-stock' },
    ],
  },
  { path: '/profit-report', label: 'Profit Report', key: 'profit-report' },
  { path: '/student-due', label: 'Student Due', key: 'student-due' },
  {
    path: '/audit-logs',
    label: 'Audit Logs',
    key: 'audit-logs',
    children: [
      { label: 'Audit Log Entry', key: 'audit-log-entry' },
      { label: 'Audit Approval', key: 'audit-log-approval' },
    ],
  },
  { path: '/settings', label: 'Settings', key: 'settings' },
];

const PERMISSION_LABELS = SIDEBAR_ITEMS.reduce((acc, item) => {
  if (item.children) {
    item.children.forEach(child => {
      acc[child.key] = child.label;
    });
  } else {
    acc[item.key] = item.label;
  }
  return acc;
}, {});

const normalizePermissions = (perms = []) => {
  const list = Array.isArray(perms) ? perms.slice() : [];
  const hasLegacyAudit = list.some(p => {
    const parsed = parsePermission(p);
    return parsed.key === 'audit-logs';
  });
  const hasLegacyManageStock = list.some(p => {
    const parsed = parsePermission(p);
    return parsed.key === 'manage-stock';
  });

  // Convert to object format for easier manipulation
  const permObj = permissionsToObject(list);

  // Handle legacy audit-logs permission
  if (hasLegacyAudit && !permObj['audit-log-entry'] && !permObj['audit-log-approval']) {
    permObj['audit-log-entry'] = permObj['audit-logs'] || 'full';
    permObj['audit-log-approval'] = permObj['audit-logs'] || 'full';
  }
  delete permObj['audit-logs'];

  // Handle legacy transactions permission
  if (permObj['transactions']) {
    const transAccess = permObj['transactions'] || 'full';
    if (!permObj['reports-daily']) permObj['reports-daily'] = transAccess;
    if (!permObj['reports-monthly']) permObj['reports-monthly'] = transAccess;
    if (!permObj['reports-stock']) permObj['reports-stock'] = transAccess;
    if (!permObj['profit-report']) permObj['profit-report'] = transAccess;
    if (!permObj['student-due']) permObj['student-due'] = transAccess;
  }
  // No need to delete transactions as it's still used as a fallback/group key

  // Handle legacy manage-stock permission
  if (hasLegacyManageStock) {
    const stockAccess = permObj['manage-stock'] || 'full';
    // Only set if individual permissions don't exist
    if (!permObj['stock-products']) permObj['stock-products'] = stockAccess;
    if (!permObj['stock-add']) permObj['stock-add'] = stockAccess;
    if (!permObj['stock-entries']) permObj['stock-entries'] = stockAccess;
    if (!permObj['stock-vendors']) permObj['stock-vendors'] = stockAccess;
  }
  delete permObj['manage-stock'];

  // Convert back to array
  return objectToPermissions(permObj);
};

// A simple modal component for creating/editing sub-admins
const SubAdminModal = ({ isOpen, onClose, onSave, subAdmin }) => {
  const [name, setName] = useState(subAdmin?.name || '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(subAdmin?.role || 'Editor');
  const [permissions, setPermissions] = useState({}); // Object format: { 'key': 'view' | 'full' }
  const [courses, setCourses] = useState([]);
  const [colleges, setColleges] = useState([]);
  const [assignedCollege, setAssignedCollege] = useState(subAdmin?.assignedCollege?._id || subAdmin?.assignedCollege || subAdmin?.assignedBranch?._id || subAdmin?.assignedBranch || '');
  const [coursePermissions, setCoursePermissions] = useState({}); // Object format: { 'course-name': 'view' | 'full' }

  // Fetch courses and branches when modal opens
  useEffect(() => {
    if (isOpen) {
      const fetchData = async () => {
        // Fetch Courses
        try {
          let res = await fetch(apiUrl('/api/academic-config/courses'));
          if (res.ok) {
            const data = await res.json();
            setCourses(Array.isArray(data) ? data : []);
          } else if (res.status === 404) {
            res = await fetch(apiUrl('/api/config/academic'));
            if (res.ok) {
              const data = await res.json();
              setCourses(Array.isArray(data?.courses) ? data.courses : []);
            }
          }
        } catch (e) {
          console.error('Failed to fetch courses:', e);
        }

        // Fetch Colleges (Hardware/Inventory Locations)
        try {
          const res = await fetch(apiUrl('/api/stock-transfers/colleges'));
          if (res.ok) {
            const data = await res.json();
            setColleges(Array.isArray(data) ? data : []);
          }
        } catch (e) {
          console.error('Failed to fetch colleges:', e);
        }
      };
      fetchData();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setName(subAdmin?.name || '');
      setRole(subAdmin?.role || 'Editor');
      setPassword(''); // Always clear password field when modal opens
      const sourcePerms = Array.isArray(subAdmin?.permissions) ? subAdmin.permissions : [];
      const normalized = normalizePermissions(sourcePerms);
      // Convert to object format for easier state management
      const permsObj = permissionsToObject(normalized);
      setPermissions(permsObj);

      // Extract course-specific permissions
      const coursePerms = {};
      Object.keys(permsObj).forEach(key => {
        if (key.startsWith('course-dashboard-')) {
          const courseName = key.replace('course-dashboard-', '');
          coursePerms[courseName] = permsObj[key];
        }
      });
      setCoursePermissions(coursePerms);

      // Set assigned branch
      setAssignedCollege(subAdmin?.assignedCollege?._id || subAdmin?.assignedCollege || subAdmin?.assignedBranch?._id || subAdmin?.assignedBranch || '');
    }
  }, [isOpen, subAdmin]);

  if (!isOpen) return null;

  const normalizeCourseName = (courseName) => {
    if (!courseName) return '';
    return String(courseName).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  };

  const handlePermissionAccessChange = (key, access) => {
    setPermissions(prev => {
      const newPerms = { ...prev };
      if (access === null) {
        // Remove permission
        delete newPerms[key];
        // If removing course-dashboard, also remove all course-specific permissions
        if (key === 'course-dashboard') {
          Object.keys(newPerms).forEach(permKey => {
            if (permKey.startsWith('course-dashboard-')) {
              delete newPerms[permKey];
            }
          });
          setCoursePermissions({});
        }
      } else {
        // Set permission with access level
        newPerms[key] = access;
      }
      return newPerms;
    });
  };

  const handleCoursePermissionChange = (courseIdentifier, access) => {
    // courseIdentifier can be specific ID (new way) or normalized name (legacy)
    const normalizedKey = normalizeCourseName(courseIdentifier);
    const coursePermissionKey = `course-dashboard-${normalizedKey}`;

    setCoursePermissions(prev => {
      const newCoursePerms = { ...prev };
      if (access === null) {
        delete newCoursePerms[courseIdentifier]; // Use the identifier as the key for local state
      } else {
        newCoursePerms[courseIdentifier] = access;
      }
      return newCoursePerms;
    });

    setPermissions(prev => {
      const newPerms = { ...prev };
      if (access === null) {
        delete newPerms[coursePermissionKey];
      } else {
        newPerms[coursePermissionKey] = access;
      }
      return newPerms;
    });
  };

  const getPermissionAccess = (key) => {
    return permissions[key] || null;
  };

  const getCoursePermissionAccess = (courseName) => {
    return coursePermissions[courseName] || null;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!subAdmin && !password) {
      alert('Password is required for new sub-admins.');
      return;
    }
    // Set default role for new sub-admins and only include password if it has been set
    const submissionRole = subAdmin ? role : 'Editor';
    // Convert permissions object back to array format
    const cleanedPermissions = objectToPermissions(permissions);
    onSave({
      ...subAdmin,
      name,
      role: submissionRole,
      permissions: cleanedPermissions,
      assignedCollege: assignedCollege || null,
      assignedBranch: assignedCollege || null, // Send both for compatibility
      ...(password && { password }),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 flex justify-center items-center z-50" style={{ backgroundColor: 'rgba(0, 0, 0, 0.1)' }}>
      <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-4xl mx-4 border border-gray-200 transform transition-all duration-300 scale-100 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">{subAdmin ? 'Edit' : 'Create'} Sub-Admin</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors duration-200">
            <X size={24} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="mb-5">
            <label htmlFor="name" className="block text-sm font-semibold text-gray-700 mb-2">Name</label>
            <input
              id="name"
              type="text"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter sub-admin name"
              required
            />
          </div>
          <div className="mb-6">
            <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2">Password</label>
            <input
              id="password"
              type="password"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={subAdmin ? "Enter new password to change" : "Enter password"}
              required={!subAdmin} // Password is required only for new sub-admins
            />

          </div>

          <div className="mb-6">
            <label htmlFor="assignedCollege" className="block text-sm font-semibold text-gray-700 mb-2">Assigned College (Optional)</label>
            <p className="text-xs text-gray-500 mb-2">Assigning a college links stock deductions to that specific location.</p>
            <div className="relative">
              <select
                id="assignedCollege"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 appearance-none bg-white"
                value={assignedCollege}
                onChange={(e) => setAssignedCollege(e.target.value)}
              >
                <option value="">-- No College Assigned (Global/Admin) --</option>
                {colleges.map((college) => (
                  <option key={college._id} value={college._id}>
                    {college.name} {college.location ? `(${college.location})` : ''}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-500">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
              </div>
            </div>
          </div>

          {/* Permissions Section */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Permissions</label>
                <p className="text-xs text-gray-500">Select access level for each feature (View = Read-only, Full = Read + Edit + Delete)</p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span className="text-gray-600">View Access</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="text-gray-600">Full Access</span>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
              <div className="max-h-[500px] overflow-y-auto">
                <table className="w-full">
                  <thead className="bg-gray-100 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Feature</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider w-32">No Access</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider w-32">View Only</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider w-32">Full Access</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {SIDEBAR_ITEMS.map((item) => {
                      if (item.children) {
                        // Render parent row with expandable children
                        const anyChildSelected = item.children.some((child) => getPermissionAccess(child.key) !== null);
                        return (
                          <React.Fragment key={item.key}>
                            <tr className="bg-indigo-50/30 hover:bg-indigo-50/50">
                              <td colSpan="4" className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-gray-800">{item.label}</span>
                                  {!anyChildSelected && (
                                    <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">No access</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                            {item.children.map((child) => {
                              const access = getPermissionAccess(child.key);
                              return (
                                <tr key={child.key} className="hover:bg-gray-50 transition-colors">
                                  <td className="px-4 py-3 pl-8">
                                    <div className="flex items-center gap-2">
                                      <div className="w-1.5 h-1.5 rounded-full bg-gray-400"></div>
                                      <span className="text-sm text-gray-700">{child.label}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <button
                                      type="button"
                                      onClick={() => handlePermissionAccessChange(child.key, null)}
                                      className={`w-10 h-10 rounded-full border-2 transition-all ${!access
                                        ? 'bg-gray-200 border-gray-400 shadow-inner'
                                        : 'bg-white border-gray-300 hover:border-gray-400'
                                        }`}
                                      title="No Access"
                                    />
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <button
                                      type="button"
                                      onClick={() => handlePermissionAccessChange(child.key, access === 'view' ? null : 'view')}
                                      className={`w-10 h-10 rounded-full border-2 transition-all flex items-center justify-center ${access === 'view'
                                        ? 'bg-blue-500 border-blue-600 shadow-md'
                                        : 'bg-white border-gray-300 hover:border-blue-200 hover:bg-blue-50'
                                        }`}
                                      title="View Access"
                                    >
                                      {access === 'view' && <Eye size={16} className="text-white" />}
                                    </button>
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <button
                                      type="button"
                                      onClick={() => handlePermissionAccessChange(child.key, access === 'full' ? null : 'full')}
                                      className={`w-10 h-10 rounded-full border-2 transition-all flex items-center justify-center ${access === 'full'
                                        ? 'bg-green-500 border-green-600 shadow-md'
                                        : 'bg-white border-gray-300 hover:border-green-200 hover:bg-green-50'
                                        }`}
                                      title="Full Access"
                                    >
                                      {access === 'full' && <Edit2 size={16} className="text-white" />}
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        );
                      }

                      // Regular permission item
                      const access = getPermissionAccess(item.key);
                      const isCourseDashboard = item.key === 'course-dashboard';
                      const hasCourseDashboardAccess = access === 'view' || access === 'full';

                      return (
                        <React.Fragment key={item.key}>
                          <tr className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                              <span className="text-sm font-medium text-gray-700">{item.label}</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                type="button"
                                onClick={() => handlePermissionAccessChange(item.key, null)}
                                className={`w-10 h-10 rounded-full border-2 transition-all ${!access
                                  ? 'bg-gray-200 border-gray-400 shadow-inner'
                                  : 'bg-white border-gray-300 hover:border-gray-400'
                                  }`}
                                title="No Access"
                              />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                type="button"
                                onClick={() => handlePermissionAccessChange(item.key, access === 'view' ? null : 'view')}
                                className={`w-10 h-10 rounded-full border-2 transition-all flex items-center justify-center ${access === 'view'
                                  ? 'bg-blue-500 border-blue-600 shadow-md'
                                  : 'bg-white border-gray-300 hover:border-blue-200 hover:bg-blue-50'
                                  }`}
                                title="View Access"
                              >
                                {access === 'view' && <Eye size={16} className="text-white" />}
                              </button>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                type="button"
                                onClick={() => handlePermissionAccessChange(item.key, access === 'full' ? null : 'full')}
                                className={`w-10 h-10 rounded-full border-2 transition-all flex items-center justify-center ${access === 'full'
                                  ? 'bg-green-500 border-green-600 shadow-md'
                                  : 'bg-white border-gray-300 hover:border-green-200 hover:bg-green-50'
                                  }`}
                                title="Full Access"
                              >
                                {access === 'full' && <Edit2 size={16} className="text-white" />}
                              </button>
                            </td>
                          </tr>
                          {/* Course Selection for Student Dashboard */}
                          {isCourseDashboard && hasCourseDashboardAccess && courses.length > 0 && (
                            <tr>
                              <td colSpan="4" className="px-4 py-4 bg-blue-50/30">
                                <div className="space-y-3">
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="text-xs font-semibold text-gray-700">Select Courses:</span>
                                    <span className="text-xs text-gray-500">({Object.keys(coursePermissions).length} selected)</span>
                                  </div>
                                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                    {courses.map((course) => {
                                      const courseName = course.name || course;
                                      const courseId = course.id || course.name; // Fallback to name if ID missing (legacy)
                                      const courseDisplayName = course.displayName || courseName;

                                      // Check if we have permission via ID (preferred) or Name (legacy)
                                      // This covers both migration cases
                                      const accessById = getCoursePermissionAccess(course.id);
                                      const accessByName = getCoursePermissionAccess(courseName); // normalized inside
                                      // also check raw normalized key in permissions
                                      const normName = normalizeCourseName(courseName);
                                      const normId = normalizeCourseName(course.id);

                                      // Determine effective access
                                      const courseAccess = accessById || accessByName ||
                                        (permissions[`course-dashboard-${normId}`]) ||
                                        (permissions[`course-dashboard-${normName}`]) || null;

                                      return (
                                        <div key={courseId} className="flex items-center gap-2 p-2 bg-white rounded-lg border border-gray-200 hover:border-blue-300 transition-colors">
                                          <input
                                            type="checkbox"
                                            checked={courseAccess !== null}
                                            onChange={(e) => {
                                              // ALWAYS save using ID if available to fix the rename issue
                                              const targetIdentifier = course.id || courseName;
                                              if (e.target.checked) {
                                                handleCoursePermissionChange(targetIdentifier, access);
                                              } else {
                                                handleCoursePermissionChange(targetIdentifier, null);
                                                // Also try to remove legacy name permission if it exists to clean up
                                                if (course.id && courseName) {
                                                  handleCoursePermissionChange(courseName, null);
                                                }
                                              }
                                            }}
                                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                          />
                                          <label className="text-sm text-gray-700 flex-1 cursor-pointer" onClick={() => {
                                            const targetIdentifier = course.id || courseName;
                                            if (courseAccess === null) {
                                              handleCoursePermissionChange(targetIdentifier, access);
                                            } else {
                                              handleCoursePermissionChange(targetIdentifier, null);
                                              if (course.id && courseName) {
                                                handleCoursePermissionChange(courseName, null);
                                              }
                                            }
                                          }}>
                                            {courseDisplayName}
                                          </label>
                                          {courseAccess !== null && (
                                            <div className="flex items-center gap-1">
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  const targetIdentifier = course.id || courseName;
                                                  handleCoursePermissionChange(targetIdentifier, courseAccess === 'view' ? 'full' : 'view');
                                                }}
                                                className={`px-2 py-1 text-xs rounded transition-colors ${courseAccess === 'view'
                                                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                                  : 'bg-green-100 text-green-700 hover:bg-green-200'
                                                  }`}
                                                title={courseAccess === 'view' ? 'View Only - Click for Full Access' : 'Full Access - Click for View Only'}
                                              >
                                                {courseAccess === 'view' ? 'View' : 'Full'}
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                  {Object.keys(coursePermissions).length === 0 && (
                                    <p className="text-xs text-amber-600 flex items-center gap-1 mt-2">
                                      <AlertCircle size={12} />
                                      No courses selected. Sub-admin will not have access to any course dashboard.
                                    </p>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {Object.keys(permissions).length === 0 && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs text-amber-700 flex items-center gap-2">
                  <AlertCircle size={14} />
                  No permissions selected. Sub-admin will have limited access.
                </p>
              </div>
            )}

            {Object.keys(permissions).length > 0 && (
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-700">
                  <strong>{Object.keys(permissions).length}</strong> permission{Object.keys(permissions).length !== 1 ? 's' : ''} selected
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-4 mt-8">
            <button type="button" onClick={onClose} className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors duration-200">
              Cancel
            </button>
            <button type="submit" className="px-6 py-3 bg-blue-700 text-white rounded-xl font-medium hover:from-indigo-600 hover:to-indigo-700 transform hover:scale-105 transition-all duration-200 shadow-lg">
              {subAdmin ? 'Update Sub-Admin' : 'Create Sub-Admin'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const SubAdminManagement = ({ currentUser }) => {
  const [subAdmins, setSubAdmins] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSubAdmin, setEditingSubAdmin] = useState(null);

  // Check if current user is super admin
  const isSuperAdmin = currentUser?.role === 'Administrator';

  useEffect(() => {
    const fetchSubAdmins = async () => {
      try {
        const response = await fetch(apiUrl('/api/subadmins'));
        if (!response.ok) {
          throw new Error(`Failed to load: ${response.status} ${response.statusText}`);
        }
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error('Unexpected response from server');
        }
        const data = await response.json();
        const list = Array.isArray(data) ? data : [];
        setSubAdmins(
          list.map(sa => ({
            ...sa,
            id: sa._id,
            permissions: normalizePermissions(sa.permissions),
          }))
        );
      } catch (error) {
        console.error("Failed to fetch sub-admins:", error);
      }
    };
    fetchSubAdmins();
  }, []);

  const handleCreate = () => {
    setEditingSubAdmin(null);
    setIsModalOpen(true);
  };

  const handleEdit = (subAdmin) => {
    setEditingSubAdmin(subAdmin);
    setIsModalOpen(true);
  };

  const handleDelete = (id) => {
    if (!window.confirm('Are you sure you want to delete this sub-admin?')) return;

    fetch(apiUrl(`/api/subadmins/${id}`), { method: 'DELETE' })
      .then(res => {
        if (!res.ok) throw new Error('Failed to delete');
        setSubAdmins(prev => prev.filter(sa => sa.id !== id));
      })
      .catch(err => alert(`Error: ${err.message}`));
  };

  const handleSave = async (subAdminData) => {
    const isUpdating = !!subAdminData.id;
    const url = isUpdating ? apiUrl(`/api/subadmins/${subAdminData.id}`) : apiUrl('/api/subadmins');
    const method = isUpdating ? 'PUT' : 'POST';

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subAdminData),
      });

      if (!response.ok) {
        // Try to parse error JSON, but fallback to status text if it fails
        const errorData = await response.json().catch(() => ({
          message: `Request failed with status: ${response.status} ${response.statusText}`
        }));
        throw new Error(errorData.message || 'Save operation failed');
      }

      const savedSubAdmin = await response.json();
      const formattedAdmin = {
        ...savedSubAdmin,
        id: savedSubAdmin._id,
        permissions: normalizePermissions(savedSubAdmin.permissions),
      };

      setSubAdmins(prev => isUpdating
        ? prev.map(sa => sa.id === formattedAdmin.id ? formattedAdmin : sa)
        : [...prev, formattedAdmin]);
      setIsModalOpen(false);
    } catch (error) {
      alert(`Error: ${error.message}`);
    }
  };

  return (
    <>
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-600 rounded-xl shadow-lg">
                <Users size={32} className="text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  Sub-Admin Management
                </h1>
                <p className="text-gray-600 mt-1">Manage your team of sub-administrators</p>
              </div>
            </div>
          </div>

          {subAdmins.length === 0 ? (
            <div className="bg-blue-600 rounded-2xl shadow-lg p-12 text-center">
              <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-6 backdrop-blur-sm">
                <Users size={48} className="text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">No Sub-Admins Yet</h3>
              <p className="text-indigo-100 mb-6">Get started by creating your first sub-admin to help manage the system.</p>
              {isSuperAdmin && (
                <button onClick={handleCreate} className="bg-white text-blue-600 px-8 py-4 rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 inline-flex items-center gap-2">
                  <Plus size={20} />
                  Create Your First Sub-Admin
                </button>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-200">
              <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gradient-to-r from-gray-50 to-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">
                  All Sub-Admins ({subAdmins.length})
                </h2>
                {isSuperAdmin && (
                  <button onClick={handleCreate} className="bg-blue-600 text-white px-6 py-2 rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 inline-flex items-center gap-2">
                    <Plus size={18} />
                    Create Sub-Admin
                  </button>
                )}
              </div>
              <div className="divide-y divide-gray-100">
                {subAdmins.map((subAdmin, index) => (
                  <div key={subAdmin.id} className={`p-6 hover:bg-indigo-50/50 transition-colors duration-200 ${index === 0 ? 'border-t-0' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-md">
                          <span className="text-white font-bold text-lg">
                            {subAdmin.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">{subAdmin.name}</h3>
                          <div className="text-sm text-gray-500 flex flex-col gap-0.5">
                            <span>{subAdmin.role || 'Sub-Administrator'}</span>
                            {subAdmin.assignedBranch && (
                              <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full w-fit">
                                📍 {subAdmin.assignedBranch.name || 'Branch Assigned'}
                              </span>
                            )}
                          </div>
                          {Array.isArray(subAdmin.permissions) && subAdmin.permissions.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {subAdmin.permissions.slice(0, 3).map((perm) => {
                                const parsed = parsePermission(perm);
                                const label = PERMISSION_LABELS[parsed.key];
                                if (!label) return null;
                                return (
                                  <span
                                    key={perm}
                                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${parsed.access === 'full'
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-blue-100 text-blue-700'
                                      }`}
                                    title={parsed.access === 'full' ? 'Full Access' : 'View Only'}
                                  >
                                    {label} {parsed.access === 'view' && '(View)'}
                                  </span>
                                );
                              })}
                              {subAdmin.permissions.length > 3 && (
                                <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                                  +{subAdmin.permissions.length - 3} more
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEdit(subAdmin)}
                          className="p-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-600 hover:text-indigo-700 rounded-lg transition-all duration-200 transform hover:scale-105"
                          title="Edit Sub-Admin"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(subAdmin.id)}
                          className="p-2 bg-red-100 hover:bg-red-200 text-red-600 hover:text-red-700 rounded-lg transition-all duration-200 transform hover:scale-105"
                          title="Delete Sub-Admin"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <SubAdminModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSave} subAdmin={editingSubAdmin} />
    </>
  );
};

export default SubAdminManagement;