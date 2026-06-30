import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeObjectFilters } from '../../src/infrastructure/firebase/repositories/filterValidation.js';

describe('repository object filter validation', () => {
  it('drops empty sentinel values before building Firestore constraints', () => {
    assert.deepEqual(
      normalizeObjectFilters({
        companyId: 'company-1',
        status: 'active',
        type: 'all',
        optional: undefined,
        deletedAt: null,
      }, 'documents'),
      [
        ['companyId', 'company-1'],
        ['status', 'active'],
      ],
    );
  });

  it('rejects object filters with no explicit criteria', () => {
    assert.throws(
      () => normalizeObjectFilters({ status: 'all', ownerUid: undefined }, 'companyMembers'),
      /Filtro vacío rechazado para companyMembers/,
    );
  });

  it('rejects array filters until IN query indexing and chunking are audited', () => {
    assert.throws(
      () => normalizeObjectFilters({ companyId: 'company-1', status: ['active', 'pending'] }, 'companyMembers'),
      /Filtro array no soportado en companyMembers\.status/,
    );
  });
});
