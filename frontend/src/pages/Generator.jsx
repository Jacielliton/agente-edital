import React, { useEffect, useMemo, useRef, useState } from "react";
import LessonContent from "../components/LessonContent"; 

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000"; 

const safeArray = (v) => (Array.isArray(v) ? v : []);
const safeString = (v) => (typeof v === "string" ? v : v == null ? "" : String(v));

function downloadJson(data, filename = "saida_professor_ai.json") {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        resolve(JSON.parse(r.result));
      } catch (e) {
        reject(e);
      }
    };
    r.onerror = () => reject(new Error("Falha ao ler arquivo"));
    r.readAsText(file);
  });
}

export default function Generator() { 
  const [text, setText] = useState("");
  
  // --- NOVOS ESTADOS PARA AS QUESTÕES ---
  const [questionFormat, setQuestionFormat] = useState("Múltipla Escolha");
  const [questionLevel, setQuestionLevel] = useState("Superior");

  // Config vindo do backend (.env)
  const [availableModels, setAvailableModels] = useState([]);
  const [model, setModel] = useState(""); 
  const [hasToken, setHasToken] = useState(false);

  // Editor de config
  const [editDefaultModel, setEditDefaultModel] = useState("");
  const [editModelsCsv, setEditModelsCsv] = useState("");
  const [editToken, setEditToken] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configMsg, setConfigMsg] = useState("");

  // Execução
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  // Histórico e Salvamento
  const [saveTitle, setSaveTitle] = useState("");
  const [saveAno, setSaveAno] = useState("");          
  const [saveBanca, setSaveBanca] = useState("");       
  const [saveConcurso, setSaveConcurso] = useState(""); 
  const [saveVisibility, setSaveVisibility] = useState("public");

  const timeoutsRef = useRef([]);

  // NOVO: Função robusta para ler o token correto salvo pelo AuthContext
  const getAuthToken = () => {
    return localStorage.getItem("professor_ai_token") || "";
  };

  const fetchConfig = async () => {
    try {
      const resp = await fetch(`${API_URL}/config`);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.detail || "Falha ao buscar config.");
      const models = safeArray(data?.available_models);
      setAvailableModels(models);
      setHasToken(!!data?.has_token);

      const def = safeString(data?.default_model).trim();
      setModel(def || (models[0] || ""));

      setEditDefaultModel(def);
      setEditModelsCsv(models.join(","));
    } catch (e) {
      console.error(e);
      if (e.message.includes("Failed to fetch")) {
        setError("Backend não detectado. Verifique se o servidor Python (porta 8000) está rodando.");
      } else {
        setError(e.message || "Falha ao buscar configuração do backend.");
      }
    }
  };

  useEffect(() => {
    fetchConfig();
    return () => {
      timeoutsRef.current.forEach((id) => clearTimeout(id));
      timeoutsRef.current = [];
    };
  }, []);

  const saveToDb = async () => {
    if (!result) return;
    setError("");
    
    if (!saveAno.trim() || !saveBanca.trim() || !saveConcurso.trim()) {
      setError("⚠️ Por favor, preencha o Ano, Banca e Concurso para salvar a aula.");
      return;
    }

    const finalTitle = saveTitle.trim() || safeString(result?.resumo_cargo).substring(0, 60) || "Plano de Estudo Sem Título";
    
    // CORREÇÃO: Pegando o token da forma exata que ele está sendo salvo
    const token = getAuthToken();

    try {
      const resp = await fetch(`${API_URL}/plans`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": token ? `Bearer ${token}` : "" // <-- Garante a permissão no servidor
        },
        body: JSON.stringify({
          title: finalTitle,
          area: result.area_identificada || "Geral",
          content: result,
          ano: saveAno.trim(),
          banca: saveBanca.trim(),
          concurso: saveConcurso.trim(),
          visibility: saveVisibility // <-- Agora sim ele vai salvar Público ou Privado sem erro
        })
      });

      if (resp.ok) {
        setStatus("Salvo no banco com sucesso! ✅");
        setSaveTitle("");
        setSaveAno("");       
        setSaveBanca("");     
        setSaveConcurso("");  
      } else {
        const errData = await resp.json().catch(() => ({}));
        setError(errData.detail || "Erro ao salvar no banco.");
      }
    } catch (e) {
      console.error(e);
      setError("Erro de conexão ao salvar.");
    }
  };

  const run = async () => {
    setError("");
    setResult(null);
    setLoading(true);
    setStatus("Iniciando análise...");

    timeoutsRef.current.forEach((id) => clearTimeout(id));
    timeoutsRef.current = [];

    timeoutsRef.current.push(
      setTimeout(() => setStatus("Arquiteto: estruturando módulos e âncoras..."), 500)
    );
    timeoutsRef.current.push(
      setTimeout(() => setStatus("Pesquisador/Professor: criando aulas aprofundadas..."), 1800)
    );
    timeoutsRef.current.push(
      setTimeout(() => setStatus("Glossário e questões: consolidando..."), 3500)
    );

    try {
      const resp = await fetch(`${API_URL}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          text, 
          model: model || null,
          question_format: questionFormat,
          question_level: questionLevel
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.detail || "Erro ao chamar API.");

      setResult(data);
      setStatus("Concluído ✅");
    } catch (e) {
      console.error(e);
      setError(e.message || "Erro inesperado.");
      setStatus("");
    } finally {
      setLoading(false);
      timeoutsRef.current.forEach((id) => clearTimeout(id));
      timeoutsRef.current = [];
    }
  };

  const onLoadJson = async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    setError("");
    try {
      const data = await readJsonFile(file);
      setResult(data);
    } catch (e) {
      console.error(e);
      setError("Arquivo JSON inválido ou corrompido.");
    } finally {
      ev.target.value = "";
    }
  };

  const saveConfig = async () => {
    setConfigSaving(true);
    setConfigMsg("");
    setError("");

    const models = editModelsCsv.split(",").map((s) => s.trim()).filter(Boolean);

    try {
      const resp = await fetch(`${API_URL}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          default_model: editDefaultModel?.trim() || null,
          available_models: models.length ? models : null,
          token: editToken !== "" ? editToken : null,
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.detail || "Falha ao salvar config.");

      setConfigMsg(`Salvo ✅`);
      setEditToken(""); 
      await fetchConfig(); 
    } catch (e) {
      console.error(e);
      setError(e.message || "Falha ao salvar configuração.");
    } finally {
      setConfigSaving(false);
    }
  };

  return (
    <div className="container">
      <header className="header">
        <h1>Gerador de Aulas</h1>
        <p>Crie novos conteúdos a partir de editais.</p>
      </header>

      <section className="panel">
        <div className="row">
          <label className="label">Modelo (Backend)</label>
          <select
            className="select"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={loading}
          >
            {availableModels.length ? (
              availableModels.map((m) => <option key={m} value={m}>{m}</option>)
            ) : (
              <option value={model || ""}>{model || "Carregando..."}</option>
            )}
          </select>
          <div className="muted">{hasToken ? "Token ativo ✅" : "Token ausente ⚠️"}</div>
        </div>

        <div className="row">
          <label className="label">Assunto / Edital</label>
          <textarea
            className="textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Cole aqui o conteúdo..."
          />
        </div>

        <div className="row" style={{ display: 'flex', gap: '15px' }}>
          <div style={{ flex: 1 }}>
            <label className="label">Nível das Questões</label>
            <select 
              className="select" 
              value={questionLevel} 
              onChange={(e) => setQuestionLevel(e.target.value)}
              disabled={loading}
            >
              <option value="Superior">Ensino Superior</option>
              <option value="Médio">Ensino Médio</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label className="label">Formato das Questões</label>
            <select 
              className="select" 
              value={questionFormat} 
              onChange={(e) => setQuestionFormat(e.target.value)}
              disabled={loading}
            >
              <option value="Múltipla Escolha">Múltipla Escolha (A a E)</option>
              <option value="Certo/Errado">Certo / Errado</option>
            </select>
          </div>
        </div>

        <div className="actions">
          <button className="btn primary" onClick={run} disabled={loading || !text.trim()}>
            {loading ? "Gerando..." : "Gerar conteúdo"}
          </button>

          <button
            className="btn"
            onClick={() => result && downloadJson(result)}
            disabled={!result}
          >
            Baixar JSON
          </button>

          <label className="btn file">
            Carregar JSON
            <input type="file" accept="application/json" onChange={onLoadJson} hidden />
          </label>

          <button className="btn" onClick={() => setShowConfig(!showConfig)}>
            {showConfig ? "Fechar Config" : "Configurar API"}
          </button>

          {/* ÁREA DE SALVAR - CORES ATUALIZADAS PARA MODO NOTURNO */}
          {result && (
            <div className="save-container" style={{ width: '100%', flexDirection: 'column', alignItems: 'stretch', gap: '10px', marginTop: '1rem', padding: '15px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px' }}>
              <div style={{ fontWeight: 'bold', color: 'var(--heading-color)', marginBottom: '5px' }}>Salvar Aula no Banco</div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <input className="input" placeholder="Ano (ex: 2024)" value={saveAno} onChange={e => setSaveAno(e.target.value)} style={{ flex: 1, minWidth: '80px' }} />
                <input className="input" placeholder="Banca (ex: CESPE)" value={saveBanca} onChange={e => setSaveBanca(e.target.value)} style={{ flex: 1, minWidth: '120px' }} />
                <input className="input" placeholder="Concurso (ex: PF)" value={saveConcurso} onChange={e => setSaveConcurso(e.target.value)} style={{ flex: 2, minWidth: '150px' }} />
                
                {/* CAMPO DE VISIBILIDADE */}
                <select className="select" value={saveVisibility} onChange={e => setSaveVisibility(e.target.value)} style={{ flex: 1, minWidth: '120px' }}>
                  <option value="public">🌍 Público</option>
                  <option value="private">🔒 Privado</option>
                </select>
              </div>
              
              <div style={{ display: 'flex', gap: '10px' }}>
                <input className="input" placeholder="Nome/Título da Aula..." value={saveTitle} onChange={e => setSaveTitle(e.target.value)} style={{ flex: 1 }} />
                <button className="btn primary" onClick={saveToDb}>💾 Salvar Aula</button>
              </div>
            </div>
          )}
        </div>

        {!!status && <div className="status">{status}</div>}
        {!!configMsg && <div className="status">{configMsg}</div>}
        {!!error && <div className="error">{error}</div>}

        {showConfig && (
          <details className="details" open>
            <summary className="summaryTitle">Configurações (.env)</summary>
            <div className="config-content">
              <div className="row">
                <label className="label">Modelo Padrão</label>
                <input className="input" value={editDefaultModel} onChange={e=>setEditDefaultModel(e.target.value)} />
              </div>
              <div className="row">
                 <label className="label">Modelos (CSV)</label>
                 <input className="input" value={editModelsCsv} onChange={e=>setEditModelsCsv(e.target.value)} />
              </div>
              <div className="row">
                 <label className="label">Token (OpenRouter)</label>
                 <input className="input" type="password" value={editToken} onChange={e=>setEditToken(e.target.value)} />
              </div>
              <div className="actions config-actions">
                <button className="btn primary" onClick={saveConfig} disabled={configSaving}>Salvar</button>
              </div>
            </div>
          </details>
        )}
      </section>

      {result && (
        <section className="result">
          <LessonContent result={result} />
        </section>
      )}
    </div>
  );
}