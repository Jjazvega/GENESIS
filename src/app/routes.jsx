import { lazy, Suspense } from 'react';
import { CompanyProvider } from '@/lib/companyContext';

// Rutas limpias GEMAILLA Core: Empresas + Documentos + Finanzas + IA.
const ModuleLoader = (Component) => (
  <Suspense
    fallback={
      <div className="flex h-[50vh] w-full items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    }
  >
    <Component />
  </Suspense>
);

const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Companies = lazy(() => import('@/modules/companies/pages/CompaniesPage'));
const Documents = lazy(() => import('@/modules/documents/pages/DocumentsPage'));
const FinancialHub = lazy(() => import('@/pages/FinancialHub'));
const AIAssistant = lazy(() => import('@/pages/AIAssistant'));

export const publicRoutes = [
  {
    path: '/',
    element: (
      <CompanyProvider>
        {ModuleLoader(Dashboard)}
      </CompanyProvider>
    ),
  },
];

export const appRoutes = [
  { path: '/dashboard', element: ModuleLoader(Dashboard) },
  { path: '/companies', element: ModuleLoader(Companies) },
  { path: '/documents', element: ModuleLoader(Documents) },
  { path: '/finance', element: ModuleLoader(FinancialHub) },
  { path: '/financial-hub', element: ModuleLoader(FinancialHub) },
  { path: '/ai', element: ModuleLoader(AIAssistant) },
  { path: '/ai-assistant', element: ModuleLoader(AIAssistant) },
];
