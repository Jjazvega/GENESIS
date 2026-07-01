import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateDocumentFileContent, validateDocumentStoragePath } from '../../src/security/documentFileValidation.js';

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

describe('validación de storagePath interno', () => {
  it('acepta rutas internas vinculadas a empresa y documento', () => {
    assert.equal(
      validateDocumentStoragePath('companies/acme/documents/doc-123/factura.pdf', { companyId: 'acme', documentId: 'doc-123' }),
      'companies/acme/documents/doc-123/factura.pdf',
    );
  });

  it('rechaza URLs públicas o rutas de otra empresa', () => {
    assert.throws(
      () => validateDocumentStoragePath('https://storage.example/doc.pdf', { companyId: 'acme', documentId: 'doc-123' }),
      /storagePath interno/,
    );
    assert.throws(
      () => validateDocumentStoragePath('companies/other/documents/doc-123/factura.pdf', { companyId: 'acme', documentId: 'doc-123' }),
      /empresa activa/,
    );
  });
});
