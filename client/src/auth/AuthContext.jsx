import { createContext, useContext, useState } from 'react';
import { api, setToken, setStoredUser, clearAuth } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('novel_user'));
    } catch {
      return null;
    }
  });

  async function login(username, password) {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    setToken(data.token);
    setStoredUser(data.user);
    setUser(data.user);
  }

  async function register(username, password) {
    const data = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    setToken(data.token);
    setStoredUser(data.user);
    setUser(data.user);
  }

  function logout() {
    clearAuth();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
