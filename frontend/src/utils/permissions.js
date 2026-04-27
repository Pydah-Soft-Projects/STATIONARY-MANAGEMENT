/**
 * Permission utility functions
 * Handles permission checking with access levels (view/full)
 */

/**
 * Parse permission string to get key and access level
 * @param {string} permission - Permission string in format "key:access" or "key" (legacy)
 * @returns {Object} { key: string, access: 'view' | 'full' }
 */
export const parsePermission = (permission) => {
  if (!permission || typeof permission !== 'string') {
    return { key: null, access: 'full' };
  }
  
  const parts = permission.split(':');
  if (parts.length === 1) {
    // Legacy format - no access level, treat as full access
    return { key: parts[0], access: 'full' };
  }
  
  return {
    key: parts[0],
    access: parts[1] === 'view' ? 'view' : 'full'
  };
};

/**
 * Get access level for a specific permission key
 * @param {Array<string>} permissions - Array of permission strings
 * @param {string} key - Permission key to check
 * @returns {'view' | 'full' | null} - Access level or null if no permission
 */
export const getAccessLevel = (permissions, key) => {
  if (!permissions || !Array.isArray(permissions)) {
    return null;
  }
  
  // Find permission that matches the key
  const permission = permissions.find(p => {
    const parsed = parsePermission(p);
    return parsed.key === key;
  });
  
  if (!permission) {
    return null;
  }
  
  return parsePermission(permission).access;
};

/**
 * Check if user has permission (any access level)
 * @param {Array<string>} permissions - Array of permission strings
 * @param {string} key - Permission key to check
 * @returns {boolean} - True if user has permission
 */
export const hasPermission = (permissions, key) => {
  return getAccessLevel(permissions, key) !== null;
};

/**
 * Check if user has view or full access
 * @param {Array<string>} permissions - Array of permission strings
 * @param {string} key - Permission key to check
 * @returns {boolean} - True if user has view or full access
 */
export const hasViewAccess = (permissions, key) => {
  const access = getAccessLevel(permissions, key);
  return access === 'view' || access === 'full';
};

/**
 * Check if user has full access (can edit/delete)
 * @param {Array<string>} permissions - Array of permission strings
 * @param {string} key - Permission key to check
 * @returns {boolean} - True if user has full access
 */
export const hasFullAccess = (permissions, key) => {
  return getAccessLevel(permissions, key) === 'full';
};

/**
 * Whether the user may create/edit student or employee counter transactions (receipts).
 * Must stay aligned with how sub-admin "Reports" permissions are stored: legacy `transactions`
 * is normalized away into granular keys like `reports-daily`, so checking only `transactions`
 * hides action buttons for sub-admins who have full access on those report keys instead.
 */
const TRANSACTION_RECORDING_KEYS = [
  'transactions',
  'reports-daily',
  'reports-monthly',
  'reports-stock',
  'student-due',
];

export const canRecordCounterTransactions = (permissions) => {
  if (!permissions || !Array.isArray(permissions)) return false;
  return TRANSACTION_RECORDING_KEYS.some((key) => hasFullAccess(permissions, key));
};

/**
 * Convert permissions array to object format for easier management
 * @param {Array<string>} permissions - Array of permission strings
 * @returns {Object} - Object with permission keys as keys and access levels as values
 */
export const permissionsToObject = (permissions) => {
  if (!permissions || !Array.isArray(permissions)) {
    return {};
  }
  
  const result = {};
  permissions.forEach(perm => {
    const { key, access } = parsePermission(perm);
    if (key) {
      result[key] = access;
    }
  });
  
  return result;
};

/**
 * Convert permissions object back to array format
 * @param {Object} permissionsObj - Object with permission keys and access levels
 * @returns {Array<string>} - Array of permission strings
 */
export const objectToPermissions = (permissionsObj) => {
  if (!permissionsObj || typeof permissionsObj !== 'object') {
    return [];
  }
  
  return Object.entries(permissionsObj)
    .filter(([key, access]) => key && (access === 'view' || access === 'full'))
    .map(([key, access]) => `${key}:${access}`);
};

/**
 * Get allowed courses for course-dashboard permission
 * @param {Array<string>} permissions - Array of permission strings
 * @returns {Array<string>} - Array of normalized course names that user has access to
 */
export const getAllowedCourses = (permissions) => {
  if (!permissions || !Array.isArray(permissions)) {
    return [];
  }
  
  const allowedCourses = [];
  permissions.forEach(perm => {
    const { key } = parsePermission(perm);
    if (key && key.startsWith('course-dashboard-')) {
      const courseName = key.replace('course-dashboard-', '');
      allowedCourses.push(courseName);
    }
  });
  
  return allowedCourses;
};

/**
 * Normalize course name for comparison (lowercase, remove special chars)
 * @param {string} courseName - Course name to normalize
 * @returns {string} - Normalized course name
 */
export const normalizeCourseName = (courseInput) => {
  if (!courseInput) return '';
  // If input looks like a MongoDB ObjectId (24 hex chars), return it as is
  if (/^[0-9a-fA-F]{24}$/.test(String(courseInput))) {
    return String(courseInput);
  }
  // Fallback to name normalization for legacy support
  return String(courseInput).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
};

/**
 * Check if user has access to a specific course in course-dashboard
 * @param {Array<string>} permissions - Array of permission strings
 * @param {string} courseName - Course name to check
 * @returns {boolean} - True if user has access to this course
 */
export const hasCourseAccess = (permissions, courseName) => {
  if (!permissions || !Array.isArray(permissions) || !courseName) {
    return false;
  }
  
  return hasViewAccess(permissions, courseKey);
};

/**
 * Get allowed departments for employee-dashboard permission
 * @param {Array<string>} permissions - Array of permission strings
 * @returns {Array<string>} - Array of department names that user has access to
 */
export const getAllowedDepartments = (permissions) => {
  if (!permissions || !Array.isArray(permissions)) {
    return [];
  }
  
  const allowedDepartments = [];
  permissions.forEach(perm => {
    const { key } = parsePermission(perm);
    if (key && key.startsWith('employee-dashboard-')) {
      const deptName = key.replace('employee-dashboard-', '');
      allowedDepartments.push(deptName);
    }
  });
  
  return allowedDepartments;
};

/**
 * Check if user has access to a specific department in employee-dashboard
 * @param {Array<string>} permissions - Array of permission strings
 * @param {string} departmentName - Department name to check
 * @returns {boolean} - True if user has access to this department
 */
export const hasDepartmentAccess = (permissions, departmentName) => {
  if (!permissions || !Array.isArray(permissions) || !departmentName) {
    return false;
  }
  
  const normalizedDept = normalizeCourseName(departmentName); // Reuse normalization
  const deptKey = `employee-dashboard-${normalizedDept}`;
  
  return hasViewAccess(permissions, deptKey);
};

