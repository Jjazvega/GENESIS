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

  it('agents.addMessage exige conversación existente, ownerUid propio y companyId antes de invocar IA', () => {
    assert.match(repoClientSource, /if \(!snap\.exists\(\)\) throw new Error\('Conversación no encontrada o sin acceso\.'\);/);
    assert.match(repoClientSource, /if \(!currentUid\) throw new Error\('Debes iniciar sesión para enviar mensajes\.'\);/);
    assert.match(repoClientSource, /current\.ownerUid && current\.ownerUid !== currentUid/);
    assert.match(repoClientSource, /No puedes enviar mensajes en conversaciones de otro usuario/);
    assert.match(repoClientSource, /if \(!current\.companyId\) throw new Error\('La conversación no tiene companyId válido\.'\);/);
  });

  it('createConversation guarda companyId obligatorio en aiConversations', () => {
    assert.match(repoClientSource, /companyId es obligatorio para crear conversaciones de IA/);
    assert.match(repoClientSource, /companyId: safeCompanyId/);
    assert.match(repoClientSource, /collection\(db, 'aiConversations'\)/);
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
