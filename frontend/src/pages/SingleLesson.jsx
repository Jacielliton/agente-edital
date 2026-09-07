import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Loader2, AlertCircle } from "lucide-react";
import LessonContent from "../components/LessonContent";

const RECENTES_KEY = "aulas_recentes";
const MAX_RECENTES = 8;

// Guarda no navegador as ultimas aulas abertas para alimentar o
// "Continuar de onde parou" do Dashboard. Falhas aqui sao silenciosas:
// e uma conveniencia, nunca deve derrubar a tela da aula.
function registrarAcesso(plan, id) {
  try {
    const raw = localStorage.getItem(RECENTES_KEY);
    const atual = raw ? JSON.parse(raw) : [];
    const lista = Array.isArray(atual) ? atual : [];
    const entrada = {
      id: String(plan?.id ?? id),
      title: plan?.title || "",
      concurso: plan?.concurso || "",
      banca: plan?.banca || "",
      ts: Date.now(),
    };
    const proxima = [entrada, ...lista.filter((r) => String(r.id) !== entrada.id)].slice(0, MAX_RECENTES);
    localStorage.setItem(RECENTES_KEY, JSON.stringify(proxima));
  } catch {
    /* localStorage indisponivel (aba anonima, cota cheia): segue sem historico */
  }
}

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
      .then((json) => {
        setData(json);
        registrarAcesso(json, id);
      })
      .catch((e) => setError("Aula não encontrada ou erro de conexão."));
  }, [id]);

  if (error) {
    return (
      <div className="container">
        <div className="error" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--error-bg)', color: 'var(--error-text)', border: '1px solid var(--error-text)', padding: '15px', borderRadius: '8px', marginTop: '20px' }}>
          <AlertCircle size={20} /> {error}
        </div>
        <Link to="/dashboard" className="ui-btn ui-btn--primary" style={{ marginTop: '20px' }}>Voltar ao Início</Link>
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
        <Link to="/dashboard" className="ui-btn">
          <ArrowLeft size={16} /> Voltar para Minhas Aulas
        </Link>
      </div>
      
      <LessonContent result={data} />
    </div>
  );
}