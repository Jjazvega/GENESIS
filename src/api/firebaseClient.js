import { auth, db } from '@/firebase';
export { default as app, auth, db, storage } from '@/firebase';
import { DOCUMENT_STATUSES, AI_DISABLED_RESPONSE_STATUSES } from '@/features/documents/constants/documentStatuses';
import { ENTITY_COLLECTIONS } from '@/infrastructure/firebase/repositories/entityCollections';
import { normalizeData } from '@/infrastructure/firebase/repositories/normalization';
import { createAuditMutationMiddleware } from '@/infrastructure/firebase/mutations/auditMutationMiddleware';
import { createRepository } from '@/infrastructure/firebase/repositories/createRepository';
import { getDocumentAccessUrl, uploadFile } from '@/infrastructure/firebase/storage/documentStorage';
import { ensureCorrelationId, getReleaseMetadata, logFrontendEvent, persistObservabilityEvent } from '@/lib/observability';
export { DOCUMENT_STATUSES } from '@/features/documents/constants/documentStatuses';

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
} from 'firebase/firestore';
export function isAiDisabledResponse(response = {}) {
  if (!response || typeof response !== 'object') return false;

  if (response.disabled === true) return true;
  if (typeof response.status === 'string' && AI_DISABLED_RESPONSE_STATUSES.has(response.status)) return true;
  if (response.documentStatus === DOCUMENT_STATUSES.AI_DISABLED) return true;

  const nestedResponse = response.data || response.result;
  return nestedResponse && nestedResponse !== response
    ? isAiDisabledResponse(nestedResponse)
    : false;
}

function nowIso() {
  return new Date().toISOString();
}

function getCurrentUser() {
  return auth.currentUser || null;
}

function getCurrentUserUid() {
  const user = getCurrentUser();
  return user?.uid || user?.id || null;
}

const mutations = createAuditMutationMiddleware({ getCurrentUserUid, nowIso });

function withCreateDefaults(data = {}) {
  const payload = normalizeData(data);
  payload.status = payload.status || 'active';
  if (!payload.ownerUid) payload.ownerUid = getCurrentUserUid();
  return payload;
}

async function getAuthHeader() {
  const user = getCurrentUser();
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}


function getSafeInternalEndpoint(configuredEndpoint, fallbackPath, label) {
  const configured = String(configuredEndpoint || fallbackPath).trim() || fallbackPath;
  let url;
  try {
    url = new URL(configured, window.location.origin);
  } catch {
    throw new Error(`Endpoint de ${label} inválido.`);
  }

  if (url.origin !== window.location.origin || url.username || url.password) {
    throw new Error(`Endpoint de ${label} bloqueado: solo se permite una ruta interna del mismo origen.`);
  }

  if (!url.pathname.startsWith('/api/')) {
    throw new Error(`Endpoint de ${label} bloqueado: la ruta debe iniciar con /api/.`);
  }

  return `${url.pathname}${url.search}`;
}

/**
 * Resuelve de forma segura el endpoint para Cloud Functions internas.
 * Mantiene la firma esperada por los tests unitarios.
 */
export function getSafeFunctionsEndpoint() {
  const defaultEndpoint = '/api/functions';
  return getSafeInternalEndpoint(defaultEndpoint, '/api/functions', 'funciones');
}

/**
 * Resuelve de forma segura el endpoint de la API de Inteligencia Artificial.
 */
export function getSafeAiEndpoint() {
  const defaultEndpoint = '/api/ai';
  return getSafeInternalEndpoint(defaultEndpoint, '/api/ai', 'ia');
}

function aiDisabledPayload(reason = 'Las funciones de IA están desactivadas porque no hay backend seguro configurado.', correlationId = ensureCorrelationId('', 'ai')) {
  return {
    disabled: true,
    status: 'disabled',
    documentStatus: DOCUMENT_STATUSES.AI_DISABLED,
    message: reason,
    summary: reason,
    response: reason,
    correlationId,
    release: getReleaseMetadata(),
  };
}

export async function invokeLLM(params = {}) {
  const correlationId = ensureCorrelationId(params.correlationId, 'ai');
  const companyId = typeof params.companyId === 'string' ? params.companyId.trim() : '';
  if (!companyId) throw new Error('companyId es obligatorio para usar IA.');
  const endpoint = getSafeAiEndpoint();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Correlation-Id': correlationId,
      ...(await getAuthHeader()),
    },
    body: JSON.stringify({
      ...params,
      companyId,
      correlationId,
      release: getReleaseMetadata(),
    }),
  });

  const raw = await response.text();
  let payload = {};
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { message: raw };
    }
  }

  if (!response.ok) {
    const message = payload?.error || payload?.message || `Error HTTP ${response.status} al llamar IA.`;
    logFrontendEvent('ai_request_failed', { correlationId, status: response.status, message }, 'error');
    await persistObservabilityEvent('ai_request_failed', {
      correlationId,
      severity: 'ERROR',
      source: 'frontend',
      status: response.status,
      message,
    }).catch(() => null);
    throw new Error(`${message} (correlationId: ${correlationId})`);
  }

  logFrontendEvent('ai_request_completed', { correlationId, status: response.status });
  const result = payload?.data || payload?.result || payload;
  if (result && typeof result === 'object') return { ...result, correlationId: result.correlationId || correlationId };
  return { response: result, correlationId };
}

async function extractDataFromUploadedFile() {
  return {
    status: 'disabled',
    output: [],
    details: 'La extracción automática de archivos requiere backend seguro. El módulo queda degradado sin romper la app.',
  };
}

async function invokeFunction(name, payload = {}) {
  const correlationId = ensureCorrelationId(payload.correlationId, name || 'fn');
  const endpoint = getSafeFunctionsEndpoint();
  if (!endpoint) {
    return {
      data: {
        success: false,
        disabled: true,
        message: `Función ${name} desactivada: falta backend seguro.`,
        results: {},
        correlationId,
      },
    };
  }

  const safeFunctionName = encodeURIComponent(String(name || '').trim());
  if (!safeFunctionName) throw new Error('Nombre de función inválido.');

  const response = await fetch(`${endpoint.replace(/\/$/, '')}/${safeFunctionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Correlation-Id': correlationId,
      ...(await getAuthHeader()),
    },
    body: JSON.stringify({
      ...payload,
      correlationId,
      release: payload.release || getReleaseMetadata(),
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error || data?.message || `No se pudo ejecutar ${name}.`;
    logFrontendEvent('function_request_failed', { correlationId, functionName: name, status: response.status, message }, 'error');
    throw new Error(`${message} (correlationId: ${correlationId})`);
  }
  return { data };
}

const connectors = {
  connectAppUser: async () => {
    throw new Error('Conectores externos desactivados: requiere backend seguro.');
  },
  disconnectAppUser: async () => ({ success: true, disabled: true }),
};


async function syncUserProfile(profile = {}) {
  const user = getCurrentUser();
  const currentUid = getCurrentUserUid();
  const requestedUid = profile.uid || profile.id || currentUid;
  if (requestedUid && currentUid && requestedUid !== currentUid) {
    throw new Error('No puedes sincronizar el perfil de otro usuario.');
  }
  const userUid = currentUid;
  if (!userUid) throw new Error('No se puede sincronizar el perfil sin UID.');

  const payload = normalizeData({
    ...profile,
    uid: userUid,
    email: profile.email || user?.email || '',
    fullName: profile.fullName || profile.displayName || user?.displayName || user?.email || '',
    status: profile.status || 'active',
  });
  delete payload.id;

  const dataWithAudit = mutations.withCreateAuditFields(payload);
  const userRef = doc(db, 'users', userUid);

  await runTransaction(db, async (transaction) => {
    transaction.set(userRef, dataWithAudit, { merge: true });
  });

  return { id: userUid, ...dataWithAudit, uid: userUid };
}

async function createCompanyWithInitialOwner(companyData = {}, membershipData = {}) {
  const user = getCurrentUser();
  const currentUid = getCurrentUserUid();
  const requestedOwnerUid = membershipData.userUid || companyData.ownerUid || currentUid;
  if (requestedOwnerUid && currentUid && requestedOwnerUid !== currentUid) {
    throw new Error('No puedes crear empresas ni membresías iniciales para otro usuario.');
  }
  const userUid = currentUid;
  if (!userUid) throw new Error('No se puede crear la empresa sin UID de propietario.');

  const companyRef = doc(collection(db, 'companies'));
  const membershipRef = doc(db, 'companyMembers', `${companyRef.id}_${userUid}`);

  const companyPayload = mutations.withCreateAuditFields(normalizeData({
    ...companyData,
    ownerUid: userUid,
    status: companyData.status || 'active',
  }));

  const membershipPayload = mutations.withCreateAuditFields(normalizeData({
    ...membershipData,
    companyId: companyRef.id,
    userUid,
    userEmail: membershipData.userEmail || user?.email || '',
    userName: membershipData.userName || user?.displayName || user?.email || '',
    role: membershipData.role || 'director',
    status: membershipData.status || 'active',
  }));

  await runTransaction(db, async (transaction) => {
    transaction.set(companyRef, companyPayload);
    transaction.set(membershipRef, membershipPayload);
  });

  return {
    id: companyRef.id,
    ...companyPayload,
    initialOwnerMembership: { id: membershipRef.id, ...membershipPayload },
  };
}

function buildEntities() {
  const entities = Object.fromEntries(
    Object.entries(ENTITY_COLLECTIONS).map(([entityName, collectionName]) => [
      entityName,
      createRepository(collectionName),
    ]),
  );

  entities.User = {
    ...entities.User,
    syncUserProfile,
  };

  entities.Company = {
    ...entities.Company,
    createCompanyWithInitialOwner,
  };

  return entities;
}

const agents = {
  createConversation: async ({ metadata = {}, agent_name: agentName = 'assistant', companyId } = {}) => {
    const safeCompanyId = typeof companyId === 'string' ? companyId.trim() : '';
    if (!safeCompanyId) throw new Error('companyId es obligatorio para crear conversaciones de IA.');
    const payload = withCreateDefaults({
      agentName,
      companyId: safeCompanyId,
      metadata,
      ownerUid: getCurrentUserUid(),
      messages: [],
      status: 'active',
    });
    const { refDoc, payload: auditedPayload } = await mutations.add(collection(db, 'aiConversations'), payload);
    return { id: refDoc.id, ...auditedPayload };
  },

  addMessage: async (conversation, message) => {
    const conversationId = typeof conversation === 'string' ? conversation : conversation?.id;
    if (!conversationId) throw new Error('Conversación inválida.');

    const refDoc = doc(db, 'aiConversations', conversationId);
    const snap = await getDoc(refDoc);
    if (!snap.exists()) throw new Error('Conversación no encontrada o sin acceso.');
    const current = snap.exists() ? snap.data() : {};
    const currentUid = getCurrentUserUid();
    if (!currentUid) throw new Error('Debes iniciar sesión para enviar mensajes.');
    if (current.ownerUid && current.ownerUid !== currentUid) {
      throw new Error('No puedes enviar mensajes en conversaciones de otro usuario.');
    }
    if (!current.companyId) throw new Error('La conversación no tiene companyId válido.');
    const messages = Array.isArray(current.messages) ? [...current.messages] : [];
    messages.push({ ...message, createdAt: nowIso() });

    if (message?.role === 'user') {
      const correlationId = ensureCorrelationId(message.correlationId, 'ai');
      const aiResponse = await invokeLLM({
        companyId: current.companyId,
        documentIds: current.context_documents || current.documentIds || [],
        prompt: message.content,
        correlationId,
      });
      messages.push({
        role: 'assistant',
        correlationId,
        release: getReleaseMetadata(),
        content: typeof aiResponse === 'string' ? aiResponse : aiResponse?.response || aiResponse?.message || 'IA desactivada temporalmente.',
        createdAt: nowIso(),
      });
    }

    await mutations.update(refDoc, { messages });
    return { id: conversationId, messages };
  },

  subscribeToConversation: (conversationId, callback) => {
    if (!conversationId) return () => {};
    return onSnapshot(doc(db, 'aiConversations', conversationId), (snap) => {
      callback(snap.exists() ? { id: snap.id, ...snap.data() } : { id: conversationId, messages: [] });
    });
  },
};

export const firebase = {
  entities: buildEntities(),
  integrations: {
    Core: {
      InvokeLLM: invokeLLM,
      UploadFile: uploadFile,
      GetDocumentAccessUrl: getDocumentAccessUrl,
      ExtractDataFromUploadedFile: extractDataFromUploadedFile,
    },
  },
  functions: {
    invoke: invokeFunction,
  },
  connectors,
  agents,
  auth: {
    me: async () => {
      const user = getCurrentUser();
      if (!user) return null;
      const userUid = getCurrentUserUid();
      return {
        id: userUid,
        uid: userUid,
        email: user.email,
        fullName: user.displayName || user.email,
        role: (await user.getIdTokenResult().catch(() => ({ claims: {} }))).claims?.role || 'user',
      };
    },
    logout: async (redirectUrl) => {
      await auth.signOut();
      if (redirectUrl) window.location.href = redirectUrl;
    },
  },
  collections: ENTITY_COLLECTIONS,
};

export default firebase;
