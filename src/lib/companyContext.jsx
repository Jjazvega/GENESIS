import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getSavedActiveCompanyId, saveActiveCompanyId } from '@/features/companies/services/activeCompanyStorage';
import { loadCompanyContextData } from '@/features/companies/services/companyMembershipService';
import { firebase } from '@/api/firebaseClient';
import { getCurrentUser } from '@/infrastructure/firebase/auth';

const CompanyContext = createContext(null);

export async function refreshActiveCompanyIdToken(companyId) {
  const currentUser = getCurrentUser();
  if (!currentUser?.getIdToken) {
    throw new Error('No hay una sesión Firebase activa para refrescar el token.');
  }

  await currentUser.getIdToken(true);
  const tokenResult = currentUser.getIdTokenResult
    ? await currentUser.getIdTokenResult(true)
    : { claims: {} };
  const refreshedCompanyId = tokenResult.claims?.companyId;
  if (refreshedCompanyId && refreshedCompanyId !== companyId) {
    throw new Error('El token refrescado no corresponde a la empresa activa.');
  }

  return tokenResult;
}

export function CompanyProvider({ children }) {
  const { user } = useAuth();
  const [companies, setCompanies] = useState([]);
  const [activeCompany, setActiveCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [memberships, setMemberships] = useState([]);

  const loadCompanies = useCallback(async () => {
    if (!user) {
      setCompanies([]);
      setActiveCompany(null);
      setMemberships([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { memberships: members, companies: validCompanies } = await loadCompanyContextData(user);

      setMemberships(members);
      setCompanies(validCompanies);

      const savedId = getSavedActiveCompanyId();
      const saved = validCompanies.find((company) => company.id === savedId);
      setActiveCompany(saved || validCompanies[0] || null);
    } catch (error) {
      console.error('Error loading companies:', error);
      setCompanies([]);
      setActiveCompany(null);
      setMemberships([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  const syncActiveCompanyClaims = useCallback(async (company) => {
    if (!company?.id || !user) return;
    try {
      await firebase.functions.invoke('syncCompanyClaims', { companyId: company.id });
      await refreshActiveCompanyIdToken(company.id);
    } catch (error) {
      console.warn('No se pudieron sincronizar los claims de empresa activa:', error);
    }
  }, [user]);

  useEffect(() => {
    syncActiveCompanyClaims(activeCompany);
  }, [activeCompany, syncActiveCompanyClaims]);

  const switchCompany = useCallback((company) => {
    setActiveCompany(company);
    saveActiveCompanyId(company.id);
    syncActiveCompanyClaims(company);
  }, [syncActiveCompanyClaims]);

  const value = useMemo(() => ({
    companies,
    activeCompany,
    loading,
    memberships,
    switchCompany,
    reloadCompanies: loadCompanies,
  }), [activeCompany, companies, loadCompanies, loading, memberships, switchCompany]);

  return (
    <CompanyContext.Provider value={value}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error('useCompany must be used within CompanyProvider');
  return ctx;
}
