import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 15000
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

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('medihub_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('medihub_token');
      localStorage.removeItem('medihub_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;