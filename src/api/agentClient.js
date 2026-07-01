import { db } from '@/firebase';
import { collection, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { ensureCorrelationId, getReleaseMetadata } from '@/lib/observability';
import { getCurrentUserUid, mutations, withCreateDefaults } from '@/api/authClient';
import { invokeLLM } from '@/api/aiClient';

function nowIso() {
  return new Date().toISOString();
}

// Conversation agents are isolated from generic entity repositories and functions.
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

export default agents;
