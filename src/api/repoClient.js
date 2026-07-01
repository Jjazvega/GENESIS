import { auth, db } from '@/firebase';
import { collection, doc, onSnapshot, runTransaction } from 'firebase/firestore';
import { ENTITY_COLLECTIONS } from '@/infrastructure/firebase/repositories/entityCollections';
import { normalizeData } from '@/infrastructure/firebase/repositories/normalization';
import { createRepository } from '@/infrastructure/firebase/repositories/createRepository';
import { getDocumentAccessUrl, uploadFile } from '@/infrastructure/firebase/storage/documentStorage';
import { ensureCorrelationId } from '@/lib/observability';
import {
  getCurrentUser,
  getCurrentUserUid,
  mutations,
  me,
  logout,
  syncUserProfile,
} from '@/api/authClient';
import { invokeLLM, invokeFunction, extractDataFromUploadedFile } from '@/api/aiClient';
import { agents } from '@/api/agentClient';
import { connectors } from '@/api/connectorClient';
import { buildEntities, ENTITY_COLLECTIONS } from '@/api/entityClient';

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
    const { data } = await invokeFunction('createAiConversation', {
      companyId: safeCompanyId,
      agentName,
      metadata,
      messages: [],
      status: 'active',
    });
    return data?.conversation || data;
  },

  addMessage: async (conversation, message) => {
    const conversationId = typeof conversation === 'string' ? conversation : conversation?.id;
    if (!conversationId) throw new Error('Conversación inválida.');
    const safeCompanyId = typeof conversation === 'object' && conversation
      ? String(conversation.companyId || '').trim()
      : '';
    if (!safeCompanyId) throw new Error('companyId es obligatorio para enviar mensajes de IA mediante el backend seguro.');
    const correlationId = ensureCorrelationId(message?.correlationId, 'ai');
    const { data } = await invokeFunction('appendAiConversationMessage', {
      companyId: safeCompanyId,
      conversationId,
      message: {
        ...message,
        correlationId,
      },
    });
    return data?.conversation || { id: conversationId, messages: data?.messages || [] };
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
