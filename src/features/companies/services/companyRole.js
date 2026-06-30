// @ts-check

export function getCompanyRole({ activeCompany, memberships, user }) {
  if (!activeCompany || !user) return null;
  const userUid = user?.uid || user?.id;
  const membership = memberships.find((member) => member.companyId === activeCompany.id);
  return membership?.role || (activeCompany.ownerUid === userUid ? 'director' : null);
}
