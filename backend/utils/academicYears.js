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

module.exports = {
  formatAcademicYearLabel,
  getCurrentAcademicYearStart,
  getDefaultAcademicYear,
  inferStudentIntakeAcademicYear,
};
