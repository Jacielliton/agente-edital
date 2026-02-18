// frontend/src/context/AuthContext.jsx
import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Ao recarregar a página, verifica se já tem login salvo
    const storedUser = localStorage.getItem('professor_ai_user');
    const token = localStorage.getItem('professor_ai_token');
    
    if (storedUser && token) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    try {
      const response = await fetch('http://localhost:8000/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) throw new Error('Login falhou');

      const data = await response.json();
      
      const userData = { email: data.email, role: data.role };
      
      localStorage.setItem('professor_ai_token', data.access_token);
      localStorage.setItem('professor_ai_user', JSON.stringify(userData));
      
      setUser(userData);
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem('professor_ai_token');
    localStorage.removeItem('professor_ai_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);