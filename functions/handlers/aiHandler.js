const { aiHandler, getAllowedOrigins, enforceAllowedOrigin, getAiLimitConfig, estimateTokenCount, getUsageTokens, calculateCostUsd, getPrompt, getCorrelationId, authorizeAiRequest } = require('../services/ai/http/aiHandler');
const { enforceAiLimits } = require('../services/ai/limits/enforceAiLimits');
const { reconcileAiReservation, calculateActualAiUsage } = require('../services/ai/limits/reconcileAiReservation');
const { writeAiAuditLog, writeAiCostLog } = require('../services/ai/audit/writeAiAuditLog');
const { validateCompanyAccess, requireCompanyId } = require('../services/ai/authorization/validateCompanyAccess');
const { validateRequestedDocuments } = require('../services/ai/documents/validateRequestedDocuments');
const { verifyFirebaseUser } = require('../services/ai/auth/verifyFirebaseUser');
const { askLLM, callOpenAIProvider, extractOutputText } = require('../services/ai/providers/openaiProvider');

module.exports = {
  aiHandler,
  enforceAiLimits,
  estimateTokenCount,
  getAiLimitConfig,
  getAllowedOrigins,
  enforceAllowedOrigin,
  getUsageTokens,
  calculateCostUsd,
  writeAiCostLog,
  writeAiAuditLog,
  reconcileAiReservation,
  calculateActualAiUsage,
  validateCompanyAccess,
  validateRequestedDocuments,
  verifyFirebaseUser,
  askLLM,
  callOpenAIProvider,
  extractOutputText,
  getPrompt,
  getCorrelationId,
  authorizeAiRequest,
  requireCompanyId,
};
