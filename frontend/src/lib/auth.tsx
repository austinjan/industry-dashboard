import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { apiFetch, loadTokens, setTokens, clearTokens, getAccessToken } from './api';

interface User {
  id: string;
  email: string;
  name: string;
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
    const params = new URLSearchParams(window.location.search);
    const access = params.get('access_token');
    const refresh = params.get('refresh_token');
    if (access && refresh) {
      setTokens(access, refresh);
      window.history.replaceState({}, '', '/');
    } else {
      loadTokens();
    }
    if (getAccessToken()) {
      apiFetch('/auth/me')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => setUser(data))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const logout = () => {
    clearTokens();
    setUser(null);
    window.location.href = '/';
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
