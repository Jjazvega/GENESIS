import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const source = await readFile(new URL('../../src/api/firebaseClient.js', import.meta.url), 'utf8');
const architectureSource = await readFile(new URL('../../scripts/validate-architecture.js', import.meta.url), 'utf8');

describe('controles de seguridad en firebaseClient', () => {
  it('syncUserProfile solo acepta profile.uid/profile.id del usuario autenticado', () => {
    assert.match(source, /const currentUid = getCurrentUserUid\(\);\n\s+const requestedUid = profile\.uid \|\| profile\.id \|\| currentUid;/);
    assert.match(source, /requestedUid && currentUid && requestedUid !== currentUid/);
    assert.match(source, /No puedes sincronizar el perfil de otro usuario/);
    assert.match(source, /const userRef = doc\(db, 'users', userUid\);/);
  });

  it('createCompanyWithInitialOwner no permite companyData.ownerUid ni membershipData.userUid ajenos', () => {
    assert.match(source, /const requestedOwnerUid = membershipData\.userUid \|\| companyData\.ownerUid \|\| currentUid;/);
    assert.match(source, /requestedOwnerUid && currentUid && requestedOwnerUid !== currentUid/);
    assert.match(source, /No puedes crear empresas ni membresías iniciales para otro usuario/);
    assert.match(source, /ownerUid: userUid/);
    assert.match(source, /userUid,/);
  });

  it('agents.addMessage exige conversación existente, ownerUid propio y companyId antes de invocar IA', () => {
    assert.match(source, /if \(!snap\.exists\(\)\) throw new Error\('Conversación no encontrada o sin acceso\.'\);/);
    assert.match(source, /if \(!currentUid\) throw new Error\('Debes iniciar sesión para enviar mensajes\.'\);/);
    assert.match(source, /current\.ownerUid && current\.ownerUid !== currentUid/);
    assert.match(source, /No puedes enviar mensajes en conversaciones de otro usuario/);
    assert.match(source, /if \(!current\.companyId\) throw new Error\('La conversación no tiene companyId válido\.'\);/);
  });

  it('createConversation guarda companyId obligatorio en aiConversations', () => {
    assert.match(source, /companyId es obligatorio para crear conversaciones de IA/);
    assert.match(source, /companyId: safeCompanyId/);
    assert.match(source, /collection\(db, 'aiConversations'\)/);
  });
});

describe('arquitectura de imports Firebase', () => {
  it('bloquea imports alternativos a Firebase fuera de la fachada e infraestructura autorizada', () => {
    assert.match(architectureSource, /@\\\/firebase/);
    assert.match(architectureSource, /firebase(?:\\\/\[\^'"\]\*)?/);
    assert.match(architectureSource, /ALLOWED_FIREBASE_IMPORT_FILES/);
  });
});
