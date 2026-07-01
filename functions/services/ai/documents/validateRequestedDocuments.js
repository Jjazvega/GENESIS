const admin = require('firebase-admin');
const { fail } = require('../../../policies/httpPolicy');
const { MAX_REQUESTED_DOCUMENTS } = require('../shared/config');

function normalizeRequestedList(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) fail(400, 'Los documentos solicitados deben enviarse como arreglo.');
  const cleaned = value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean);
  if (cleaned.length !== value.length) fail(400, 'Todos los documentos solicitados deben ser identificadores válidos.');
  return [...new Set(cleaned)];
}
function getRequestedDocuments(body = {}) {
  const documentIds = normalizeRequestedList(body.documentIds || body.contextDocumentIds || body.context_documents);
  const storagePaths = normalizeRequestedList(body.storagePaths);
  if (documentIds.length + storagePaths.length > MAX_REQUESTED_DOCUMENTS) fail(400, `No se pueden solicitar más de ${MAX_REQUESTED_DOCUMENTS} documentos por consulta IA.`);
  return { documentIds, storagePaths };
}
async function validateRequestedDocuments({ companyId, documentIds, storagePaths }) {
  const documentRefs = [];
  const seenDocIds = new Set();
  for (const documentId of documentIds) {
    const docSnap = await admin.firestore().collection('documents').doc(documentId).get();
    if (!docSnap.exists) fail(403, 'Documento solicitado no válido o sin acceso.');
    const data = docSnap.data() || {};
    if (data.companyId !== companyId) fail(403, 'Documento solicitado no pertenece a la empresa validada.');
    if (!seenDocIds.has(docSnap.id)) { seenDocIds.add(docSnap.id); documentRefs.push({ id: docSnap.id, ...data }); }
  }
  for (const storagePath of storagePaths) {
    const querySnap = await admin.firestore().collection('documents').where('companyId', '==', companyId).where('storagePath', '==', storagePath).limit(1).get();
    if (querySnap.empty) fail(403, 'Ruta de documento solicitada no válida o sin acceso.');
    const docSnap = querySnap.docs[0];
    if (!seenDocIds.has(docSnap.id)) { seenDocIds.add(docSnap.id); documentRefs.push({ id: docSnap.id, ...(docSnap.data() || {}) }); }
  }
  return documentRefs;
}
module.exports = { normalizeRequestedList, getRequestedDocuments, validateRequestedDocuments };
