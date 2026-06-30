import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateDocumentFileContent } from '../../src/security/documentFileValidation.js';

function fileLike({ name, type, content }) {
  const blob = new Blob([content], { type });
  return {
    name,
    type,
    size: blob.size,
    slice: blob.slice.bind(blob),
  };
}

describe('validación endurecida PDF/XML', () => {
  it('acepta PDF con firma válida', async () => {
    const metadata = await validateDocumentFileContent(fileLike({ name: 'factura.pdf', type: 'application/pdf', content: '%PDF-1.7\nbody' }));
    assert.equal(metadata.fileType, 'pdf');
    assert.equal(metadata.contentType, 'application/pdf');
  });

  it('rechaza PDF sin firma mágica', async () => {
    await assert.rejects(
      () => validateDocumentFileContent(fileLike({ name: 'factura.pdf', type: 'application/pdf', content: '<xml />' })),
      /firma del archivo/,
    );
  });

  it('rechaza XML con entidades externas', async () => {
    await assert.rejects(
      () => validateDocumentFileContent(fileLike({ name: 'factura.xml', type: 'application/xml', content: '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><foo />' })),
      /DOCTYPE\/ENTITY/,
    );
  });
});
