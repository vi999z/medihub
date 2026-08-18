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
    try {
      await api.post('/auth/logout'); // server expires the cookie
    } catch {
      // proceed regardless
    }
    api.clearAllCache();
    setUser(null);
    setAuthReady(true);

    const nav = navigate || navigateRef.current;
    if (nav) {
      nav('/login', { replace: true }); // React Router — stays in-tree, no reload
    } else {
      window.location.replace('/login');
    }
  }, []);

  // ── 401 interceptor ──────────────────────────────────────────────────────
  // Registered before hydration so expired-session requests mid-session are
  // caught. Guarded by hydratingRef so the expected 401 from /auth/me on
  // first load does NOT trigger a redirect loop.
  useEffect(() => {
    api.setAuthLogout(() => {
      if (hydratingRef.current) return; // ignore 401s during initial hydration
      logoutFn(null);
    });
  }, [logoutFn]);

  // ── Hydrate session on mount ─────────────────────────────────────────────
  useEffect(() => {
    async function hydrate() {
      try {
        const res = await api.get('/auth/me');
        setUser(res.data);
      } catch {
        // 401 = no active session — normal, not an error. Stay on /login.
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
