#!/usr/bin/env node
import { setTimeout as delay } from 'node:timers/promises';

const baseUrl = process.env.STAGING_BASE_URL || process.env.PLAYWRIGHT_BASE_URL;
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 15000);
const retries = Number(process.env.SMOKE_RETRIES || 3);

if (!baseUrl) {
  console.error('Missing STAGING_BASE_URL or PLAYWRIGHT_BASE_URL for staging smoke tests.');
  process.exit(1);
}

const checks = [
  { name: 'hosting root', path: '/', ok: (r, body) => r.ok && body.includes('<div id="root"') },
  { name: 'SPA fallback', path: '/__smoke__/route-fallback', ok: (r, body) => r.ok && body.includes('<div id="root"') },
  { name: 'AI endpoint rejects unauthenticated traffic', path: '/api/ai', options: { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'smoke' }) }, ok: (r) => [401, 403, 405].includes(r.status) },
];

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const failures = [];
for (const check of checks) {
  const url = new URL(check.path, baseUrl).toString();
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, check.options);
      const body = await response.text();
      if (check.ok(response, body)) {
        console.log(`ok ${check.name}: ${response.status} ${url}`);
        lastError = undefined;
        break;
      }
      lastError = new Error(`unexpected status/body: ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < retries) await delay(1000 * attempt);
  }
  if (lastError) failures.push(`${check.name}: ${lastError.message}`);
}

if (failures.length > 0) {
  console.error('Staging smoke tests failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
