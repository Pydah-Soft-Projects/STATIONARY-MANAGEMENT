/**
 * Academic year helpers (mirrors frontend/src/utils/academicYears.js).
 */

const formatAcademicYearLabel = (startYear) => {
  const end = startYear + 1;
  return `${startYear}-${String(end).slice(-2)}`;
};

const getCurrentAcademicYearStart = (date = new Date()) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  return month >= 5 ? year : year - 1;
};

const getDefaultAcademicYear = (date = new Date()) =>
  formatAcademicYearLabel(getCurrentAcademicYearStart(date));

const inferStudentIntakeAcademicYear = (student, date = new Date()) => {
  const studentYear = Number(student?.year);
  if (!studentYear || studentYear < 1) return null;
  const intakeStart = getCurrentAcademicYearStart(date) - (studentYear - 1);
  return formatAcademicYearLabel(intakeStart);
};

const normalizeAcademicYearLabel = (value) => {
  if (value === null || value === undefined) return '';
  const str = String(value).trim().toLowerCase();
  if (!str) return '';

  const shortMatch = str.match(/^(\d{4})-(\d{2,4})$/);
  if (shortMatch) {
    const start = shortMatch[1];
    const endPart = shortMatch[2];
    const end = endPart.length === 2 ? endPart : endPart.slice(-2);
    return `${start}-${end}`;
  }

  const yearOnly = str.match(/^(\d{4})$/);
  if (yearOnly) {
    return formatAcademicYearLabel(Number(yearOnly[1]));
  }

  return str;
};

/** Student SQL batch (joining year) — not used for kit matching. */
const getStudentAcademicYear = (student, date = new Date()) => {
  const fromSql = student?.batch || student?.academicYear;
  if (fromSql && String(fromSql).trim()) {
    return normalizeAcademicYearLabel(fromSql);
  }
  const inferred = inferStudentIntakeAcademicYear(student, date);
  return inferred ? normalizeAcademicYearLabel(inferred) : '';
};

module.exports = {
  formatAcademicYearLabel,
  getCurrentAcademicYearStart,
  getDefaultAcademicYear,
  inferStudentIntakeAcademicYear,
  normalizeAcademicYearLabel,
  getStudentAcademicYear,
};
