import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { describe, it, beforeEach, afterEach } from 'node:test';
import Module from 'node:module';

const realRequire = createRequire(import.meta.url);
const MODULE_PATH = new URL('../../functions/index.js', import.meta.url);
const ORIGINAL_ENV = { ...process.env };


function expect(received) {
  return {
    toBe(expected) {
      assert.equal(received, expected);
    },
    toMatch(pattern) {
      assert.match(received, pattern);
    },
    toBeUndefined() {
      assert.equal(received, undefined);
    },
    toBeNull() {
      assert.equal(received, null);
    },
    not: {
      toHaveProperty(propertyName) {
        assert.equal(Object.prototype.hasOwnProperty.call(received, propertyName), false);
      },
    },
  };
}

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

async function loadAiEndpoint({ store, verifyIdToken, fetchImpl, exportName = 'aiHandler' }) {
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
  globalThis.fetch = fetchImpl;
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

function createReq({ token = 'valid-token', body = {}, method = 'POST', origin = '' } = {}) {
  const headers = new Map();
  if (token) headers.set('authorization', `Bearer ${token}`);
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
      inactiveCompany: { status: 'inactive', ownerUid: 'owner-uid' },
      memberCompany: { status: 'active', ownerUid: 'other-owner' },
    },
    companyMembers: {
      memberCompany_memberUid: { companyId: 'memberCompany', userUid: 'memberUid', status: 'active', role: 'admin' },
      memberCompany_inactiveMember: { companyId: 'memberCompany', userUid: 'inactiveMember', status: 'inactive', role: 'admin' },
      memberCompany_blockedRole: { companyId: 'memberCompany', userUid: 'blockedRole', status: 'active', role: 'guest' },
    },
    documents: {
      validDoc: { companyId: 'validCompany', storagePath: 'companies/validCompany/doc.pdf' },
      otherTenantDoc: { companyId: 'otherCompany', storagePath: 'companies/otherCompany/doc.pdf' },
    },
    aiRateLimits: overrides.aiRateLimits || {},
    aiUsage: overrides.aiUsage || {},
  });
}

async function exercise({ store = seedBase(), uid = 'owner-uid', token = 'valid-token', body, fetchImpl, origin } = {}) {
  const handler = await loadAiEndpoint({
    store,
    verifyIdToken: async (receivedToken) => {
      if (receivedToken !== 'valid-token') throw new Error('bad token');
      return { uid };
    },
    fetchImpl: fetchImpl || (async () => ({ ok: true, status: 200, async json() { return { output_text: 'Respuesta IA de prueba' }; } })),
  });
  const res = createRes();
  await handler(createReq({ token, body, origin }), res);
  return res;
}

describe('endpoint IA', () => {
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

  it('usa orígenes CORS de producción por defecto', async () => {
    delete process.env.ALLOWED_ORIGINS;
    const getAllowedOrigins = await loadAiEndpoint({
      store: seedBase(),
      verifyIdToken: async () => ({ uid: 'owner-uid' }),
      fetchImpl: async () => ({ ok: true, status: 200, async json() { return { output_text: 'ok' }; } }),
      exportName: 'getAllowedOrigins',
    });

    assert.deepEqual(Array.from(getAllowedOrigins()), [
      'https://gemailla.com',
      'https://www.gemailla.com',
      'https://gemailla-enterprise.firebaseapp.com',
      'https://gemailla-enterprise.web.app',
    ]);
  });

  it('responde 403 para origen CORS no permitido antes de llamar a OpenAI', async () => {
    process.env.ALLOWED_ORIGINS = 'https://allowed.example';
    const handler = await loadAiEndpoint({
      store: seedBase(),
      verifyIdToken: async () => ({ uid: 'owner-uid' }),
      fetchImpl: async () => {
        throw new Error('OpenAI no debe llamarse');
      },
    });
    const res = createRes();

    await handler(createReq({ origin: 'https://evil.example', body: { companyId: 'validCompany', prompt: 'Hola' } }), res);

    assert.equal(res.statusCode, 403);
    assert.match(res.payload.error, /CORS no permitido/);
  });

  it('responde con Access-Control-Allow-Origin dinámico cuando el origen está autorizado', async () => {
    process.env.ALLOWED_ORIGINS = 'https://gemailla.com,https://www.gemailla.com';

    const res = await exercise({
      origin: 'https://gemailla.com',
      body: { companyId: 'validCompany', prompt: 'Hola' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://gemailla.com');
    expect(res.headers.Vary).toBe('Origin');
  });

  it('responde 403 y no emite Access-Control-Allow-Origin para un origen no autorizado', async () => {
    process.env.ALLOWED_ORIGINS = 'https://gemailla.com';

    const res = await exercise({
      origin: 'https://hackdomain.com',
      body: { companyId: 'validCompany', prompt: 'Hola' },
      fetchImpl: async () => {
        throw new Error('OpenAI no debe llamarse para un origen no autorizado');
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.payload.error).toMatch(/CORS no permitido/);
    expect(res.headers).not.toHaveProperty('Access-Control-Allow-Origin');
    expect(res.headers.Vary).toBe('Origin');
  });

  it('procesa de forma segura una petición sin cabecera Origin', async () => {
    process.env.ALLOWED_ORIGINS = 'https://gemailla.com';

    const res = await exercise({
      body: { companyId: 'validCompany', prompt: 'Hola' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers).not.toHaveProperty('Access-Control-Allow-Origin');
    expect(res.payload.response).toBe('Respuesta IA de prueba');
    expect(res.headers.Vary).toBe('Origin');
  });

  it('responde 401 sin token', async () => {
    const res = await exercise({ token: null, body: { companyId: 'validCompany', prompt: 'Hola' } });

    assert.equal(res.statusCode, 401);
    assert.match(res.payload.error, /Autenticación requerida/);
  });

  it('responde 401 con token inválido', async () => {
    const res = await exercise({ token: 'invalid-token', body: { companyId: 'validCompany', prompt: 'Hola' } });

    assert.equal(res.statusCode, 401);
    assert.match(res.payload.error, /Token de Firebase inválido/);
  });

  it('responde 400 cuando companyId está ausente', async () => {
    const res = await exercise({ body: { prompt: 'Hola' } });

    assert.equal(res.statusCode, 400);
    assert.match(res.payload.error, /companyId es obligatorio/);
  });

  it('responde 403 cuando la empresa no existe', async () => {
    const res = await exercise({ body: { companyId: 'missingCompany', prompt: 'Hola' } });

    assert.equal(res.statusCode, 403);
    assert.match(res.payload.error, /Empresa no válida/);
  });

  it('responde 403 con membresía inválida', async () => {
    const res = await exercise({ uid: 'inactiveMember', body: { companyId: 'memberCompany', prompt: 'Hola' } });

    assert.equal(res.statusCode, 403);
    assert.match(res.payload.error, /membresía activa/);
  });

  it('responde 403 con rol insuficiente', async () => {
    const res = await exercise({ uid: 'blockedRole', body: { companyId: 'memberCompany', prompt: 'Hola' } });

    assert.equal(res.statusCode, 403);
    assert.match(res.payload.error, /rol no permite/);
  });

  it('responde 403 al solicitar un documento de otro tenant', async () => {
    const res = await exercise({ body: { companyId: 'validCompany', prompt: 'Analiza documento', documentIds: ['otherTenantDoc'] } });

    assert.equal(res.statusCode, 403);
    assert.match(res.payload.error, /no pertenece a la empresa validada/);
  });

  it('responde 200 en el caso válido y registra costo de IA', async () => {
    const store = seedBase();
    const res = await exercise({
      store,
      body: { companyId: 'validCompany', prompt: 'Hola', documentIds: ['validDoc'], integration: 'ellmer' },
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async json() {
          return { output_text: 'Respuesta IA de prueba', usage: { input_tokens: 11, output_tokens: 7, total_tokens: 18 } };
        },
      }),
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.response, 'Respuesta IA de prueba');
    assert.equal(res.payload.companyId, 'validCompany');
    assert.equal(res.payload.tokens, 18);
    assert.equal(res.payload.costo, 0.000036);

    const usageDocs = Array.from(store.entries()).filter(([key]) => key.startsWith('aiUsage/')).map(([, value]) => value);
    assert.equal(usageDocs.length, 1);
    assert.equal(usageDocs[0].tokensUsed, 18);
    assert.equal(usageDocs[0].completedRequestCount, 1);
    assert.equal(usageDocs[0].reservedTokens, 0);
    assert.equal(usageDocs[0].reservedBudgetUsd, 0);

    const costLogs = Array.from(store.entries()).filter(([key]) => key.startsWith('aiCostLogs/')).map(([, value]) => value);
    assert.equal(costLogs.length, 1);
    assert.equal(costLogs[0].tokens, 18);
    assert.equal(costLogs[0].model, 'gpt-4o-mini');
    assert.equal(costLogs[0].costo, 0.000036);
    assert.equal(costLogs[0].integration, 'ellmer');
    assert.match(costLogs[0].timestamp, /^\d{4}-\d{2}-\d{2}T/);


    const auditLogs = Array.from(store.entries()).filter(([key]) => key.startsWith('aiAuditLogs/')).map(([, value]) => value);
    assert.equal(auditLogs.length, 2);
    assert.deepEqual(auditLogs.map((log) => log.eventName).sort(), ['ai_request_completed', 'ai_request_started']);
    assert.equal(auditLogs.every((log) => log.companyId === 'validCompany'), true);
    assert.equal(auditLogs.every((log) => log.userUid === 'owner-uid'), true);
    assert.equal(auditLogs.every((log) => log.prompt === undefined), true);
    assert.equal(auditLogs.every((log) => log.content === undefined), true);
  });


  it('revierte la reserva cuando OpenAI devuelve 502', async () => {
    const store = seedBase();

    const res = await exercise({
      store,
      body: { companyId: 'validCompany', prompt: 'Hola' },
      fetchImpl: async () => ({
        ok: false,
        status: 502,
        async json() {
          return { error: { message: 'Bad gateway upstream' } };
        },
      }),
    });

    assert.equal(res.statusCode, 502);
    assert.match(res.payload.error, /Bad gateway upstream/);

    const usageDocs = Array.from(store.entries()).filter(([key]) => key.startsWith('aiUsage/')).map(([, value]) => value);
    assert.equal(usageDocs.length, 1);
    assert.equal(usageDocs[0].reservedTokens, 0);
    assert.equal(usageDocs[0].reservedBudgetUsd, 0);
    assert.equal(usageDocs[0].failedRequestCount, 1);
    assert.equal(usageDocs[0].tokensUsed, 0);
    assert.equal(usageDocs[0].budgetUsedUsd, 0);
  });

  it('incrementa failedRequestCount cuando el proveedor colapsa después de reservar', async () => {
    const store = seedBase();

    const res = await exercise({
      store,
      body: { companyId: 'validCompany', prompt: 'Hola' },
      fetchImpl: async () => {
        throw new Error('network collapse after reservation');
      },
    });

    assert.equal(res.statusCode, 500);
    assert.match(res.payload.error, /network collapse after reservation/);

    const usageDocs = Array.from(store.entries()).filter(([key]) => key.startsWith('aiUsage/')).map(([, value]) => value);
    assert.equal(usageDocs.length, 1);
    assert.equal(usageDocs[0].reservedTokens, 0);
    assert.equal(usageDocs[0].reservedBudgetUsd, 0);
    assert.equal(usageDocs[0].failedRequestCount, 1);
    assert.equal(usageDocs[0].tokensUsed, 0);
    assert.equal(usageDocs[0].budgetUsedUsd, 0);
  });

  it('devuelve una reserva extendida antes de llamar al proveedor', async () => {
    const store = seedBase();
    const enforceAiLimits = await loadAiEndpoint({
      store,
      verifyIdToken: async () => ({ uid: 'owner-uid' }),
      fetchImpl: async () => ({ ok: true, status: 200, async json() { return { output_text: 'ok' }; } }),
      exportName: 'enforceAiLimits',
    });

    const reservation = await enforceAiLimits({
      user: { uid: 'owner-uid' },
      authorization: { companyId: 'validCompany' },
      prompt: 'Hola',
      correlationId: 'reservation-contract',
      now: new Date('2026-06-19T00:00:00.000Z'),
    });

    assert.equal(reservation.usageDocId, '2026-06-19_validCompany');
    assert.equal(reservation.rateDocId, 'validCompany_owner-uid');
    assert.equal(reservation.estimatedTokens, 1201);
    assert.equal(reservation.estimatedCostUsd, 0.002402);
    assert.equal(reservation.reservedAtMs, 1781827200000);
    assert.equal(reservation.reservationStatus, 'reserved');
  });

  it('bloquea por rate limiting antes de llamar a OpenAI', async () => {
    process.env.AI_RATE_LIMIT_MAX_REQUESTS = '1';
    const store = seedBase({ aiRateLimits: { 'validCompany_owner-uid': { windowStartedAtMs: Date.now(), requestCount: 1 } } });
    let openAiCalls = 0;

    const res = await exercise({
      store,
      body: { companyId: 'validCompany', prompt: 'Hola' },
      fetchImpl: async () => {
        openAiCalls += 1;
        return { ok: true, status: 200, async json() { return { output_text: 'No debe llamarse' }; } };
      },
    });

    assert.equal(res.statusCode, 429);
    assert.match(res.payload.error, /Límite de frecuencia/);
    assert.equal(openAiCalls, 0);


    const auditLogs = Array.from(store.entries()).filter(([key]) => key.startsWith('aiAuditLogs/')).map(([, value]) => value);
    assert.equal(auditLogs.length, 1);
    assert.equal(auditLogs[0].eventName, 'ai_request_failed');
    assert.equal(auditLogs[0].status, 429);
    assert.equal(auditLogs[0].companyId, 'validCompany');
    assert.equal(auditLogs[0].userUid, 'owner-uid');
  });

  it('bloquea por cuota diaria de tokens antes de llamar a OpenAI', async () => {
    process.env.AI_DAILY_TOKEN_LIMIT = '10';
    let openAiCalls = 0;

    const res = await exercise({
      body: { companyId: 'validCompany', prompt: 'Hola' },
      fetchImpl: async () => {
        openAiCalls += 1;
        return { ok: true, status: 200, async json() { return { output_text: 'No debe llamarse' }; } };
      },
    });

    assert.equal(res.statusCode, 429);
    assert.match(res.payload.error, /Cuota diaria de tokens/);
    assert.equal(openAiCalls, 0);
  });

  it('bloquea por presupuesto diario antes de llamar a OpenAI', async () => {
    process.env.AI_DAILY_BUDGET_USD = '0.000001';
    let openAiCalls = 0;

    const res = await exercise({
      body: { companyId: 'validCompany', prompt: 'Hola' },
      fetchImpl: async () => {
        openAiCalls += 1;
        return { ok: true, status: 200, async json() { return { output_text: 'No debe llamarse' }; } };
      },
    });

    assert.equal(res.statusCode, 429);
    assert.match(res.payload.error, /Presupuesto diario/);
    assert.equal(openAiCalls, 0);
  });
});
