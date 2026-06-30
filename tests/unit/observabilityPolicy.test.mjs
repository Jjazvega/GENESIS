import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  OBSERVABILITY_LIMITS,
  ensureCorrelationId,
  getObservabilityEventPolicy,
  sanitizeObservabilityPayload,
} from '../../src/lib/observabilityPolicy.js';

describe('observability policy', () => {
  it('normalizes correlation IDs without changing already valid IDs', () => {
    assert.equal(ensureCorrelationId(' ai:request.123 ', 'ai'), 'ai:request.123');
    assert.equal(ensureCorrelationId('ai request/123', 'ai'), 'ai_request_123');
  });

  it('generates bounded correlation IDs for missing or abusive values', () => {
    const generated = ensureCorrelationId('', 'doc');
    assert.match(generated, /^doc_/);

    const oversized = ensureCorrelationId('a'.repeat(OBSERVABILITY_LIMITS.maxCorrelationIdLength + 50), 'ai');
    assert.equal(oversized.length, OBSERVABILITY_LIMITS.maxCorrelationIdLength);
  });

  it('redacts PII, prompts, document content, file names, URLs, tokens and secrets', () => {
    const sanitized = sanitizeObservabilityPayload({
      email: 'cliente@example.com',
      prompt: 'Analiza este documento financiero completo',
      documentText: 'Texto completo del PDF',
      fileName: 'estado-cuenta-enero.pdf',
      downloadUrl: 'https://storage.example.com/signed-url',
      message: 'usuario cliente@example.com usó bearer abcdefghijklmnopqrstuvwxyz',
      nested: { apiKey: 'sensitive-api-key-placeholder' },
    });

    assert.equal(sanitized.email, '[REDACTED]');
    assert.equal(sanitized.prompt, '[REDACTED]');
    assert.equal(sanitized.documentText, '[REDACTED]');
    assert.equal(sanitized.fileName, '[REDACTED]');
    assert.equal(sanitized.downloadUrl, '[REDACTED]');
    assert.equal(sanitized.nested.apiKey, '[REDACTED]');
    assert.equal(sanitized.message, 'usuario [REDACTED_EMAIL] usó bearer [REDACTED_SECRET]');
  });

  it('limits log cardinality by truncating long strings, arrays and deep objects', () => {
    const sanitized = sanitizeObservabilityPayload({
      longValue: 'x'.repeat(OBSERVABILITY_LIMITS.maxLogStringLength + 10),
      rows: Array.from({ length: OBSERVABILITY_LIMITS.maxLogArrayLength + 5 }, (_, index) => index),
      level1: { level2: { level3: { level4: { level5: { level6: { level7: 'too deep' } } } } } },
    });

    assert.equal(sanitized.longValue.length, OBSERVABILITY_LIMITS.maxLogStringLength);
    assert.equal(sanitized.rows.length, OBSERVABILITY_LIMITS.maxLogArrayLength);
    assert.equal(sanitized.level1.level2.level3.level4.level5.level6, '[MAX_DEPTH]');
  });

  it('keeps failed events persisted and marks high-volume success events as sampled console-only data', () => {
    assert.deepEqual(getObservabilityEventPolicy('ai_request_failed', 'ERROR'), {
      minSeverity: 'ERROR',
      persist: true,
      sampleRate: 1,
      retentionDays: 30,
    });

    assert.deepEqual(getObservabilityEventPolicy('ai_request_completed', 'INFO'), {
      minSeverity: 'INFO',
      persist: false,
      sampleRate: 0.1,
      retentionDays: 7,
    });
  });
});
