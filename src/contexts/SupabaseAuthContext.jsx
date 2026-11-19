import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { authApi } from '@/lib/customSupabaseClient';

const AuthContext = createContext(undefined);

const isResetUrl = () => window.location.pathname === '/reset-password';

export const AuthProvider = ({ children, toast }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mailConfigured, setMailConfigured] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(isResetUrl());

  const refreshUser = useCallback(async () => {
    const { user: current, mailConfigured: mail } = await authApi.me();
    setUser(current ?? null);
    setMailConfigured(Boolean(mail));
    return current ?? null;
  }, []);

  useEffect(() => {
    setLoading(true);
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  const signIn = useCallback(async (email, password) => {
    const { user: loggedIn, error } = await authApi.login(email, password);
    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error al iniciar sesión',
        description: error.message || 'Revisa tu correo y contraseña.',
      });
      return { error };
    }
    setUser(loggedIn);
    setPasswordRecovery(false);
    toast({ title: '✅ ¡Bienvenido de nuevo!', description: 'Has iniciado sesión correctamente.' });
    return { error: null };
  }, [toast]);

  const signOut = useCallback(async () => {
    const { error } = await authApi.logout();
    setUser(null);
    setPasswordRecovery(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Error al cerrar sesión', description: error.message });
    } else {
      toast({ title: '👋 ¡Hasta luego!', description: 'Has cerrado sesión correctamente.' });
    }
    return { error };
  }, [toast]);

  const finishPasswordRecovery = useCallback(() => setPasswordRecovery(false), []);

  const value = useMemo(() => ({
    user,
    session: user ? { user } : null,
    loading,
    isSuperAdmin: user?.role === 'admin',
    isAdmin: user?.role === 'admin',
    mailConfigured,
    passwordRecovery,
    finishPasswordRecovery,
    refreshUser,
    signIn,
    signOut,
  }), [user, loading, mailConfigured, passwordRecovery, finishPasswordRecovery, refreshUser, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
