import { useQuery } from '@tanstack/react-query';
import { firebase } from '@/api/firebaseClient';

export const COMPANY_ENTITY_DEFAULT_LIMIT = 100;
export const COMPANY_ENTITY_STALE_TIME = 5 * 60 * 1000;
export const COMPANY_ENTITY_GC_TIME = 30 * 60 * 1000;

export const COMPANY_ENTITY_QUERIES = Object.freeze({
  transactions: { entity: 'Transaction', orderBy: '-date', limit: COMPANY_ENTITY_DEFAULT_LIMIT },
  documents: { entity: 'Document', orderBy: '-createdAt', limit: COMPANY_ENTITY_DEFAULT_LIMIT },
  auditLogs: { entity: 'AuditLog', orderBy: '-createdAt', limit: 200 },
  aiConversations: { entity: 'AIConversation', orderBy: '-createdAt', limit: 20 },
});

const getCompanyId = (companyOrId) => (
  typeof companyOrId === 'string' ? companyOrId : companyOrId?.id
);


export const COMPANY_ENTITY_QUERY_NAMES = Object.freeze(Object.keys(COMPANY_ENTITY_QUERIES));

export const fetchCompanyEntity = (queryName, companyOrId, options = {}) => {
  const config = COMPANY_ENTITY_QUERIES[queryName];
  if (!config) throw new Error(`Query de entidad desconocida: ${queryName}`);

  const companyId = getCompanyId(companyOrId);
  const orderBy = options.orderBy ?? config.orderBy;
  const resultLimit = options.limit ?? config.limit ?? COMPANY_ENTITY_DEFAULT_LIMIT;

  if (!companyId) return Promise.resolve([]);

  return firebase.entities[config.entity].filter({ companyId }, orderBy, resultLimit);
};

export const companyEntityQueryKey = (queryName, companyOrId, options = {}) => {
  const companyId = getCompanyId(companyOrId);
  const config = COMPANY_ENTITY_QUERIES[queryName] || {};
  const orderBy = options.orderBy ?? config.orderBy ?? null;
  const resultLimit = options.limit ?? config.limit ?? COMPANY_ENTITY_DEFAULT_LIMIT;
  return ['company-entity', queryName, companyId, { orderBy, limit: resultLimit }];
};

export const buildCompanyEntityQuery = (queryName, companyOrId, options = {}) => {
  const config = COMPANY_ENTITY_QUERIES[queryName];
  if (!config) throw new Error(`Query de entidad desconocida: ${queryName}`);

  const companyId = getCompanyId(companyOrId);
  const orderBy = options.orderBy ?? config.orderBy;
  const resultLimit = options.limit ?? config.limit ?? COMPANY_ENTITY_DEFAULT_LIMIT;

  return {
    queryKey: companyEntityQueryKey(queryName, companyId, { orderBy, limit: resultLimit }),
    queryFn: () => fetchCompanyEntity(queryName, companyId, { orderBy, limit: resultLimit }),
    enabled: !!companyId && (options.enabled ?? true),
    staleTime: options.staleTime ?? COMPANY_ENTITY_STALE_TIME,
    gcTime: options.gcTime ?? COMPANY_ENTITY_GC_TIME,
  };
};

export const useCompanyEntityQuery = (queryName, companyOrId, options = {}) => {
  const queryOptions = buildCompanyEntityQuery(queryName, companyOrId, options);
  const {
    enabled: queryEnabled,
    queryKey: _queryKey,
    queryFn: _queryFn,
    ...reactQueryOptions
  } = options.query ?? {};

  return useQuery({
    ...queryOptions,
    ...reactQueryOptions,
    enabled: queryOptions.enabled && (queryEnabled ?? true),
  });
};


export const useCompanyTransactions = (companyOrId, options) => useCompanyEntityQuery('transactions', companyOrId, options);
export const useCompanyDocuments = (companyOrId, options) => useCompanyEntityQuery('documents', companyOrId, options);
export const useCompanyAuditLogs = (companyOrId, options) => useCompanyEntityQuery('auditLogs', companyOrId, options);
export const useCompanyAiConversations = (companyOrId, options) => useCompanyEntityQuery('aiConversations', companyOrId, options);
