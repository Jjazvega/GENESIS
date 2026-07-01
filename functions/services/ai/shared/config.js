const DEFAULT_LLM_PROVIDER = 'openai';
const DEFAULT_MODEL = 'gpt-4o-mini';
const MAX_PROMPT_LENGTH = 12000;
const RELEASE_METADATA = Object.freeze({
  appVersion: process.env.APP_VERSION || '1.0.0',
  buildId: process.env.BUILD_ID || process.env.K_REVISION || 'local',
  gitSha: process.env.GIT_SHA || process.env.GITHUB_SHA || 'unknown',
  deployEnv: process.env.DEPLOY_ENV || process.env.NODE_ENV || 'production',
});
const ACTIVE_STATUSES = new Set(['active', 'activo']);
const AI_ALLOWED_ROLES = new Set(['owner', 'director', 'admin', 'editor']);
const COMPANY_ID_PATTERN = /^[A-Za-z0-9_-]{1,160}$/;
const MAX_REQUESTED_DOCUMENTS = 25;
const MAX_CORRELATION_ID_LENGTH = 160;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 30;
const DEFAULT_DAILY_TOKEN_LIMIT = 50000;
const DEFAULT_DAILY_BUDGET_USD = 5;
const DEFAULT_RESERVED_OUTPUT_TOKENS = 1200;
const DEFAULT_COST_PER_1K_TOKENS_USD = 0.002;
const AI_COST_LOG_COLLECTION = 'aiCostLogs';
const AI_AUDIT_LOG_COLLECTION = 'aiAuditLogs';
const TRACKED_AI_INTEGRATIONS = new Set(['ellmer', 'tidyllm', 'openai', 'gemini.R', 'groqR']);

function getPositiveNumberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getAiLimitConfig() {
  return {
    rateLimitWindowMs: getPositiveNumberEnv('AI_RATE_LIMIT_WINDOW_MS', DEFAULT_RATE_LIMIT_WINDOW_MS),
    rateLimitMaxRequests: getPositiveNumberEnv('AI_RATE_LIMIT_MAX_REQUESTS', DEFAULT_RATE_LIMIT_MAX_REQUESTS),
    dailyTokenLimit: getPositiveNumberEnv('AI_DAILY_TOKEN_LIMIT', DEFAULT_DAILY_TOKEN_LIMIT),
    dailyBudgetUsd: getPositiveNumberEnv('AI_DAILY_BUDGET_USD', DEFAULT_DAILY_BUDGET_USD),
    reservedOutputTokens: getPositiveNumberEnv('AI_RESERVED_OUTPUT_TOKENS', DEFAULT_RESERVED_OUTPUT_TOKENS),
    costPer1kTokensUsd: getPositiveNumberEnv('AI_COST_PER_1K_TOKENS_USD', DEFAULT_COST_PER_1K_TOKENS_USD),
  };
}

function getLlmProvider() {
  return String(process.env.LLM_PROVIDER || DEFAULT_LLM_PROVIDER).trim().toLowerCase();
}

function getLlmModel(provider = getLlmProvider()) {
  return process.env.LLM_MODEL || process.env.OPENAI_MODEL || (provider === 'openai' ? DEFAULT_MODEL : 'default');
}

module.exports = {
  DEFAULT_MODEL,
  MAX_PROMPT_LENGTH,
  RELEASE_METADATA,
  ACTIVE_STATUSES,
  AI_ALLOWED_ROLES,
  COMPANY_ID_PATTERN,
  MAX_REQUESTED_DOCUMENTS,
  MAX_CORRELATION_ID_LENGTH,
  AI_COST_LOG_COLLECTION,
  AI_AUDIT_LOG_COLLECTION,
  TRACKED_AI_INTEGRATIONS,
  getAiLimitConfig,
  getLlmProvider,
  getLlmModel,
};
