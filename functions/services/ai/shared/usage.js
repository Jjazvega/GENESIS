const { getAiLimitConfig, TRACKED_AI_INTEGRATIONS } = require('./config');

function estimateTokenCount(text = '') { return Math.max(1, Math.ceil(String(text).length / 4)); }
function getUtcDateKey(now = new Date()) { return now.toISOString().slice(0, 10); }
function toCounterNumber(value) { return Number.isFinite(Number(value)) ? Number(value) : 0; }
function normalizeAiIntegration(value) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  return TRACKED_AI_INTEGRATIONS.has(candidate) ? candidate : 'openai';
}
function getUsageTokens(usage = {}) {
  const inputTokens = toCounterNumber(usage.input_tokens || usage.prompt_tokens);
  const outputTokens = toCounterNumber(usage.output_tokens || usage.completion_tokens);
  const totalTokens = toCounterNumber(usage.total_tokens) || inputTokens + outputTokens;
  return { inputTokens, outputTokens, totalTokens };
}
function calculateCostUsd(totalTokens, costPer1kTokensUsd = getAiLimitConfig().costPer1kTokensUsd) {
  return Number(((toCounterNumber(totalTokens) / 1000) * costPer1kTokensUsd).toFixed(8));
}
module.exports = { estimateTokenCount, getUtcDateKey, toCounterNumber, normalizeAiIntegration, getUsageTokens, calculateCostUsd };
