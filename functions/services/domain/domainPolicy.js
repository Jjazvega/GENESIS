const { fail } = require('../../policies/httpPolicy');

const DOMAIN_ALLOWED_ROLES = new Set(['owner', 'director', 'admin', 'manager', 'finance', 'analyst']);
const APPROVAL_REQUIRED_ROLES = new Set(['owner', 'director', 'admin', 'manager']);
const COMPANY_ID_PATTERN = /^[A-Za-z0-9_-]{3,128}$/;
const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9_-]{3,160}$/;
const SAFE_FILENAME_PATTERN = /^[^\\/:*?"<>|\u0000-\u001f]{1,180}$/;
const ALLOWED_DOCUMENT_TYPES = new Set(['pdf', 'xml', 'csv', 'txt']);
const ALLOWED_CONTENT_TYPES = new Set(['application/pdf', 'text/xml', 'application/xml', 'text/csv', 'text/plain']);
const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;
const SENSITIVE_COST_LIMIT_USD = 1000;

function normalizeString(value, maxLength = 500) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function sanitizeFileName(name = 'archivo') {
  return String(name || 'archivo')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 160) || 'archivo';
}

function normalizeMoney(value, fieldName) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < 0) fail(400, `${fieldName} debe ser un número positivo.`);
  return Number(number.toFixed(2));
}

function assertCompanyId(companyId) {
  const safeCompanyId = normalizeString(companyId, 128);
  if (!COMPANY_ID_PATTERN.test(safeCompanyId)) fail(400, 'companyId inválido.');
  return safeCompanyId;
}

function assertCriticalOperationAllowed({ role, operation = 'operación crítica', approvalRequired = false }) {
  const normalizedRole = normalizeString(role, 40).toLowerCase();
  if (!DOMAIN_ALLOWED_ROLES.has(normalizedRole)) fail(403, `Tu rol no permite ejecutar ${operation}.`);
  if (approvalRequired && !APPROVAL_REQUIRED_ROLES.has(normalizedRole)) fail(403, `Tu rol no permite aprobar ${operation}.`);
  return normalizedRole;
}

function normalizeApprovalPolicy({ amountUsd = 0, role, requestedApproval = false } = {}) {
  const normalizedAmount = normalizeMoney(amountUsd, 'amountUsd');
  const requiresApproval = requestedApproval === true || normalizedAmount >= SENSITIVE_COST_LIMIT_USD;
  return {
    amountUsd: normalizedAmount,
    requiresApproval,
    approved: requiresApproval ? APPROVAL_REQUIRED_ROLES.has(normalizeString(role, 40).toLowerCase()) : true,
    thresholdUsd: SENSITIVE_COST_LIMIT_USD,
  };
}

function validateDocumentUploadPayload({ companyId, documentId, fileName, fileType, contentType, fileSize, role }) {
  const safeCompanyId = assertCompanyId(companyId);
  const safeDocumentId = normalizeString(documentId, 160);
  if (!DOCUMENT_ID_PATTERN.test(safeDocumentId)) fail(400, 'documentId inválido.');

  const safeFileName = sanitizeFileName(fileName);
  if (!SAFE_FILENAME_PATTERN.test(safeFileName)) fail(400, 'Nombre de archivo inválido.');

  const safeFileType = normalizeString(fileType, 20).toLowerCase();
  const safeContentType = normalizeString(contentType, 80).toLowerCase();
  const normalizedSize = Number(fileSize || 0);

  if (!ALLOWED_DOCUMENT_TYPES.has(safeFileType)) fail(400, 'Tipo de documento no permitido.');
  if (!ALLOWED_CONTENT_TYPES.has(safeContentType)) fail(400, 'Content-Type de documento no permitido.');
  if (!Number.isFinite(normalizedSize) || normalizedSize <= 0 || normalizedSize > MAX_DOCUMENT_SIZE_BYTES) fail(400, 'Tamaño de documento no permitido.');

  assertCriticalOperationAllowed({ role, operation: 'flujos de documentos' });

  return {
    companyId: safeCompanyId,
    documentId: safeDocumentId,
    fileName: safeFileName,
    fileType: safeFileType,
    contentType: safeContentType,
    fileSize: normalizedSize,
  };
}

module.exports = {
  APPROVAL_REQUIRED_ROLES,
  DOMAIN_ALLOWED_ROLES,
  SENSITIVE_COST_LIMIT_USD,
  assertCompanyId,
  assertCriticalOperationAllowed,
  normalizeApprovalPolicy,
  sanitizeFileName,
  validateDocumentUploadPayload,
};
