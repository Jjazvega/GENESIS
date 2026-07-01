const { aiHandler, getAllowedOrigins, enforceAllowedOrigin, getAiLimitConfig, estimateTokenCount, getUsageTokens, calculateCostUsd, getPrompt, getCorrelationId, authorizeAiRequest } = require('../services/ai/http/aiHandler');
const { enforceAiLimits } = require('../services/ai/limits/enforceAiLimits');
const { enforceAiRiskControls, getAiRiskConfig, normalizePromptFingerprint } = require('../services/ai/limits/enforceAiRiskControls');
const { reconcileAiReservation, calculateActualAiUsage } = require('../services/ai/limits/reconcileAiReservation');
const { writeAiAuditLog, writeAiCostLog } = require('../services/ai/audit/writeAiAuditLog');
const { validateCompanyAccess, requireCompanyId } = require('../services/ai/authorization/validateCompanyAccess');
const { validateRequestedDocuments } = require('../services/ai/documents/validateRequestedDocuments');
const { verifyFirebaseUser } = require('../services/ai/auth/verifyFirebaseUser');
const { askLLM, callOpenAIProvider, extractOutputText } = require('../services/ai/providers/openaiProvider');
const { composeAiPrompt, normalizeDocumentContext } = require('../services/ai/context/composeAiContext');

module.exports = {
  aiHandler,
  enforceAiLimits,
  enforceAiRiskControls,
  getAiRiskConfig,
  normalizePromptFingerprint,
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
  composeAiPrompt,
  normalizeDocumentContext,
};
