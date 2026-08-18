import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  // Hold the latest navigate function injected by callers via logout(navigate).
  // Using a ref avoids re-rendering the provider when it changes.
  const navigateRef = useRef(null);

  // ── Hydrate session on mount ─────────────────────────────────────────────
  // The HttpOnly cookie is sent automatically — just call /auth/me.
  // A 401 means no active session; that is normal, not an error.
  useEffect(() => {
    async function hydrate() {
      try {
        const res = await api.get('/auth/me');
        setUser(res.data);
      } catch {
        setUser(null);
      } finally {
        setAuthReady(true);
      }
    }
    hydrate();
  }, []);

  // ── 401 interceptor callback ─────────────────────────────────────────────
  // Registered once; calls logout without a navigate arg so it uses
  // window.location.replace as a safe fallback outside the Router tree.
  const logoutFn = useCallback(async (navigate) => {
    try {
      await api.post('/auth/logout'); // server clears the cookie
    } catch {
      // proceed with client-side cleanup regardless
    }
    api.clearAllCache();
    setUser(null);
    setAuthReady(true);

    const nav = navigate || navigateRef.current;
    if (nav) {
      nav('/login', { replace: true }); // React Router — no hard reload
    } else {
      window.location.replace('/login'); // fallback outside Router context
    }
  }, []);

  useEffect(() => {
    api.setAuthLogout(() => logoutFn(null));
  }, [logoutFn]);

  // ── login ────────────────────────────────────────────────────────────────
  async function login(email, password) {
    const res = await api.post('/auth/login', { email, password });
    // Token is in the HttpOnly cookie — just store the user profile in state.
    setUser(res.data.user);
    return res.data.user;
  }

  // ── logout (public) ──────────────────────────────────────────────────────
  // Call sites pass their `navigate` function so we can use React Router
  // navigation instead of a hard page reload.
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
