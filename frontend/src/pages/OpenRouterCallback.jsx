import React, { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { CheckCircle, Loader2, XCircle } from "lucide-react";

export default function OpenRouterCallback() {
  const [status, setStatus] = useState("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const hasFetched = useRef(false); // Trava para evitar execução dupla no localhost
  
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  useEffect(() => {
    // Se já executou, ignora a segunda passada do React Strict Mode
    if (hasFetched.current) return;
    hasFetched.current = true;

    // Pega o código da URL: ?code=XYZ...
    const params = new URLSearchParams(location.search);
    const code = params.get("code");

    if (!code) {
      setStatus("error");
      setErrorMsg("Nenhum código de autorização encontrado.");
      return;
    }

    const token = localStorage.getItem("professor_ai_token");

    if (!token) {
      setStatus("error");
      setErrorMsg("Você precisa estar logado para ativar a IA.");
      return;
    }

    fetch(`${API_URL}/auth/openrouter/exchange`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ code })
    })
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || "Falha ao validar o código com o servidor.");
        }
        setStatus("success");
        setTimeout(() => navigate("/dashboard"), 3000); // Volta pro painel em 3s
      })
      .catch((err) => {
        console.error("Erro no Callback:", err);
        setStatus("error");
        setErrorMsg(err.message);
      });
  }, [location, navigate, API_URL]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80vh', fontFamily: 'system-ui, sans-serif' }}>
      {status === "loading" && (
        <>
          <Loader2 size={56} className="spin" color="#3b82f6" style={{ animation: 'spin 1s linear infinite' }} />
          <h2 style={{ marginTop: '20px', color: '#0f172a' }}>Ativando recursos de IA...</h2>
          <p style={{ color: '#64748b' }}>Conectando a sua conta ao sistema.</p>
          <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
        </>
      )}
      
      {status === "success" && (
        <>
          <CheckCircle size={64} color="#10b981" />
          <h2 style={{ marginTop: '20px', color: '#065f46' }}>IA Ativada com Sucesso!</h2>
          <p style={{ color: '#10b981', fontWeight: 'bold' }}>A redirecionar para o painel...</p>
        </>
      )}
      
      {status === "error" && (
        <>
          <XCircle size={64} color="#ef4444" />
          <h2 style={{ marginTop: '20px', color: '#991b1b' }}>Falha ao ativar IA</h2>
          <p style={{ color: '#ef4444', marginBottom: '20px' }}>{errorMsg}</p>
          <button 
            onClick={() => window.location.href = '/dashboard'}
            style={{ padding: '10px 20px', backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Voltar ao Dashboard
          </button>
        </>
      )}
    </div>
  );
}