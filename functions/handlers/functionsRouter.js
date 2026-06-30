const { syncCompanyClaimsHandler } = require('./syncCompanyClaimsHandler');

const FUNCTION_HANDLERS = new Map([
  ['syncCompanyClaims', syncCompanyClaimsHandler],
]);

function getFunctionNameFromRequest(req) {
  const originalUrl = String(req.originalUrl || req.url || '');
  const pathname = originalUrl.split('?')[0];
  const marker = '/api/functions/';
  const markerIndex = pathname.indexOf(marker);
  const encodedName = markerIndex >= 0
    ? pathname.slice(markerIndex + marker.length).split('/')[0]
    : pathname.split('/').filter(Boolean).at(-1);

  try {
    return decodeURIComponent(encodedName || '').trim();
  } catch (_error) {
    return '';
  }
}

async function functionsRouterHandler(req, res) {
  const functionName = getFunctionNameFromRequest(req);
  const handler = FUNCTION_HANDLERS.get(functionName);

  if (!handler) {
    return res.status(404).json({
      error: functionName
        ? `Función interna no encontrada: ${functionName}.`
        : 'Función interna no especificada.',
    });
  }

  return handler(req, res);
}

module.exports = {
  FUNCTION_HANDLERS,
  functionsRouterHandler,
  getFunctionNameFromRequest,
};
