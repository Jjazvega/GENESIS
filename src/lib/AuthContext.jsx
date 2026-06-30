import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { auth, login as loginWithEmailAndPassword, onAuthStateChanged } from '@/infrastructure/firebase/auth';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setAuthError(null);

      if (currentUser) {
        const authUid = currentUser?.uid || currentUser?.id;
        setUser({
          id: authUid,
          uid: authUid,
          email: currentUser.email,
          fullName: currentUser.displayName,
          role: 'user',
        });
        setIsAuthenticated(true);
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
      setIsLoadingAuth(false);
    }, (error) => {
      setUser(null);
      setIsAuthenticated(false);
      setAuthError({ type: 'auth_error', message: error?.message || 'No se pudo validar la sesión.' });
      setIsLoadingAuth(false);
    });

    return unsubscribe;
  }, []);

  const login = useCallback((email, password) => loginWithEmailAndPassword(email, password), []);

  const logout = useCallback(async (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    await auth.signOut();
    if (shouldRedirect && typeof window !== 'undefined') {
      window.location.assign('/');
    }
  }, []);

  const value = useMemo(() => ({
    user,
    isAuthenticated,
    isLoadingAuth,
    authError,
    login,
    logout,
  }), [authError, isAuthenticated, isLoadingAuth, login, logout, user]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
