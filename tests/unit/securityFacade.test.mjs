import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const authClientSource = await readFile(new URL('../../src/api/authClient.js', import.meta.url), 'utf8');
const repoClientSource = await readFile(new URL('../../src/api/repoClient.js', import.meta.url), 'utf8');
const architectureSource = await readFile(new URL('../../scripts/validate-architecture.js', import.meta.url), 'utf8');

describe('authClient: controles de seguridad de perfil', () => {
  it('syncUserProfile solo acepta profile.uid/profile.id del usuario autenticado', () => {
    assert.match(authClientSource, /const currentUid = getCurrentUserUid\(\);\n\s+const requestedUid = profile\.uid \|\| profile\.id \|\| currentUid;/);
    assert.match(authClientSource, /requestedUid && currentUid && requestedUid !== currentUid/);
    assert.match(authClientSource, /No puedes sincronizar el perfil de otro usuario/);
    assert.match(authClientSource, /const userRef = doc\(db, 'users', userUid\);/);
  });
});

describe('repoClient: controles de seguridad de empresa y conversaciones', () => {
  it('createCompanyWithInitialOwner no permite companyData.ownerUid ni membershipData.userUid ajenos', () => {
    assert.match(repoClientSource, /const requestedOwnerUid = membershipData\.userUid \|\| companyData\.ownerUid \|\| currentUid;/);
    assert.match(repoClientSource, /requestedOwnerUid && currentUid && requestedOwnerUid !== currentUid/);
    assert.match(repoClientSource, /No puedes crear empresas ni membresías iniciales para otro usuario/);
    assert.match(repoClientSource, /ownerUid: userUid/);
    assert.match(repoClientSource, /userUid,/);
  });

  it('agents.addMessage delega la validación y persistencia de IA al backend seguro', () => {
    assert.match(repoClientSource, /companyId es obligatorio para enviar mensajes de IA mediante el backend seguro/);
    assert.match(repoClientSource, /invokeFunction\('appendAiConversationMessage'/);
    assert.doesNotMatch(repoClientSource, /getDoc\(refDoc\)/);
    assert.doesNotMatch(repoClientSource, /mutations\.update\(refDoc,\s*\{\s*messages/);
  });

  it('createConversation enruta companyId obligatorio al backend seguro', () => {
    assert.match(repoClientSource, /companyId es obligatorio para crear conversaciones de IA/);
    assert.match(repoClientSource, /invokeFunction\('createAiConversation'/);
    assert.match(repoClientSource, /companyId: safeCompanyId/);
    assert.doesNotMatch(repoClientSource, /collection\(db, 'aiConversations'\)/);
  });
});

describe('arquitectura de imports Firebase', () => {
  it('bloquea imports alternativos a Firebase fuera de la fachada e infraestructura autorizada', () => {
    assert.match(architectureSource, /@\\\/firebase/);
    assert.match(architectureSource, /firebase(?:\\\/\[\^'"\]\*)?/);
    assert.match(architectureSource, /ALLOWED_FIREBASE_IMPORT_FILES/);
  });

  it('valida que los nuevos clientes de dominio estén en la lista permitida', () => {
    assert.match(architectureSource, /authClient\.js/);
    assert.match(architectureSource, /aiClient\.js/);
    assert.match(architectureSource, /repoClient\.js/);
  });
});
