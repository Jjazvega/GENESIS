import { z } from 'zod';
import { auth } from '@/firebase';
import { DOCUMENT_STATUSES, AI_DISABLED_RESPONSE_STATUSES } from '@/features/documents/constants/documentStatuses';
import { ensureCorrelationId, getReleaseMetadata, logFrontendEvent, persistObservabilityEvent } from '@/lib/observability';


/**
 * @typedef {Object} AiHttpRequestBody
 * @property {string} companyId Empresa activa autorizada por el backend.
 * @property {string} prompt Prompt final que el frontend manda a POST /api/ai.
 * @property {string[]=} documentIds IDs de documentos; el backend revalida pertenencia a la empresa.
 * @property {string[]=} storagePaths Rutas de Storage; el backend revalida pertenencia a la empresa.
 * @property {string=} correlationId ID trazable enviado también en X-Correlation-Id.
 * @property {Record<string, unknown>=} response_json_schema Esquema opcional para salida estructurada.
 * @property {string=} integration Etiqueta para auditoría y costos.
 * @property {Record<string, unknown>=} release Metadata de versión del frontend.
 *
 * @typedef {Object} AiHttpSuccessResponse
 * @property {'completed'} status Estado final del backend.
 * @property {string} response Texto generado por IA.
 * @property {string} provider Proveedor LLM usado.
 * @property {string} model Modelo usado.
 * @property {number} tokens Tokens reales reportados por el proveedor y debitados en aiUsage.tokensUsed.
 * @property {number} costUsd Costo real debitado en aiUsage.budgetUsedUsd.
 * @property {number} costo Alias legado de costUsd.
 * @property {number} estimatedCostUsd Costo estimado reservado para controlar presupuesto diario antes del LLM.
 * @property {string} correlationId ID de trazabilidad.
 * @property {string=} companyId Empresa autorizada.
 * @property {Record<string, unknown>} release Metadata de versión del backend.
 *
 * @typedef {Object} AiHttpErrorResponse
 * @property {string} error Mensaje seguro de error.
 * @property {string} correlationId ID de trazabilidad.
 * @property {'CORS_FORBIDDEN'|'AUTH_REQUIRED'|'AUTH_INVALID'|'AI_PERMISSION_DENIED'|'AI_QUOTA_EXCEEDED'|'AI_BAD_REQUEST'|'AI_INTERNAL_ERROR'=} code Código estable.
 * @property {'cors'|'auth'|'permission'|'quota'|'validation'|'server'=} type Tipo estable. Un HTTP 403 con type='cors' significa origen no permitido; con type='permission' significa usuario/rol/empresa sin permiso.
 * @property {Record<string, unknown>=} release Metadata de versión del backend.
 */

// ── Zod input schemas (zero-trust validation) ────────────────────────────────

const MAX_PROMPT_LENGTH = 12000;
const MAX_REQUESTED_DOCUMENTS = 25;
const MAX_CORRELATION_ID_LENGTH = 160;
const COMPANY_ID_PATTERN = /^[A-Za-z0-9_-]{1,160}$/;

const CompanyIdSchema = z.string()
  .trim()
  .min(1, 'companyId es obligatorio para usar IA.')
  .max(160, 'companyId inválido.')
  .regex(COMPANY_ID_PATTERN, 'companyId inválido.');

const CorrelationIdSchema = z.string()
  .trim()
  .min(1, 'correlationId inválido.')
  .max(MAX_CORRELATION_ID_LENGTH, `correlationId no puede exceder ${MAX_CORRELATION_ID_LENGTH} caracteres.`)
  .optional();

const DocumentIdArraySchema = z.array(
  z.string().trim().min(1, 'Todos los documentIds deben ser válidos.').max(160, 'documentId inválido.'),
)
  .max(MAX_REQUESTED_DOCUMENTS, `No se permiten más de ${MAX_REQUESTED_DOCUMENTS} documentIds por consulta.`)
  .transform((items) => [...new Set(items)]);

const StoragePathArraySchema = z.array(
  z.string().trim().min(1, 'Todas las rutas de documento deben ser válidas.').max(500, 'Ruta de documento inválida.'),
)
  .max(MAX_REQUESTED_DOCUMENTS, `No se permiten más de ${MAX_REQUESTED_DOCUMENTS} rutas de documento por consulta.`)
  .transform((items) => [...new Set(items)]);

export const InvokeLLMSchema = z.object({
  companyId: CompanyIdSchema,
  prompt: z.string()
    .trim()
    .min(1, 'El prompt es obligatorio para usar IA.')
    .max(MAX_PROMPT_LENGTH, `El prompt no puede exceder ${MAX_PROMPT_LENGTH} caracteres.`),
  documentIds: DocumentIdArraySchema.optional(),
  storagePaths: StoragePathArraySchema.optional(),
  correlationId: CorrelationIdSchema,
  response_json_schema: z.record(z.unknown()).optional(),
  integration: z.string().trim().min(1, 'Integración inválida.').max(80, 'Integración inválida.').optional(),
  release: z.record(z.unknown()).optional(),
}).strict();

export const InvokeFunctionSchema = z.object({
  name: z.string()
    .trim()
    .min(1, 'Nombre de función inválido.')
    .max(80, 'Nombre de función inválido.')
    .regex(/^[A-Za-z0-9_-]+$/, 'Nombre de función inválido.'),
  payload: z.record(z.unknown()).optional(),
}).strict();

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

/** @returns {AiHttpRequestBody} */
function shapeInvokeLlmPayload(data, correlationId) {
  return {
    companyId: data.companyId,
    prompt: data.prompt,
    ...(data.documentIds?.length ? { documentIds: data.documentIds } : {}),
    ...(data.storagePaths?.length ? { storagePaths: data.storagePaths } : {}),
    ...(data.response_json_schema ? { response_json_schema: data.response_json_schema } : {}),
    ...(data.integration ? { integration: data.integration } : {}),
    correlationId,
    release: getReleaseMetadata(),
  };
}

function shapeInvokeFunctionPayload(payload = {}, correlationId) {
  return {
    ...payload,
    correlationId,
    release: getReleaseMetadata(),
  };
}

// ── AI LLM call (no database mutation access) ────────────────────────────────

/**
 * Ejecuta explícitamente una petición HTTP POST /api/ai.
 * Secuencia visible: valida datos, obtiene token Firebase, construye body, llama fetch, lee texto, parsea JSON, distingue éxito/error.
 * @param {AiHttpRequestBody} params
 * @returns {Promise<AiHttpSuccessResponse>}
 */
export async function invokeLLM(params = {}) {
  const parsed = InvokeLLMSchema.safeParse(params);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || 'Parámetros de IA inválidos.');
  }

  const correlationId = ensureCorrelationId(parsed.data.correlationId, 'ai');
  const endpoint = getSafeAiEndpoint();
  const httpRequestBody = shapeInvokeLlmPayload(parsed.data, correlationId);
  const authHeader = await getAuthHeader();
  const httpRequest = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Correlation-Id': correlationId,
      ...authHeader,
    },
    body: JSON.stringify(httpRequestBody),
  };

  logFrontendEvent('ai_http_request_started', { correlationId, endpoint, method: httpRequest.method });
  const response = await fetch(endpoint, httpRequest);
  logFrontendEvent('ai_http_response_received', { correlationId, status: response.status, ok: response.ok });

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
    const errorType = payload?.type || (response.status === 403 ? 'permission' : 'server');
    const errorCode = payload?.code || (response.status === 403 ? 'AI_PERMISSION_DENIED' : 'AI_INTERNAL_ERROR');
    const message = payload?.error || payload?.message || `Error HTTP ${response.status} al llamar IA.`;
    logFrontendEvent('ai_request_failed', { correlationId, status: response.status, errorType, errorCode, message }, 'error');
    await persistObservabilityEvent('ai_request_failed', {
      correlationId,
      severity: 'ERROR',
      source: 'frontend',
      status: response.status,
      message,
    }).catch(() => null);
    const error = new Error(`${message} (correlationId: ${correlationId})`);
    error.status = response.status;
    error.code = errorCode;
    error.type = errorType;
    error.payload = payload;
    throw error;
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

  const correlationId = ensureCorrelationId(parsed.data.payload?.correlationId, parsed.data.name || 'fn');
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

  const safeFunctionName = encodeURIComponent(parsed.data.name);
  if (!safeFunctionName) throw new Error('Nombre de función inválido.');

  const response = await fetch(`${endpoint.replace(/\/$/, '')}/${safeFunctionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Correlation-Id': correlationId,
      ...(await getAuthHeader()),
    },
    body: JSON.stringify(shapeInvokeFunctionPayload(parsed.data.payload, correlationId)),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error || data?.message || `No se pudo ejecutar ${name}.`;
    logFrontendEvent('function_request_failed', { correlationId, functionName: name, status: response.status, message }, 'error');
    const error = new Error(`${message} (correlationId: ${correlationId})`);
    error.status = response.status;
    error.code = data?.code;
    error.type = data?.type;
    error.payload = data;
    throw error;
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
