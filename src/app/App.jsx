import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppProviders } from '@/app/providers';
import { appRoutes, publicRoutes } from '@/app/routes';
import LoadingState from '@/components/shared/LoadingState';

const ProtectedRoute = lazy(() => import('@/components/auth/ProtectedRoute'));
const PublicRoute = lazy(() => import('@/components/auth/PublicRoute'));
const AppLayout = lazy(() => import('@/components/layout/AppLayout'));
const PageNotFound = lazy(() => import('@/lib/PageNotFound'));

const AppRoutes = () => (
  <Suspense fallback={<LoadingState label="Iniciando GEMAILLA AI..." size="md" variant="fullscreen" />}>
    <Routes>
      <Route element={<PublicRoute />}>
        {publicRoutes.map(({ path, element }) => (
          <Route key={path} path={path} element={element} />
        ))}
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          {appRoutes.map(({ path, element }) => (
            <Route key={path} path={path} element={element} />
          ))}
        </Route>
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  </Suspense>
);

export default function App() {
  return (
    <AppProviders>
      <AppRoutes />
    </AppProviders>
  );
}
