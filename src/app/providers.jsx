import { BrowserRouter as Router } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/lib/AuthContext';
import { queryClientInstance } from '@/lib/query-client';
import { AppErrorBoundary } from '@/components/shared/AppErrorBoundary';

export function AppProviders({ children }) {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            {children}
          </Router>
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </AppErrorBoundary>
  );
}
