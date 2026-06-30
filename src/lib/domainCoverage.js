// @ts-check

/**
 * Mapa canónico de cobertura del Core funcional.
 */
export const DOMAIN_COVERAGE = Object.freeze({
  core: Object.freeze({
    label: 'Núcleo multiempresa',
    entities: Object.freeze(['User', 'Company', 'CompanyMember', 'AuditLog']),
    companyQueries: Object.freeze(['auditLogs']),
  }),
  documents: Object.freeze({
    label: 'Gestión documental',
    entities: Object.freeze(['Document']),
    companyQueries: Object.freeze(['documents']),
  }),
  imports: Object.freeze({
    label: 'Importaciones de datos financieros',
    entities: Object.freeze(['ImportLog']),
    companyQueries: Object.freeze([]),
  }),
  finance: Object.freeze({
    label: 'Finanzas',
    entities: Object.freeze(['Transaction']),
    companyQueries: Object.freeze(['transactions']),
  }),
  ai: Object.freeze({
    label: 'IA empresarial',
    entities: Object.freeze(['AIConversation']),
    companyQueries: Object.freeze(['aiConversations']),
  }),
  observability: Object.freeze({
    label: 'Observabilidad operacional',
    entities: Object.freeze(['ObservabilityEvent']),
    companyQueries: Object.freeze([]),
  }),
});

export const DOMAIN_NAMES = Object.freeze(Object.keys(DOMAIN_COVERAGE));

export const getCoveredEntitiesByDomain = () => new Set(
  Object.values(DOMAIN_COVERAGE).flatMap((domain) => domain.entities),
);

export const getCoveredCompanyQueriesByDomain = () => new Set(
  Object.values(DOMAIN_COVERAGE).flatMap((domain) => domain.companyQueries),
);
