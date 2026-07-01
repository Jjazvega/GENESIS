import { db } from '@/firebase';
import { collection, doc, runTransaction } from 'firebase/firestore';
import { ENTITY_COLLECTIONS } from '@/infrastructure/firebase/repositories/entityCollections';
import { normalizeData } from '@/infrastructure/firebase/repositories/normalization';
import { createRepository } from '@/infrastructure/firebase/repositories/createRepository';
import {
  getCurrentUser,
  getCurrentUserUid,
  mutations,
  syncUserProfile,
} from '@/api/authClient';

// Public entity mutations. Treat each method in this file as a frontend API boundary.

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

export function buildEntities() {
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

export { ENTITY_COLLECTIONS };
