const admin = require('firebase-admin');
const { fail } = require('../../../policies/httpPolicy');
const { ACTIVE_STATUSES, AI_ALLOWED_ROLES, COMPANY_ID_PATTERN } = require('../shared/config');

function requireCompanyId(body = {}) {
  const companyId = typeof body.companyId === 'string' ? body.companyId.trim() : '';
  if (!companyId) fail(400, 'El campo companyId es obligatorio para usar IA.');
  if (!COMPANY_ID_PATTERN.test(companyId)) fail(400, 'companyId inválido.');
  return companyId;
}
function isActiveStatus(status) { return ACTIVE_STATUSES.has(String(status || '').toLowerCase()); }
async function validateCompanyAccess({ user, companyId }) {
  const companyRef = admin.firestore().collection('companies').doc(companyId);
  const companySnap = await companyRef.get();
  if (!companySnap.exists) fail(403, 'Empresa no válida o sin acceso.');
  const company = companySnap.data() || {};
  if (!isActiveStatus(company.status)) fail(403, 'La empresa no está activa para usar IA.');
  const ownerUid = company.ownerUid || company.createdBy;
  if (ownerUid === user.uid) return { companyRef, company, role: 'owner', membership: null };
  const membershipId = `${companyId}_${user.uid}`;
  const membershipSnap = await admin.firestore().collection('companyMembers').doc(membershipId).get();
  if (!membershipSnap.exists) fail(403, 'Se requiere membresía activa en la empresa para usar IA.');
  const membership = membershipSnap.data() || {};
  if (membership.companyId !== companyId || membership.userUid !== user.uid || !isActiveStatus(membership.status)) fail(403, 'Se requiere membresía activa en la empresa para usar IA.');
  const role = String(membership.role || '').trim().toLowerCase();
  if (!AI_ALLOWED_ROLES.has(role)) fail(403, 'Tu rol no permite usar IA en esta empresa.');
  return { companyRef, company, role, membership };
}
module.exports = { requireCompanyId, isActiveStatus, validateCompanyAccess };
