import { auth, db } from '@/firebase';
import { doc, runTransaction } from 'firebase/firestore';
import { createAuditMutationMiddleware } from '@/infrastructure/firebase/mutations/auditMutationMiddleware';
import { normalizeData } from '@/infrastructure/firebase/repositories/normalization';

function nowIso() {
  return new Date().toISOString();
}

export function getCurrentUser() {
  return auth.currentUser || null;
}

export function getCurrentUserUid() {
  const user = getCurrentUser();
  return user?.uid || user?.id || null;
}

const mutations = createAuditMutationMiddleware({ getCurrentUserUid, nowIso });

export function withCreateDefaults(data = {}) {
  const payload = normalizeData(data);
  payload.status = payload.status || 'active';
  if (!payload.ownerUid) payload.ownerUid = getCurrentUserUid();
  return payload;
}

export async function getAuthHeader() {
  const user = getCurrentUser();
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

export async function me() {
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
}

export async function logout(redirectUrl) {
  await auth.signOut();
  if (redirectUrl) window.location.href = redirectUrl;
}

export async function syncUserProfile(profile = {}) {
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

export { mutations };
