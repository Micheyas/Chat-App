import { createContext, useContext, useState, useEffect } from 'react';

const SESSION_KEY = 'chat_session';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(null);

  // Restore session on mount
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SESSION_KEY));
      if (saved?.token && saved?.username) setAuth(saved);
    } catch { /* no session */ }
  }, []);

  const login = (data) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
    setAuth(data);
  };

  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    setAuth(null);
  };

  const updateAuth = (data) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
    setAuth(data);
  };

  return (
    <AuthContext.Provider value={{ auth, login, logout, updateAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
