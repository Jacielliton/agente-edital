import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext();

// O Vite vai usar a variável de ambiente, ou o localhost se estiver no PC
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("professor_ai_token");
    if (token) {
      fetch(`${API_URL}/users/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => {
        if (res.ok) return res.json();
        throw new Error("Token inválido");
      })
      .then(data => setUser(data))
      .catch(() => {
        localStorage.removeItem("professor_ai_token");
        setUser(null);
      })
      .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    try {
      // CORREÇÃO: Enviando JSON com "email" e "password" exatamente como o Pydantic do backend exige
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (res.ok) {
        const data = await res.json();
        const token = data.access_token || data.token; 
        localStorage.setItem("professor_ai_token", token);
        
        // Puxa os dados do usuário logado
        const userRes = await fetch(`${API_URL}/users/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const userData = await userRes.json();
        setUser(userData);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Erro no login", error);
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem("professor_ai_token");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);