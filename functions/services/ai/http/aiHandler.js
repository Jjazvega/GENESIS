require('../../../contracts/aiContracts');
const { applyCors, enforceAllowedOrigin, getAllowedOrigins } = require('../../../policies/httpPolicy');
const { verifyFirebaseUser } = require('../auth/verifyFirebaseUser');
const { requireCompanyId, validateCompanyAccess } = require('../authorization/validateCompanyAccess');
const { getRequestedDocuments, validateRequestedDocuments } = require('../documents/validateRequestedDocuments');
const { enforceAiLimits } = require('../limits/enforceAiLimits');
const { reconcileAiReservation } = require('../limits/reconcileAiReservation');
const { writeAiAuditLog, writeAiCostLog } = require('../audit/writeAiAuditLog');
const { askLLM } = require('../providers/openaiProvider');
const { composeAiPrompt } = require('../context/composeAiContext');
const { MAX_CORRELATION_ID_LENGTH, MAX_PROMPT_LENGTH, RELEASE_METADATA, getAiLimitConfig, getLlmModel, getLlmProvider } = require('../shared/config');
const { createCorrelationId, structuredLog } = require('../shared/logging');
const { calculateCostUsd, estimateTokenCount, getUsageTokens } = require('../shared/usage');

function getCorrelationId(req) {
  const candidate = String(req.get('x-correlation-id') || req.body?.correlationId || '').trim();
  if (!candidate) return createCorrelationId('ai');
  return candidate.replace(/[^a-zA-Z0-9._:-]/g, '_').slice(0, MAX_CORRELATION_ID_LENGTH) || createCorrelationId('ai');
}
function classifyAiHttpError(error, status) {
  if (error?.code && error?.type) return { code: error.code, type: error.type };
  if (status === 403) return { code: 'AI_PERMISSION_DENIED', type: 'permission' };
  if (status === 401) return { code: 'AUTH_REQUIRED', type: 'auth' };
  if (status === 429) return { code: 'AI_QUOTA_EXCEEDED', type: 'quota' };
  if (status >= 400 && status < 500) return { code: 'AI_BAD_REQUEST', type: 'validation' };
  return { code: 'AI_INTERNAL_ERROR', type: 'server' };
}

function getPrompt(body = {}) {
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) { const error = new Error('El campo prompt es obligatorio.'); error.status = 400; throw error; }
  if (prompt.length > MAX_PROMPT_LENGTH) { const error = new Error(`El prompt excede el límite de ${MAX_PROMPT_LENGTH} caracteres.`); error.status = 413; throw error; }
  return prompt;
}
async function authorizeAiRequest({ user, body }) {
  const companyId = requireCompanyId(body);
  const access = await validateCompanyAccess({ user, companyId });
  const requested = getRequestedDocuments(body);
  const documents = await validateRequestedDocuments({ companyId, ...requested });
  return { companyId, ...access, requested, documents };
}

async function aiHandler(req, res) {
  const startedAt = Date.now();
  const correlationId = getCorrelationId(req);
  applyCors(req, res);
  res.set('X-Correlation-Id', correlationId);
  res.set('X-App-Version', RELEASE_METADATA.appVersion);
  res.set('X-Build-Id', RELEASE_METADATA.buildId);
  res.set('X-Git-Sha', RELEASE_METADATA.gitSha);
  res.set('X-Deploy-Env', RELEASE_METADATA.deployEnv);

  if (req.method === 'OPTIONS') {
    try { enforceAllowedOrigin(req); res.status(204).send(''); }
    catch (error) { const status = Number(error.status) || 403; structuredLog('WARNING', 'ai_cors_preflight_rejected', { correlationId, origin: req.get('origin') || 'none', status }); res.status(status).json({ error: error.message || 'CORS no permitido.', correlationId, release: RELEASE_METADATA, code: 'CORS_FORBIDDEN', type: 'cors' }); }
    return;
  }
  if (req.method !== 'POST') { structuredLog('WARNING', 'ai_request_rejected', { correlationId, method: req.method, status: 405 }); res.status(405).json({ error: 'Método no permitido. Usa POST.', correlationId, release: RELEASE_METADATA }); return; }

  let authorization = null; let user = null; let reservation = null; let providerName = null; let modelName = null;
  try {
    enforceAllowedOrigin(req);
    user = await verifyFirebaseUser(req);
    const prompt = getPrompt(req.body);
    authorization = await authorizeAiRequest({ user, body: req.body || {} });
    const serverPrompt = composeAiPrompt({ prompt, authorization });
    reservation = await enforceAiLimits({ user, authorization, prompt: serverPrompt, correlationId });
    providerName = getLlmProvider(); modelName = getLlmModel(providerName);
    const requestMetadata = { requestedDocumentCount: authorization.documents.length, promptLength: prompt.length, estimatedTokens: reservation.estimatedTokens, estimatedCostUsd: Number(reservation.estimatedCostUsd.toFixed(8)) };
    await writeAiAuditLog({ eventName: 'ai_request_started', status: 102, user, authorization, correlationId, provider: providerName, model: modelName, requestMetadata });
    structuredLog('INFO', 'ai_request_started', { correlationId, firebaseUid: user.uid || 'unknown', companyId: authorization.companyId, role: authorization.role, ...requestMetadata, provider: providerName, model: modelName });
    const { outputText, provider, model, usage } = await askLLM({ prompt: serverPrompt, user, authorization, correlationId });
    const reconciliation = await reconcileAiReservation({ user, authorization, reservation, status: 'completed', usage, provider, model, correlationId });
    await writeAiCostLog({ user, authorization, correlationId, integration: req.body?.integration || provider, provider, model, usage, estimatedTokens: reservation.estimatedTokens, estimatedCostUsd: reservation.estimatedCostUsd });
    await writeAiAuditLog({ eventName: 'ai_request_completed', status: 200, user, authorization, correlationId, provider, model, requestMetadata });
    res.status(200).json({ response: outputText, provider, model, tokens: reconciliation.tokens, costo: reconciliation.costo, costUsd: reconciliation.costUsd, estimatedCostUsd: Number(reservation.estimatedCostUsd.toFixed(8)), status: 'completed', correlationId, ...(authorization?.companyId ? { companyId: authorization.companyId } : {}), release: RELEASE_METADATA });
    structuredLog('INFO', 'ai_request_completed', { correlationId, firebaseUid: user.uid || 'unknown', companyId: authorization.companyId, status: 200, latencyMs: Date.now() - startedAt });
  } catch (error) {
    const status = Number(error.status) || 500;
    if (reservation) {
      try { await reconcileAiReservation({ user: user || { uid: 'unknown' }, authorization, reservation, status: 'failed', usage: null, provider: providerName || getLlmProvider(), model: modelName || getLlmModel(providerName || getLlmProvider()), correlationId }); }
      catch (reconcileError) { structuredLog('ERROR', 'ai_reservation_reconcile_failed', { correlationId, status: Number(reconcileError.status) || 500, message: reconcileError.message || 'No se pudo reconciliar la reserva IA fallida.' }); }
    }
    try { await writeAiAuditLog({ eventName: 'ai_request_failed', status, user, authorization, correlationId, provider: providerName || null, model: modelName || null, requestMetadata: { companyId: req.body?.companyId, requestedDocumentCount: authorization?.documents?.length || 0, promptLength: typeof req.body?.prompt === 'string' ? req.body.prompt.length : 0, estimatedTokens: reservation?.estimatedTokens, estimatedCostUsd: reservation?.estimatedCostUsd }, errorMessage: error.message || 'No se pudo completar la consulta de IA.' }); }
    catch (auditError) { structuredLog('ERROR', 'ai_audit_log_failed', { correlationId, status: Number(auditError.status) || 500, message: auditError.message || 'No se pudo registrar auditoría IA.' }); }
    structuredLog(status >= 500 ? 'ERROR' : 'WARNING', 'ai_request_failed', { correlationId, status, latencyMs: Date.now() - startedAt, message: error.message || 'No se pudo completar la consulta de IA.' });
    const errorContract = classifyAiHttpError(error, status);
    res.status(status).json({ error: error.message || 'No se pudo completar la consulta de IA.', correlationId, ...(authorization?.companyId ? { companyId: authorization.companyId } : {}), release: RELEASE_METADATA, ...errorContract });
  }
}
module.exports = { aiHandler, getCorrelationId, getPrompt, classifyAiHttpError, authorizeAiRequest, getAllowedOrigins, enforceAllowedOrigin, getAiLimitConfig, estimateTokenCount, getUsageTokens, calculateCostUsd };
