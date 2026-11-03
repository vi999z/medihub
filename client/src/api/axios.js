import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
// Origin the API (and its /uploads static files) are served from — the
// client's own baseURL minus the trailing /api. Client and API can be
// deployed as separate origins in production, so relative upload paths
// like /uploads/medicines/x.jpg must be resolved against this, not the
// page's own origin.
const API_ORIGIN = API_BASE.replace(/\/api\/?$/, '');

// Generous timeout: the free hosting plan can take up to a minute to wake the
// server after a quiet spell, and AI answers can take a while.
const api = axios.create({
  baseURL: API_BASE,
  timeout: 90000,
});

// Resolves a possibly-relative file URL (e.g. medicine photo `/uploads/...`
// paths returned by the API) into an absolute URL against the API's origin.
// Already-absolute URLs (blob:, http(s):) are returned unchanged.
export function resolveFileUrl(url) {
  if (!url) return url;
  if (/^(https?:|blob:|data:)/i.test(url)) return url;
  return `${API_ORIGIN}${url}`;
}

const cache = new Map();
const CACHE_TTL = 60_000; // 60 s — reduces redundant API calls on page revisit

function setCache(key, value) {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL });
}

function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

api.cachedGet = function cachedGet(url) {
  const key = `GET:${url}`;
  const cached = getCache(key);
  if (cached) return Promise.resolve(cached);
  return api.get(url).then((res) => {
    setCache(key, res);
    return res;
  });
};

// Clears `url` and the same path with any query string, so invalidating
// '/transactions/recent' also drops '/transactions/recent?limit=500'.
api.invalidateCache = function invalidateCache(url) {
  const key = `GET:${url}`;
  for (const cachedKey of [...cache.keys()]) {
    if (cachedKey === key || cachedKey.startsWith(`${key}?`)) cache.delete(cachedKey);
  }
};

api.clearAllCache = function clearAllCache() {
  cache.clear();
};

// Attach the JWT from localStorage as a Bearer token on every request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('medihub_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let on401Callback = null;

api.setAuthLogout = function setAuthLogout(callback) {
  on401Callback = callback;
};

const RETRY_STATUSES = new Set([502, 503, 504]);
const MAX_RETRIES = 2;

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const config = err.config;

    // Reads are safe to repeat: a server that is waking up or briefly
    // unreachable usually answers on the second or third try.
    const isRead = config && ['get', 'head'].includes((config.method || 'get').toLowerCase());
    const transient = !err.response ? err.code !== 'ERR_CANCELED' : RETRY_STATUSES.has(err.response.status);
    if (isRead && transient && (config.__retries || 0) < MAX_RETRIES) {
      config.__retries = (config.__retries || 0) + 1;
      await new Promise((resolve) => setTimeout(resolve, 800 * config.__retries));
      return api(config);
    }

    // A failed download arrives as a Blob; read the server's JSON message out of it.
    const body = err.response?.data;
    if (typeof Blob !== 'undefined' && body instanceof Blob && body.type.includes('json')) {
      try { err.response.data = JSON.parse(await body.text()); } catch { /* keep the blob */ }
    }

    const requestUrl = config?.url || '';
    const isLoginRequest = requestUrl.endsWith('/auth/login');
    if (err.response?.status === 401 && on401Callback && !isLoginRequest) {
      on401Callback();
    }
    return Promise.reject(err);
  }
);

export default api;
