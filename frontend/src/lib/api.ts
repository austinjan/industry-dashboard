const API_BASE = '/api';

const AUTH_NO_REFRESH_PATHS = ['/auth/login/local', '/auth/register'];

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  let res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
  });

  // Do NOT retry auth credential endpoints — a 401 here means bad credentials, not expired token
  const skipRefresh = AUTH_NO_REFRESH_PATHS.some(p => path.startsWith(p));

  if (res.status === 401 && !skipRefresh) {
    const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (refreshRes.ok) {
      res = await fetch(`${API_BASE}${path}`, {
        ...options,
        credentials: 'include',
      });
    }
  }

  return res;
}
