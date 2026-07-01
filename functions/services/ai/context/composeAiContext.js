const MAX_DOCUMENT_CONTEXT_ITEMS = 5;

function normalizeText(value, maxLength = 1000) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function normalizeDocumentContext(doc = {}) {
  return {
    id: normalizeText(doc.id, 160),
    title: normalizeText(doc.title || doc.name || doc.fileName || 'Documento sin título', 180),
    status: normalizeText(doc.status || 'unknown', 40),
    contentType: normalizeText(doc.contentType || 'unknown', 80),
    fileType: normalizeText(doc.fileType || 'unknown', 20),
  };
}

function composeAiPrompt({ prompt, authorization }) {
  const normalizedPrompt = normalizeText(prompt, 12000);
  const documents = Array.isArray(authorization?.documents)
    ? authorization.documents.slice(0, MAX_DOCUMENT_CONTEXT_ITEMS).map(normalizeDocumentContext)
    : [];
  const contextLines = [
    `Empresa validada: ${normalizeText(authorization?.companyId, 128)}`,
    `Rol validado: ${normalizeText(authorization?.role || 'owner', 40)}`,
    `Documentos validados: ${documents.length}`,
    ...documents.map((doc, index) => `${index + 1}. ${doc.title} [${doc.id}] estado=${doc.status} tipo=${doc.fileType || doc.contentType}`),
  ];

  return [
    'Contexto server-side validado por GEMAILLA:',
    ...contextLines,
    '',
    'Solicitud del usuario:',
    normalizedPrompt,
  ].join('\n');
}

module.exports = { MAX_DOCUMENT_CONTEXT_ITEMS, composeAiPrompt, normalizeDocumentContext };
