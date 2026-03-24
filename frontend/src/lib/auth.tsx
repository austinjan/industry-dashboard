import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiFetch } from './api';
import i18n from './i18n';

interface User {
  id: string;
  email: string;
  name: string;
  locale?: string | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: () => {},
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

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
