import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const firebaseClientSource = await readFile(new URL('../../src/api/firebaseClient.js', import.meta.url), 'utf8');
const aiClientSource = await readFile(new URL('../../src/api/aiClient.js', import.meta.url), 'utf8');
const repoClientSource = await readFile(new URL('../../src/api/repoClient.js', import.meta.url), 'utf8');
const authClientSource = await readFile(new URL('../../src/api/authClient.js', import.meta.url), 'utf8');
const aiAssistantSource = await readFile(new URL('../../src/pages/AIAssistant.jsx', import.meta.url), 'utf8');

// Helper: strip single-line comment lines before checking for declarations
function stripComments(source) {
  return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function collectSourceFilesRecursively(dirUrl, files = []) {
  let entries;
  try {
    entries = await readdir(dirUrl, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return files;
    throw error;
  }
  for (const entry of entries) {
    const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dirUrl);
    if (entry.isDirectory()) {
      await collectSourceFilesRecursively(entryUrl, files);
      continue;
    }
    if (/\.(?:js|jsx|ts|tsx|mjs|cjs)$/.test(entry.name)) {
      files.push(entryUrl);
    }
  }
  return files;
}

describe('firebaseClient: solo exporta primitivas de Firebase', () => {
  it('no contiene declaraciones de funciones de negocio', () => {
    const code = stripComments(firebaseClientSource);
    // Precise pattern: actual function declarations (not merely the word "function" in a comment)
    assert.doesNotMatch(code, /\b(?:export\s+)?(?:async\s+)?function\s+[a-zA-Z_$][\w$]*\s*\(/);
    assert.doesNotMatch(code, /\bclass\s+[a-zA-Z_$][\w$]*/);
  });

  it('re-exporta los primitivos esperados de @/firebase', () => {
    assert.match(firebaseClientSource, /export.*app.*from\s+['"]@\/firebase['"]/);
    assert.match(firebaseClientSource, /export.*auth.*from\s+['"]@\/firebase['"]/);
    assert.match(firebaseClientSource, /export.*db.*from\s+['"]@\/firebase['"]/);
    assert.match(firebaseClientSource, /export.*storage.*from\s+['"]@\/firebase['"]/);
  });

  it('no importa db ni módulos de negocio directamente', () => {
    assert.doesNotMatch(firebaseClientSource, /import.*mutations/);
    assert.doesNotMatch(firebaseClientSource, /import.*createRepository/);
    assert.doesNotMatch(firebaseClientSource, /import.*invokeLLM/);
  });
});

describe('aiClient: aislamiento de base de datos', () => {
  it('no importa db de @/firebase (sin acceso a Firestore)', () => {
    const stripped = stripComments(aiClientSource);
    // Check destructured imports
    const destructuredMatch = stripped.match(/import\s*\{([^}]+)\}\s*from\s*['"]@\/firebase['"]/);
    if (destructuredMatch) {
      assert.doesNotMatch(destructuredMatch[1], /\bdb\b/, 'aiClient.js no debe importar db de @/firebase');
    }
    // Check namespace imports
    assert.doesNotMatch(stripped, /import\s*\*\s*as\s+\w+\s*from\s*['"]@\/firebase['"]/);
    // Check default import (which would give indirect db access)
    assert.doesNotMatch(stripped, /^import\s+[a-zA-Z_$][\w$]*\s*from\s*['"]@\/firebase['"]/m);
  });

  it('valida inputs con esquemas Zod', () => {
    assert.match(aiClientSource, /from 'zod'/);
    assert.match(aiClientSource, /InvokeLLMSchema/);
    assert.match(aiClientSource, /InvokeFunctionSchema/);
    assert.match(aiClientSource, /z\.object/);
    assert.match(aiClientSource, /\.safeParse/);
    assert.match(aiClientSource, /MAX_PROMPT_LENGTH = 12000/);
    assert.match(aiClientSource, /MAX_REQUESTED_DOCUMENTS = 25/);
    assert.match(aiClientSource, /\.strict\(\)/);
  });

  it('usa InvokeFunctionSchema para validar invokeFunction', () => {
    assert.match(aiClientSource, /InvokeFunctionSchema\.safeParse/);
  });

  it('no accede directamente a Firestore (colecciones internas)', () => {
    assert.doesNotMatch(aiClientSource, /collection\(db/);
    assert.doesNotMatch(aiClientSource, /doc\(db/);
    assert.doesNotMatch(aiClientSource, /getDoc\(/);
    assert.doesNotMatch(aiClientSource, /setDoc\(/);
    assert.doesNotMatch(aiClientSource, /updateDoc\(/);
    assert.doesNotMatch(aiClientSource, /runTransaction\(/);
  });
});

describe('repoClient: exposición del facade de dominio', () => {
  it('importa operaciones AI desde aiClient (no las reimplementa)', () => {
    assert.match(repoClientSource, /from '@\/api\/aiClient'/);
    assert.match(repoClientSource, /invokeLLM/);
    assert.match(repoClientSource, /invokeFunction/);
  });

  it('importa operaciones de auth desde authClient (no las reimplementa)', () => {
    assert.match(repoClientSource, /from '@\/api\/authClient'/);
    assert.match(repoClientSource, /getCurrentUser/);
    assert.match(repoClientSource, /me,/);
    assert.match(repoClientSource, /logout,/);
  });

  it('exporta el facade firebase como default y named export', () => {
    assert.match(repoClientSource, /export const firebase = /);
    assert.match(repoClientSource, /export default firebase/);
  });

  it('enruta la persistencia de conversaciones IA por funciones backend seguras', () => {
    assert.match(repoClientSource, /invokeFunction\('createAiConversation'/);
    assert.match(repoClientSource, /invokeFunction\('appendAiConversationMessage'/);
    assert.doesNotMatch(repoClientSource, /collection\(db,\s*'aiConversations'\)/);
    assert.doesNotMatch(repoClientSource, /getDoc\(/);
    assert.doesNotMatch(repoClientSource, /mutations\.add\(collection\(db,\s*'aiConversations'/);
    assert.doesNotMatch(repoClientSource, /mutations\.update\(doc\(db,\s*'aiConversations'/);
  });
});

describe('authClient: operaciones de autenticación', () => {
  it('exporta getAuthHeader, me, logout y syncUserProfile', () => {
    assert.match(authClientSource, /export async function getAuthHeader/);
    assert.match(authClientSource, /export async function me/);
    assert.match(authClientSource, /export async function logout/);
    assert.match(authClientSource, /export async function syncUserProfile/);
  });

  it('usa auth y db de @/firebase para operaciones de perfil', () => {
    assert.match(authClientSource, /from '@\/firebase'/);
    assert.match(authClientSource, /\bauth\b/);
    assert.match(authClientSource, /\bdb\b/);
  });
});

describe('frontera Zero-Trust IA en UI', () => {
  it('evita persistir conversaciones IA directamente desde AIAssistant', () => {
    assert.match(aiAssistantSource, /firebase\.functions\.invoke\('createAiConversation'/);
    assert.doesNotMatch(aiAssistantSource, /AIConversation\.create\(/);
    assert.doesNotMatch(aiAssistantSource, /logAction\(/);
  });

  it('bloquea imports directos de SDKs de proveedores IA en capas visuales', async () => {
    const roots = [
      new URL('../../src/components/', import.meta.url),
      new URL('../../src/features/', import.meta.url),
      new URL('../../src/modules/', import.meta.url),
      new URL('../../src/pages/', import.meta.url),
    ];
    const providerImportPattern = /(?:^\s*import\s+.*from\s+['"](openai|anthropic|@anthropic-ai\/sdk|@google-cloud\/vertexai|@google\/generative-ai)['"]|require\(['"](openai|anthropic|@anthropic-ai\/sdk|@google-cloud\/vertexai|@google\/generative-ai)['"]\))/m;
    const offenders = [];

    for (const root of roots) {
      const files = await collectSourceFilesRecursively(root);
      for (const file of files) {
        const source = await readFile(file, 'utf8');
        if (providerImportPattern.test(source)) {
          offenders.push(file.pathname);
        }
      }
    }

    assert.deepEqual(offenders, []);
  });
});
