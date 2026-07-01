const admin = require('firebase-admin');
const { applyCors, enforceAllowedOrigin, fail } = require('../policies/httpPolicy');
const { verifyFirebaseUser } = require('../services/ai/auth/verifyFirebaseUser');
const { requireCompanyId, validateCompanyAccess } = require('../services/ai/authorization/validateCompanyAccess');
const { getRequestedDocuments, normalizeRequestedList, validateRequestedDocuments } = require('../services/ai/documents/validateRequestedDocuments');
const { writeAiAuditLog, writeAiCostLog } = require('../services/ai/audit/writeAiAuditLog');
const { enforceAiLimits } = require('../services/ai/limits/enforceAiLimits');
const { reconcileAiReservation } = require('../services/ai/limits/reconcileAiReservation');
const { askLLM } = require('../services/ai/providers/openaiProvider');
const {
  AI_ALLOWED_ROLES,
  MAX_CORRELATION_ID_LENGTH,
  MAX_PROMPT_LENGTH,
  MAX_REQUESTED_DOCUMENTS,
  RELEASE_METADATA,
  getLlmModel,
  getLlmProvider,
} = require('../services/ai/shared/config');
const { createCorrelationId, structuredLog } = require('../services/ai/shared/logging');

const ALLOWED_CONVERSATION_STATUSES = new Set(['active', 'completed', 'pendingApproval', 'error', 'archived']);
const ALLOWED_MESSAGE_ROLES = new Set(['system', 'user', 'assistant']);
const MAX_METADATA_DEPTH = 3;
const MAX_METADATA_ENTRIES = 20;

function nowIso() {
  return new Date().toISOString();
}

function getCorrelationId(req) {
  const candidate = String(req.get('x-correlation-id') || req.body?.correlationId || '').trim();
  if (!candidate) return createCorrelationId('ai_conv');
  return candidate.replace(/[^a-zA-Z0-9._:-]/g, '_').slice(0, MAX_CORRELATION_ID_LENGTH) || createCorrelationId('ai_conv');
}

function sanitizeConversationId(value, fallbackPrefix = 'conv') {
  const candidate = String(value || '').trim().replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 160);
  return candidate || createCorrelationId(fallbackPrefix).replace(/[^A-Za-z0-9_-]/g, '_');
}

function sanitizeBoundedString(value, { fieldName, maxLength = 5000, required = false } = {}) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    if (required) fail(400, `El campo ${fieldName} es obligatorio.`);
    return '';
  }
  if (normalized.length > maxLength) fail(400, `El campo ${fieldName} excede el límite permitido.`);
  return normalized;
}

function sanitizeOptionalBoolean(value) {
  return value === true;
}

function sanitizeMetadataValue(value, depth = 0) {
  if (depth > MAX_METADATA_DEPTH || value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string') return value.slice(0, 500);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, MAX_METADATA_ENTRIES).map((item) => sanitizeMetadataValue(item, depth + 1)).filter((item) => item !== undefined);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, MAX_METADATA_ENTRIES)
        .map(([key, entryValue]) => [String(key).trim().slice(0, 120), sanitizeMetadataValue(entryValue, depth + 1)])
        .filter(([key, entryValue]) => key && entryValue !== undefined),
    );
  }
  return undefined;
}

function sanitizeFlatObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, MAX_METADATA_ENTRIES)
      .map(([key, entryValue]) => [String(key).trim().slice(0, 120), sanitizeMetadataValue(entryValue)])
      .filter(([key, entryValue]) => key && entryValue !== undefined),
  );
}

function sanitizeMessage(message, fallbackCorrelationId) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) fail(400, 'El mensaje de conversación es obligatorio.');
  const role = String(message.role || '').trim().toLowerCase();
  if (!ALLOWED_MESSAGE_ROLES.has(role)) fail(400, 'Rol de mensaje inválido.');
  const content = sanitizeBoundedString(message.content, { fieldName: 'message.content', required: true, maxLength: MAX_PROMPT_LENGTH });
  return {
    role,
    content,
    correlationId: getCorrelationId({ get: () => '', body: { correlationId: message.correlationId || fallbackCorrelationId } }),
    createdAt: nowIso(),
    release: RELEASE_METADATA,
  };
}

function sanitizeMessages(messages = [], fallbackCorrelationId) {
  if (messages === undefined) return [];
  if (!Array.isArray(messages)) fail(400, 'messages debe enviarse como arreglo.');
  if (messages.length > 100) fail(400, 'No se permiten más de 100 mensajes por conversación.');
  return messages.map((message) => sanitizeMessage(message, fallbackCorrelationId));
}

function createConversationId() {
  return createCorrelationId('conv').replace(/[^A-Za-z0-9_-]/g, '_');
}

function buildConversationPayload(body, { user, companyId, documentIds, correlationId }) {
  const status = String(body.status || 'active').trim();
  if (!ALLOWED_CONVERSATION_STATUSES.has(status)) fail(400, 'Estado de conversación inválido.');
  const query = sanitizeBoundedString(body.query, { fieldName: 'query', maxLength: MAX_PROMPT_LENGTH });
  const response = sanitizeBoundedString(body.response, { fieldName: 'response', maxLength: MAX_PROMPT_LENGTH });
  const messages = sanitizeMessages(body.messages, correlationId);
  const metadata = sanitizeFlatObject(body.metadata);
  const filtersUsed = sanitizeFlatObject(body.filtersUsed || body.filters_used);
  const agentName = sanitizeBoundedString(body.agentName || body.agent_name || 'assistant', { fieldName: 'agentName', required: true, maxLength: 80 });
  const errorMessage = sanitizeBoundedString(body.errorMessage, { fieldName: 'errorMessage', maxLength: 1000 });

  return {
    companyId,
    ownerUid: user.uid || null,
    userUid: user.uid || null,
    userEmail: typeof user.email === 'string' ? user.email : '',
    agentName,
    metadata,
    query,
    response,
    messages,
    context_documents: documentIds,
    documentIds,
    filters_used: filtersUsed,
    status,
    requiresSupervisorApproval: sanitizeOptionalBoolean(body.requiresSupervisorApproval) || status === 'pendingApproval',
    errorMessage: errorMessage || null,
    correlationId,
    release: RELEASE_METADATA,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdBy: user.uid || null,
    updatedBy: user.uid || null,
  };
}

async function createAiConversationHandler(req, res) {
  applyCors(req, res);
  const correlationId = getCorrelationId(req);
  res.set('X-Correlation-Id', correlationId);

  if (req.method === 'OPTIONS') {
    try {
      enforceAllowedOrigin(req);
      return res.status(204).send('');
    } catch (error) {
      return res.status(Number(error.status) || 403).json({ error: error.message || 'CORS no permitido.', correlationId, release: RELEASE_METADATA });
    }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido. Usa POST.', correlationId, release: RELEASE_METADATA });

  try {
    enforceAllowedOrigin(req);
    const user = await verifyFirebaseUser(req);
    const companyId = requireCompanyId(req.body || {});
    const access = await validateCompanyAccess({ user, companyId });
    if (!AI_ALLOWED_ROLES.has(String(access.role || '').trim().toLowerCase()) && access.role !== 'owner') {
      fail(403, 'Tu rol no permite persistir conversaciones de IA en esta empresa.');
    }
    const requested = getRequestedDocuments(req.body || {});
    const documents = await validateRequestedDocuments({ companyId, ...requested });
    const documentIds = documents.map((document) => document.id).slice(0, MAX_REQUESTED_DOCUMENTS);
    const conversationId = createConversationId();
    const payload = buildConversationPayload(req.body || {}, { user, companyId, documentIds, correlationId });
    await admin.firestore().collection('aiConversations').doc(conversationId).set(payload);
    await writeAiAuditLog({
      eventName: 'ai_conversation_persisted',
      status: 200,
      user,
      authorization: { ...access, companyId, documents },
      correlationId,
      provider: null,
      model: null,
      requestMetadata: {
        companyId,
        requestedDocumentCount: documentIds.length,
        promptLength: payload.query.length,
      },
    });
    return res.status(200).json({
      success: true,
      conversation: { id: conversationId, ...payload },
      correlationId,
      release: RELEASE_METADATA,
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    structuredLog(status >= 500 ? 'ERROR' : 'WARNING', 'ai_conversation_persist_failed', {
      correlationId,
      status,
      message: error?.message || 'No se pudo persistir la conversación IA.',
    });
    return res.status(status).json({ error: error?.message || 'No se pudo persistir la conversación IA.', correlationId, release: RELEASE_METADATA });
  }
}

async function appendAiConversationMessageHandler(req, res) {
  applyCors(req, res);
  const startedAt = Date.now();
  const correlationId = getCorrelationId(req);
  res.set('X-Correlation-Id', correlationId);

  if (req.method === 'OPTIONS') {
    try {
      enforceAllowedOrigin(req);
      return res.status(204).send('');
    } catch (error) {
      return res.status(Number(error.status) || 403).json({ error: error.message || 'CORS no permitido.', correlationId, release: RELEASE_METADATA });
    }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido. Usa POST.', correlationId, release: RELEASE_METADATA });

  let reservation = null;
  let providerName = null;
  let modelName = null;
  let authorization = null;
  let user = null;

  try {
    enforceAllowedOrigin(req);
    user = await verifyFirebaseUser(req);
    const companyId = requireCompanyId(req.body || {});
    const access = await validateCompanyAccess({ user, companyId });
    const conversationId = sanitizeBoundedString(req.body?.conversationId, {
      fieldName: 'conversationId',
      required: true,
      maxLength: 160,
    }).replace(/[^A-Za-z0-9_-]/g, '_');
    if (!conversationId) fail(400, 'conversationId inválido.');
    const conversationRef = admin.firestore().collection('aiConversations').doc(conversationId);
    const snap = await conversationRef.get();
    if (!snap.exists) fail(404, 'Conversación no encontrada o sin acceso.');
    let current = snap.data() || {};
    if (current.companyId !== companyId) fail(403, 'La conversación no pertenece a la empresa validada.');
    if (current.ownerUid && current.ownerUid !== user.uid) fail(403, 'No puedes enviar mensajes en conversaciones de otro usuario.');

    const documentIds = normalizeRequestedList(current.context_documents || current.documentIds);
    const documents = documentIds.length
      ? await validateRequestedDocuments({ companyId, documentIds, storagePaths: [] })
      : [];
    authorization = { ...access, companyId, documents };

    if (!req.body?.message || typeof req.body.message !== 'object' || Array.isArray(req.body.message)) {
      fail(400, 'El campo message es obligatorio para persistir mensajes de conversación IA.');
    }
    const safeMessage = sanitizeMessage(req.body.message, correlationId);
    const messages = Array.isArray(current.messages) ? [...current.messages] : [];
    messages.push(safeMessage);

    let responseText = null;
    let usage = null;
    if (safeMessage.role === 'user') {
      reservation = await enforceAiLimits({ user, authorization, prompt: safeMessage.content, correlationId });
      providerName = getLlmProvider();
      modelName = getLlmModel(providerName);
      const requestMetadata = {
        requestedDocumentCount: documents.length,
        promptLength: safeMessage.content.length,
        estimatedTokens: reservation.estimatedTokens,
        estimatedCostUsd: Number(reservation.estimatedCostUsd.toFixed(8)),
      };
      await writeAiAuditLog({
        eventName: 'ai_request_started',
        status: 102,
        user,
        authorization,
        correlationId,
        provider: providerName,
        model: modelName,
        requestMetadata,
      });
      const providerResult = await askLLM({ prompt: safeMessage.content, user, authorization, correlationId });
      responseText = providerResult.outputText;
      usage = providerResult.usage;
      providerName = providerResult.provider;
      modelName = providerResult.model;
      const reconciliation = await reconcileAiReservation({
        user,
        authorization,
        reservation,
        status: 'completed',
        usage,
        provider: providerName,
        model: modelName,
        correlationId,
      });
      await writeAiCostLog({
        user,
        authorization,
        correlationId,
        integration: providerName,
        provider: providerName,
        model: modelName,
        usage,
        estimatedTokens: reservation.estimatedTokens,
        estimatedCostUsd: reservation.estimatedCostUsd,
      });
      await writeAiAuditLog({
        eventName: 'ai_request_completed',
        status: 200,
        user,
        authorization,
        correlationId,
        provider: providerName,
        model: modelName,
        requestMetadata,
      });
      messages.push({
        role: 'assistant',
        content: responseText,
        correlationId,
        createdAt: nowIso(),
        release: RELEASE_METADATA,
      });
      reservation = null;
      current = {
        ...current,
        tokens: reconciliation.tokens,
        costUsd: reconciliation.costUsd,
        costo: reconciliation.costo,
        model: modelName,
      };
    }

    const updatedConversation = {
      ...current,
      messages,
      updatedAt: nowIso(),
      updatedBy: user.uid || null,
      correlationId,
      release: RELEASE_METADATA,
    };
    await conversationRef.set(updatedConversation, { merge: true });
    structuredLog('INFO', 'ai_conversation_message_persisted', {
      correlationId,
      companyId,
      firebaseUid: user.uid || 'unknown',
      status: 200,
      latencyMs: Date.now() - startedAt,
    });
    return res.status(200).json({
      success: true,
      conversation: { id: conversationId, ...updatedConversation },
      response: responseText,
      correlationId,
      release: RELEASE_METADATA,
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    if (reservation && authorization) {
      try {
        await reconcileAiReservation({
          user: user || { uid: 'unknown' },
          authorization,
          reservation,
          status: 'failed',
          usage: null,
          provider: providerName || getLlmProvider(),
          model: modelName || getLlmModel(providerName || getLlmProvider()),
          correlationId,
        });
      } catch (reconcileError) {
        structuredLog('ERROR', 'ai_conversation_reconcile_failed', {
          correlationId,
          status: Number(reconcileError.status) || 500,
          message: reconcileError.message || 'No se pudo reconciliar la reserva IA.',
        });
      }
    }
    structuredLog(status >= 500 ? 'ERROR' : 'WARNING', 'ai_conversation_message_failed', {
      correlationId,
      status,
      latencyMs: Date.now() - startedAt,
      message: error?.message || 'No se pudo persistir el mensaje IA.',
    });
    return res.status(status).json({ error: error?.message || 'No se pudo persistir el mensaje IA.', correlationId, release: RELEASE_METADATA });
  }
}

module.exports = {
  createAiConversationHandler,
  appendAiConversationMessageHandler,
};
