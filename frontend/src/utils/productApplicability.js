/**
 * Client-side product ↔ student matching (mirrors backend/utils/productApplicability.js).
 */

import { getDefaultAcademicYear } from './academicYears';

export const normalizeCourse = (value) => {
  if (!value) return '';
  if (/^[0-9a-fA-F]{24}$/.test(String(value))) return String(value);
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
};

export const normalizeAcademicYear = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).trim().toLowerCase();
};

export const getProductYears = (product) => {
  if (!product) return [];
  const fromArray = Array.isArray(product.years) ? product.years : [];
  const normalized = fromArray.map(Number).filter((y) => !Number.isNaN(y) && y > 0);
  if (normalized.length > 0) return normalized;
  const fallback = Number(product.year);
  if (!Number.isNaN(fallback) && fallback > 0) return [fallback];
  return [];
};

export const getProductAcademicYears = (product) => {
  if (!product || !Array.isArray(product.academicYears)) return [];
  return product.academicYears.map((y) => String(y).trim()).filter(Boolean);
};

export const formatAcademicYearsDisplay = (product) => {
  const years = getProductAcademicYears(product);
  if (years.length === 0) return 'All academic years';
  return years.join(', ');
};

/**
 * Rule-based applicability only (not student-assignment mode).
 */
export const productMatchesStudentRules = (product, student) => {
  if (!product || !student) return false;

  if (product.forCourseId && student.courseId) {
    if (Number(product.forCourseId) !== Number(student.courseId)) return false;
  } else if (product.forCourse) {
    if (normalizeCourse(product.forCourse) !== normalizeCourse(student.course)) return false;
  } else {
    return false;
  }

  const productYears = getProductYears(product);
  const studentYear = Number(student.year);
  if (productYears.length > 0) {
    if (!studentYear || !productYears.includes(studentYear)) return false;
  }

  const productAcademicYears = getProductAcademicYears(product);
  if (productAcademicYears.length > 0) {
    const currentSession = normalizeAcademicYear(getDefaultAcademicYear());
    const normalized = productAcademicYears.map(normalizeAcademicYear);
    if (!normalized.includes(currentSession)) return false;
  }

  const productBranchIds = Array.isArray(product.branchIds) ? product.branchIds : [];
  if (productBranchIds.length > 0 && student.branchId) {
    if (!productBranchIds.includes(student.branchId)) return false;
  } else {
    const productBranches = Array.isArray(product.branch)
      ? product.branch
      : product.branch
        ? [product.branch]
        : [];
    if (productBranches.length > 0) {
      const studentBranch = normalizeCourse(student.branch || '');
      const normalizedBranches = productBranches.map((b) =>
        normalizeCourse(typeof b === 'object' ? b.name : b)
      );
      if (!normalizedBranches.includes(studentBranch)) return false;
    }
  }

  const productSemesters = Array.isArray(product.semesters) ? product.semesters : [];
  if (productSemesters.length > 0 && student.semester) {
    if (!productSemesters.includes(Number(student.semester))) return false;
  }

  return true;
};
