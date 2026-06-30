import assert from 'node:assert/strict';
import { deleteApp, initializeApp } from 'firebase/app';
import { connectStorageEmulator, getStorage, ref, uploadBytes } from 'firebase/storage';

export const PROJECT_ID = process.env.FIREBASE_RULES_TEST_PROJECT_ID || 'demo-gemailla-test';
export const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
export const STORAGE_HOST = process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9199';
export const STORAGE_BUCKET = process.env.FIREBASE_STORAGE_TEST_BUCKET || `${PROJECT_ID}.appspot.com`;

const firestoreBase = `http://${FIRESTORE_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const storageBase = `http://${STORAGE_HOST}/v0/b/${STORAGE_BUCKET}/o`;

function base64Url(value) {
  return Buffer.from(JSON.stringify(value))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export function authToken(uid, claims = {}) {
  if (!uid) return null;

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    aud: PROJECT_ID,
    auth_time: now,
    user_id: uid,
    sub: uid,
    iat: now,
    exp: now + 3600,
    firebase: { sign_in_provider: 'password' },
    ...claims,
  };

  return `${base64Url({ alg: 'none', typ: 'JWT' })}.${base64Url(payload)}.`;
}

export function authHeaders(auth = null, extraHeaders = {}) {
  const token = typeof auth === 'string' ? authToken(auth) : auth?.token || authToken(auth?.uid, auth?.claims);
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extraHeaders,
  };
}

export function ownerHeaders(extraHeaders = {}) {
  return {
    Authorization: 'Bearer owner',
    ...extraHeaders,
  };
}

function firestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (typeof value === 'object') return { mapValue: { fields: firestoreFields(value) } };
  throw new TypeError(`Unsupported Firestore value: ${String(value)}`);
}

function firestoreFields(data) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, firestoreValue(value)]));
}

export async function clearFirestore() {
  const response = await fetch(`http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, {
    method: 'DELETE',
    headers: ownerHeaders(),
  });

  assert.ok(
    response.ok,
    `Expected Firestore emulator cleanup to succeed, got ${response.status}: ${await response.text()}`,
  );
}

export async function firestoreSet(path, data, auth = 'owner') {
  const response = await fetch(`${firestoreBase}/${path}`, {
    method: 'PATCH',
    headers: auth === 'owner'
      ? ownerHeaders({ 'Content-Type': 'application/json' })
      : authHeaders(auth, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ fields: firestoreFields(data) }),
  });

  return response;
}

export async function firestoreCommitSet(writes, auth = 'owner') {
  const response = await fetch(`${firestoreBase}:commit`, {
    method: 'POST',
    headers: auth === 'owner'
      ? ownerHeaders({ 'Content-Type': 'application/json' })
      : authHeaders(auth, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      writes: writes.map(({ path, data }) => ({
        update: {
          name: `projects/${PROJECT_ID}/databases/(default)/documents/${path}`,
          fields: firestoreFields(data),
        },
      })),
    }),
  });

  return response;
}

export async function firestoreGet(path, auth) {
  return fetch(`${firestoreBase}/${path}`, {
    headers: authHeaders(auth),
  });
}

export async function firestorePatch(path, data, auth) {
  return fetch(`${firestoreBase}/${path}`, {
    method: 'PATCH',
    headers: authHeaders(auth, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ fields: firestoreFields(data) }),
  });
}

export async function firestoreDelete(path, auth) {
  return fetch(`${firestoreBase}/${path}`, {
    method: 'DELETE',
    headers: authHeaders(auth),
  });
}

export async function assertAllowed(promiseOrResponse, message) {
  const response = await promiseOrResponse;
  assert.ok(response.ok, `${message} should be allowed, got ${response.status}: ${await response.text()}`);
  return response;
}

export async function assertDenied(promiseOrResponse, message) {
  const response = await promiseOrResponse;
  assert.ok(
    [401, 403].includes(response.status),
    `${message} should be denied, got ${response.status}: ${await response.text()}`,
  );
  return response;
}

export async function seedCompany({ companyId, ownerUid, memberships = [] }) {
  await assertAllowed(firestoreSet(`companies/${companyId}`, {
    name: `Empresa ${companyId}`,
    ownerUid,
    status: 'active',
  }), 'admin company seed');

  for (const membership of memberships) {
    const memberId = membership.id || `${companyId}_${membership.userUid || membership.userEmail}`;
    await assertAllowed(firestoreSet(`companyMembers/${memberId}`, {
      companyId,
      role: membership.role || 'viewer',
      status: membership.status || 'active',
      ...(membership.userUid ? { userUid: membership.userUid } : {}),
      ...(membership.userEmail ? { userEmail: membership.userEmail } : {}),
    }), `admin membership seed for ${memberId}`);
  }
}

function storageEmulatorHostAndPort() {
  const [host, port = '9199'] = STORAGE_HOST.split(':');
  return { host, port: Number(port) };
}

function storageUploadResponse(status, message = '') {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => message,
  };
}

function storageBodyBytes(body) {
  if (body instanceof Uint8Array || body instanceof ArrayBuffer) return body;
  return Buffer.from(String(body));
}

export async function storageUpload(path, auth, { contentType = 'application/pdf', body = 'PDF fixture', customMetadata, metadata = customMetadata || {} } = {}) {
  const token = typeof auth === 'string' ? authToken(auth) : auth?.token || authToken(auth?.uid, auth?.claims);
  const app = initializeApp({
    projectId: PROJECT_ID,
    storageBucket: STORAGE_BUCKET,
  }, `storage-rules-test-${Date.now()}-${Math.random()}`);

  try {
    const { host, port } = storageEmulatorHostAndPort();
    const storage = getStorage(app);
    connectStorageEmulator(storage, host, port, token ? { mockUserToken: token } : undefined);

    await uploadBytes(ref(storage, path), storageBodyBytes(body), {
      contentType,
      customMetadata: Object.fromEntries(
        Object.entries(metadata).map(([key, value]) => [key, String(value)]),
      ),
    });

    return storageUploadResponse(200);
  } catch (error) {
    const status = error?.code === 'storage/unauthorized' ? 403 : 500;
    return storageUploadResponse(status, error?.message || String(error));
  } finally {
    await deleteApp(app);
  }
}

export async function storageRead(path, auth) {
  return fetch(`${storageBase}/${encodeURIComponent(path)}?alt=media`, {
    headers: authHeaders(auth),
  });
}

export async function storageUpdate(path, auth, { contentType = 'application/pdf', body = 'updated bytes' } = {}) {
  return fetch(`${storageBase}/${encodeURIComponent(path)}`, {
    method: 'PATCH',
    headers: authHeaders(auth, { 'Content-Type': contentType }),
    body,
  });
}

export async function storageDelete(path, auth) {
  return fetch(`${storageBase}/${encodeURIComponent(path)}`, {
    method: 'DELETE',
    headers: authHeaders(auth),
  });
}
