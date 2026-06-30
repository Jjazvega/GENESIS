const FIREBASE_CONFIG_KEYS = new Set([
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
  'measurementId',
]);

const RELEASE_CONFIG_KEYS = new Set(['appVersion', 'buildId', 'gitSha', 'deployEnv']);

function coerceStringMap(value, allowedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, entryValue]) => allowedKeys.has(key) && typeof entryValue === 'string')
      .map(([key, entryValue]) => [key, entryValue.trim()]),
  );
}

export function ensureRuntimeConfigDefaults(targetWindow = window) {
  targetWindow.GEMAILLA_FIREBASE_CONFIG = coerceStringMap(targetWindow.GEMAILLA_FIREBASE_CONFIG, FIREBASE_CONFIG_KEYS);
  targetWindow.GEMAILLA_USE_FIREBASE_EMULATORS = targetWindow.GEMAILLA_USE_FIREBASE_EMULATORS ?? 'auto';
  targetWindow.GEMAILLA_RELEASE = coerceStringMap(targetWindow.GEMAILLA_RELEASE, RELEASE_CONFIG_KEYS);
}

function parseJsLiteral(literal) {
  const normalized = literal
    .replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, '$1"$2":')
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/'/g, '"');
  return JSON.parse(normalized);
}

function parseRuntimeConfigAssignments(raw) {
  const allowedStatement = /window\.(GEMAILLA_FIREBASE_CONFIG|GEMAILLA_USE_FIREBASE_EMULATORS|GEMAILLA_RELEASE)\s*=\s*([\s\S]*?)\s*;/g;
  const payload = {};
  let cursor = 0;
  let matched = false;

  for (const match of raw.matchAll(allowedStatement)) {
    if (raw.slice(cursor, match.index).trim()) return null;
    matched = true;
    payload[match[1]] = parseJsLiteral(match[2]);
    cursor = match.index + match[0].length;
  }

  if (raw.slice(cursor).trim()) return null;

  return matched ? payload : null;
}


export function isRuntimeConfigPayload(text = '') {
  const raw = String(text || '').trim();
  return raw.startsWith('{')
    || raw.startsWith('window.GEMAILLA_FIREBASE_CONFIG')
    || raw.startsWith('window.GEMAILLA_USE_FIREBASE_EMULATORS')
    || raw.startsWith('window.GEMAILLA_RELEASE');
}

export function parseRuntimeConfig(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return {};

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    const assignmentConfig = parseRuntimeConfigAssignments(raw);
    if (!assignmentConfig) {
      throw new Error('app-config.js contiene código no permitido; solo se aceptan JSON o asignaciones literales de configuración.');
    }
    payload = assignmentConfig;
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('app-config.js debe contener un objeto de configuración.');
  }

  return {
    firebaseConfig: coerceStringMap(payload.GEMAILLA_FIREBASE_CONFIG || payload.firebaseConfig, FIREBASE_CONFIG_KEYS),
    useFirebaseEmulators: payload.GEMAILLA_USE_FIREBASE_EMULATORS ?? payload.useFirebaseEmulators,
    release: coerceStringMap(payload.GEMAILLA_RELEASE || payload.release, RELEASE_CONFIG_KEYS),
  };
}

export function applyRuntimeConfig(config = {}, targetWindow = window) {
  if (config.firebaseConfig) targetWindow.GEMAILLA_FIREBASE_CONFIG = config.firebaseConfig;
  if (['auto', true, false, 'true', 'false'].includes(config.useFirebaseEmulators)) {
    targetWindow.GEMAILLA_USE_FIREBASE_EMULATORS = config.useFirebaseEmulators;
  }
  if (config.release) targetWindow.GEMAILLA_RELEASE = config.release;
  ensureRuntimeConfigDefaults(targetWindow);
}
