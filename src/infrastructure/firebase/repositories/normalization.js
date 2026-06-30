// @ts-check

export const LEGACY_FIELD_MAP = Object.freeze({
  company_id: 'companyId',
  client_id: 'clientId',
  project_id: 'projectId',
  employee_id: 'employeeId',
  owner_uid: 'ownerUid',
  user_email: 'userEmail',
  user_name: 'userName',
  full_name: 'fullName',
  created_date: 'createdAt',
  updated_date: 'updatedAt',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
  start_date: 'startDate',
  end_date: 'endDate',
  due_date: 'dueDate',
  doc_type: 'docType',
  doc_date: 'docDate',
  content_type: 'contentType',
  size_bytes: 'fileSize',
  fiscal_regime: 'fiscalRegime',
  payment_date: 'paymentDate',
  payment_method: 'paymentMethod',
  employee_name: 'employeeName',
  assigned_to: 'assignedTo',
  base_salary: 'baseSalary',
  net_pay: 'netPay',
  billing_cycle: 'billingCycle',
  expected_close: 'expectedClose',
  last_contact: 'lastContact',
  next_action: 'nextAction',
  next_action_date: 'nextActionDate',
  estimated_hours: 'estimatedHours',
  estimated_cost: 'estimatedCost',
  error_message: 'errorMessage',
  review_date: 'reviewDate',
  overall_rating: 'overallRating',
  imss_number: 'imssNumber',
  hire_date: 'hireDate',
  employment_type: 'employmentType',
  bank_account: 'bankAccount',
  is_recurring: 'isRecurring',
});

export function normalizeKey(key) {
  return LEGACY_FIELD_MAP[key] || key;
}

export function normalizeData(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;

  const output = {};
  for (const [rawKey, rawValue] of Object.entries(input)) {
    const key = normalizeKey(rawKey);
    const value = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
      ? normalizeData(rawValue)
      : rawValue;
    output[key] = value;
  }

  delete output.fileUrl;
  delete output.downloadUrl;
  delete output.downloadURL;
  delete output.file_url;
  delete output.publicUrl;

  return output;
}

export function normalizeFilters(filters = {}) {
  return normalizeData(filters);
}
