export function validateRequired(value) {
  return value.trim().length > 0;
}

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateCase(caseData) {
  const errors = {};

  if (!validateRequired(caseData.title)) errors.title = "Title is required.";

  if (!validateRequired(caseData.description))
    errors.description = "Description is required.";

  if (!validateRequired(caseData.investigator_name))
    errors.investigator_name = "Investigator name is required.";

  if (!validateRequired(caseData.case_id))
    errors.case_id = "Case ID is required.";

  return errors;
}
