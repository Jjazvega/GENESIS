// @ts-check

import { addDoc, setDoc, updateDoc } from 'firebase/firestore';

function resolveActorId(getCurrentUserUid) {
  const actorId = typeof getCurrentUserUid === 'function' ? getCurrentUserUid() : null;
  return actorId || null;
}

function resolveTimestamp(nowIso) {
  return typeof nowIso === 'function' ? nowIso() : new Date().toISOString();
}

/**
 * Builds the generic audit fields that every Firebase write should carry.
 * This middleware is intentionally domain-agnostic: callers provide the data,
 * actor resolver and clock, while the helper injects security/audit metadata.
 *
 * @param {{ getCurrentUserUid?: () => string | null | undefined, nowIso?: () => string }} [options]
 */
export function createAuditMutationMiddleware(options = {}) {
  const { getCurrentUserUid, nowIso } = options;
  function withCreateAuditFields(data = {}) {
    const actorId = resolveActorId(getCurrentUserUid);
    const timestamp = resolveTimestamp(nowIso);

    return {
      ...data,
      createdAt: data.createdAt || timestamp,
      updatedAt: timestamp,
      createdBy: data.createdBy || actorId,
      updatedBy: actorId,
    };
  }

  function withUpdateAuditFields(data = {}) {
    const actorId = resolveActorId(getCurrentUserUid);

    return {
      ...data,
      updatedAt: resolveTimestamp(nowIso),
      updatedBy: actorId,
    };
  }

  async function add(refCollection, data = {}) {
    const payload = withCreateAuditFields(data);
    const refDoc = await addDoc(refCollection, payload);
    return { refDoc, payload };
  }

  async function set(refDoc, data = {}, options) {
    const payload = withCreateAuditFields(data);
    if (options) {
      await setDoc(refDoc, payload, options);
    } else {
      await setDoc(refDoc, payload);
    }
    return { refDoc, payload };
  }

  async function update(refDoc, data = {}) {
    const payload = withUpdateAuditFields(data);
    await updateDoc(refDoc, payload);
    return { refDoc, payload };
  }

  function batchSet(batch, refDoc, data = {}, options) {
    const payload = withCreateAuditFields(data);
    if (options) {
      batch.set(refDoc, payload, options);
    } else {
      batch.set(refDoc, payload);
    }
    return payload;
  }

  return {
    add,
    set,
    update,
    batchSet,
    withCreateAuditFields,
    withUpdateAuditFields,
  };
}
