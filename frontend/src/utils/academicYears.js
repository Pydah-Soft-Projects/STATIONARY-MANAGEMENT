/**
 * Academic year labels (e.g. 2025-26) for kit/product mapping.
 * Not tied to SQL student batch — generated from the current date.
 */

/** @param {number} startYear first calendar year of the academic year */
export const formatAcademicYearLabel = (startYear) => {
  const end = startYear + 1;
  return `${startYear}-${String(end).slice(-2)}`;
};

/**
 * Academic year start (June rollover — common in Indian colleges).
 * Jan–May → previous calendar year's AY; Jun–Dec → current calendar year's AY.
 */
export const getCurrentAcademicYearStart = (date = new Date()) => {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0 = Jan
  return month >= 5 ? year : year - 1;
};

/**
 * Past 3, current, and next 3 academic years (7 options total).
 */
export const getAcademicYearOptions = (date = new Date()) => {
  const currentStart = getCurrentAcademicYearStart(date);
  const options = [];
  for (let offset = -3; offset <= 3; offset += 1) {
    options.push(formatAcademicYearLabel(currentStart + offset));
  }
  return options;
};

export const getDefaultAcademicYear = (date = new Date()) =>
  formatAcademicYearLabel(getCurrentAcademicYearStart(date));

/**
 * Infer a student's intake academic year from study year + current calendar AY.
 * Does not use SQL batch — assumes one study year advances per academic year.
 */
export const inferStudentIntakeAcademicYear = (student, date = new Date()) => {
  const studentYear = Number(student?.year);
  if (!studentYear || studentYear < 1) return null;
  const intakeStart = getCurrentAcademicYearStart(date) - (studentYear - 1);
  return formatAcademicYearLabel(intakeStart);
};
