import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const firebaseClientSource = await readFile(new URL('../../src/api/firebaseClient.js', import.meta.url), 'utf8');
const aiClientSource = await readFile(new URL('../../src/api/aiClient.js', import.meta.url), 'utf8');
const repoClientSource = await readFile(new URL('../../src/api/repoClient.js', import.meta.url), 'utf8');
const authClientSource = await readFile(new URL('../../src/api/authClient.js', import.meta.url), 'utf8');
const entityClientSource = await readFile(new URL('../../src/api/entityClient.js', import.meta.url), 'utf8');
const agentClientSource = await readFile(new URL('../../src/api/agentClient.js', import.meta.url), 'utf8');

// Helper: strip single-line comment lines before checking for declarations
function stripComments(source) {
  return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
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
  it('ensambla clientes de dominio sin importar Firebase ni Firestore', () => {
    assert.match(repoClientSource, /from '@\/api\/aiClient'/);
    assert.match(repoClientSource, /from '@\/api\/authClient'/);
    assert.match(repoClientSource, /from '@\/api\/entityClient'/);
    assert.match(repoClientSource, /from '@\/api\/agentClient'/);
    assert.doesNotMatch(repoClientSource, /from ['"]@\/firebase['"]/);
    assert.doesNotMatch(repoClientSource, /from ['"]firebase\//);
    assert.doesNotMatch(repoClientSource, /collection\(db/);
    assert.doesNotMatch(repoClientSource, /doc\(db/);
    assert.doesNotMatch(repoClientSource, /runTransaction\(/);
  });

  it('exporta el facade firebase como default y named export', () => {
    assert.match(repoClientSource, /export const firebase = /);
    assert.match(repoClientSource, /export default firebase/);
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


describe('entityClient y agentClient: privilegios separados', () => {
  it('entityClient contiene repositorios sin acoplarse a IA HTTP', () => {
    assert.match(entityClientSource, /createRepository/);
    assert.match(entityClientSource, /createCompanyWithInitialOwner/);
    assert.doesNotMatch(entityClientSource, /invokeLLM/);
    assert.doesNotMatch(entityClientSource, /invokeFunction/);
  });

  it('agentClient contiene conversaciones IA sin repositorios genéricos ni functions', () => {
    assert.match(agentClientSource, /aiConversations/);
    assert.match(agentClientSource, /invokeLLM/);
    assert.doesNotMatch(agentClientSource, /createRepository/);
    assert.doesNotMatch(agentClientSource, /invokeFunction/);
  });
});
