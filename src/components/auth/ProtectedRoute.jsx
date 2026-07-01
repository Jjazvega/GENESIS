import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { CompanyProvider } from '@/lib/companyContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import AuthErrorPage from '@/components/auth/AuthErrorPage';
import LoadingState from '@/components/shared/LoadingState';

export default function ProtectedRoute() {
  const { isAuthenticated, isLoadingAuth, authError } = useAuth();
  const location = useLocation();

  if (isLoadingAuth) return <LoadingState label="Cargando GEMAILLA AI..." size="md" variant="fullscreen" />;

  if (authError?.type === 'user_not_registered') return <UserNotRegisteredError />;

  if (authError) return <AuthErrorPage message={authError.message} />;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return (
    <CompanyProvider>
      <Outlet />
    </CompanyProvider>
  );
}
