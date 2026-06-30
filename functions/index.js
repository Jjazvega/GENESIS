const admin = require('firebase-admin');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

admin.initializeApp();

const openAiApiKey = defineSecret('OPENAI_API_KEY');
const aiExports = require('./handlers/aiHandler');
const { syncCompanyClaimsHandler, getRoleForClaims } = require('./handlers/syncCompanyClaimsHandler');
const { functionsRouterHandler } = require('./handlers/functionsRouter');

exports.ai = onRequest({ cors: false, secrets: [openAiApiKey] }, aiExports.aiHandler);
exports.syncCompanyClaims = onRequest({ cors: false }, syncCompanyClaimsHandler);
exports.functionsRouter = onRequest({ cors: false }, functionsRouterHandler);

exports._test = {
  ...aiExports,
  syncCompanyClaimsHandler,
  functionsRouterHandler,
  getRoleForClaims,
};
