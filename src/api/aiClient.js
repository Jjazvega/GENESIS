import { z } from 'zod';
import { auth } from '@/firebase';
import { DOCUMENT_STATUSES, AI_DISABLED_RESPONSE_STATUSES } from '@/features/documents/constants/documentStatuses';
import { ensureCorrelationId, getReleaseMetadata, logFrontendEvent, persistObservabilityEvent } from '@/lib/observability';

// ── Zod input schemas (zero-trust validation) ────────────────────────────────

export const InvokeLLMSchema = z.object({
  companyId: z.string().trim().min(1, 'companyId es obligatorio para usar IA.'),
  prompt: z.string().optional(),
  documentIds: z.array(z.string()).optional(),
  correlationId: z.string().optional(),
  release: z.record(z.unknown()).optional(),
});

export const InvokeFunctionSchema = z.object({
  name: z.string().trim().min(1, 'Nombre de función inválido.'),
  payload: z.record(z.unknown()).optional(),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function getCurrentUser() {
  return auth.currentUser || null;
}

async function getAuthHeader() {
  const user = getCurrentUser();
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

export function isAiDisabledResponse(response = {}) {
  if (!response || typeof response !== 'object') return false;

  if (response.disabled === true) return true;
  if (typeof response.status === 'string' && AI_DISABLED_RESPONSE_STATUSES.has(response.status)) return true;
  if (response.documentStatus === DOCUMENT_STATUSES.AI_DISABLED) return true;

  const nestedResponse = response.data || response.result;
  return nestedResponse && nestedResponse !== response
    ? isAiDisabledResponse(nestedResponse)
    : false;
}

function aiDisabledPayload(reason = 'Las funciones de IA están desactivadas porque no hay backend seguro configurado.', correlationId = ensureCorrelationId('', 'ai')) {
  return {
    disabled: true,
    status: 'disabled',
    documentStatus: DOCUMENT_STATUSES.AI_DISABLED,
    message: reason,
    summary: reason,
    response: reason,
    correlationId,
    release: getReleaseMetadata(),
  };
}

export function getSafeInternalEndpoint(configuredEndpoint, fallbackPath, label) {
  const configured = String(configuredEndpoint || fallbackPath).trim() || fallbackPath;
  let url;
  try {
    url = new URL(configured, window.location.origin);
  } catch {
    throw new Error(`Endpoint de ${label} inválido.`);
  }

  if (url.origin !== window.location.origin || url.username || url.password) {
    throw new Error(`Endpoint de ${label} bloqueado: solo se permite una ruta interna del mismo origen.`);
  }

  if (!url.pathname.startsWith('/api/')) {
    throw new Error(`Endpoint de ${label} bloqueado: la ruta debe iniciar con /api/.`);
  }

  return `${url.pathname}${url.search}`;
}

export function getSafeFunctionsEndpoint() {
  const defaultEndpoint = '/api/functions';
  return getSafeInternalEndpoint(defaultEndpoint, '/api/functions', 'funciones');
}

export function getSafeAiEndpoint() {
  const defaultEndpoint = '/api/ai';
  return getSafeInternalEndpoint(defaultEndpoint, '/api/ai', 'ia');
}

// ── AI LLM call (no database mutation access) ────────────────────────────────

export async function invokeLLM(params = {}) {
  const parsed = InvokeLLMSchema.safeParse(params);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Parámetros de IA inválidos.');
  }

  const correlationId = ensureCorrelationId(params.correlationId, 'ai');
  const companyId = parsed.data.companyId;
  const endpoint = getSafeAiEndpoint();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Correlation-Id': correlationId,
      ...(await getAuthHeader()),
    },
    body: JSON.stringify({
      ...params,
      companyId,
      correlationId,
      release: getReleaseMetadata(),
    }),
  });

  const raw = await response.text();
  let payload = {};
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { message: raw };
    }
  }

  if (!response.ok) {
    const message = payload?.error || payload?.message || `Error HTTP ${response.status} al llamar IA.`;
    logFrontendEvent('ai_request_failed', { correlationId, status: response.status, message }, 'error');
    await persistObservabilityEvent('ai_request_failed', {
      correlationId,
      severity: 'ERROR',
      source: 'frontend',
      status: response.status,
      message,
    }).catch(() => null);
    throw new Error(`${message} (correlationId: ${correlationId})`);
  }

  logFrontendEvent('ai_request_completed', { correlationId, status: response.status });
  const result = payload?.data || payload?.result || payload;
  if (result && typeof result === 'object') return { ...result, correlationId: result.correlationId || correlationId };
  return { response: result, correlationId };
}

// ── Internal function invocation (no database mutation access) ───────────────

export async function invokeFunction(name, payload = {}) {
  const parsed = InvokeFunctionSchema.safeParse({ name, payload });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || 'Nombre de función inválido.');

  const correlationId = ensureCorrelationId(payload.correlationId, name || 'fn');
  const endpoint = getSafeFunctionsEndpoint();
  if (!endpoint) {
    return {
      data: {
        success: false,
        disabled: true,
        message: `Función ${name} desactivada: falta backend seguro.`,
        results: {},
        correlationId,
      },
    };
  }

  const safeFunctionName = encodeURIComponent(String(name || '').trim());
  if (!safeFunctionName) throw new Error('Nombre de función inválido.');

  const response = await fetch(`${endpoint.replace(/\/$/, '')}/${safeFunctionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Correlation-Id': correlationId,
      ...(await getAuthHeader()),
    },
    body: JSON.stringify({
      ...payload,
      correlationId,
      release: payload.release || getReleaseMetadata(),
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error || data?.message || `No se pudo ejecutar ${name}.`;
    logFrontendEvent('function_request_failed', { correlationId, functionName: name, status: response.status, message }, 'error');
    throw new Error(`${message} (correlationId: ${correlationId})`);
  }
  return { data };
}

// ── Document upload preparation (server-side validation and path reservation) ─

export async function prepareDocumentUpload(params = {}) {
  const correlationId = ensureCorrelationId(params.correlationId, 'doc_upload');
  const result = await invokeFunction('prepareDocumentUpload', {
    ...params,
    correlationId,
    release: getReleaseMetadata(),
  });
  return result.data;
}

// ── Stub: file data extraction (requires secure backend) ─────────────────────

export async function extractDataFromUploadedFile() {
  return {
    status: 'disabled',
    output: [],
    details: 'La extracción automática de archivos requiere backend seguro. El módulo queda degradado sin romper la app.',
  };
}

// Re-export disabled payload builder for consumers that need it
export { aiDisabledPayload };
