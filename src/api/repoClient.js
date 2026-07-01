import { getDocumentAccessUrl, uploadFile } from '@/infrastructure/firebase/storage/documentStorage';
import { me, logout } from '@/api/authClient';
import { invokeLLM, invokeFunction, extractDataFromUploadedFile } from '@/api/aiClient';
import { agents } from '@/api/agentClient';
import { connectors } from '@/api/connectorClient';
import { buildEntities, ENTITY_COLLECTIONS } from '@/api/entityClient';

// Main firebase facade: composition only. Domain privileges live in dedicated clients.
export const firebase = {
  entities: buildEntities(),
  integrations: {
    Core: {
      InvokeLLM: invokeLLM,
      UploadFile: uploadFile,
      GetDocumentAccessUrl: getDocumentAccessUrl,
      ExtractDataFromUploadedFile: extractDataFromUploadedFile,
    },
  },
  functions: {
    invoke: invokeFunction,
  },
  connectors,
  agents,
  auth: {
    me,
    logout,
  },
  collections: ENTITY_COLLECTIONS,
};

export default firebase;
