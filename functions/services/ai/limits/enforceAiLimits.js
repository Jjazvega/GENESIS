const admin = require('firebase-admin');
const { fail } = require('../../../policies/httpPolicy');
const { getAiLimitConfig } = require('../shared/config');
const { estimateTokenCount, getUtcDateKey, toCounterNumber } = require('../shared/usage');
const { structuredLog } = require('../shared/logging');
const { enforceAiRiskControls } = require('./enforceAiRiskControls');

function getLimitDocIds({ companyId, uid, now = new Date() }) {
  const safeUid = String(uid || 'unknown').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 160) || 'unknown';
  return { usageDocId: `${getUtcDateKey(now)}_${companyId}`, rateDocId: `${companyId}_${safeUid}` };
}
async function enforceAiLimits({ user, authorization, prompt, correlationId, now = new Date() }) {
  const config = getAiLimitConfig();
  const estimatedTokens = estimateTokenCount(prompt) + config.reservedOutputTokens;
  const estimatedCostUsd = (estimatedTokens / 1000) * config.costPer1kTokensUsd;
  const { usageDocId, rateDocId } = getLimitDocIds({ companyId: authorization.companyId, uid: user.uid, now });
  const db = admin.firestore();
  const rateRef = db.collection('aiRateLimits').doc(rateDocId);
  const usageRef = db.collection('aiUsage').doc(usageDocId);
  const nowMs = now.getTime();
  const reservation = { usageDocId, rateDocId, estimatedTokens, estimatedCostUsd, reservedAtMs: nowMs, reservationStatus: 'reserved' };
  await db.runTransaction(async (transaction) => {
    const rateSnap = await transaction.get(rateRef);
    const rateData = rateSnap.exists ? (rateSnap.data() || {}) : {};
    const windowStartedAtMs = toCounterNumber(rateData.windowStartedAtMs);
    const requestCount = toCounterNumber(rateData.requestCount);
    const windowExpired = !windowStartedAtMs || nowMs - windowStartedAtMs >= config.rateLimitWindowMs;
    const nextRequestCount = windowExpired ? 1 : requestCount + 1;
    if (!windowExpired && requestCount >= config.rateLimitMaxRequests) {
      structuredLog('WARNING', 'ai_rate_limit_exceeded', { correlationId, firebaseUid: user.uid || 'unknown', companyId: authorization.companyId, requestCount, rateLimitMaxRequests: config.rateLimitMaxRequests, rateLimitWindowMs: config.rateLimitWindowMs });
      fail(429, 'Límite de frecuencia de IA excedido. Intenta de nuevo más tarde.', 'AI_RATE_LIMIT_EXCEEDED');
    }
    const usageSnap = await transaction.get(usageRef);
    const usageData = usageSnap.exists ? (usageSnap.data() || {}) : {};
    const usedTokens = toCounterNumber(usageData.reservedTokens) + toCounterNumber(usageData.tokensUsed);
    const usedBudgetUsd = toCounterNumber(usageData.reservedBudgetUsd) + toCounterNumber(usageData.budgetUsedUsd);
    if (usedTokens + estimatedTokens > config.dailyTokenLimit) fail(429, 'Cuota diaria de tokens IA excedida para esta empresa.', 'AI_DAILY_TOKEN_QUOTA_EXCEEDED');
    if (usedBudgetUsd + estimatedCostUsd > config.dailyBudgetUsd) fail(429, 'Presupuesto diario de IA excedido para esta empresa.', 'AI_DAILY_BUDGET_EXCEEDED');
    await enforceAiRiskControls({ transaction, db, user, authorization, prompt, usageRef, usageData, estimatedTokens, estimatedCostUsd, correlationId, now });
    transaction.set(rateRef, { companyId: authorization.companyId, userUid: user.uid || 'unknown', windowStartedAtMs: windowExpired ? nowMs : windowStartedAtMs, requestCount: nextRequestCount, updatedAtMs: nowMs }, { merge: true });
    transaction.set(usageRef, { companyId: authorization.companyId, dateKey: getUtcDateKey(now), reservedTokens: Math.max(0, toCounterNumber(usageData.reservedTokens) + estimatedTokens), reservedBudgetUsd: Number(Math.max(0, toCounterNumber(usageData.reservedBudgetUsd) + estimatedCostUsd).toFixed(8)), requestCount: toCounterNumber(usageData.requestCount) + 1, updatedAtMs: nowMs }, { merge: true });
  });
  return reservation;
}
module.exports = { getLimitDocIds, enforceAiLimits };
