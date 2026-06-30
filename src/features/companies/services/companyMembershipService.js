// @ts-check

import { firebase } from '@/api/firebaseClient';

const ACTIVE_STATUS = 'active';
const DEFAULT_INITIAL_OWNER_ROLE = 'director';

function compareMembershipsByCreation(a, b) {
  return String(a?.createdAt || '').localeCompare(String(b?.createdAt || ''))
    || String(a?.companyId || '').localeCompare(String(b?.companyId || ''))
    || String(a?.id || '').localeCompare(String(b?.id || ''));
}

function uniqueById(records) {
  const recordsById = new Map();
  records.forEach((record) => {
    if (record?.id) recordsById.set(record.id, record);
  });
  return Array.from(recordsById.values()).sort(compareMembershipsByCreation);
}

async function getActiveCompanyClaim(user) {
  if (!user?.getIdTokenResult) return null;
  const tokenResult = await user.getIdTokenResult().catch(() => null);
  const companyId = tokenResult?.claims?.companyId;
  return typeof companyId === 'string' && companyId.trim() ? companyId.trim() : null;
}

export async function loadCompanyMemberships(user) {
  const userUid = user?.uid || user?.id;
  const activeCompanyId = await getActiveCompanyClaim(user);
  if (userUid && activeCompanyId) {
    const [byId, byEmail] = await Promise.all([
      firebase.entities.CompanyMember.get(`${activeCompanyId}_${userUid}`).catch(() => null),
      user?.email
        ? firebase.entities.CompanyMember.filter({
          companyId: activeCompanyId,
          userEmail: user.email,
          status: ACTIVE_STATUS,
        }).catch(() => [])
        : [],
    ]);

    return uniqueById([
      byId?.status === ACTIVE_STATUS ? byId : null,
      ...byEmail,
    ].filter(Boolean));
  }

  const [byUid, byEmail] = await Promise.all([
    userUid
      ? firebase.entities.CompanyMember.filter({ userUid, status: ACTIVE_STATUS }).catch(() => [])
      : [],
    user?.email
      ? firebase.entities.CompanyMember.filter({ userEmail: user.email, status: ACTIVE_STATUS }).catch(() => [])
      : [],
  ]);

  return uniqueById([...byUid, ...byEmail]);
}

export async function loadCompaniesForMemberships(memberships) {
  const companyIds = [...new Set(memberships.map((member) => member.companyId).filter(Boolean))];
  return (
    await Promise.all(companyIds.map((companyId) => firebase.entities.Company.get(companyId).catch(() => null)))
  ).filter(Boolean);
}

export async function loadCompanyContextData(user) {
  const memberships = await loadCompanyMemberships(user);
  const companies = await loadCompaniesForMemberships(memberships);
  return { memberships, companies };
}

export async function loadActiveMembersForCompanies(companies = []) {
  const companyIds = companies.map((company) => company?.id).filter(Boolean);
  if (companyIds.length === 0) return [];

  const memberLists = await Promise.all(
    companyIds.map((companyId) => firebase.entities.CompanyMember.filter({
      companyId,
      status: ACTIVE_STATUS,
    }).catch(() => [])),
  );

  return memberLists.flat();
}

export function groupMembersByCompany(members = []) {
  return members.reduce((accumulator, member) => {
    if (!member?.companyId || member.status !== ACTIVE_STATUS) return accumulator;
    if (!accumulator[member.companyId]) accumulator[member.companyId] = [];
    accumulator[member.companyId].push(member);
    return accumulator;
  }, {});
}

export async function createCompanyForCurrentUser(companyData = {}, user = {}) {
  const company = await firebase.entities.Company.createCompanyWithInitialOwner(companyData, {
    userEmail: user.email,
    userName: user.fullName || user.displayName || user.email || '',
    role: DEFAULT_INITIAL_OWNER_ROLE,
    status: ACTIVE_STATUS,
  });

  return company;
}

export async function addCompanyMember(companyId, memberData = {}) {
  if (!companyId) throw new Error('companyId es obligatorio para agregar miembros.');
  return firebase.entities.CompanyMember.create({
    companyId,
    userEmail: memberData.userEmail,
    userName: memberData.userName || '',
    role: memberData.role,
    status: ACTIVE_STATUS,
  });
}
