// @ts-check

import { auth, storage } from '@/firebase';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { ensureCorrelationId, logFrontendEvent } from '@/lib/observability';
import { validateDocumentFileContent } from '@/security/documentFileValidation';

function getCurrentUser() {
  return auth.currentUser || null;
}

function sanitizeFileName(name = 'archivo') {
  return String(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 160) || 'archivo';
}

function sanitizePathSegment(value, fallback) {
  return sanitizeFileName(value).replace(/\.+/g, '.').replace(/^\.+|\.+$/g, '') || fallback;
}

/**
 * @param {{ file?: File, companyId?: string, documentId?: string, folder?: string, correlationId?: string }} [params]
 */
export async function uploadFile({ file, companyId, documentId, folder = 'documents', correlationId: providedCorrelationId } = {}) {
  if (!file) throw new Error('No se recibió ningún archivo para subir.');

  const correlationId = ensureCorrelationId(providedCorrelationId, 'storage');
  const user = getCurrentUser();
  if (!user) throw new Error('Debes iniciar sesión para subir archivos.');

  const { contentType } = await validateDocumentFileContent(file);

  const safeName = sanitizeFileName(file.name);
  const safeCompanyId = sanitizePathSegment(String(companyId || '').trim(), '');
  if (!safeCompanyId) {
    throw new Error('No se puede subir el archivo sin una empresa activa. Falta companyId.');
  }

  const safeFolder = folder === 'documents' ? 'documents' : 'documents';
  const safeDocumentId = sanitizePathSegment(documentId || '', '');
  if (!safeDocumentId) {
    throw new Error('No se puede subir el archivo sin un ID de documento preasignado.');
  }
  const storagePath = `companies/${safeCompanyId}/${safeFolder}/${safeDocumentId}/${safeName}`;
  const storageRef = ref(storage, storagePath);

  await uploadBytes(storageRef, file, {
    contentType,
    customMetadata: {
      correlationId,
      companyId: safeCompanyId,
      documentId: safeDocumentId,
      uploadedBy: user.uid || '',
    },
  });

  logFrontendEvent('document_storage_uploaded', {
    correlationId,
    companyId: safeCompanyId,
    documentId: safeDocumentId,
    contentType,
    fileSize: file.size,
  });

  return {
    storagePath,
    fileName: file.name,
    contentType,
    fileSize: file.size,
    correlationId,
  };
}

export async function getDocumentAccessUrl(storagePath) {
  const safeStoragePath = String(storagePath || '').trim();
  if (!safeStoragePath) {
    throw new Error('No se puede abrir el documento sin storagePath.');
  }

  const allowedDocumentPath = /^companies\/[^/]+\/documents\/[^/]+\/.+$/;
  if (!allowedDocumentPath.test(safeStoragePath) || /^https?:\/\//i.test(safeStoragePath)) {
    throw new Error('Ruta de documento inválida. Usa storagePath interno, no URLs públicas.');
  }

  const fileRef = ref(storage, safeStoragePath);
  return getDownloadURL(fileRef);
}
