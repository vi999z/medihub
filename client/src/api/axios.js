import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://medihub-1-jx4l.onrender.com'
});

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