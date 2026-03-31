import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiFetch } from './api';
import i18n from './i18n';

interface User {
  id: string;
  email: string;
  name: string;
  locale?: string | null;
  has_microsoft: boolean;
  registered_via: string;
  microsoft_email?: string | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => void;
  refreshUser: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: () => {},
  refreshUser: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setUser(data);
        if (data?.locale) {
          i18n.changeLanguage(data.locale);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const logout = async () => {
    await apiFetch('/auth/logout', { method: 'POST' });
    setUser(null);
    window.location.href = '/login';
  };

  const refreshUser = () => {
    apiFetch('/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setUser(data);
        if (data?.locale) {
          i18n.changeLanguage(data.locale);
        }
      });
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
