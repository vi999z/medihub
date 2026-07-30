import { createContext, useContext, useState } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('medihub_user');
    return stored ? JSON.parse(stored) : null;
  });

  async function login(email, password) {
    const res = await api.post('/auth/login', { email, password });
    localStorage.setItem('medihub_token', res.data.token);
    localStorage.setItem('medihub_user', JSON.stringify(res.data.user));
    setUser(res.data.user);
    return res.data.user;
  }

  function logout() {
    localStorage.removeItem('medihub_token');
    localStorage.removeItem('medihub_user');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
} 