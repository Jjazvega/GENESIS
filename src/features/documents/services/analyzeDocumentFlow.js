// @ts-check

import firebase, { isAiDisabledResponse } from '@/api/firebaseClient';
import { logAction } from '@/lib/auditLogger';
import { DOCUMENT_STATUSES } from '@/features/documents/constants/documentStatuses';
import { ensureCorrelationId, getReleaseMetadata, logFrontendEvent } from '@/lib/observability';

import { askLLM } from '@/modules/ai/aiService';

const AI_RESULT_FIELDS = new Set([
  'docType',
  'rfc_emisor',
  'rfc_receptor',
  'subtotal',
  'iva',
  'total',
  'currency',
  'docDate',
  'concepts',
  'ai_summary',
  'ai_classification',
  'tags',
]);

function pickAiResultFields(result = {}) {
  if (!result || typeof result !== 'object') return {};
  return Object.fromEntries(Object.entries(result).filter(([key]) => AI_RESULT_FIELDS.has(key)));
}

function validateDocumentReadyForAi({ doc, company }) {
  if (!company?.id) throw new Error('Necesitas una empresa activa para analizar documentos.');
  if (doc.companyId !== company.id) throw new Error('El documento no pertenece a la empresa activa.');
  if (!doc.storagePath || !String(doc.storagePath).startsWith(`companies/${company.id}/documents/${doc.id}/`)) {
    throw new Error('El documento no tiene una ruta interna válida para esta empresa.');
  }
  if (!['pdf', 'xml'].includes(String(doc.fileType || '').toLowerCase())) {
    throw new Error('Solo se pueden analizar documentos PDF o XML validados.');
  }
}

function getErrorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export async function analyzeDocumentFlow({ doc, company, user, correlationId: providedCorrelationId }) {
  if (!doc?.id) throw new Error('Documento inválido.');
  validateDocumentReadyForAi({ doc, company });

  const correlationId = ensureCorrelationId(providedCorrelationId || doc.correlationId, 'doc_ai');

  await firebase.entities.Document.update(doc.id, {
    status: DOCUMENT_STATUSES.PROCESSING,
    aiDisabled: false,
    errorMessage: null,
    correlationId,
    release: getReleaseMetadata(),
  });

  try {
    const result = await askLLM({
      companyId: company.id,
      prompt: `Analiza este documento fiscal/financiero mexicano. Extrae toda la información posible:
        - Tipo de documento (factura, nota de crédito, recibo, contrato, estado de cuenta, declaración, nómina, otro)
        - RFC emisor y receptor
        - Subtotal, IVA, Total
        - Moneda
        - Fecha del documento
        - Conceptos/líneas de detalle
        - Resumen general
        - Clasificación y etiquetas relevantes

        El archivo está en: ${doc.storagePath}
        Nombre: ${doc.title}`,
      documentIds: [doc.id],
      storagePaths: [doc.storagePath],
      correlationId,
      response_json_schema: {
        type: 'object',
        properties: {
          docType: { type: 'string', enum: ['factura', 'nota_credito', 'recibo', 'contrato', 'estado_cuenta', 'declaración', 'nómina', 'otro'] },
          rfc_emisor: { type: 'string' },
          rfc_receptor: { type: 'string' },
          subtotal: { type: 'number' },
          iva: { type: 'number' },
          total: { type: 'number' },
          currency: { type: 'string' },
          docDate: { type: 'string' },
          concepts: { type: 'array', items: { type: 'object', properties: { description: { type: 'string' }, quantity: { type: 'number' }, unit_price: { type: 'number' }, amount: { type: 'number' } } } },
          ai_summary: { type: 'string' },
          ai_classification: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
        },
      },
    });

    if (isAiDisabledResponse(result)) {
      const message = result?.message || result?.summary || 'IA no configurada. Configura un backend seguro para analizar documentos.';

      await firebase.entities.Document.update(doc.id, {
        status: result?.documentStatus || DOCUMENT_STATUSES.AI_DISABLED,
        aiDisabled: true,
        ai_summary: message,
        errorMessage: `${message} (correlationId: ${correlationId})`,
        correlationId,
      });

      return { status: 'ai_disabled', message };
    }

    await firebase.entities.Document.update(doc.id, {
      ...pickAiResultFields(result),
      status: DOCUMENT_STATUSES.ANALYZED,
      aiDisabled: false,
      errorMessage: null,
      correlationId,
      release: getReleaseMetadata(),
    });

    await logAction({
      companyId: company?.id,
      userEmail: user?.email,
      userName: user?.fullName,
      action: 'document_analyze',
      entityType: 'Document',
      entityId: doc.id,
      details: `Analizado: ${doc.title}`,
      correlationId,
    });

    return { status: 'analyzed', result, correlationId };
  } catch (error) {
    const message = getErrorMessage(error, 'No se pudo analizar el documento.');
    await firebase.entities.Document.update(doc.id, {
      status: DOCUMENT_STATUSES.ERROR,
      errorMessage: `${message} (correlationId: ${correlationId})`,
      correlationId,
    });
    logFrontendEvent('document_analyze_failed', { correlationId, documentId: doc.id, companyId: company?.id, message }, 'error');
    throw error;
  }
}
