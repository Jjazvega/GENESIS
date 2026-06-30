import { createRequire } from 'node:module';
import { ENTITY_COLLECTIONS } from '../src/infrastructure/firebase/repositories/entityCollections.js';

const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');

const BATCH_SIZE = 450;
const collections = [...new Set(Object.values(ENTITY_COLLECTIONS))];

function initializeAdmin() {
  if (admin.apps.length > 0) return;
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

async function migrateCollection(db, collectionName) {
  let migrated = 0;

  while (true) {
    const snapshot = await db
      .collection(collectionName)
      .where('deleted', '==', true)
      .limit(BATCH_SIZE)
      .get();

    if (snapshot.empty) break;

    const batch = db.batch();
    const archivedAt = new Date().toISOString();

    snapshot.docs.forEach((documentSnapshot) => {
      const data = documentSnapshot.data();
      batch.update(documentSnapshot.ref, {
        status: 'archived',
        archivedAt: data.archivedAt || data.deletedAt || archivedAt,
      });
    });

    await batch.commit();
    migrated += snapshot.size;
  }

  return migrated;
}

async function main() {
  initializeAdmin();
  const db = admin.firestore();
  let total = 0;

  for (const collectionName of collections) {
    const migrated = await migrateCollection(db, collectionName);
    total += migrated;
    console.log(`${collectionName}: ${migrated} registros migrados`);
  }

  console.log(`Migración completada. Total: ${total} registros migrados.`);
}

main().catch((error) => {
  console.error('Error migrando registros deleted:true a status:archived', error);
  process.exitCode = 1;
});
