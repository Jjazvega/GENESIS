import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const config = JSON.parse(await readFile(new URL('../../docs/observability/monitoring-config.json', import.meta.url), 'utf8'));

describe('monitoring configuration', () => {
  it('covers required stabilization alert policies', () => {
    const requiredAlertIds = [
      'cloud-functions-errors',
      'ai-failures',
      'ai-daily-token-cost-by-company',
      'storage-errors',
      'security-rules-denials-anomaly',
    ];

    assert.deepEqual(
      requiredAlertIds.filter((id) => !config.alertPolicies.some((policy) => policy.id === id)),
      [],
    );
  });

  it('defines the minimum AI usage, cost and audit dashboard widgets', () => {
    const widgetIds = config.dashboard.widgets.map((widget) => widget.id).sort();
    assert.deepEqual(widgetIds, ['aiAuditLogs', 'aiCostLogs', 'aiUsage']);
  });

  it('documents reviewed AI cost and rate-limit defaults', () => {
    assert.equal(config.reviewedDefaults.AI_DAILY_TOKEN_LIMIT.value, 50000);
    assert.equal(config.reviewedDefaults.AI_DAILY_BUDGET_USD.value, 5);
    assert.equal(config.reviewedDefaults.AI_RATE_LIMIT_MAX_REQUESTS.value, 30);
    assert.equal(config.reviewedDefaults.AI_RATE_LIMIT_MAX_REQUESTS.windowMs, 60000);
  });
});
