import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const source = await readFile(new URL('../../src/lib/companyContext.jsx', import.meta.url), 'utf8');

describe('sincronización de claims de empresa activa', () => {
  it('refresca forzosamente el ID token Firebase después de sincronizar claims', () => {
    assert.match(source, /import \{ getCurrentUser \} from '@\/infrastructure\/firebase\/auth';/);
    assert.match(source, /const currentUser = getCurrentUser\(\);/);
    assert.match(source, /await currentUser\.getIdToken\(true\);/);
    assert.match(source, /await currentUser\.getIdTokenResult\(true\)/);
    assert.match(source, /await firebase\.functions\.invoke\('syncCompanyClaims', \{ companyId: company\.id \}\);\n\s+await refreshActiveCompanyIdToken\(company\.id\);/);
  });
});
