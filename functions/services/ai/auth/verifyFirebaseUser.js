const admin = require('firebase-admin');

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
    error.code = 'AUTH_REQUIRED';
    error.type = 'auth';
    throw error;
  }
  try {
    return await admin.auth().verifyIdToken(token);
  } catch (_error) {
    const error = new Error('Token de Firebase inválido o expirado.');
    error.status = 401;
    error.code = 'AUTH_INVALID';
    error.type = 'auth';
    throw error;
  }
}

module.exports = { getBearerToken, verifyFirebaseUser };
