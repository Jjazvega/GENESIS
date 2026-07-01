const admin = require('firebase-admin');
const { applyCors, enforceAllowedOrigin, fail } = require('../../policies/httpPolicy');
const { verifyFirebaseUser } = require('../ai/auth/verifyFirebaseUser');
const { validateCompanyAccess } = require('../ai/authorization/validateCompanyAccess');
const { validateDocumentUploadPayload } = require('../domain/domainPolicy');

function getCorrelationId(req) {
  return String(req.get?.('x-correlation-id') || req.body?.correlationId || `doc_${Date.now()}`).replace(/[^a-zA-Z0-9._:-]/g, '_').slice(0, 120);
}

async function prepareDocumentUploadHandler(req, res) {
  const correlationId = getCorrelationId(req);
  try {
    applyCors(req, res);
    enforceAllowedOrigin(req);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido. Usa POST.', correlationId });

    const user = await verifyFirebaseUser(req);
    const body = req.body || {};
    const access = await validateCompanyAccess({ user, companyId: body.companyId });
    const normalized = validateDocumentUploadPayload({ ...body, role: access.role });
    const storagePath = `companies/${normalized.companyId}/documents/${normalized.documentId}/${normalized.fileName}`;
    const documentRef = admin.firestore().collection('documents').doc(normalized.documentId);

    await admin.firestore().runTransaction(async (transaction) => {
      const snap = await transaction.get(documentRef);
      if (snap.exists) {
        const current = snap.data() || {};
        if (current.companyId !== normalized.companyId) fail(409, 'El documento ya existe para otra empresa.');
      }
      transaction.set(documentRef, {
        companyId: normalized.companyId,
        title: normalized.fileName,
        contentType: normalized.contentType,
        fileType: normalized.fileType,
        fileSize: normalized.fileSize,
        storagePath,
        status: 'uploading',
        correlationId,
        updatedAt: new Date().toISOString(),
        createdByUid: user.uid || 'unknown',
      }, { merge: true });
    });

    return res.status(200).json({ success: true, ...normalized, storagePath, status: 'uploading', correlationId });
  } catch (error) {
    const status = Number(error.status) || 500;
    return res.status(status).json({ error: error.message || 'No se pudo preparar la subida de documento.', correlationId });
  }
}

module.exports = { getCorrelationId, prepareDocumentUploadHandler };
