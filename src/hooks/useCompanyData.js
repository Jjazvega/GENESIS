import { useQueries } from '@tanstack/react-query';
import {
  COMPANY_ENTITY_QUERY_NAMES,
  companyEntityQueryKey,
  fetchCompanyEntity,
} from '@/lib/companyEntityQueries';

const EMPTY_RESULT = Object.freeze({});

export function useCompanyData(companyId, options = {}) {
  const {
    queryNames = COMPANY_ENTITY_QUERY_NAMES,
    enabled = true,
    limit = 50,
  } = options;

  const safeCompanyId = typeof companyId === 'string' ? companyId : companyId?.id;
  const safeQueryNames = Array.isArray(queryNames) ? queryNames : [];

  const queries = useQueries({
    queries: safeQueryNames.map((queryName) => ({
      queryKey: companyEntityQueryKey(queryName, safeCompanyId, { limit }),
      queryFn: () =>
        fetchCompanyEntity(queryName, safeCompanyId, {
          limit,
        }),
      enabled: Boolean(enabled && safeCompanyId && queryName),
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
    })),
  });

  return safeQueryNames.reduce((accumulator, queryName, index) => {
    const queryResult = queries[index];

    accumulator[queryName] = queryResult?.data || [];
    accumulator[`${queryName}Query`] = queryResult;

    return accumulator;
  }, { ...EMPTY_RESULT });
}

export default useCompanyData;
