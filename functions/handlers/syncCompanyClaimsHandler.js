const admin = require('firebase-admin');
const { applyCors, enforceAllowedOrigin } = require('../policies/httpPolicy');
const { requireCompanyId, validateCompanyAccess } = require('./aiHandler');

const COMPANY_ADMIN_ROLES = new Set(['owner', 'director', 'admin']);
const AI_ALLOWED_ROLES = new Set(['owner', 'director', 'admin', 'editor']);

function getBearerToken(req) {
  const authHeader = req.get('authorization') || '';
  const [scheme, token] = authHeader.split(' ');
  return scheme?.toLowerCase() === 'bearer' ? token : null;
}

async function verifyFirebaseUser(req) {
  const token = getBearerToken(req);
  if (!token) {
    const error = new Error('Autenticación requerida para usar IA.');
    error.status = 401;
    throw error;
  }

  try {
    return await admin.auth().verifyIdToken(token);
  } catch (_error) {
    const error = new Error('Token de Firebase inválido o expirado.');
    error.status = 401;
    throw error;
  }
}

function getRoleForClaims(role) {
  const normalized = String(role || '').trim().toLowerCase();
  return AI_ALLOWED_ROLES.has(normalized) || COMPANY_ADMIN_ROLES.has(normalized) ? normalized : 'viewer';
}

async function syncCompanyClaimsHandler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    try {
      enforceAllowedOrigin(req);
      return res.status(204).send('');
    } catch (error) {
      return res.status(Number(error.status) || 403).json({ error: error.message || 'CORS no permitido para este origen.' });
    }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });

  try {
    enforceAllowedOrigin(req);
    const user = await verifyFirebaseUser(req);
    const companyId = requireCompanyId(req.body || {});
    const access = await validateCompanyAccess({ user, companyId });
    const companyRole = getRoleForClaims(access.role);
    await admin.auth().setCustomUserClaims(user.uid, { companyId, companyRole, role: companyRole });
    return res.status(200).json({ success: true, companyId, companyRole });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return res.status(status).json({ error: error?.message || 'No se pudieron sincronizar los claims.' });
  }
}

module.exports = { getRoleForClaims, syncCompanyClaimsHandler };
