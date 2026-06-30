import firebase from '@/api/firebaseClient';
import { ensureCorrelationId, getReleaseMetadata } from '@/lib/observability';

export async function logAction({ companyId, userEmail, userName, action, entityType, entityId, details, correlationId }) {
  try {
    const normalizedCorrelationId = ensureCorrelationId(correlationId, 'audit');
    await firebase.entities.AuditLog.create({
      companyId: companyId || '',
      userEmail: userEmail || '',
      userName: userName || '',
      action,
      entity_type: entityType || '',
      entity_id: entityId || '',
      details: details || '',
      correlationId: normalizedCorrelationId,
      release: getReleaseMetadata(),
    });
  } catch (error) {
    console.error('[auditLogger] No se pudo registrar la auditoria:', error);
  }
}
