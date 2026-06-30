import { auth } from '@/infrastructure/firebase/auth';
import { addDoc, collection, db } from '@/infrastructure/firebase/firestore';
import { ensureCorrelationId, getObservabilityEventPolicy, sanitizeObservabilityPayload } from '@/lib/observabilityPolicy';
export { createCorrelationId, ensureCorrelationId, getObservabilityEventPolicy, sanitizeObservabilityPayload } from '@/lib/observabilityPolicy';

const FALLBACK_APP_VERSION = '1.0.0';
const runtimeMetadata = typeof window !== 'undefined' ? window.GEMAILLA_RELEASE || {} : {};

export const releaseMetadata = Object.freeze({
  appVersion: import.meta.env.VITE_APP_VERSION || runtimeMetadata.APP_VERSION || __APP_VERSION__ || FALLBACK_APP_VERSION,
  buildId: import.meta.env.VITE_BUILD_ID || runtimeMetadata.BUILD_ID || __BUILD_ID__ || 'local',
  gitSha: import.meta.env.VITE_GIT_SHA || runtimeMetadata.GIT_SHA || __GIT_SHA__ || 'unknown',
  deployEnv: import.meta.env.VITE_DEPLOY_ENV || runtimeMetadata.DEPLOY_ENV || __DEPLOY_ENV__ || 'development',
});

export function getReleaseMetadata() {
  return releaseMetadata;
}

function getErrorPayload(error) {
  if (error instanceof Error) {
    return sanitizeObservabilityPayload({
      name: error.name,
      message: error.message,
      stack: error.stack || '',
    }, 0, 'error');
  }

  return sanitizeObservabilityPayload({
    name: 'NonError',
    message: typeof error === 'string' ? error : JSON.stringify(error),
    stack: '',
  }, 0, 'error');
}

function writeConsole(level, eventName, payload = {}) {
  const entry = sanitizeObservabilityPayload({
    severity: level.toUpperCase(),
    eventName,
    timestamp: new Date().toISOString(),
    ...releaseMetadata,
    ...payload,
  });

  if (level === 'error') console.error(JSON.stringify(entry));
  else if (level === 'warn') console.warn(JSON.stringify(entry));
  else console.info(JSON.stringify(entry));
}

export function logFrontendEvent(eventName, payload = {}, level = 'info') {
  const policy = getObservabilityEventPolicy(eventName, payload.severity || level);
  writeConsole(level, eventName, { ...payload, logPolicy: policy });
}

export async function persistObservabilityEvent(eventName, payload = {}) {
  const user = auth.currentUser || null;
  const policy = getObservabilityEventPolicy(eventName, payload.severity || 'INFO');
  if (!policy.persist) return null;

  const normalizedPayload = sanitizeObservabilityPayload({
    eventName,
    ...releaseMetadata,
    ...payload,
    logPolicy: policy,
    ownerUid: payload.ownerUid || user?.uid || '',
    createdAt: new Date().toISOString(),
  });

  if (!normalizedPayload.ownerUid && !payload.companyId) return null;
  return addDoc(collection(db, 'observabilityEvents'), normalizedPayload);
}

export async function captureFrontendError(error, context = {}) {
  const correlationId = ensureCorrelationId(context.correlationId, 'fe');
  const payload = {
    correlationId,
    severity: context.severity || 'ERROR',
    source: 'frontend',
    error: getErrorPayload(error),
    route: typeof window !== 'undefined' ? window.location.pathname : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    context: context.context || {},
  };

  logFrontendEvent('frontend_error', payload, 'error');
  await persistObservabilityEvent('frontend_error', payload).catch(() => null);
  return correlationId;
}

export function installGlobalErrorTracking() {
  if (typeof window === 'undefined' || window.__GEMAILLA_ERROR_TRACKING__) return;
  window.__GEMAILLA_ERROR_TRACKING__ = true;

  window.addEventListener('error', (event) => {
    captureFrontendError(event.error || event.message, {
      context: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    captureFrontendError(event.reason, {
      context: { type: 'unhandledrejection' },
    });
  });
}
