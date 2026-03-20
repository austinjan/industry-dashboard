const API_BASE = '/api';

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  let res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
  });

  if (res.status === 401) {
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
