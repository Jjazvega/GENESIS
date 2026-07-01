import { auth, db } from '@/firebase';
import { collection, doc, getDoc, onSnapshot, runTransaction } from 'firebase/firestore';
import { ENTITY_COLLECTIONS } from '@/infrastructure/firebase/repositories/entityCollections';
import { normalizeData } from '@/infrastructure/firebase/repositories/normalization';
import { createRepository } from '@/infrastructure/firebase/repositories/createRepository';
import { getDocumentAccessUrl, uploadFile } from '@/infrastructure/firebase/storage/documentStorage';
import { ensureCorrelationId, getReleaseMetadata } from '@/lib/observability';
import {
  getCurrentUser,
  getCurrentUserUid,
  mutations,
  withCreateDefaults,
  me,
  logout,
  syncUserProfile,
} from '@/api/authClient';
import { invokeLLM, invokeFunction, extractDataFromUploadedFile } from '@/api/aiClient';

function nowIso() {
  return new Date().toISOString();
}

// ── Company creation (transactional, requires db access) ────────────────────

export async function createCompanyWithInitialOwner(companyData = {}, membershipData = {}) {
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

// ── Entity repositories ──────────────────────────────────────────────────────

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

// ── AI Conversation agents (need Firestore access to persist conversations) ──

export const agents = {
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
    const { refDoc: conversationRef, payload: auditedPayload } = await mutations.add(collection(db, 'aiConversations'), payload);
    return { id: conversationRef.id, ...auditedPayload };
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

// ── Disabled connectors stub ─────────────────────────────────────────────────

export const connectors = {
  connectAppUser: async () => {
    throw new Error('Conectores externos desactivados: requiere backend seguro.');
  },
  disconnectAppUser: async () => ({ success: true, disabled: true }),
};

// ── Main firebase facade (assembled from domain clients) ─────────────────────

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
    me,
    logout,
  },
  collections: ENTITY_COLLECTIONS,
};

export default firebase;
