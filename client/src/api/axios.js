import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
// Origin the API (and its /uploads static files) are served from — the
// client's own baseURL minus the trailing /api. Client and API can be
// deployed as separate origins in production, so relative upload paths
// like /uploads/medicines/x.jpg must be resolved against this, not the
// page's own origin.
const API_ORIGIN = API_BASE.replace(/\/api\/?$/, '');

const api = axios.create({
  baseURL: API_BASE,
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

api.invalidateCache = function invalidateCache(url) {
  cache.delete(`GET:${url}`);
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

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const requestUrl = err.config?.url || '';
    const isLoginRequest = requestUrl.endsWith('/auth/login');
    if (err.response?.status === 401 && on401Callback && !isLoginRequest) {
      on401Callback();
    }
    return Promise.reject(err);
  }
);

export default api;
