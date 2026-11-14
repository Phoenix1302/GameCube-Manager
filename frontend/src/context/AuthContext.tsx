import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  needsSetup: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
  checkSetupStatus: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('gamecube_token'));
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('gamecube_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [needsSetup, setNeedsSetup] = useState<boolean>(false);

  const checkSetupStatus = async (): Promise<boolean> => {
    try {
      const res = await api.get('/auth/setup-status');
      const isInit = !!res.data.initialized;
      setNeedsSetup(!isInit);
      return isInit;
    } catch (e) {
      console.error('Failed to check setup status', e);
      return true; // Default to initialized on network error to avoid trapping
    }
  };

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem('gamecube_token', newToken);
    localStorage.setItem('gamecube_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    setNeedsSetup(false);
  };

  const logout = () => {
    localStorage.removeItem('gamecube_token');
    localStorage.removeItem('gamecube_user');
    setToken(null);
    setUser(null);
  };

  const refreshUser = async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    try {
      const res = await api.get('/auth/me');
      setUser(res.data);
      localStorage.setItem('gamecube_user', JSON.stringify(res.data));
    } catch {
      logout();
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      setIsLoading(true);
      const isInit = await checkSetupStatus();
      if (!isInit) {
        setIsLoading(false);
        return;
      }
      if (token) {
        await refreshUser();
      } else {
        setIsLoading(false);
      }
    };
    initAuth();
  }, [token]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!token && !!user,
        isAdmin: user?.role === 'admin',
        needsSetup,
        login,
        logout,
        refreshUser,
        checkSetupStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
