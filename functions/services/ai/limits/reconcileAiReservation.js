const admin = require('firebase-admin');
const { calculateCostUsd, toCounterNumber } = require('../shared/usage');
const { structuredLog } = require('../shared/logging');

function calculateActualAiUsage({ status, usage, estimatedTokens }) {
  if (status === 'failed' && !usage) return { actualTokens: 0, actualCostUsd: 0 };
  const hasUsage = usage && typeof usage === 'object';
  let actualTokens = 0;
  if (hasUsage && usage.total_tokens !== undefined && usage.total_tokens !== null) actualTokens = toCounterNumber(usage.total_tokens);
  else if (hasUsage && (usage.input_tokens !== undefined || usage.output_tokens !== undefined || usage.prompt_tokens !== undefined || usage.completion_tokens !== undefined)) actualTokens = toCounterNumber(usage.input_tokens || usage.prompt_tokens) + toCounterNumber(usage.output_tokens || usage.completion_tokens);
  else if (status === 'completed') actualTokens = toCounterNumber(estimatedTokens);
  actualTokens = Math.max(0, actualTokens);
  return { actualTokens, actualCostUsd: calculateCostUsd(actualTokens) };
}
async function reconcileAiReservation({ user, authorization, reservation, status, usage, provider, model, correlationId }) {
  if (!reservation?.usageDocId) { const error = new Error('No se puede reconciliar una reserva IA sin usageDocId.'); error.status = 500; throw error; }
  if (status !== 'completed' && status !== 'failed') { const error = new Error('Estado de reconciliación IA inválido.'); error.status = 500; throw error; }
  const db = admin.firestore();
  const usageRef = db.collection('aiUsage').doc(reservation.usageDocId);
  const estimatedTokens = toCounterNumber(reservation.estimatedTokens);
  const estimatedCostUsd = toCounterNumber(reservation.estimatedCostUsd);
  const { actualTokens, actualCostUsd } = calculateActualAiUsage({ status, usage, estimatedTokens });
  const nowMs = Date.now();
  await db.runTransaction(async (transaction) => {
    const usageSnap = await transaction.get(usageRef);
    const usageData = usageSnap.exists ? (usageSnap.data() || {}) : {};
    const baseUpdate = { companyId: authorization.companyId, userUid: user.uid || 'unknown', reservedTokens: Math.max(0, toCounterNumber(usageData.reservedTokens) - estimatedTokens), reservedBudgetUsd: Number(Math.max(0, toCounterNumber(usageData.reservedBudgetUsd) - estimatedCostUsd).toFixed(8)), provider, model, lastCorrelationId: correlationId, updatedAtMs: nowMs };
    if (status === 'completed') transaction.set(usageRef, { ...baseUpdate, tokensUsed: Math.max(0, toCounterNumber(usageData.tokensUsed)) + actualTokens, budgetUsedUsd: Number((Math.max(0, toCounterNumber(usageData.budgetUsedUsd)) + actualCostUsd).toFixed(8)), completedRequestCount: toCounterNumber(usageData.completedRequestCount) + 1 }, { merge: true });
    else transaction.set(usageRef, { ...baseUpdate, tokensUsed: Math.max(0, toCounterNumber(usageData.tokensUsed)), budgetUsedUsd: Number(Math.max(0, toCounterNumber(usageData.budgetUsedUsd)).toFixed(8)), failedRequestCount: toCounterNumber(usageData.failedRequestCount) + 1 }, { merge: true });
  });
  structuredLog('INFO', 'ai_reservation_reconciled', { correlationId, companyId: authorization.companyId, firebaseUid: user.uid || 'unknown', status, usageDocId: reservation.usageDocId, estimatedTokens, actualTokens, actualCostUsd });
  return { tokens: actualTokens, costUsd: actualCostUsd, costo: actualCostUsd };
}
module.exports = { calculateActualAiUsage, reconcileAiReservation };
