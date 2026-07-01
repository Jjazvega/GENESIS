import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  LEGACY_FIELD_MAP,
  normalizeData,
  normalizeFilters,
  normalizeKey,
} from '../../src/infrastructure/firebase/repositories/normalization.js';

describe('repository data normalization edge cases', () => {
  it('maps every documented legacy snake_case field to its canonical camelCase field', () => {
    for (const [legacyKey, canonicalKey] of Object.entries(LEGACY_FIELD_MAP)) {
      assert.equal(normalizeKey(legacyKey), canonicalKey, `${legacyKey} debe normalizar a ${canonicalKey}`);
    }

    assert.equal(normalizeKey('alreadyCanonical'), 'alreadyCanonical');
  });

  it('normalizes nested plain objects while preserving arrays and scalar values', () => {
    const input = {
      company_id: 'company-1',
      nested: {
        owner_uid: 'owner-1',
        due_date: '2026-07-01',
        untouched: true,
      },
      line_items: [
        { company_id: 'array-company-kept-as-is' },
        'scalar',
      ],
      amount: 0,
      active: false,
      missing: null,
    };

    assert.deepEqual(normalizeData(input), {
      companyId: 'company-1',
      nested: {
        ownerUid: 'owner-1',
        dueDate: '2026-07-01',
        untouched: true,
      },
      line_items: [
        { company_id: 'array-company-kept-as-is' },
        'scalar',
      ],
      amount: 0,
      active: false,
      missing: null,
    });
  });

  it('strips unsafe public URL aliases at every normalized object level', () => {
    assert.deepEqual(normalizeData({
      fileUrl: 'https://public.example/file.pdf',
      downloadUrl: 'https://public.example/download',
      downloadURL: 'https://public.example/download-url',
      file_url: 'https://public.example/legacy',
      publicUrl: 'https://public.example/public',
      nested: {
        fileUrl: 'https://nested.example/file.pdf',
        storagePath: 'companies/company-1/documents/doc-1/file.pdf',
      },
      storagePath: 'companies/company-1/documents/doc-1/file.pdf',
    }), {
      nested: {
        storagePath: 'companies/company-1/documents/doc-1/file.pdf',
      },
      storagePath: 'companies/company-1/documents/doc-1/file.pdf',
    });
  });

  it('returns non-object inputs unchanged and exposes normalizeFilters as the same normalization boundary', () => {
    assert.equal(normalizeData(null), null);
    assert.equal(normalizeData('company_id'), 'company_id');
    assert.deepEqual(normalizeData(['company_id']), ['company_id']);
    assert.deepEqual(normalizeFilters({ company_id: 'company-1', doc_type: 'factura' }), {
      companyId: 'company-1',
      docType: 'factura',
    });
  });
});
