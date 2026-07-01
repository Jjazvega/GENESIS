const { RELEASE_METADATA } = require('./config');

const MAX_LOG_STRING_LENGTH = 500;
const MAX_LOG_DEPTH = 5;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const TOKEN_PATTERN = /(bearer\s+|token['"\s:=]+|api[_-]?key['"\s:=]+|secret['"\s:=]+)[A-Za-z0-9._~+/=-]{12,}/gi;
const SENSITIVE_KEY_PATTERN = /(authorization|api[_-]?key|secret|token|password|prompt|content|document(Content|Text)?|raw(Document)?|file(Name)?|storagePath|downloadUrl|url|query|response|rfc|email)$/i;

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
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      SENSITIVE_KEY_PATTERN.test(entryKey) ? (entryValue ? '[REDACTED]' : entryValue) : sanitizeLogPayload(entryValue, depth + 1, entryKey),
    ]));
  }
  return String(value);
}

function structuredLog(severity, eventName, payload = {}) {
  const entry = sanitizeLogPayload({ severity, eventName, timestamp: new Date().toISOString(), ...RELEASE_METADATA, ...payload });
  const line = JSON.stringify(entry);
  if (severity === 'ERROR' || severity === 'CRITICAL') console.error(line);
  else if (severity === 'WARNING') console.warn(line);
  else console.log(line);
}

function createCorrelationId(prefix = 'srv') {
  const crypto = require('node:crypto');
  return `${prefix}_${crypto.randomUUID()}`;
}

module.exports = { structuredLog, sanitizeLogPayload, createCorrelationId };
