#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FRONTEND_REQUIRED = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];

const FUNCTIONS_REQUIRED = ['OPENAI_API_KEY'];
const PLACEHOLDER_PATTERN = /^(TU_|YOUR_|CHANGEME|REPLACE_ME|xxx$|unknown$|local$)/i;

function parseArgs(argv) {
  const options = { target: process.env.GEMAILLA_VALIDATE_ENV_TARGET || 'frontend' };
  for (const arg of argv) {
    if (arg.startsWith('--target=')) options.target = arg.slice('--target='.length);
    if (arg === '--all') options.target = 'all';
    if (arg === '--functions') options.target = 'functions';
    if (arg === '--frontend') options.target = 'frontend';
  }
  return options;
}

function readDotEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const values = {};
  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    values[key] = rawValue.replace(/^['"]|['"]$/g, '').trim();
  }
  return values;
}

function collectEnvironment() {
  return {
    ...readDotEnvFile(resolve('.env')),
    ...readDotEnvFile(resolve('.env.local')),
    ...process.env,
  };
}

function isPresent(value) {
  return typeof value === 'string' && value.trim().length > 0 && !PLACEHOLDER_PATTERN.test(value.trim());
}

function validateRequired(env, names) {
  return names.filter((name) => !isPresent(env[name]));
}

function getRequiredNames(target) {
  if (target === 'frontend') return FRONTEND_REQUIRED;
  if (target === 'functions') return FUNCTIONS_REQUIRED;
  if (target === 'all') return [...FRONTEND_REQUIRED, ...FUNCTIONS_REQUIRED];
  throw new Error(`Target no soportado: ${target}. Usa frontend, functions o all.`);
}

function main() {
  const { target } = parseArgs(process.argv.slice(2));
  const env = collectEnvironment();
  const requiredNames = getRequiredNames(target);
  const missing = validateRequired(env, requiredNames);

  if (missing.length > 0) {
    console.error('❌ Validación de entorno fallida. Faltan variables obligatorias o contienen placeholders:');
    for (const name of missing) console.error(`  - ${name}`);
    console.error('\nConfigura las variables en el entorno de CI, .env o .env.local antes de ejecutar builds/pruebas.');
    process.exit(1);
  }

  if (isPresent(env.VITE_OPENAI_API_KEY)) {
    console.error('❌ VITE_OPENAI_API_KEY no debe existir: expone secretos en el frontend. Usa OPENAI_API_KEY en Functions.');
    process.exit(1);
  }

  console.log(`✅ Entorno validado sin prompts interactivos (target: ${target}).`);
}

main();
