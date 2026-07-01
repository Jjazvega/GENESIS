// Firebase initialization primitives only.
// Business logic lives in the domain-specific API clients:
//   src/api/authClient.js  – auth operations
//   src/api/aiClient.js    – AI/function HTTP calls
//   src/api/repoClient.js  – entity repositories and agents
export { default as app, auth, db, storage } from '@/firebase';
