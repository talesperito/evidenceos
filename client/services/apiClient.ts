const ACCESS_TOKEN_KEY = 'evidenceos.access_token';
const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {};
const API_BASE_URL = (env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

let accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
let refreshPromise: Promise<void> | null = null;

const buildHeaders = (headers?: HeadersInit): Headers => {
  const merged = new Headers(headers);
  if (!merged.has('Content-Type')) {
    merged.set('Content-Type', 'application/json');
  }
  if (accessToken) {
    merged.set('Authorization', `Bearer ${accessToken}`);
  }
  return merged;
};

export const getApiBaseUrl = () => API_BASE_URL;

export const getAccessToken = () => accessToken;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
  if (token) {
    localStorage.setItem(ACCESS_TOKEN_KEY, token);
    return;
  }
  localStorage.removeItem(ACCESS_TOKEN_KEY);
};

const parseResponse = async <T>(response: Response): Promise<T> => {
  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = payload?.message || payload?.error || `HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
};

export const refreshSession = async () => {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      const payload = await parseResponse<{ token: string }>(response);
      setAccessToken(payload.token);
    })().finally(() => {
      refreshPromise = null;
    });
  }

  await refreshPromise;
};

export const apiRequest = async <T>(path: string, init: RequestInit = {}, allowRetry = true): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: buildHeaders(init.headers),
  });

  if (response.status === 401 && allowRetry && path !== '/api/auth/refresh' && path !== '/api/auth/login') {
    try {
      await refreshSession();
    } catch (error) {
      setAccessToken(null);
      throw error;
    }

    return apiRequest<T>(path, init, false);
  }

  return parseResponse<T>(response);
};
