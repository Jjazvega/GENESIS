const MAX_CORRELATION_ID_LENGTH = 160;
const MAX_LOG_STRING_LENGTH = 500;
const MAX_LOG_DEPTH = 5;
const MAX_LOG_ARRAY_LENGTH = 20;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const TOKEN_PATTERN = /(bearer\s+|token['"\s:=]+|api[_-]?key['"\s:=]+|secret['"\s:=]+)[A-Za-z0-9._~+/=-]{12,}/gi;
const SENSITIVE_KEY_PATTERN = /(authorization|api[_-]?key|secret|token|password|prompt|content|document(Content|Text)?|raw(Document)?|file(Name)?|storagePath|downloadUrl|url|query|response|rfc|email)$/i;
const ERROR_REDACT_KEY_ALLOWLIST = new Set(['name', 'message', 'stack']);

export const OBSERVABILITY_LIMITS = Object.freeze({
  maxCorrelationIdLength: MAX_CORRELATION_ID_LENGTH,
  maxLogStringLength: MAX_LOG_STRING_LENGTH,
  maxLogDepth: MAX_LOG_DEPTH,
  maxLogArrayLength: MAX_LOG_ARRAY_LENGTH,
});

export const OBSERVABILITY_EVENT_POLICIES = Object.freeze({
  frontend_error: { minSeverity: 'ERROR', persist: true, sampleRate: 1, retentionDays: 30 },
  ai_request_failed: { minSeverity: 'ERROR', persist: true, sampleRate: 1, retentionDays: 30 },
  ai_request_completed: { minSeverity: 'INFO', persist: false, sampleRate: 0.1, retentionDays: 7 },
  function_request_failed: { minSeverity: 'ERROR', persist: true, sampleRate: 1, retentionDays: 30 },
  document_upload_started: { minSeverity: 'INFO', persist: false, sampleRate: 0.1, retentionDays: 7 },
  document_upload_completed: { minSeverity: 'INFO', persist: false, sampleRate: 0.25, retentionDays: 14 },
  document_upload_failed: { minSeverity: 'ERROR', persist: true, sampleRate: 1, retentionDays: 30 },
  document_analyze_started: { minSeverity: 'INFO', persist: false, sampleRate: 0.1, retentionDays: 7 },
  document_analyze_completed: { minSeverity: 'INFO', persist: false, sampleRate: 0.25, retentionDays: 14 },
  document_analyze_failed: { minSeverity: 'ERROR', persist: true, sampleRate: 1, retentionDays: 30 },
});

const SEVERITY_RANK = Object.freeze({
  DEBUG: 10,
  INFO: 20,
  NOTICE: 25,
  WARNING: 30,
  WARN: 30,
  ERROR: 40,
  CRITICAL: 50,
  ALERT: 60,
  EMERGENCY: 70,
});

export function createCorrelationId(prefix = 'op') {
  const randomValue = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${randomValue}`;
}

export function ensureCorrelationId(value, prefix = 'op') {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!candidate) return createCorrelationId(prefix);

  const safeValue = candidate
    .replace(/[^a-zA-Z0-9._:-]/g, '_')
    .slice(0, MAX_CORRELATION_ID_LENGTH);

  return safeValue || createCorrelationId(prefix);
}

function redactString(value) {
  return value
    .replace(EMAIL_PATTERN, '[REDACTED_EMAIL]')
    .replace(TOKEN_PATTERN, '$1[REDACTED_SECRET]')
    .slice(0, MAX_LOG_STRING_LENGTH);
}

function shouldRedactKey(key) {
  return SENSITIVE_KEY_PATTERN.test(key);
}

export function sanitizeObservabilityPayload(value, depth = 0, key = '') {
  if (value === null || value === undefined) return value;
  if (depth > MAX_LOG_DEPTH) return '[MAX_DEPTH]';

  if (typeof value === 'string') {
    if (shouldRedactKey(key)) return value ? '[REDACTED]' : '';
    return redactString(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_LOG_ARRAY_LENGTH)
      .map((item) => sanitizeObservabilityPayload(item, depth + 1, key));
  }

  if (typeof value === 'object') {
    const sanitized = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
      if (shouldRedactKey(entryKey) && !(key === 'error' && ERROR_REDACT_KEY_ALLOWLIST.has(entryKey))) {
        sanitized[entryKey] = entryValue ? '[REDACTED]' : entryValue;
        continue;
      }
      sanitized[entryKey] = sanitizeObservabilityPayload(entryValue, depth + 1, entryKey);
    }
    return sanitized;
  }

  return String(value);
}

export function getObservabilityEventPolicy(eventName, severity = 'INFO') {
  const normalizedSeverity = String(severity || 'INFO').toUpperCase();
  const configuredPolicy = OBSERVABILITY_EVENT_POLICIES[eventName] || {};
  const severityRank = SEVERITY_RANK[normalizedSeverity] || SEVERITY_RANK.INFO;
  const minSeverity = configuredPolicy.minSeverity || (severityRank >= SEVERITY_RANK.ERROR ? 'ERROR' : 'INFO');

  return {
    minSeverity,
    persist: configuredPolicy.persist ?? severityRank >= SEVERITY_RANK.ERROR,
    sampleRate: configuredPolicy.sampleRate ?? (severityRank >= SEVERITY_RANK.ERROR ? 1 : 0.1),
    retentionDays: configuredPolicy.retentionDays ?? (severityRank >= SEVERITY_RANK.ERROR ? 30 : 7),
  };
}
