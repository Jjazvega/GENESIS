const { RELEASE_METADATA, getLlmModel, getLlmProvider } = require('../shared/config');
const { structuredLog } = require('../shared/logging');

const openAiApiKey = { value: () => process.env.OPENAI_API_KEY };
function extractOutputText(payload = {}) {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  const chunks = [];
  for (const item of payload.output || []) for (const content of item.content || []) if (content.type === 'output_text' && content.text) chunks.push(content.text);
  return chunks.join('\n').trim();
}
async function callOpenAIProvider({ apiKey, prompt, user, authorization, correlationId, model }) {
  const startedAt = Date.now();
  const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Correlation-Id': correlationId }, body: JSON.stringify({ model, input: [{ role: 'system', content: 'Eres GEMAILLA AI, un asistente financiero empresarial. Responde en español, con recomendaciones accionables y sin inventar datos no presentes en el contexto.' }, { role: 'user', content: prompt }], metadata: { firebase_uid: user.uid || 'unknown', company_id: authorization.companyId, company_role: authorization.role, correlation_id: correlationId, app_version: RELEASE_METADATA.appVersion, build_id: RELEASE_METADATA.buildId, git_sha: RELEASE_METADATA.gitSha, deploy_env: RELEASE_METADATA.deployEnv } }) });
  const latencyMs = Date.now() - startedAt;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    structuredLog('ERROR', 'openai_request_failed', { correlationId, firebaseUid: user.uid || 'unknown', status: response.status, latencyMs, message: payload?.error?.message || payload?.message || 'OpenAI error' });
    const error = new Error(payload?.error?.message || payload?.message || `El proveedor LLM respondió HTTP ${response.status}.`);
    error.status = response.status >= 500 ? 502 : response.status;
    throw error;
  }
  const outputText = extractOutputText(payload);
  if (!outputText) { const error = new Error('El proveedor LLM no devolvió texto utilizable.'); error.status = 502; throw error; }
  structuredLog('INFO', 'openai_request_completed', { correlationId, firebaseUid: user.uid || 'unknown', status: response.status, latencyMs, model });
  return { outputText, latencyMs, provider: 'openai', model, usage: payload.usage || {} };
}
async function askLLM({ prompt, user, authorization, correlationId }) {
  const provider = getLlmProvider();
  const model = getLlmModel(provider);
  if (provider !== 'openai') { const error = new Error(`Proveedor LLM no soportado: ${provider}. Configura LLM_PROVIDER=openai o agrega un adaptador en providers/openaiProvider.`); error.status = 501; throw error; }
  const apiKey = openAiApiKey.value() || process.env.OPENAI_API_KEY;
  if (!apiKey) { const error = new Error('Backend IA no configurado: falta OPENAI_API_KEY en Firebase Functions.'); error.status = 503; throw error; }
  return callOpenAIProvider({ apiKey, prompt, user, authorization, correlationId, model });
}
module.exports = { extractOutputText, callOpenAIProvider, askLLM };
