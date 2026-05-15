import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Loader2, AlertCircle } from "lucide-react";
import LessonContent from "../components/LessonContent";

export default function SingleLesson() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  // Função para garantir que a requisição envia o token de login
  const getAuthToken = () => {
    return localStorage.getItem("professor_ai_token") || "";
  };

  useEffect(() => {
    // CORREÇÃO CRÍTICA: Impedindo a quebra no Deploy usando a URL dinâmica
    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
    const token = getAuthToken();

    fetch(`${API_URL}/plans/${id}`, {
      headers: {
        "Authorization": token ? `Bearer ${token}` : ""
      }
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Erro ao carregar");
        return res.json();
      })
      .then((json) => setData(json))
      .catch((e) => setError("Aula não encontrada ou erro de conexão."));
  }, [id]);

  if (error) {
    return (
      <div className="container">
        <div className="error" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--error-bg)', color: 'var(--error-text)', border: '1px solid var(--error-text)', padding: '15px', borderRadius: '8px', marginTop: '20px' }}>
          <AlertCircle size={20} /> {error}
        </div>
        <Link to="/dashboard" className="btn primary" style={{ marginTop: '20px' }}>Voltar ao Início</Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: 'var(--text-secondary)' }}>
        <Loader2 size={48} style={{ animation: 'spin 1s linear infinite', marginBottom: '15px', color: 'var(--primary)' }} />
        <h3 style={{ margin: 0, color: 'var(--heading-color)' }}>Carregando conteúdo da aula...</h3>
        <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="container">
      <div style={{ marginBottom: "1.5rem", display: 'flex', alignItems: 'center' }}>
        <Link to="/dashboard" className="btn" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'var(--card-bg)', color: 'var(--text-main)', border: '1px solid var(--border)', fontWeight: 'bold' }}>
          <ArrowLeft size={16} /> Voltar para Dashboard
        </Link>
      </div>
      
      <LessonContent result={data} />
    </div>
  );
}