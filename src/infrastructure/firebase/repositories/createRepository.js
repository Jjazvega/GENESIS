import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit as firestoreLimit,
  orderBy,
  query,
  setDoc,
  startAfter,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '@/firebase';
import { createAuditMutationMiddleware } from '@/infrastructure/firebase/mutations/auditMutationMiddleware';
import { normalizeObjectFilters } from '@/infrastructure/firebase/repositories/filterValidation';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const MAX_BATCH_SIZE = 450;

function normalizeLimit(value) {
  const parsed = Number(value || DEFAULT_PAGE_SIZE);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(parsed, MAX_PAGE_SIZE);
}

function chunkArray(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function serializeDocSnapshot(snapshot) {
  return {
    id: snapshot.id,
    ...snapshot.data(),
  };
}

function isArchivedRecord(record) {
  return record?.status === 'archived' || record?.deleted === true;
}

function filterActiveRecords(records) {
  return records.filter((record) => !isArchivedRecord(record));
}

function serializeQuerySnapshot(snapshot) {
  return filterActiveRecords(snapshot.docs.map(serializeDocSnapshot));
}

function buildQuery(collectionRef, options = {}) {
  /** @type {import('firebase/firestore').QueryConstraint[]} */
  const constraints = [];

  if (Array.isArray(options.where)) {
    for (const condition of options.where) {
      constraints.push(where(condition.field, condition.operator, condition.value));
    }
  }

  if (options.orderBy) {
    constraints.push(orderBy(options.orderBy.field, options.orderBy.direction || 'asc'));
  }

  if (options.cursor) {
    constraints.push(startAfter(options.cursor));
  }

  constraints.push(firestoreLimit(normalizeLimit(options.limit)));

  return query(collectionRef, ...constraints);
}

export const createRepository = (collectionName) => {
  const collectionRef = collection(db, collectionName);
  const auditMiddleware = createAuditMutationMiddleware({
    getCurrentUserUid: () => auth.currentUser?.uid || null,
    nowIso: () => new Date().toISOString(),
  });

  const newId = () => doc(collectionRef).id;

  const getById = async (id) => {
    const snapshot = await getDoc(doc(db, collectionName, id));

    if (!snapshot.exists()) {
      return null;
    }

    return serializeDocSnapshot(snapshot);
  };

  const list = async (options) => {
    if (!options || Object.keys(options).length === 0) {
      const snapshot = await getDocs(collectionRef);
      return serializeQuerySnapshot(snapshot);
    }

    const snapshot = await getDocs(buildQuery(collectionRef, options));
    const pageSize = normalizeLimit(options.limit);

    return {
      items: serializeQuerySnapshot(snapshot),
      lastCursor: snapshot.docs.at(-1) || null,
      hasMore: snapshot.docs.length === pageSize,
    };
  };

  const filter = async (field, operator, value) => {
    if (field && typeof field === 'object' && !Array.isArray(field)) {
      const normalizedFilters = normalizeObjectFilters(field, collectionName);
      /** @type {import('firebase/firestore').QueryConstraint[]} */
      const constraints = normalizedFilters
        .map(([filterField, filterValue]) => where(filterField, '==', filterValue));

      if (operator) {
        const direction = String(operator).startsWith('-') ? 'desc' : 'asc';
        constraints.push(orderBy(String(operator).replace(/^-/, ''), direction));
      }

      if (value) constraints.push(firestoreLimit(value));

      const snapshot = await getDocs(constraints.length ? query(collectionRef, ...constraints) : collectionRef);
      return serializeQuerySnapshot(snapshot);
    }

    const q = query(collectionRef, where(field, operator, value));
    const snapshot = await getDocs(q);
    return serializeQuerySnapshot(snapshot);
  };

  const create = async (data, id = null) => {
    const dataWithAudit = auditMiddleware.withCreateAuditFields(data);

    if (id) {
      const documentRef = doc(db, collectionName, id);
      await setDoc(documentRef, dataWithAudit);

      return {
        id,
        ...dataWithAudit,
      };
    }

    const documentRef = await addDoc(collectionRef, dataWithAudit);

    return {
      id: documentRef.id,
      ...dataWithAudit,
    };
  };

  const createWithId = (id, data) => create(data, id);

  const update = async (id, data) => {
    const documentRef = doc(db, collectionName, id);
    const dataWithAudit = auditMiddleware.withUpdateAuditFields(data);
    await updateDoc(documentRef, dataWithAudit);

    return {
      id,
      ...dataWithAudit,
    };
  };

  const bulkCreate = async (items = []) => {
    if (!Array.isArray(items)) {
      throw new TypeError('bulkCreate espera un arreglo');
    }

    if (items.length === 0) return [];

    const created = [];

    for (const chunk of chunkArray(items, MAX_BATCH_SIZE)) {
      const batch = writeBatch(db);

      for (const item of chunk) {
        const documentRef = doc(collectionRef);
        const dataWithAudit = auditMiddleware.withCreateAuditFields(item);
        batch.set(documentRef, dataWithAudit);
        created.push({ id: documentRef.id, ...dataWithAudit });
      }

      await batch.commit();
    }

    return created;
  };

  const archive = async (id) => {
    const archiveData = auditMiddleware.withUpdateAuditFields({
      status: 'archived',
      archivedAt: new Date().toISOString(),
    });

    await updateDoc(doc(db, collectionName, id), archiveData);
    return { id, ...archiveData };
  };

  return {
    get: getById,
    getById,
    list,
    filter,
    create,
    createWithId,
    bulkCreate,
    update,
    archive,
    newId,
  };
};
