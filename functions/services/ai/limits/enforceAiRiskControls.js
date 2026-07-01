const crypto = require('node:crypto');
const { fail } = require('../../../policies/httpPolicy');
const { APPROVAL_REQUIRED_ROLES } = require('../../domain/domainPolicy');
const { getUtcDateKey, toCounterNumber } = require('../shared/usage');
const { structuredLog } = require('../shared/logging');

const DEFAULT_HIGH_COST_APPROVAL_USD = 0.25;
const DEFAULT_REPEATED_PROMPT_THRESHOLD = 5;
const DEFAULT_FRAUD_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_OFF_HOURS_LIMIT = 20;
const DEFAULT_LABOR_START_HOUR_UTC = 8;
const DEFAULT_LABOR_END_HOUR_UTC = 20;

function getPositiveNumberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getAiRiskConfig() {
  return {
    highCostApprovalUsd: getPositiveNumberEnv('AI_HIGH_COST_APPROVAL_USD', DEFAULT_HIGH_COST_APPROVAL_USD),
    repeatedPromptThreshold: getPositiveNumberEnv('AI_REPEATED_PROMPT_THRESHOLD', DEFAULT_REPEATED_PROMPT_THRESHOLD),
    fraudWindowMs: getPositiveNumberEnv('AI_FRAUD_WINDOW_MS', DEFAULT_FRAUD_WINDOW_MS),
    offHoursLimit: getPositiveNumberEnv('AI_OFF_HOURS_LIMIT', DEFAULT_OFF_HOURS_LIMIT),
    laborStartHourUtc: getPositiveNumberEnv('AI_LABOR_START_HOUR_UTC', DEFAULT_LABOR_START_HOUR_UTC),
    laborEndHourUtc: getPositiveNumberEnv('AI_LABOR_END_HOUR_UTC', DEFAULT_LABOR_END_HOUR_UTC),
  };
}

function normalizePromptFingerprint(prompt) {
  return crypto
    .createHash('sha256')
    .update(String(prompt || '').trim().toLowerCase().replace(/\s+/g, ' '))
    .digest('hex')
    .slice(0, 32);
}

function isPrivilegedApprover(role) {
  return APPROVAL_REQUIRED_ROLES.has(String(role || '').trim().toLowerCase());
}

function getRiskDocIds({ companyId, uid, now = new Date() }) {
  const safeUid = String(uid || 'unknown').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 160) || 'unknown';
  return {
    budgetDocId: companyId,
    fraudDocId: `${companyId}_${safeUid}`,
    approvalDocId: `${getUtcDateKey(now)}_${companyId}_${safeUid}`,
  };
}

function enforceBudgetPolicy({ budgetData = {}, usageData = {}, estimatedCostUsd, estimatedTokens }) {
  if (budgetData.disabled === true || budgetData.status === 'blocked') fail(429, 'Presupuesto IA bloqueado para esta empresa.');

  const dailyBudgetUsd = Number(budgetData.dailyBudgetUsd || budgetData.dailyLimitUsd || 0);
  const dailyTokenLimit = Number(budgetData.dailyTokenLimit || 0);
  const usedBudgetUsd = toCounterNumber(usageData.reservedBudgetUsd) + toCounterNumber(usageData.budgetUsedUsd);
  const usedTokens = toCounterNumber(usageData.reservedTokens) + toCounterNumber(usageData.tokensUsed);

  if (Number.isFinite(dailyBudgetUsd) && dailyBudgetUsd > 0 && usedBudgetUsd + estimatedCostUsd > dailyBudgetUsd) {
    fail(429, 'Presupuesto diario IA configurado en backend excedido para esta empresa.');
  }
  if (Number.isFinite(dailyTokenLimit) && dailyTokenLimit > 0 && usedTokens + estimatedTokens > dailyTokenLimit) {
    fail(429, 'Cuota diaria de tokens IA configurada en backend excedida para esta empresa.');
  }
}

function enforceApprovalPolicy({ authorization, estimatedCostUsd, config }) {
  if (estimatedCostUsd < config.highCostApprovalUsd) return null;
  if (isPrivilegedApprover(authorization?.role)) return null;
  fail(403, 'Solicitud IA pendiente de aprobación: el costo estimado supera el umbral permitido para tu rol.');
  return null;
}

function enforceFraudPolicy({ fraudData = {}, prompt, now, correlationId, user, authorization, config }) {
  const nowMs = now.getTime();
  const blockedUntilMs = toCounterNumber(fraudData.blockedUntilMs);
  if (blockedUntilMs > nowMs) fail(429, 'Uso IA bloqueado temporalmente por controles antifraude.');

  const fingerprint = normalizePromptFingerprint(prompt);
  const windowStartedAtMs = toCounterNumber(fraudData.windowStartedAtMs);
  const windowExpired = !windowStartedAtMs || nowMs - windowStartedAtMs >= config.fraudWindowMs;
  const previousFingerprint = String(fraudData.lastPromptFingerprint || '');
  const repeatedPromptCount = windowExpired || previousFingerprint !== fingerprint
    ? 1
    : toCounterNumber(fraudData.repeatedPromptCount) + 1;
  if (repeatedPromptCount >= config.repeatedPromptThreshold) {
    structuredLog('WARNING', 'ai_fraud_repeated_prompt_blocked', { correlationId, firebaseUid: user.uid || 'unknown', companyId: authorization.companyId, repeatedPromptCount });
    fail(429, 'Solicitud IA bloqueada por patrón repetitivo potencialmente abusivo.');
  }

  const hour = now.getUTCHours();
  const offHours = hour < config.laborStartHourUtc || hour >= config.laborEndHourUtc;
  const offHoursCount = windowExpired ? (offHours ? 1 : 0) : toCounterNumber(fraudData.offHoursCount) + (offHours ? 1 : 0);
  if (offHoursCount > config.offHoursLimit) fail(429, 'Uso IA bloqueado temporalmente por actividad fuera de horario.');

  return {
    lastPromptFingerprint: fingerprint,
    repeatedPromptCount,
    offHoursCount,
    windowStartedAtMs: windowExpired ? nowMs : windowStartedAtMs,
    updatedAtMs: nowMs,
    companyId: authorization.companyId,
    userUid: user.uid || 'unknown',
  };
}

function enforceAiRiskControls({ transaction, db, user, authorization, prompt, usageRef, usageData, estimatedTokens, estimatedCostUsd, correlationId, now = new Date() }) {
  const config = getAiRiskConfig();
  const { budgetDocId, fraudDocId } = getRiskDocIds({ companyId: authorization.companyId, uid: user.uid, now });
  const budgetRef = db.collection('aiBudgets').doc(budgetDocId);
  const fraudRef = db.collection('aiFraudControls').doc(fraudDocId);

  return transaction.get(budgetRef).then((budgetSnap) => transaction.get(fraudRef).then((fraudSnap) => {
    const budgetData = budgetSnap.exists ? (budgetSnap.data() || {}) : {};
    const fraudData = fraudSnap.exists ? (fraudSnap.data() || {}) : {};
    enforceBudgetPolicy({ budgetData, usageData, estimatedCostUsd, estimatedTokens });
    enforceApprovalPolicy({ authorization, estimatedCostUsd, config });
    const fraudUpdate = enforceFraudPolicy({ fraudData, prompt, now, correlationId, user, authorization, config });
    transaction.set(fraudRef, fraudUpdate, { merge: true });
    transaction.set(usageRef, { lastRiskCheckedAtMs: now.getTime() }, { merge: true });
    return { budgetDocId, fraudDocId, config };
  }));
}

module.exports = {
  enforceAiRiskControls,
  enforceApprovalPolicy,
  enforceBudgetPolicy,
  enforceFraudPolicy,
  getAiRiskConfig,
  getRiskDocIds,
  isPrivilegedApprover,
  normalizePromptFingerprint,
};
