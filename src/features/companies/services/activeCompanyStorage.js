// @ts-check

const ACTIVE_COMPANY_KEY = 'gemailla_active_company';

export function getSavedActiveCompanyId() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ACTIVE_COMPANY_KEY);
}

export function saveActiveCompanyId(companyId) {
  if (typeof window === 'undefined' || !companyId) return;
  window.localStorage.setItem(ACTIVE_COMPANY_KEY, companyId);
}
