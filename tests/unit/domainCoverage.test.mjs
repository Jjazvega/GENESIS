import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DOMAIN_COVERAGE,
  DOMAIN_NAMES,
  getCoveredCompanyQueriesByDomain,
  getCoveredEntitiesByDomain,
} from '../../src/lib/domainCoverage.js';
import { ENTITY_COLLECTIONS } from '../../src/infrastructure/firebase/repositories/entityCollections.js';

const EXPECTED_COMPANY_QUERIES = Object.freeze([
  'transactions',
  'documents',
  'auditLogs',
  'aiConversations',
]);

describe('domain coverage map', () => {
  it('covers every Firebase entity from an explicit business domain', () => {
    const coveredEntities = getCoveredEntitiesByDomain();
    const missingEntities = Object.keys(ENTITY_COLLECTIONS)
      .filter((entityName) => !coveredEntities.has(entityName));

    assert.deepEqual(missingEntities, []);
  });

  it('covers every multi-company query from an explicit business domain', () => {
    const coveredQueries = getCoveredCompanyQueriesByDomain();
    const missingQueries = EXPECTED_COMPANY_QUERIES
      .filter((queryName) => !coveredQueries.has(queryName));

    assert.deepEqual(missingQueries, []);
  });

  it('keeps domain entries auditable and non-empty', () => {
    for (const domainName of DOMAIN_NAMES) {
      const domain = DOMAIN_COVERAGE[domainName];

      assert.equal(typeof domain.label, 'string');
      assert.ok(domain.label.length > 0);
      assert.ok(domain.entities.length > 0, `${domainName} debe declarar entidades`);
      assert.ok(Array.isArray(domain.companyQueries), `${domainName} debe declarar queries multiempresa`);
    }
  });
});
