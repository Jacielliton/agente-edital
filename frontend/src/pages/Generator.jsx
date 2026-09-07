import React, { useEffect, useRef, useState } from "react";
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

// FUNÇÃO ROBUSTA DE TOKEN UNIFICADA
const getAuthToken = () => {
  const storages = [localStorage, sessionStorage];
  for (const storage of storages) {
    let t = storage.getItem("access_token") || storage.getItem("token") || storage.getItem("professor_ai_token");
    if (t && t.startsWith("eyJ")) return t;
    try {
      const uStr = storage.getItem("user");
      if (uStr && uStr.startsWith("{")) {
        const uObj = JSON.parse(uStr);
        if (uObj.access_token && String(uObj.access_token).startsWith("eyJ")) return uObj.access_token;
        if (uObj.token && String(uObj.token).startsWith("eyJ")) return uObj.token;
      }
    } catch(e) {}
  }
  return null;
};

export default function Generator() { 
  const [text, setText] = useState("");
  
  // Estados para as Questões
  const [questionFormat, setQuestionFormat] = useState("Múltipla Escolha");
  const [questionLevel, setQuestionLevel] = useState("Normal");

  // Config do Servidor
  const [availableModels, setAvailableModels] = useState([]);
  const [model, setModel] = useState(""); 

  // ESTADOS GLOBAIS DE CONFIGURAÇÃO DE IA INDIVIDUAL
  const [showConfig, setShowConfig] = useState(false);
  const [tempModel, setTempModel] = useState("");
  const [userApiKey, setUserApiKey] = useState("");
  const [userModel, setUserModel] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);

  // Execução e UX
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0); // <-- NOVO: Barra de progresso
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  // Contexto da prova: pedido ANTES de gerar, porque a banca muda o estilo da
  // aula e das questoes. Os mesmos valores sao reaproveitados ao salvar.
  const [saveTitle, setSaveTitle] = useState("");
  const [saveAno, setSaveAno] = useState("");
  const [saveBanca, setSaveBanca] = useState("");
  const [saveConcurso, setSaveConcurso] = useState("");
  const [saveCargo, setSaveCargo] = useState("");
  const [qtdQuestoes, setQtdQuestoes] = useState(10);
  const [saveVisibility, setSaveVisibility] = useState("public");

  // Geracao modulo a modulo
  const [estrutura, setEstrutura] = useState(null);   // { modulos, instrucoes, area... }
  const [falhas, setFalhas] = useState([]);           // modulos que nao geraram
  const [refazendo, setRefazendo] = useState(null);   // indice em regeneracao

  const timeoutsRef = useRef([]);

  // Recupera o rascunho salvo no LocalStorage ao carregar a página
  useEffect(() => {
    const draft = localStorage.getItem("generator_draft_text");
    if (draft) setText(draft);
  }, []);

  const handleTextChange = (e) => {
    const newText = e.target.value;
    setText(newText);
    localStorage.setItem("generator_draft_text", newText); // <-- NOVO: Auto-save do rascunho
  };

  const fetchConfig = async () => {
    try {
      const resp = await fetch(`${API_URL}/config`);
      const data = await resp.json().catch(() => ({}));
      if (resp.ok) {
        const models = safeArray(data?.available_models);
        setAvailableModels(models);
        const def = safeString(data?.default_model).trim();
        setModel(def || (models[0] || ""));
      }
    } catch (e) {
      console.error("Falha ao buscar modelos do backend:", e);
    }
  };

  const fetchUserSettings = async () => {
    try {
      const token = getAuthToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/users/me/settings`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.api_key) setUserApiKey(data.api_key);
        if (data.preferred_model) setUserModel(data.preferred_model);
      }
    } catch (err) { console.error("Falha ao buscar configurações de IA", err); }
  };

  useEffect(() => {
    fetchConfig();
    fetchUserSettings();
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
    const token = getAuthToken();

    try {
      const resp = await fetch(`${API_URL}/plans`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": token ? `Bearer ${token}` : ""
        },
        body: JSON.stringify({
          title: finalTitle,
          area: result.area_identificada || "Geral",
          content: result,
          ano: saveAno.trim(),
          banca: saveBanca.trim(),
          concurso: saveConcurso.trim(),
          visibility: saveVisibility 
        })
      });

      if (resp.ok) {
        setStatus("Salvo no banco com sucesso! ✅");
        setSaveTitle("");
      } else {
        const errData = await resp.json().catch(() => ({}));
        setError(errData.detail || "Erro ao salvar no banco.");
      }
    } catch (e) {
      console.error(e);
      setError("Erro de conexão ao salvar.");
    }
  };

  // Chamada autenticada, usada por todas as etapas da geracao.
  const postJson = async (rota, corpo) => {
    const token = getAuthToken();
    const resp = await fetch(`${API_URL}${rota}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": token ? `Bearer ${token}` : "",
      },
      body: JSON.stringify(corpo),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.detail || "Falha na comunicação com o servidor.");
    return data;
  };

  // Dados da prova que acompanham todas as etapas.
  const contextoDaProva = () => ({
    model: userModel || model || null,
    api_key: userApiKey || null,
    banca: saveBanca.trim() || null,
    concurso: saveConcurso.trim() || null,
    cargo: saveCargo.trim() || null,
    ano: saveAno.trim() || null,
  });

  const gerarUmModulo = (est, indice) =>
    postJson("/analyze/modulo", {
      ...contextoDaProva(),
      modulo: est.modulos[indice],
      area: est.area_identificada,
      instrucoes: est.instrucoes,
      texto_edital: text,
      question_format: questionFormat,
      question_level: questionLevel,
      qtd_questoes: Number(qtdQuestoes) || 10,
    });

  // A geracao acontece em etapas: primeiro o edital vira uma lista de modulos,
  // depois cada modulo e gerado numa chamada propria. Assim o progresso e real,
  // uma falha custa um modulo em vez do edital inteiro, e da para refazer so ele.
  const run = async () => {
    if (text.trim().length < 50) {
      setError("⚠️ O texto do edital é muito curto. Cole pelo menos um parágrafo válido.");
      return;
    }
    if (!saveBanca.trim() || !saveConcurso.trim() || !saveAno.trim()) {
      setError("⚠️ Informe banca, concurso e ano antes de gerar — é o que faz a IA escrever no padrão certo.");
      return;
    }

    setError("");
    setResult(null);
    setEstrutura(null);
    setFalhas([]);
    setLoading(true);
    setProgress(0);
    setStatus("Lendo o edital e separando os módulos...");

    try {
      // ---------- Etapa 1: estrutura ----------
      const est = await postJson("/analyze/estrutura", { ...contextoDaProva(), text });
      const modulos = safeArray(est?.modulos);
      if (modulos.length === 0) throw new Error("Não foi possível identificar módulos neste texto.");

      setEstrutura(est);
      if (est.truncado) {
        setError(`O edital tem mais de ${est.limite_modulos} tópicos. Serão gerados os ${est.limite_modulos} primeiros — gere o restante numa segunda aula.`);
      }

      // ---------- Etapa 2: um módulo por vez ----------
      const aulas = [];
      const naoGerados = [];

      for (let i = 0; i < modulos.length; i++) {
        const titulo = safeString(modulos[i]?.titulo) || `Módulo ${i + 1}`;
        setStatus(`Módulo ${i + 1} de ${modulos.length}: ${titulo}`);
        setProgress(Math.round((i / modulos.length) * 95));

        try {
          const aula = await gerarUmModulo(est, i);
          aulas.push(aula);
        } catch (e) {
          console.error(`Falha no módulo ${i + 1}`, e);
          naoGerados.push({ indice: i, titulo, mensagem: e.message });
        }

        // Mostra o que já ficou pronto, mesmo antes de terminar tudo.
        setResult({
          schema_version: 1,
          resumo_cargo: est.resumo_cargo,
          area_identificada: est.area_identificada,
          aulas: [...aulas],
          plano_estudo: "",
        });
      }

      setFalhas(naoGerados);

      if (aulas.length === 0) {
        throw new Error("Nenhum módulo pôde ser gerado. Verifique a sua chave de IA e tente novamente.");
      }

      // ---------- Etapa 3: plano de estudo ----------
      setStatus("Montando o plano de estudo...");
      setProgress(97);
      const plano = await postJson("/analyze/plano", {
        aulas,
        area: est.area_identificada,
        model: userModel || model || null,
        api_key: userApiKey || null,
      }).catch(() => ({ plano_estudo: "" }));

      setResult({
        schema_version: 1,
        resumo_cargo: est.resumo_cargo,
        area_identificada: est.area_identificada,
        aulas,
        plano_estudo: plano?.plano_estudo || "",
      });

      setProgress(100);
      setStatus(
        naoGerados.length > 0
          ? `Gerado com ${naoGerados.length} módulo(s) com falha — dá para refazer só eles abaixo.`
          : "Conteúdo gerado com sucesso!"
      );

      localStorage.removeItem("generator_draft_text");
      setTimeout(() => {
        document.getElementById("gerador-resultado")?.scrollIntoView({ behavior: "smooth" });
      }, 400);
    } catch (e) {
      console.error(e);
      setError(e.message || "Erro inesperado ao gerar a aula.");
      setStatus("");
      setProgress(0);
    } finally {
      setLoading(false);
    }
  };

  // Refaz um módulo isolado, sem regerar (nem pagar) o edital inteiro.
  const refazerModulo = async (indice) => {
    if (!estrutura) return;
    setRefazendo(indice);
    setError("");
    try {
      const aula = await gerarUmModulo(estrutura, indice);

      setResult((anterior) => {
        const aulas = safeArray(anterior?.aulas).slice();
        const posicao = aulas.findIndex((a) => a?.meta_modulo?.titulo === estrutura.modulos[indice]?.titulo);
        if (posicao >= 0) aulas[posicao] = aula;
        else aulas.push(aula);
        return { ...(anterior || {}), aulas };
      });

      setFalhas((anterior) => anterior.filter((f) => f.indice !== indice));
      setStatus("Módulo refeito com sucesso.");
    } catch (e) {
      setError(`Não foi possível refazer o módulo: ${e.message}`);
    } finally {
      setRefazendo(null);
    }
  };

  const onLoadJson = async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    setError("");
    try {
      const data = await readJsonFile(file);

      // Sem validacao, um arquivo em outro formato derruba a tela de aula.
      const aulas = safeArray(data?.aulas);
      if (aulas.length === 0) {
        throw new Error("O arquivo não tem a lista de aulas no formato esperado.");
      }
      const incompletos = aulas
        .map((a, i) => (safeString(a?.titulo).trim() ? null : i + 1))
        .filter((x) => x !== null);
      if (incompletos.length === aulas.length) {
        throw new Error("Nenhum módulo do arquivo tem título — o formato não confere.");
      }

      setResult(data);
      setEstrutura(null);
      setFalhas([]);
      setStatus(
        incompletos.length > 0
          ? `Arquivo carregado. Atenção: ${incompletos.length} módulo(s) estão incompletos.`
          : "Arquivo carregado."
      );
    } catch (e) {
      console.error(e);
      setError(e.message || "Arquivo JSON inválido ou corrompido.");
    } finally {
      ev.target.value = "";
    }
  };

  const handleConnectAI = () => {
    const callbackUrl = encodeURIComponent(`${window.location.origin}/callback`);
    window.location.href = `https://openrouter.ai/auth?callback_url=${callbackUrl}`;
  };

  const openConfigModal = () => {
    setTempModel(userModel || "deepseek/deepseek-v4-flash");
    setShowConfig(true);
  };

  const saveConfigToDB = async () => {
    setSavingConfig(true);
    try {
      const token = getAuthToken();
      if (!token) { alert("Sessão expirada. Faça login."); return; }
      const res = await fetch(`${API_URL}/users/me/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ api_key: userApiKey, preferred_model: tempModel.trim() })
      });
      if (res.ok) {
        setUserModel(tempModel.trim());
        setShowConfig(false);
      } else { alert("Erro ao guardar no servidor."); }
    } catch (err) { alert("Falha de conexão."); } finally { setSavingConfig(false); }
  };

  const handleDisconnectAI = async () => {
    if (!window.confirm("Tem a certeza que deseja desvincular a sua conta? Os recursos interativos de IA serão bloqueados.")) return;
    
    setSavingConfig(true);
    try {
      const token = getAuthToken();
      if (!token) { alert("Sessão expirada. Faça login."); return; }
      
      const res = await fetch(`${API_URL}/users/me/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ api_key: "", preferred_model: tempModel.trim() })
      });
      
      if (res.ok) {
        setUserApiKey("");
      } else { 
        alert("Erro ao desvincular no servidor."); 
      }
    } catch (err) { 
      alert("Falha de conexão."); 
    } finally { 
      setSavingConfig(false); 
    }
  };

  return (
    <div className="container">
      <header className="header">
        <h1 style={{ color: 'var(--heading-color)', margin: '0 0 10px 0' }}>Gerador de Aulas AI</h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Transforme editais secos em conteúdos didáticos e simulados incríveis.</p>
      </header>

      {/* BARRA SUPERIOR DE CONFIGURAÇÃO UNIFICADA */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--card-bg)', padding: '15px 20px', borderRadius: '12px', marginBottom: '20px', border: '1px solid var(--border)', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
        <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
          <strong>IA Geradora:</strong> {userApiKey ? <span style={{color: 'var(--success-text)'}}>Chave Ativa ({userModel || "Padrão"})</span> : <span>Configure a sua IA gratuitamente para gerar aulas mais rápidas.</span>}
        </div>
        <button onClick={openConfigModal} style={{ background: 'var(--primary)', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '0.95rem', cursor: 'pointer', fontWeight: 'bold', transition: 'background 0.2s' }}>
          ⚙️ Configurar a Minha IA
        </button>
      </div>

      <section className="panel" style={{ padding: '25px' }}>
        <div className="row">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
            <label className="label" style={{ margin: 0 }}>Assunto / Edital</label>
            <span style={{ fontSize: '0.8rem', color: text.length > 50 ? 'var(--success-text)' : 'var(--text-muted)' }}>
              {text.length} caracteres
            </span>
          </div>
          <textarea
            className="textarea"
            value={text}
            onChange={handleTextChange}
            disabled={loading}
            placeholder="Cole aqui o trecho do edital, lei ou conteúdo programático..."
            style={{ minHeight: '180px', backgroundColor: 'var(--input-bg)' }}
          />
        </div>

        {/* A banca precisa ser conhecida ANTES da geração: é ela que define o
            estilo do enunciado, das alternativas e da pegadinha. */}
        <div className="row" style={{ display: 'flex', gap: '15px', marginTop: '15px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 150px' }}>
            <label className="label">Banca *</label>
            <input className="input" placeholder="Ex: CEBRASPE, FGV, FCC" value={saveBanca} onChange={e => setSaveBanca(e.target.value)} disabled={loading} />
          </div>
          <div style={{ flex: '2 1 200px' }}>
            <label className="label">Concurso *</label>
            <input className="input" placeholder="Ex: DATAPREV, Polícia Federal" value={saveConcurso} onChange={e => setSaveConcurso(e.target.value)} disabled={loading} />
          </div>
          <div style={{ flex: '1 1 150px' }}>
            <label className="label">Cargo</label>
            <input className="input" placeholder="Ex: Analista de TI" value={saveCargo} onChange={e => setSaveCargo(e.target.value)} disabled={loading} />
          </div>
          <div style={{ flex: '0 1 110px' }}>
            <label className="label">Ano *</label>
            <input className="input" placeholder="2026" value={saveAno} onChange={e => setSaveAno(e.target.value)} disabled={loading} />
          </div>
        </div>

        <div className="row" style={{ display: 'flex', gap: '15px', marginTop: '15px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <label className="label">Nível das Questões</label>
            <select 
              className="select" 
              value={questionLevel} 
              onChange={(e) => setQuestionLevel(e.target.value)}
              disabled={loading}
            >
              <option value="Iniciante">Iniciante</option>
              <option value="Normal">Normal</option>
              <option value="Avançado">Avançado</option>
              <option value="Expert">Expert</option>
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
          <div style={{ flex: '0 1 160px' }}>
            <label className="label">Questões por módulo</label>
            <input
              className="input"
              type="number"
              min="3"
              max="20"
              value={qtdQuestoes}
              onChange={(e) => setQtdQuestoes(e.target.value)}
              disabled={loading}
            />
          </div>
        </div>

        {/* FEEDBACK VISUAL DE CARREGAMENTO */}
        {loading && (
          <div style={{ marginTop: '20px', background: 'var(--bg)', padding: '20px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--primary)', gap: '15px' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{status}</span>
              <span style={{ flex: 'none' }}>{progress}%</span>
            </div>
            <div style={{ width: '100%', backgroundColor: 'var(--border)', height: '10px', borderRadius: '5px', overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, backgroundColor: 'var(--primary)', height: '100%', transition: 'width 0.5s ease-out' }}></div>
            </div>
            {estrutura && (
              <p style={{ margin: '10px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Cada módulo é gerado numa chamada própria. Você pode acompanhar o resultado aparecendo abaixo conforme fica pronto.
              </p>
            )}
          </div>
        )}

        <div className="actions" style={{ marginTop: '25px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button className="btn primary" onClick={run} disabled={loading || text.trim().length < 10} style={{ flex: '1 1 200px', padding: '12px', fontSize: '1.05rem' }}>
            {loading ? "A processar..." : "✨ Gerar Material Completo"}
          </button>

          <button className="btn" onClick={() => result && downloadJson(result)} disabled={!result} style={{ flex: '1 1 120px' }}>
            ⬇️ Baixar JSON
          </button>

          <label className="btn file" style={{ flex: '1 1 120px', textAlign: 'center' }}>
            📂 Carregar JSON
            <input type="file" accept="application/json" onChange={onLoadJson} hidden />
          </label>
        </div>

        {/* Módulos que falharam: refazer só eles, sem regerar o edital todo. */}
        {falhas.length > 0 && !loading && (
          <div style={{ marginTop: '20px', padding: '15px', borderRadius: '8px', border: '1px solid var(--warn, #B4720B)', background: 'var(--warn-soft, #FDF3E2)' }}>
            <strong style={{ display: 'block', marginBottom: '10px', color: 'var(--warn, #B4720B)' }}>
              {falhas.length} módulo(s) não foram gerados
            </strong>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {falhas.map((f) => (
                <div key={f.indice} style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>
                    {f.titulo}
                    <span style={{ color: 'var(--text-muted)', marginLeft: '8px', fontSize: '0.85rem' }}>{f.mensagem}</span>
                  </span>
                  <button
                    className="btn"
                    onClick={() => refazerModulo(f.indice)}
                    disabled={refazendo !== null}
                    style={{ flex: 'none' }}
                  >
                    {refazendo === f.indice ? "Refazendo..." : "Refazer este módulo"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {!!error && <div className="error" style={{ marginTop: '15px', padding: '10px', background: 'var(--error-bg)', color: 'var(--error-text)', border: '1px solid var(--error-text)', borderRadius: '6px' }}>{error}</div>}
        {!!status && !loading && !error && <div className="status" style={{ marginTop: '15px', color: 'var(--success-text)', fontWeight: 'bold' }}>{status}</div>}

        {/* ÁREA DE SALVAR (Só aparece após sucesso) */}
        {result && !loading && (
          <div className="save-container" style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '25px', padding: '20px', backgroundColor: 'var(--hover-bg)', border: '1px solid var(--border)', borderRadius: '12px' }}>
            <h3 style={{ margin: 0, color: 'var(--heading-color)' }}>💾 Salvar Aula no Banco de Dados</h3>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              Gerada para <strong style={{ color: 'var(--text-main)' }}>{saveBanca || "—"}</strong>
              {saveConcurso ? <> · {saveConcurso}</> : null}
              {saveCargo ? <> · {saveCargo}</> : null}
              {saveAno ? <> · {saveAno}</> : null}
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '120px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-main)' }}>Visibilidade</label>
                <select className="select" value={saveVisibility} onChange={e => setSaveVisibility(e.target.value)} style={{ width: '100%', marginTop: '5px' }}>
                  <option value="public">🌍 Público</option>
                  <option value="private">🔒 Privado</option>
                </select>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-main)' }}>Título da Aula</label>
                <input className="input" placeholder="Digite um título fácil de lembrar..." value={saveTitle} onChange={e => setSaveTitle(e.target.value)} style={{ width: '100%', marginTop: '5px' }} />
              </div>
              <button className="btn primary" onClick={saveToDb} style={{ padding: '10px 20px', height: '42px' }}>Confirmar e Salvar</button>
            </div>
          </div>
        )}
      </section>

      {/* RENDERIZA O RESULTADO */}
      {result && (
        <section id="gerador-resultado" className="result" style={{ marginTop: '40px' }}>
          <LessonContent result={result} />
        </section>
      )}

      {/* MODAL DE CONFIGURAÇÃO GLOBAL (CHAVE DA IA INDIVIDUAL) */}
      {showConfig && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.8)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: '12px', padding: '30px', width: '100%', maxWidth: '500px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', border: '1px solid var(--border)' }}>
            <h3 style={{ marginTop: 0, color: 'var(--heading-color)', borderBottom: '1px solid var(--border)', paddingBottom: '15px', marginBottom: '15px' }}>⚙️ Configurar a Minha IA</h3>
            
            <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: '1.5', background: 'var(--bg)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              Vincule a sua conta do OpenRouter para desbloquear a geração rápida e os recursos avançados. <br/><br/>
              ✨ É <strong style={{color: 'var(--text-main)'}}>100% gratuito</strong> e você pode conectar-se em 2 segundos usando a sua conta já existente do <strong style={{color: 'var(--text-main)'}}>Google, Discord ou GitHub</strong>.
            </p>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', color: 'var(--text-main)', marginBottom: '8px' }}>Integração de Acesso:</label>
              
              {userApiKey ? (
                <div style={{ padding: '12px', borderRadius: '6px', background: 'var(--success-bg)', border: '1px solid var(--success-text)', color: 'var(--success-text)', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>✅ Conta vinculada com sucesso!</span>
                  <button 
                    onClick={handleDisconnectAI} 
                    disabled={savingConfig}
                    style={{ background: 'transparent', border: 'none', color: 'var(--success-text)', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem', textDecoration: 'underline' }}
                  >
                    {savingConfig ? "Ags..." : "Desvincular"}
                  </button>
                </div>
              ) : (
                <button onClick={handleConnectAI} style={{ width: '100%', padding: '14px', backgroundColor: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                  🔗 Conectar IA Gratuitamente
                </button>
              )}
            </div>

            <div style={{ marginBottom: '25px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', color: 'var(--text-main)', marginBottom: '8px' }}>Modelo de IA (Opcional):</label>
              <input 
                type="text" 
                value={tempModel} 
                onChange={(e) => setTempModel(e.target.value)} 
                placeholder="ex: deepseek/deepseek-v4-flash" 
                disabled={!userApiKey}
                style={{ 
                  width: '100%', 
                  padding: '12px', 
                  borderRadius: '6px', 
                  border: '1px solid var(--border)', 
                  fontSize: '1rem', 
                  backgroundColor: !userApiKey ? 'var(--bg)' : 'var(--input-bg)', 
                  color: !userApiKey ? 'var(--text-muted)' : 'var(--text-main)',
                  cursor: !userApiKey ? 'not-allowed' : 'text'
                }} 
              />
              
              {!userApiKey ? (
                <span style={{ fontSize: '0.85rem', color: 'var(--error-text)', marginTop: '8px', display: 'block', fontWeight: 'bold' }}>
                  🔒 Como você está usando a IA Compartilhada, o modelo é definido automaticamente pelo administrador da plataforma.
                </span>
              ) : (
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '8px', display: 'block', lineHeight: '1.4' }}>
                  O sistema utiliza modelos gratuitos por padrão. <a href="https://openrouter.ai/models?max_price=0" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', fontWeight: 'bold', textDecoration: 'underline' }}>Clique aqui para ver a lista de modelos 100% gratuitos</a>.
                </span>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px', marginTop: '10px' }}>
              <button onClick={() => setShowConfig(false)} disabled={savingConfig} style={{ padding: '12px 20px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--hover-bg)', color: 'var(--text-main)', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}>Fechar</button>
              <button onClick={saveConfigToDB} disabled={savingConfig} style={{ padding: '12px 20px', borderRadius: '6px', border: 'none', background: 'var(--primary)', color: 'white', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}>{savingConfig ? "⏳ A guardar..." : "Salvar Modelo"}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}