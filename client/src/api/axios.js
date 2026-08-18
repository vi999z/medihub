import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  // Send the HttpOnly session cookie on every request (including cross-origin
  // requests during Vite dev where the client is on :5173 and API on :5000).
  withCredentials: true,
});

const cache = new Map();
const CACHE_TTL = 15_000;

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

// No manual token injection — the browser sends the HttpOnly cookie automatically.
// We keep a no-op request interceptor in case middleware is added later.
api.interceptors.request.use((config) => config);

let on401Callback = null;

api.setAuthLogout = function setAuthLogout(callback) {
  on401Callback = callback;
};

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && on401Callback) {
      on401Callback();
    }
    return Promise.reject(err);
  }
);

export default api;
