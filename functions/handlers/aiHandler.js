const admin = require('firebase-admin');
require('../contracts/aiContracts');
const { applyCors, enforceAllowedOrigin, fail, getAllowedOrigins } = require('../policies/httpPolicy');

const openAiApiKey = { value: () => process.env.OPENAI_API_KEY };
const DEFAULT_LLM_PROVIDER = 'openai';
const DEFAULT_MODEL = 'gpt-4o-mini';
const MAX_PROMPT_LENGTH = 12000;
const RELEASE_METADATA = Object.freeze({
  appVersion: process.env.APP_VERSION || '1.0.0',
  buildId: process.env.BUILD_ID || process.env.K_REVISION || 'local',
  gitSha: process.env.GIT_SHA || process.env.GITHUB_SHA || 'unknown',
  deployEnv: process.env.DEPLOY_ENV || process.env.NODE_ENV || 'production',
});
const ACTIVE_STATUSES = new Set(['active', 'activo']);
const COMPANY_ADMIN_ROLES = new Set(['owner', 'director', 'admin']);
const AI_ALLOWED_ROLES = new Set(['owner', 'director', 'admin', 'editor']);
const COMPANY_ID_PATTERN = /^[A-Za-z0-9_-]{1,160}$/;
const MAX_REQUESTED_DOCUMENTS = 25;
const MAX_CORRELATION_ID_LENGTH = 160;
const MAX_LOG_STRING_LENGTH = 500;
const MAX_LOG_DEPTH = 5;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 30;
const DEFAULT_DAILY_TOKEN_LIMIT = 50000;
const DEFAULT_DAILY_BUDGET_USD = 5;
const DEFAULT_RESERVED_OUTPUT_TOKENS = 1200;
const DEFAULT_COST_PER_1K_TOKENS_USD = 0.002;
const AI_COST_LOG_COLLECTION = 'aiCostLogs';
const AI_AUDIT_LOG_COLLECTION = 'aiAuditLogs';
const TRACKED_AI_INTEGRATIONS = new Set(['ellmer', 'tidyllm', 'openai', 'gemini.R', 'groqR']);
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const TOKEN_PATTERN = /(bearer\s+|token['"\s:=]+|api[_-]?key['"\s:=]+|secret['"\s:=]+)[A-Za-z0-9._~+/=-]{12,}/gi;
const SENSITIVE_KEY_PATTERN = /(authorization|api[_-]?key|secret|token|password|prompt|content|document(Content|Text)?|raw(Document)?|file(Name)?|storagePath|downloadUrl|url|query|response|rfc|email)$/i;


function getPositiveNumberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getAiLimitConfig() {
  return {
    rateLimitWindowMs: getPositiveNumberEnv('AI_RATE_LIMIT_WINDOW_MS', DEFAULT_RATE_LIMIT_WINDOW_MS),
    rateLimitMaxRequests: getPositiveNumberEnv('AI_RATE_LIMIT_MAX_REQUESTS', DEFAULT_RATE_LIMIT_MAX_REQUESTS),
    dailyTokenLimit: getPositiveNumberEnv('AI_DAILY_TOKEN_LIMIT', DEFAULT_DAILY_TOKEN_LIMIT),
    dailyBudgetUsd: getPositiveNumberEnv('AI_DAILY_BUDGET_USD', DEFAULT_DAILY_BUDGET_USD),
    reservedOutputTokens: getPositiveNumberEnv('AI_RESERVED_OUTPUT_TOKENS', DEFAULT_RESERVED_OUTPUT_TOKENS),
    costPer1kTokensUsd: getPositiveNumberEnv('AI_COST_PER_1K_TOKENS_USD', DEFAULT_COST_PER_1K_TOKENS_USD),
  };
}

function estimateTokenCount(text = '') {
  return Math.max(1, Math.ceil(String(text).length / 4));
}

function getUtcDateKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function toCounterNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function getOpenAiModel() {
  return process.env.OPENAI_MODEL || DEFAULT_MODEL;
}

function normalizeAiIntegration(value) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  return TRACKED_AI_INTEGRATIONS.has(candidate) ? candidate : 'openai';
}

function getUsageTokens(usage = {}) {
  const inputTokens = toCounterNumber(usage.input_tokens || usage.prompt_tokens);
  const outputTokens = toCounterNumber(usage.output_tokens || usage.completion_tokens);
  const totalTokens = toCounterNumber(usage.total_tokens) || inputTokens + outputTokens;
  return { inputTokens, outputTokens, totalTokens };
}

function calculateCostUsd(totalTokens, costPer1kTokensUsd = getAiLimitConfig().costPer1kTokensUsd) {
  return Number(((toCounterNumber(totalTokens) / 1000) * costPer1kTokensUsd).toFixed(8));
}

async function writeAiAuditLog({ eventName, status, user, authorization, correlationId, provider, model, requestMetadata = {}, errorMessage }) {
  const timestamp = new Date().toISOString();
  const safeCorrelationId = String(correlationId || createCorrelationId('audit')).replace(/[^A-Za-z0-9_-]/g, '_');
  const logId = `${timestamp.replace(/[^0-9A-Za-z]/g, '')}_${safeCorrelationId}_${String(eventName || 'ai_event').replace(/[^A-Za-z0-9_-]/g, '_')}`.slice(0, 220);
  const companyId = authorization?.companyId || (COMPANY_ID_PATTERN.test(String(requestMetadata.companyId || '')) ? String(requestMetadata.companyId) : null);
  const payload = sanitizeLogPayload({
    timestamp,
    eventName,
    status,
    correlationId,
    companyId,
    userUid: user?.uid || null,
    role: authorization?.role || null,
    provider: provider || null,
    model: model || null,
    release: RELEASE_METADATA,
    requestedDocumentCount: Number(requestMetadata.requestedDocumentCount || 0),
    promptLength: Number(requestMetadata.promptLength || 0),
    estimatedTokens: requestMetadata.estimatedTokens,
    estimatedCostUsd: requestMetadata.estimatedCostUsd,
    errorMessage: errorMessage || null,
  });

  await admin.firestore().collection(AI_AUDIT_LOG_COLLECTION).doc(logId).set(payload, { merge: true });
  structuredLog(status >= 500 ? 'ERROR' : status >= 400 ? 'WARNING' : 'INFO', 'ai_audit_logged', {
    correlationId,
    eventName,
    status,
    companyId,
    firebaseUid: user?.uid || null,
  });
  return payload;
}

async function writeAiCostLog({ user, authorization, correlationId, integration = 'openai', provider = 'openai', model, usage, estimatedTokens, estimatedCostUsd }) {
  const timestamp = new Date().toISOString();
  const usageTokens = getUsageTokens(usage);
  const tokens = usageTokens.totalTokens || toCounterNumber(estimatedTokens);
  const costUsd = usageTokens.totalTokens ? calculateCostUsd(usageTokens.totalTokens) : Number(toCounterNumber(estimatedCostUsd).toFixed(8));
  const logId = `${timestamp.replace(/[^0-9A-Za-z]/g, '')}_${String(correlationId || createCorrelationId('cost')).replace(/[^A-Za-z0-9_-]/g, '_')}`.slice(0, 220);

  await admin.firestore().collection(AI_COST_LOG_COLLECTION).doc(logId).set({
    timestamp,
    tokens,
    inputTokens: usageTokens.inputTokens,
    outputTokens: usageTokens.outputTokens,
    model,
    costo: costUsd,
    costUsd,
    provider,
    integration: normalizeAiIntegration(integration),
    correlationId,
    companyId: authorization.companyId,
    userUid: user.uid || 'unknown',
  }, { merge: true });

  structuredLog('INFO', 'ai_cost_logged', {
    correlationId,
    companyId: authorization.companyId,
    firebaseUid: user.uid || 'unknown',
    integration: normalizeAiIntegration(integration),
    provider,
    model,
    tokens,
    costUsd,
  });

  return { timestamp, tokens, model, costo: costUsd, costUsd };
}

function getLimitDocIds({ companyId, uid, now = new Date() }) {
  const safeUid = String(uid || 'unknown').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 160) || 'unknown';
  return {
    usageDocId: `${getUtcDateKey(now)}_${companyId}`,
    rateDocId: `${companyId}_${safeUid}`,
  };
}

async function enforceAiLimits({ user, authorization, prompt, correlationId, now = new Date() }) {
  const config = getAiLimitConfig();
  const promptTokens = estimateTokenCount(prompt);
  const estimatedTokens = promptTokens + config.reservedOutputTokens;
  const estimatedCostUsd = (estimatedTokens / 1000) * config.costPer1kTokensUsd;
  const { usageDocId, rateDocId } = getLimitDocIds({ companyId: authorization.companyId, uid: user.uid, now });
  const db = admin.firestore();
  const rateRef = db.collection('aiRateLimits').doc(rateDocId);
  const usageRef = db.collection('aiUsage').doc(usageDocId);
  const nowMs = now.getTime();
  const reservation = {
    usageDocId,
    rateDocId,
    estimatedTokens,
    estimatedCostUsd,
    reservedAtMs: nowMs,
    reservationStatus: 'reserved',
  };

  await db.runTransaction(async (transaction) => {
    const rateSnap = await transaction.get(rateRef);
    const rateData = rateSnap.exists ? (rateSnap.data() || {}) : {};
    const windowStartedAtMs = toCounterNumber(rateData.windowStartedAtMs);
    const requestCount = toCounterNumber(rateData.requestCount);
    const windowExpired = !windowStartedAtMs || nowMs - windowStartedAtMs >= config.rateLimitWindowMs;
    const nextRequestCount = windowExpired ? 1 : requestCount + 1;

    if (!windowExpired && requestCount >= config.rateLimitMaxRequests) {
      structuredLog('WARNING', 'ai_rate_limit_exceeded', {
        correlationId,
        firebaseUid: user.uid || 'unknown',
        companyId: authorization.companyId,
        requestCount,
        rateLimitMaxRequests: config.rateLimitMaxRequests,
        rateLimitWindowMs: config.rateLimitWindowMs,
      });
      fail(429, 'Límite de frecuencia de IA excedido. Intenta de nuevo más tarde.');
    }

    const usageSnap = await transaction.get(usageRef);
    const usageData = usageSnap.exists ? (usageSnap.data() || {}) : {};
    const usedTokens = toCounterNumber(usageData.reservedTokens) + toCounterNumber(usageData.tokensUsed);
    const usedBudgetUsd = toCounterNumber(usageData.reservedBudgetUsd) + toCounterNumber(usageData.budgetUsedUsd);
    const nextTokens = usedTokens + estimatedTokens;
    const nextBudgetUsd = usedBudgetUsd + estimatedCostUsd;

    if (nextTokens > config.dailyTokenLimit) {
      structuredLog('WARNING', 'ai_token_quota_exceeded', {
        correlationId,
        firebaseUid: user.uid || 'unknown',
        companyId: authorization.companyId,
        usedTokens,
        estimatedTokens,
        dailyTokenLimit: config.dailyTokenLimit,
      });
      fail(429, 'Cuota diaria de tokens IA excedida para esta empresa.');
    }

    if (nextBudgetUsd > config.dailyBudgetUsd) {
      structuredLog('WARNING', 'ai_budget_exceeded', {
        correlationId,
        firebaseUid: user.uid || 'unknown',
        companyId: authorization.companyId,
        usedBudgetUsd,
        estimatedCostUsd,
        dailyBudgetUsd: config.dailyBudgetUsd,
      });
      fail(429, 'Presupuesto diario de IA excedido para esta empresa.');
    }

    transaction.set(rateRef, {
      companyId: authorization.companyId,
      userUid: user.uid || 'unknown',
      windowStartedAtMs: windowExpired ? nowMs : windowStartedAtMs,
      requestCount: nextRequestCount,
      updatedAtMs: nowMs,
    }, { merge: true });

    transaction.set(usageRef, {
      companyId: authorization.companyId,
      dateKey: getUtcDateKey(now),
      reservedTokens: Math.max(0, toCounterNumber(usageData.reservedTokens) + estimatedTokens),
      reservedBudgetUsd: Number(Math.max(0, toCounterNumber(usageData.reservedBudgetUsd) + estimatedCostUsd).toFixed(8)),
      requestCount: toCounterNumber(usageData.requestCount) + 1,
      updatedAtMs: nowMs,
    }, { merge: true });
  });

  return reservation;
}

function calculateActualAiUsage({ status, usage, estimatedTokens }) {
  if (status === 'failed' && !usage) {
    return { actualTokens: 0, actualCostUsd: 0 };
  }

  const hasUsage = usage && typeof usage === 'object';
  let actualTokens = 0;

  if (hasUsage && usage.total_tokens !== undefined && usage.total_tokens !== null) {
    actualTokens = toCounterNumber(usage.total_tokens);
  } else if (hasUsage && (usage.input_tokens !== undefined || usage.output_tokens !== undefined || usage.prompt_tokens !== undefined || usage.completion_tokens !== undefined)) {
    actualTokens = toCounterNumber(usage.input_tokens || usage.prompt_tokens) + toCounterNumber(usage.output_tokens || usage.completion_tokens);
  } else if (status === 'completed') {
    actualTokens = toCounterNumber(estimatedTokens);
  }

  actualTokens = Math.max(0, actualTokens);
  return { actualTokens, actualCostUsd: calculateCostUsd(actualTokens) };
}

async function reconcileAiReservation({ user, authorization, reservation, status, usage, provider, model, correlationId }) {
  if (!reservation?.usageDocId) {
    const error = new Error('No se puede reconciliar una reserva IA sin usageDocId.');
    error.status = 500;
    throw error;
  }

  if (status !== 'completed' && status !== 'failed') {
    const error = new Error('Estado de reconciliación IA inválido.');
    error.status = 500;
    throw error;
  }

  const db = admin.firestore();
  const usageRef = db.collection('aiUsage').doc(reservation.usageDocId);
  const estimatedTokens = toCounterNumber(reservation.estimatedTokens);
  const estimatedCostUsd = toCounterNumber(reservation.estimatedCostUsd);
  const { actualTokens, actualCostUsd } = calculateActualAiUsage({ status, usage, estimatedTokens });
  const nowMs = Date.now();

  await db.runTransaction(async (transaction) => {
    const usageSnap = await transaction.get(usageRef);
    const usageData = usageSnap.exists ? (usageSnap.data() || {}) : {};
    const baseUpdate = {
      companyId: authorization.companyId,
      userUid: user.uid || 'unknown',
      reservedTokens: Math.max(0, toCounterNumber(usageData.reservedTokens) - estimatedTokens),
      reservedBudgetUsd: Number(Math.max(0, toCounterNumber(usageData.reservedBudgetUsd) - estimatedCostUsd).toFixed(8)),
      provider,
      model,
      lastCorrelationId: correlationId,
      updatedAtMs: nowMs,
    };

    if (status === 'completed') {
      transaction.set(usageRef, {
        ...baseUpdate,
        tokensUsed: Math.max(0, toCounterNumber(usageData.tokensUsed)) + actualTokens,
        budgetUsedUsd: Number((Math.max(0, toCounterNumber(usageData.budgetUsedUsd)) + actualCostUsd).toFixed(8)),
        completedRequestCount: toCounterNumber(usageData.completedRequestCount) + 1,
      }, { merge: true });
      return;
    }

    transaction.set(usageRef, {
      ...baseUpdate,
      tokensUsed: Math.max(0, toCounterNumber(usageData.tokensUsed)),
      budgetUsedUsd: Number(Math.max(0, toCounterNumber(usageData.budgetUsedUsd)).toFixed(8)),
      failedRequestCount: toCounterNumber(usageData.failedRequestCount) + 1,
    }, { merge: true });
  });

  structuredLog('INFO', 'ai_reservation_reconciled', {
    correlationId,
    companyId: authorization.companyId,
    firebaseUid: user.uid || 'unknown',
    status,
    usageDocId: reservation.usageDocId,
    estimatedTokens,
    actualTokens,
    actualCostUsd,
  });

  return { tokens: actualTokens, costUsd: actualCostUsd, costo: actualCostUsd };
}

function createCorrelationId(prefix = 'srv') {
  const crypto = require('node:crypto');
  return `${prefix}_${crypto.randomUUID()}`;
}

function getCorrelationId(req) {
  const headerValue = req.get('x-correlation-id');
  const bodyValue = req.body?.correlationId;
  const candidate = String(headerValue || bodyValue || '').trim();
  if (!candidate) return createCorrelationId('ai');
  const safeValue = candidate.replace(/[^a-zA-Z0-9._:-]/g, '_').slice(0, MAX_CORRELATION_ID_LENGTH);
  return safeValue || createCorrelationId('ai');
}

function redactString(value) {
  return value
    .replace(EMAIL_PATTERN, '[REDACTED_EMAIL]')
    .replace(TOKEN_PATTERN, '$1[REDACTED_SECRET]')
    .slice(0, MAX_LOG_STRING_LENGTH);
}

function sanitizeLogPayload(value, depth = 0, key = '') {
  if (value === null || value === undefined) return value;
  if (depth > MAX_LOG_DEPTH) return '[MAX_DEPTH]';
  if (typeof value === 'string') {
    if (SENSITIVE_KEY_PATTERN.test(key)) return value ? '[REDACTED]' : '';
    return redactString(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeLogPayload(item, depth + 1, key));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        SENSITIVE_KEY_PATTERN.test(entryKey) ? (entryValue ? '[REDACTED]' : entryValue) : sanitizeLogPayload(entryValue, depth + 1, entryKey),
      ]),
    );
  }
  return String(value);
}

function structuredLog(severity, eventName, payload = {}) {
  const entry = sanitizeLogPayload({
    severity,
    eventName,
    timestamp: new Date().toISOString(),
    ...RELEASE_METADATA,
    ...payload,
  });
  const line = JSON.stringify(entry);
  if (severity === 'ERROR' || severity === 'CRITICAL') console.error(line);
  else if (severity === 'WARNING') console.warn(line);
  else console.log(line);
}


function getBearerToken(req) {
  const authHeader = req.get('authorization') || '';
  const [scheme, token] = authHeader.split(' ');
  return scheme?.toLowerCase() === 'bearer' ? token : null;
}

async function verifyFirebaseUser(req) {
  const token = getBearerToken(req);
  if (!token) {
    const error = new Error('Autenticación requerida para usar IA.');
    error.status = 401;
    throw error;
  }

  try {
    return await admin.auth().verifyIdToken(token);
  } catch (_error) {
    const error = new Error('Token de Firebase inválido o expirado.');
    error.status = 401;
    throw error;
  }
}

function getPrompt(body = {}) {
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    const error = new Error('El campo prompt es obligatorio.');
    error.status = 400;
    throw error;
  }

  if (prompt.length > MAX_PROMPT_LENGTH) {
    const error = new Error(`El prompt excede el límite de ${MAX_PROMPT_LENGTH} caracteres.`);
    error.status = 413;
    throw error;
  }

  return prompt;
}



function requireCompanyId(body = {}) {
  const companyId = typeof body.companyId === 'string' ? body.companyId.trim() : '';
  if (!companyId) fail(400, 'El campo companyId es obligatorio para usar IA.');
  if (!COMPANY_ID_PATTERN.test(companyId)) fail(400, 'companyId inválido.');
  return companyId;
}

function isActiveStatus(status) {
  return ACTIVE_STATUSES.has(String(status || '').toLowerCase());
}

function normalizeRequestedList(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) fail(400, 'Los documentos solicitados deben enviarse como arreglo.');
  const cleaned = value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean);
  if (cleaned.length !== value.length) fail(400, 'Todos los documentos solicitados deben ser identificadores válidos.');
  return [...new Set(cleaned)];
}

function getRequestedDocuments(body = {}) {
  const documentIds = normalizeRequestedList(body.documentIds || body.contextDocumentIds || body.context_documents);
  const storagePaths = normalizeRequestedList(body.storagePaths);
  if (documentIds.length + storagePaths.length > MAX_REQUESTED_DOCUMENTS) {
    fail(400, `No se pueden solicitar más de ${MAX_REQUESTED_DOCUMENTS} documentos por consulta IA.`);
  }
  return { documentIds, storagePaths };
}

async function validateCompanyAccess({ user, companyId }) {
  const companyRef = admin.firestore().collection('companies').doc(companyId);
  const companySnap = await companyRef.get();
  if (!companySnap.exists) fail(403, 'Empresa no válida o sin acceso.');

  const company = companySnap.data() || {};
  if (!isActiveStatus(company.status)) fail(403, 'La empresa no está activa para usar IA.');

  const ownerUid = company.ownerUid || company.createdBy;
  if (ownerUid === user.uid) {
    return { companyRef, company, role: 'owner', membership: null };
  }

  const membershipId = `${companyId}_${user.uid}`;
  const membershipSnap = await admin.firestore().collection('companyMembers').doc(membershipId).get();
  if (!membershipSnap.exists) fail(403, 'Se requiere membresía activa en la empresa para usar IA.');

  const membership = membershipSnap.data() || {};
  if (membership.companyId !== companyId || membership.userUid !== user.uid || !isActiveStatus(membership.status)) {
    fail(403, 'Se requiere membresía activa en la empresa para usar IA.');
  }

  const role = String(membership.role || '').trim().toLowerCase();
  if (!AI_ALLOWED_ROLES.has(role)) fail(403, 'Tu rol no permite usar IA en esta empresa.');

  return { companyRef, company, role, membership };
}

async function validateRequestedDocuments({ companyId, documentIds, storagePaths }) {
  const documentRefs = [];
  const seenDocIds = new Set();

  for (const documentId of documentIds) {
    const docSnap = await admin.firestore().collection('documents').doc(documentId).get();
    if (!docSnap.exists) fail(403, 'Documento solicitado no válido o sin acceso.');
    const data = docSnap.data() || {};
    if (data.companyId !== companyId) fail(403, 'Documento solicitado no pertenece a la empresa validada.');
    if (!seenDocIds.has(docSnap.id)) {
      seenDocIds.add(docSnap.id);
      documentRefs.push({ id: docSnap.id, ...data });
    }
  }

  for (const storagePath of storagePaths) {
    const querySnap = await admin.firestore()
      .collection('documents')
      .where('companyId', '==', companyId)
      .where('storagePath', '==', storagePath)
      .limit(1)
      .get();
    if (querySnap.empty) fail(403, 'Ruta de documento solicitada no válida o sin acceso.');
    const docSnap = querySnap.docs[0];
    if (!seenDocIds.has(docSnap.id)) {
      seenDocIds.add(docSnap.id);
      documentRefs.push({ id: docSnap.id, ...(docSnap.data() || {}) });
    }
  }

  return documentRefs;
}

async function authorizeAiRequest({ user, body }) {
  const companyId = requireCompanyId(body);
  const access = await validateCompanyAccess({ user, companyId });
  const requested = getRequestedDocuments(body);
  const documents = await validateRequestedDocuments({ companyId, ...requested });
  return { companyId, ...access, requested, documents };
}

function extractOutputText(payload = {}) {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const chunks = [];
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) chunks.push(content.text);
    }
  }

  return chunks.join('\n').trim();
}

function getLlmProvider() {
  return String(process.env.LLM_PROVIDER || DEFAULT_LLM_PROVIDER).trim().toLowerCase();
}

function getLlmModel(provider = getLlmProvider()) {
  return process.env.LLM_MODEL || process.env.OPENAI_MODEL || (provider === 'openai' ? DEFAULT_MODEL : 'default');
}

async function callOpenAIProvider({ apiKey, prompt, user, authorization, correlationId, model }) {
  const startedAt = Date.now();
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Correlation-Id': correlationId,
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'system',
          content: 'Eres GEMAILLA AI, un asistente financiero empresarial. Responde en español, con recomendaciones accionables y sin inventar datos no presentes en el contexto.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      metadata: {
        firebase_uid: user.uid || 'unknown',
        company_id: authorization.companyId,
        company_role: authorization.role,
        correlation_id: correlationId,
        app_version: RELEASE_METADATA.appVersion,
        build_id: RELEASE_METADATA.buildId,
        git_sha: RELEASE_METADATA.gitSha,
        deploy_env: RELEASE_METADATA.deployEnv,
      },
    }),
  });

  const latencyMs = Date.now() - startedAt;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    structuredLog('ERROR', 'openai_request_failed', {
      correlationId,
      firebaseUid: user.uid || 'unknown',
      status: response.status,
      latencyMs,
      message: payload?.error?.message || payload?.message || 'OpenAI error',
    });
    const message = payload?.error?.message || payload?.message || `El proveedor LLM respondió HTTP ${response.status}.`;
    const error = new Error(message);
    error.status = response.status >= 500 ? 502 : response.status;
    throw error;
  }

  const outputText = extractOutputText(payload);
  if (!outputText) {
    const error = new Error('El proveedor LLM no devolvió texto utilizable.');
    error.status = 502;
    throw error;
  }

  structuredLog('INFO', 'openai_request_completed', {
    correlationId,
    firebaseUid: user.uid || 'unknown',
    status: response.status,
    latencyMs,
    model,
  });

  return { outputText, latencyMs, provider: 'openai', model, usage: payload.usage || {} };
}

async function askLLM({ prompt, user, authorization, correlationId }) {
  const provider = getLlmProvider();
  const model = getLlmModel(provider);

  if (provider !== 'openai') {
    const error = new Error(`Proveedor LLM no soportado: ${provider}. Configura LLM_PROVIDER=openai o agrega un adaptador en askLLM.`);
    error.status = 501;
    throw error;
  }

  const apiKey = openAiApiKey.value() || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const error = new Error('Backend IA no configurado: falta OPENAI_API_KEY en Firebase Functions.');
    error.status = 503;
    throw error;
  }

  return callOpenAIProvider({ apiKey, prompt, user, authorization, correlationId, model });
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
    try {
      enforceAllowedOrigin(req);
      res.status(204).send('');
    } catch (error) {
      const status = Number(error.status) || 403;
      structuredLog('WARNING', 'ai_cors_preflight_rejected', {
        correlationId,
        origin: req.get('origin') || 'none',
        status,
      });
      res.status(status).json({ error: error.message || 'CORS no permitido.', correlationId, release: RELEASE_METADATA });
    }
    return;
  }

  if (req.method !== 'POST') {
    structuredLog('WARNING', 'ai_request_rejected', { correlationId, method: req.method, status: 405 });
    res.status(405).json({ error: 'Método no permitido. Usa POST.', correlationId, release: RELEASE_METADATA });
    return;
  }

  let authorization = null;
  let user = null;
  let reservation = null;
  let providerName = null;
  let modelName = null;

  try {
    enforceAllowedOrigin(req);

    user = await verifyFirebaseUser(req);
    const prompt = getPrompt(req.body);
    authorization = await authorizeAiRequest({ user, body: req.body || {} });
    reservation = await enforceAiLimits({ user, authorization, prompt, correlationId });
    providerName = getLlmProvider();
    modelName = getLlmModel(providerName);
    await writeAiAuditLog({
      eventName: 'ai_request_started',
      status: 102,
      user,
      authorization,
      correlationId,
      provider: providerName,
      model: modelName,
      requestMetadata: {
        requestedDocumentCount: authorization.documents.length,
        promptLength: prompt.length,
        estimatedTokens: reservation.estimatedTokens,
        estimatedCostUsd: Number(reservation.estimatedCostUsd.toFixed(8)),
      },
    });

    structuredLog('INFO', 'ai_request_started', {
      correlationId,
      firebaseUid: user.uid || 'unknown',
      companyId: authorization.companyId,
      role: authorization.role,
      requestedDocumentCount: authorization.documents.length,
      promptLength: prompt.length,
      provider: providerName,
      model: modelName,
      estimatedTokens: reservation.estimatedTokens,
      estimatedCostUsd: Number(reservation.estimatedCostUsd.toFixed(8)),
    });

    const { outputText, provider, model, usage } = await askLLM({ prompt, user, authorization, correlationId });

    const reconciliation = await reconcileAiReservation({
      user,
      authorization,
      reservation,
      status: 'completed',
      usage,
      provider,
      model,
      correlationId,
    });

    const costLog = await writeAiCostLog({
      user,
      authorization,
      correlationId,
      integration: req.body?.integration || provider,
      provider,
      model,
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
      provider,
      model,
      requestMetadata: {
        requestedDocumentCount: authorization.documents.length,
        promptLength: prompt.length,
        estimatedTokens: reservation.estimatedTokens,
        estimatedCostUsd: Number(reservation.estimatedCostUsd.toFixed(8)),
      },
    });

    res.status(200).json({
      response: outputText,
      provider,
      model,
      tokens: reconciliation.tokens,
      costo: reconciliation.costo,
      costUsd: reconciliation.costUsd,
      status: 'completed',
      correlationId,
      ...(authorization?.companyId ? { companyId: authorization.companyId } : {}),
      release: RELEASE_METADATA,
    });

    structuredLog('INFO', 'ai_request_completed', {
      correlationId,
      firebaseUid: user.uid || 'unknown',
      companyId: authorization.companyId,
      status: 200,
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    const status = Number(error.status) || 500;
    if (reservation) {
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
        structuredLog('ERROR', 'ai_reservation_reconcile_failed', {
          correlationId,
          status: Number(reconcileError.status) || 500,
          message: reconcileError.message || 'No se pudo reconciliar la reserva IA fallida.',
        });
      }
    }
    try {
      await writeAiAuditLog({
        eventName: 'ai_request_failed',
        status,
        user,
        authorization,
        correlationId,
        provider: providerName || null,
        model: modelName || null,
        requestMetadata: {
          companyId: req.body?.companyId,
          requestedDocumentCount: authorization?.documents?.length || 0,
          promptLength: typeof req.body?.prompt === 'string' ? req.body.prompt.length : 0,
          estimatedTokens: reservation?.estimatedTokens,
          estimatedCostUsd: reservation?.estimatedCostUsd,
        },
        errorMessage: error.message || 'No se pudo completar la consulta de IA.',
      });
    } catch (auditError) {
      structuredLog('ERROR', 'ai_audit_log_failed', {
        correlationId,
        status: Number(auditError.status) || 500,
        message: auditError.message || 'No se pudo registrar auditoría IA.',
      });
    }

    structuredLog(status >= 500 ? 'ERROR' : 'WARNING', 'ai_request_failed', {
      correlationId,
      status,
      latencyMs: Date.now() - startedAt,
      message: error.message || 'No se pudo completar la consulta de IA.',
    });
    res.status(status).json({
      error: error.message || 'No se pudo completar la consulta de IA.',
      correlationId,
      ...(authorization?.companyId ? { companyId: authorization.companyId } : {}),
      release: RELEASE_METADATA,
    });
  }
}

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
  requireCompanyId,
};
