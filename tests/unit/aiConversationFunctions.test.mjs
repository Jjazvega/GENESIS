import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, it } from 'node:test';
import Module from 'node:module';

const realRequire = createRequire(import.meta.url);
const MODULE_PATH = new URL('../../functions/index.js', import.meta.url);
const ORIGINAL_ENV = { ...process.env };

class MockDocSnap {
  constructor(id, data) {
    this.id = id;
    this._data = data;
    this.exists = data !== undefined;
  }

  data() {
    return this._data;
  }
}

class MockQuerySnap {
  constructor(docs) {
    this.docs = docs;
    this.empty = docs.length === 0;
  }
}

function createStore(initial = {}) {
  const store = new Map();
  for (const [collection, docs] of Object.entries(initial)) {
    for (const [id, data] of Object.entries(docs)) {
      store.set(`${collection}/${id}`, structuredClone(data));
    }
  }
  return store;
}

function createFirestore(store) {
  function docRef(collectionName, id) {
    return {
      collectionName,
      id,
      key: `${collectionName}/${id}`,
      async get() {
        return new MockDocSnap(id, store.get(this.key));
      },
      async set(value, options = {}) {
        const previous = options.merge ? (store.get(this.key) || {}) : {};
        store.set(this.key, { ...previous, ...structuredClone(value) });
      },
    };
  }

  function query(collectionName) {
    const filters = [];
    return {
      where(field, op, value) {
        assert.equal(op, '==');
        filters.push({ field, value });
        return this;
      },
      limit() {
        return this;
      },
      async get() {
        const docs = [];
        for (const [key, data] of store.entries()) {
          const [candidateCollection, id] = key.split('/');
          if (candidateCollection !== collectionName) continue;
          if (filters.every(({ field, value }) => data?.[field] === value)) {
            docs.push(new MockDocSnap(id, data));
          }
        }
        return new MockQuerySnap(docs);
      },
    };
  }

  return {
    collection(collectionName) {
      return {
        doc(id) {
          return docRef(collectionName, id);
        },
        where(field, op, value) {
          return query(collectionName).where(field, op, value);
        },
      };
    },
    async runTransaction(callback) {
      return callback({
        async get(ref) {
          return new MockDocSnap(ref.id, store.get(ref.key));
        },
        set(ref, value, options = {}) {
          const previous = options.merge ? (store.get(ref.key) || {}) : {};
          store.set(ref.key, { ...previous, ...structuredClone(value) });
        },
      });
    },
  };
}

async function loadHandler({ store, verifyIdToken, fetchImpl, exportName }) {
  const firestore = createFirestore(store);
  const admin = {
    initializeApp() {},
    auth() {
      return {
        verifyIdToken,
        async setCustomUserClaims() {},
      };
    },
    firestore() {
      return firestore;
    },
  };
  const modulePath = fileURLToPath(MODULE_PATH);
  const originalLoad = Module._load;
  globalThis.fetch = fetchImpl || (async () => ({ ok: true, status: 200, async json() { return { output_text: 'ok' }; } }));
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'firebase-admin') return admin;
    if (request === 'firebase-functions/v2/https') return { onRequest: (_options, handler) => handler };
    if (request === 'firebase-functions/params') return { defineSecret: () => ({ value: () => process.env.OPENAI_API_KEY }) };
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    for (const key of Object.keys(realRequire.cache)) {
      if (key.includes('/functions/')) delete realRequire.cache[key];
    }
    const loaded = realRequire(modulePath);
    return loaded._test[exportName];
  } finally {
    Module._load = originalLoad;
  }
}

function createReq({ token = 'valid-token', body = {}, method = 'POST', origin = 'https://gemailla.com' } = {}) {
  const headers = new Map();
  if (token) headers.set('authorization', 'Bearer ' + token);
  headers.set('x-correlation-id', 'test-correlation');
  if (origin) headers.set('origin', origin);

  return {
    method,
    body,
    get(name) {
      return headers.get(String(name).toLowerCase()) || '';
    },
  };
}

function createRes() {
  return {
    headers: {},
    statusCode: undefined,
    payload: undefined,
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
    send(payload) {
      this.payload = payload;
      return this;
    },
  };
}

function seedBase(overrides = {}) {
  return createStore({
    companies: {
      validCompany: { status: 'active', ownerUid: 'owner-uid' },
    },
    companyMembers: overrides.companyMembers || {},
    documents: {
      validDoc: { companyId: 'validCompany', storagePath: 'companies/validCompany/doc.pdf' },
    },
    aiUsage: overrides.aiUsage || {},
    aiRateLimits: overrides.aiRateLimits || {},
    aiConversations: overrides.aiConversations || {},
    aiAuditLogs: overrides.aiAuditLogs || {},
    aiCostLogs: overrides.aiCostLogs || {},
  });
}

describe('AI conversation backend functions', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.AI_RATE_LIMIT_MAX_REQUESTS = '30';
    process.env.AI_RATE_LIMIT_WINDOW_MS = '60000';
    process.env.AI_DAILY_TOKEN_LIMIT = '50000';
    process.env.AI_DAILY_BUDGET_USD = '5';
    process.env.AI_RESERVED_OUTPUT_TOKENS = '1200';
    process.env.AI_COST_PER_1K_TOKENS_USD = '0.002';
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('createAiConversation persiste solo datos autorizados por backend', async () => {
    const store = seedBase();
    const handler = await loadHandler({
      store,
      verifyIdToken: async (token) => {
        assert.equal(token, 'valid-token');
        return { uid: 'owner-uid' };
      },
      exportName: 'createAiConversationHandler',
    });
    const res = createRes();
    await handler(createReq({
      body: {
        companyId: 'validCompany',
        query: 'Hola',
        response: 'Respuesta',
        documentIds: ['validDoc'],
        userEmail: 'attacker@example.com',
        ownerUid: 'attacker-uid',
        tokens: 999999,
        costUsd: 99,
        metadata: { source: 'ui' },
      },
    }), res);

    assert.equal(res.statusCode, 200);
    const { conversation } = res.payload;
    const stored = store.get(`aiConversations/${conversation.id}`);
    assert.equal(stored.companyId, 'validCompany');
    assert.equal(stored.ownerUid, 'owner-uid');
    assert.equal(stored.userUid, 'owner-uid');
    assert.deepEqual(stored.documentIds, ['validDoc']);
    assert.equal(stored.userEmail, '');
    assert.equal(stored.tokens, undefined);
    assert.equal(stored.costUsd, undefined);
    assert.equal(stored.ownerUid, 'owner-uid');
  });

  it('appendAiConversationMessage agrega mensajes y registra uso IA desde backend', async () => {
    const store = seedBase({
      aiConversations: {
        conv_1: {
          companyId: 'validCompany',
          ownerUid: 'owner-uid',
          messages: [],
          context_documents: ['validDoc'],
          status: 'active',
        },
      },
    });
    const handler = await loadHandler({
      store,
      verifyIdToken: async () => ({ uid: 'owner-uid' }),
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async json() {
          return {
            output_text: 'Respuesta IA segura',
            usage: { input_tokens: 8, output_tokens: 5, total_tokens: 13 },
          };
        },
      }),
      exportName: 'appendAiConversationMessageHandler',
    });
    const res = createRes();
    await handler(createReq({
      body: {
        companyId: 'validCompany',
        conversationId: 'conv_1',
        message: { role: 'user', content: 'Resume el documento' },
      },
    }), res);

    assert.equal(res.statusCode, 200);
    const stored = store.get('aiConversations/conv_1');
    assert.equal(stored.messages.length, 2);
    assert.equal(stored.messages[0].role, 'user');
    assert.equal(stored.messages[1].role, 'assistant');
    assert.equal(stored.messages[1].content, 'Respuesta IA segura');

    const costLogEntry = [...store.entries()].find(([key]) => key.startsWith('aiCostLogs/'));
    assert.ok(costLogEntry, 'Se esperaba un aiCostLogs/* generado por el backend.');
    const auditLogEntry = [...store.entries()].find(([key, value]) => key.startsWith('aiAuditLogs/') && value?.eventName === 'ai_request_completed');
    assert.ok(auditLogEntry, 'Se esperaba un aiAuditLogs/* de solicitud completada.');
  });
});
