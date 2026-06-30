const DEFAULT_ALLOWED_ORIGINS = Object.freeze([
  'https://gemailla.com',
  'https://www.gemailla.com',
  'https://gemailla-enterprise.firebaseapp.com',
  'https://gemailla-enterprise.web.app',
]);

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function getAllowedOrigins() {
  const configuredOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configuredOrigins.length > 0 ? configuredOrigins : [...DEFAULT_ALLOWED_ORIGINS];
}

function applyCors(req, res) {
  const allowedOrigins = getAllowedOrigins();
  const requestOrigin = req.get('origin');

  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    res.set('Access-Control-Allow-Origin', requestOrigin);
  }

  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Correlation-Id');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

function enforceAllowedOrigin(req) {
  const requestOrigin = req.get('origin');
  if (!requestOrigin) return;

  const allowedOrigins = getAllowedOrigins();
  if (!allowedOrigins.includes(requestOrigin)) {
    fail(403, 'CORS no permitido para este origen.');
  }
}

module.exports = { DEFAULT_ALLOWED_ORIGINS, applyCors, enforceAllowedOrigin, fail, getAllowedOrigins };
