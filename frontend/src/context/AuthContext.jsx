import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext();

// O Vite vai usar a variável de ambiente, ou o localhost se estiver no PC
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // =======================================================================
  // SISTEMA ANTI-COMPARTILHAMENTO: INTERCEPTOR GLOBAL DE FETCH
  // =======================================================================
  useEffect(() => {
    const originalFetch = window.fetch;
    
    // Sobrescrevemos o fetch nativo temporariamente para monitorar as respostas
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      
      // Se a resposta for 401 (Não Autorizado), verificamos o detalhe do erro
      if (response.status === 401) {
        try {
          // Clonamos a resposta para ler o JSON sem bloquear o fluxo original da aplicação
          const clone = response.clone();
          const data = await clone.json();
          
          if (data.detail === "CONFLITO_DE_SESSAO") {
            alert("🔒 Segurança: A sua conta foi conectada noutro dispositivo. Você foi desconectado automaticamente.");
            
            // Limpeza implacável de todos os vestígios de sessão
            localStorage.removeItem("professor_ai_token");
            localStorage.removeItem("access_token");
            sessionStorage.clear();
            
            setUser(null);
            window.location.href = "/login"; // Força o redirecionamento
          } else if (data.detail === "CONTA_EXPIRADA") {
            alert("⚠️ Seu período de acesso expirou. Você foi desconectado.");
            localStorage.removeItem("professor_ai_token");
            localStorage.removeItem("access_token");
            sessionStorage.clear();
            setUser(null);
            window.location.href = "/login"; 
          }
        } catch (e) {
          // Se a resposta 401 não tiver JSON ou falhar, ignoramos silenciosamente
        }
      }
      return response;
    };

    return () => {
      // Limpeza: Restaura o fetch original caso o AuthProvider seja desmontado
      window.fetch = originalFetch; 
    };
  }, []);

  // =======================================================================
  // CARREGAMENTO INICIAL DA SESSÃO
  // =======================================================================
  useEffect(() => {
    const token = localStorage.getItem("professor_ai_token");
    if (token) {
      fetch(`${API_URL}/users/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(async res => {
        if (res.ok) return res.json();
        throw new Error("Token inválido");
      })
      .then(data => setUser(data))
      .catch(() => {
        // Se der erro na checagem inicial (token expirado ou conflito), limpa o estado
        localStorage.removeItem("professor_ai_token");
        setUser(null);
      })
      .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  // =======================================================================
  // FUNÇÃO DE LOGIN
  // =======================================================================
  const login = async (email, password) => {
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (res.ok) {
        const data = await res.json();
        const token = data.access_token || data.token; 
        localStorage.setItem("professor_ai_token", token);
        
        // Puxa os dados do usuário recém-logado
        const userRes = await fetch(`${API_URL}/users/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const userData = await userRes.json();
        setUser(userData);
        return true;
      } else {
        const errorData = await res.json().catch(() => ({}));
        if (res.status === 403 && errorData.detail === "CONTA_EXPIRADA") {
          throw new Error("CONTA_EXPIRADA");
        }
        throw new Error("Email ou senha inválidos.");
      }
    } catch (error) {
      console.error("Erro no login", error);
      throw error; // Passa o erro adiante para o Login.jsx
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