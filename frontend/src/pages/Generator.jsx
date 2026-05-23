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

  // Histórico e Salvamento
  const [saveTitle, setSaveTitle] = useState("");
  const [saveAno, setSaveAno] = useState("");          
  const [saveBanca, setSaveBanca] = useState("");       
  const [saveConcurso, setSaveConcurso] = useState(""); 
  const [saveVisibility, setSaveVisibility] = useState("public");

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
    if (text.trim().length < 50) {
      setError("⚠️ O texto do edital é muito curto. Cole pelo menos um parágrafo válido.");
      return;
    }

    setError("");
    setResult(null);
    setLoading(true);
    setProgress(5); // Inicia progresso
    setStatus("Iniciando análise do edital...");

    timeoutsRef.current.forEach((id) => clearTimeout(id));
    timeoutsRef.current = [];

    // <-- NOVO: Progressões de status com preenchimento de barra simulada
    timeoutsRef.current.push(setTimeout(() => { setStatus("Arquiteto IA: mapeando módulos e estrutura..."); setProgress(25); }, 1500));
    timeoutsRef.current.push(setTimeout(() => { setStatus("Pesquisador IA: aprofundando conteúdo teórico..."); setProgress(55); }, 5000));
    timeoutsRef.current.push(setTimeout(() => { setStatus("Professor IA: criando exemplos e analogias..."); setProgress(75); }, 10000));
    timeoutsRef.current.push(setTimeout(() => { setStatus("Banca IA: elaborando questões e revisando..."); setProgress(90); }, 15000));

    try {
      const token = getAuthToken();
      const resp = await fetch(`${API_URL}/analyze`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": token ? `Bearer ${token}` : ""
        },
        body: JSON.stringify({ 
          text, 
          model: userModel || model || null, 
          question_format: questionFormat,
          question_level: questionLevel,
          api_key: userApiKey || null 
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.detail || "Erro ao chamar API.");

      setProgress(100);
      setResult(data);
      setStatus("Conteúdo gerado com sucesso! ✅");
      
      // Limpa o rascunho após sucesso
      localStorage.removeItem("generator_draft_text");
      
      setTimeout(() => {
        document.getElementById('gerador-resultado')?.scrollIntoView({ behavior: 'smooth' });
      }, 500);

    } catch (e) {
      console.error(e);
      setError(e.message || "Erro inesperado ao gerar a aula.");
      setStatus("");
      setProgress(0);
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

  const handleConnectAI = () => {
    const callbackUrl = encodeURIComponent(`${window.location.origin}/callback`);
    window.location.href = `https://openrouter.ai/auth?callback_url=${callbackUrl}`;
  };

  const openConfigModal = () => {
    setTempModel(userModel || "arcee-ai/trinity-large-thinking:free");
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

        <div className="row" style={{ display: 'flex', gap: '15px', marginTop: '15px' }}>
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
        </div>

        {/* FEEDBACK VISUAL DE CARREGAMENTO */}
        {loading && (
          <div style={{ marginTop: '20px', background: 'var(--bg)', padding: '20px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--primary)' }}>
              <span>{status}</span>
              <span>{progress}%</span>
            </div>
            <div style={{ width: '100%', backgroundColor: 'var(--border)', height: '10px', borderRadius: '5px', overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, backgroundColor: 'var(--primary)', height: '100%', transition: 'width 0.5s ease-out' }}></div>
            </div>
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

        {!!error && <div className="error" style={{ marginTop: '15px', padding: '10px', background: 'var(--error-bg)', color: 'var(--error-text)', border: '1px solid var(--error-text)', borderRadius: '6px' }}>{error}</div>}
        {!!status && !loading && !error && <div className="status" style={{ marginTop: '15px', color: 'var(--success-text)', fontWeight: 'bold' }}>{status}</div>}

        {/* ÁREA DE SALVAR (Só aparece após sucesso) */}
        {result && !loading && (
          <div className="save-container" style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '25px', padding: '20px', backgroundColor: 'var(--hover-bg)', border: '1px solid var(--border)', borderRadius: '12px' }}>
            <h3 style={{ margin: 0, color: 'var(--heading-color)' }}>💾 Salvar Aula no Banco de Dados</h3>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '80px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-main)' }}>Ano</label>
                <input className="input" placeholder="Ex: 2024" value={saveAno} onChange={e => setSaveAno(e.target.value)} style={{ width: '100%', marginTop: '5px' }} />
              </div>
              <div style={{ flex: 1, minWidth: '120px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-main)' }}>Banca</label>
                <input className="input" placeholder="Ex: CESPE" value={saveBanca} onChange={e => setSaveBanca(e.target.value)} style={{ width: '100%', marginTop: '5px' }} />
              </div>
              <div style={{ flex: 2, minWidth: '150px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-main)' }}>Concurso</label>
                <input className="input" placeholder="Ex: Polícia Federal" value={saveConcurso} onChange={e => setSaveConcurso(e.target.value)} style={{ width: '100%', marginTop: '5px' }} />
              </div>
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
              <input type="text" value={tempModel} onChange={(e) => setTempModel(e.target.value)} placeholder="ex: arcee-ai/trinity-large-thinking:free" style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '1rem', backgroundColor: 'var(--input-bg)', color: 'var(--text-main)' }} />
              
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '8px', display: 'block', lineHeight: '1.4' }}>
                O sistema utiliza modelos gratuitos por padrão. <a href="https://openrouter.ai/models?max_price=0" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', fontWeight: 'bold', textDecoration: 'underline' }}>Clique aqui para ver a lista de modelos 100% gratuitos</a>.
              </span>
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