import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  // Tracks whether the initial /auth/me hydration is still in flight.
  // The 401 interceptor must not fire a redirect during this window —
  // a 401 from /auth/me is expected when no session exists.
  const hydratingRef = useRef(true);
  // Holds the navigate fn passed in by call sites (Layout, etc.)
  const navigateRef = useRef(null);

  // ── logout implementation ────────────────────────────────────────────────
  const logoutFn = useCallback(async (navigate) => {
    localStorage.removeItem('medihub_token');
    localStorage.removeItem('medihub_user');
    api.clearAllCache();
    setUser(null);
    setAuthReady(true);

    const nav = navigate || navigateRef.current;
    if (nav) {
      nav('/login', { replace: true }); // React Router — no hard reload
    } else {
      window.location.replace('/login');
    }
  }, []);

  // ── 401 interceptor ──────────────────────────────────────────────────────
  // Guarded by hydratingRef so the expected 401 from /auth/me on first load
  // (no token in localStorage) does NOT trigger a redirect loop.
  useEffect(() => {
    api.setAuthLogout(() => {
      if (hydratingRef.current) return;
      logoutFn(null);
    });
  }, [logoutFn]);

  // ── Hydrate session on mount ─────────────────────────────────────────────
  useEffect(() => {
    async function hydrate() {
      const token = localStorage.getItem('medihub_token');
      if (!token) {
        // No token — not logged in, nothing to hydrate
        hydratingRef.current = false;
        setAuthReady(true);
        return;
      }
      try {
        const res = await api.get('/auth/me');
        localStorage.setItem('medihub_user', JSON.stringify(res.data));
        setUser(res.data);
      } catch {
        // Token invalid/expired — clear it and stay on /login
        localStorage.removeItem('medihub_token');
        localStorage.removeItem('medihub_user');
        setUser(null);
      } finally {
        hydratingRef.current = false;
        setAuthReady(true);
      }
    }
    hydrate();
  }, []);

  // ── login ────────────────────────────────────────────────────────────────
  async function login(email, password) {
    const res = await api.post('/auth/login', { email, password });
    localStorage.setItem('medihub_token', res.data.token);
    localStorage.setItem('medihub_user', JSON.stringify(res.data.user));
    setUser(res.data.user);
    return res.data.user;
  }

  // ── logout (public API) ──────────────────────────────────────────────────
  function logout(navigate) {
    return logoutFn(navigate);
  }

  return (
    <AuthContext.Provider value={{ user, authReady, login, logout, navigateRef }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
