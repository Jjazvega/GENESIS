const admin = require('firebase-admin');
const { AI_AUDIT_LOG_COLLECTION, AI_COST_LOG_COLLECTION, COMPANY_ID_PATTERN, RELEASE_METADATA } = require('../shared/config');
const { createCorrelationId, sanitizeLogPayload, structuredLog } = require('../shared/logging');
const { calculateCostUsd, getUsageTokens, normalizeAiIntegration, toCounterNumber } = require('../shared/usage');

async function writeAiAuditLog({ eventName, status, user, authorization, correlationId, provider, model, requestMetadata = {}, errorMessage }) {
  const timestamp = new Date().toISOString();
  const safeCorrelationId = String(correlationId || createCorrelationId('audit')).replace(/[^A-Za-z0-9_-]/g, '_');
  const logId = `${timestamp.replace(/[^0-9A-Za-z]/g, '')}_${safeCorrelationId}_${String(eventName || 'ai_event').replace(/[^A-Za-z0-9_-]/g, '_')}`.slice(0, 220);
  const companyId = authorization?.companyId || (COMPANY_ID_PATTERN.test(String(requestMetadata.companyId || '')) ? String(requestMetadata.companyId) : null);
  const payload = sanitizeLogPayload({ timestamp, eventName, status, correlationId, companyId, userUid: user?.uid || null, role: authorization?.role || null, provider: provider || null, model: model || null, release: RELEASE_METADATA, requestedDocumentCount: Number(requestMetadata.requestedDocumentCount || 0), promptLength: Number(requestMetadata.promptLength || 0), estimatedTokens: requestMetadata.estimatedTokens, estimatedCostUsd: requestMetadata.estimatedCostUsd, errorMessage: errorMessage || null });
  await admin.firestore().collection(AI_AUDIT_LOG_COLLECTION).doc(logId).set(payload, { merge: true });
  structuredLog(status >= 500 ? 'ERROR' : status >= 400 ? 'WARNING' : 'INFO', 'ai_audit_logged', { correlationId, eventName, status, companyId, firebaseUid: user?.uid || null });
  return payload;
}
async function writeAiCostLog({ user, authorization, correlationId, integration = 'openai', provider = 'openai', model, usage, estimatedTokens, estimatedCostUsd }) {
  const timestamp = new Date().toISOString();
  const usageTokens = getUsageTokens(usage);
  const tokens = usageTokens.totalTokens || toCounterNumber(estimatedTokens);
  const costUsd = usageTokens.totalTokens ? calculateCostUsd(usageTokens.totalTokens) : Number(toCounterNumber(estimatedCostUsd).toFixed(8));
  const logId = `${timestamp.replace(/[^0-9A-Za-z]/g, '')}_${String(correlationId || createCorrelationId('cost')).replace(/[^A-Za-z0-9_-]/g, '_')}`.slice(0, 220);
  await admin.firestore().collection(AI_COST_LOG_COLLECTION).doc(logId).set({ timestamp, tokens, inputTokens: usageTokens.inputTokens, outputTokens: usageTokens.outputTokens, model, costo: costUsd, costUsd, provider, integration: normalizeAiIntegration(integration), correlationId, companyId: authorization.companyId, userUid: user.uid || 'unknown' }, { merge: true });
  structuredLog('INFO', 'ai_cost_logged', { correlationId, companyId: authorization.companyId, firebaseUid: user.uid || 'unknown', integration: normalizeAiIntegration(integration), provider, model, tokens, costUsd });
  return { timestamp, tokens, model, costo: costUsd, costUsd };
}
module.exports = { writeAiAuditLog, writeAiCostLog };
