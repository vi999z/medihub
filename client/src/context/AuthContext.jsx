import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('medihub_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    async function hydrate() {
      const token = localStorage.getItem('medihub_token');
      if (!token) {
        setUser(null);
        setAuthReady(true);
        return;
      }

      try {
        const res = await api.get('/auth/me');
        const nextUser = res.data;
        localStorage.setItem('medihub_user', JSON.stringify(nextUser));
        setUser(nextUser);
      } catch {
        localStorage.removeItem('medihub_token');
        localStorage.removeItem('medihub_user');
        setUser(null);
      } finally {
        setAuthReady(true);
      }
    }

    hydrate();
  }, []);

  async function login(email, password) {
    const res = await api.post('/auth/login', { email, password });
    localStorage.setItem('medihub_token', res.data.token);
    localStorage.setItem('medihub_user', JSON.stringify(res.data.user));
    setUser(res.data.user);
    // Ensure ProtectedRoute never hangs on "Loading your session…" after login,
    // even if the initial /auth/me hydration is still in flight.
    setAuthReady(true);
    return res.data.user;
  }

  function logout() {
    localStorage.removeItem('medihub_token');
    localStorage.removeItem('medihub_user');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, authReady, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
} 