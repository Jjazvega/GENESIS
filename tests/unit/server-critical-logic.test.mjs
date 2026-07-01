import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

const require = createRequire(import.meta.url);
const { composeAiPrompt, normalizeDocumentContext } = require('../../functions/services/ai/context/composeAiContext.js');
const { normalizeApprovalPolicy, validateDocumentUploadPayload } = require('../../functions/services/domain/domainPolicy.js');

describe('server-side critical logic', () => {
  it('normalizes AI context on the backend using tenant-validated document metadata', () => {
    const prompt = composeAiPrompt({
      prompt: '  Resume   este documento  ',
      authorization: {
        companyId: 'company_123',
        role: 'admin',
        documents: [{ id: 'doc_1', title: 'Factura Junio', status: 'pending', contentType: 'application/pdf', fileType: 'pdf' }],
      },
    });

    assert.match(prompt, /Contexto server-side validado/);
    assert.match(prompt, /Empresa validada: company_123/);
    assert.match(prompt, /1\. Factura Junio \[doc_1\] estado=pending tipo=pdf/);
    assert.match(prompt, /Solicitud del usuario:\nResume este documento/);
  });

  it('sanitizes document context fields before they reach the model prompt', () => {
    assert.deepEqual(normalizeDocumentContext({ id: '  doc\n1  ', title: '  Mi   PDF  ' }), {
      id: 'doc 1',
      title: 'Mi PDF',
      status: 'unknown',
      contentType: 'unknown',
      fileType: 'unknown',
    });
  });

  it('validates document upload policies on the backend', () => {
    const result = validateDocumentUploadPayload({
      companyId: 'company_123',
      documentId: 'doc_123',
      fileName: 'Factura Junio 2026.pdf',
      fileType: 'pdf',
      contentType: 'application/pdf',
      fileSize: 1024,
      role: 'admin',
    });

    assert.equal(result.fileName, 'Factura_Junio_2026.pdf');
    assert.equal(result.companyId, 'company_123');
  });

  it('calculates approval policy for sensitive costs on the backend', () => {
    assert.deepEqual(normalizeApprovalPolicy({ amountUsd: 1200, role: 'analyst' }), {
      amountUsd: 1200,
      requiresApproval: true,
      approved: false,
      thresholdUsd: 1000,
    });
  });
});

const { enforceFraudPolicy, enforceBudgetPolicy, normalizePromptFingerprint } = require('../../functions/services/ai/limits/enforceAiRiskControls.js');

describe('server-side fraud and budget enforcement', () => {
  it('blocks repeated prompts on the backend before provider execution', () => {
    assert.throws(() => enforceFraudPolicy({
      fraudData: {
        lastPromptFingerprint: normalizePromptFingerprint('same prompt'),
        repeatedPromptCount: 4,
        windowStartedAtMs: Date.parse('2026-07-01T10:00:00.000Z'),
      },
      prompt: 'same   prompt',
      now: new Date('2026-07-01T10:01:00.000Z'),
      correlationId: 'fraud-test',
      user: { uid: 'user_1' },
      authorization: { companyId: 'company_123' },
      config: { repeatedPromptThreshold: 5, fraudWindowMs: 600000, laborStartHourUtc: 8, laborEndHourUtc: 20, offHoursLimit: 20 },
    }), /patrón repetitivo/);
  });

  it('blocks backend budget overages independently of client estimates', () => {
    assert.throws(() => enforceBudgetPolicy({
      budgetData: { dailyBudgetUsd: 1 },
      usageData: { budgetUsedUsd: 0.75, reservedBudgetUsd: 0.1 },
      estimatedCostUsd: 0.2,
      estimatedTokens: 100,
    }), /Presupuesto diario IA configurado/);
  });
});
