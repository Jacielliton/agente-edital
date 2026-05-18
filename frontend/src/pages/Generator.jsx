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
    let t = storage.getItem("access_token") || storage.getItem("token");
    if (t && t.startsWith("eyJ")) return t;
    try {
      const uStr = storage.getItem("user");
      if (uStr && uStr.startsWith("{")) {
        const uObj = JSON.parse(uStr);
        if (uObj.access_token && String(uObj.access_token).startsWith("eyJ")) return uObj.access_token;
        if (uObj.token && String(uObj.token).startsWith("eyJ")) return uObj.token;
      }
    } catch(e) {}
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      const val = storage.getItem(key);
      if (typeof val === "string" && val.startsWith("eyJ")) return val;
      try {
        if (val && val.startsWith("{")) {
          const obj = JSON.parse(val);
          for (let k in obj) {
            if (typeof obj[k] === "string" && obj[k].startsWith("eyJ")) return obj[k];
          }
        }
      } catch(e) {}
    }
  }
  return null;
};

export default function Generator() { 
  const [text, setText] = useState("");
  
  // Estados para as Questões
  const [questionFormat, setQuestionFormat] = useState("Múltipla Escolha");
  const [questionLevel, setQuestionLevel] = useState("Superior");

  // Config do Servidor (Para fallback de Modelos)
  const [availableModels, setAvailableModels] = useState([]);
  const [model, setModel] = useState(""); 

  // ESTADOS GLOBAIS DE CONFIGURAÇÃO DE IA INDIVIDUAL
  const [showConfig, setShowConfig] = useState(false);
  const [tempModel, setTempModel] = useState("");
  const [userApiKey, setUserApiKey] = useState("");
  const [userModel, setUserModel] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);

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
    // NOVA TRAVA: Se não houver chave individual do utilizador e for gerar, avisa.
    // Opcionalmente, pode forçar o bloqueio aqui caso o servidor exija.
    
    setError("");
    setResult(null);
    setLoading(true);
    setStatus("Iniciando análise...");

    timeoutsRef.current.forEach((id) => clearTimeout(id));
    timeoutsRef.current = [];

    timeoutsRef.current.push(setTimeout(() => setStatus("Arquiteto: estruturando módulos e âncoras..."), 500));
    timeoutsRef.current.push(setTimeout(() => setStatus("Pesquisador/Professor: criando aulas aprofundadas..."), 1800));
    timeoutsRef.current.push(setTimeout(() => setStatus("Glossário e questões: consolidando..."), 3500));

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
          model: userModel || model || null, // Prioriza o modelo individual do utilizador
          question_format: questionFormat,
          question_level: questionLevel,
          api_key: userApiKey || null // Passa a chave individual para o backend caso configurado
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

  // Funções do Modal de Configuração de IA
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
        <h1>Gerador de Aulas</h1>
        <p>Crie novos conteúdos a partir de editais.</p>
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

      <section className="panel">
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

          {/* ÁREA DE SALVAR */}
          {result && (
            <div className="save-container" style={{ width: '100%', flexDirection: 'column', alignItems: 'stretch', gap: '10px', marginTop: '1rem', padding: '15px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px' }}>
              <div style={{ fontWeight: 'bold', color: 'var(--heading-color)', marginBottom: '5px' }}>Salvar Aula no Banco</div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <input className="input" placeholder="Ano (ex: 2024)" value={saveAno} onChange={e => setSaveAno(e.target.value)} style={{ flex: 1, minWidth: '80px' }} />
                <input className="input" placeholder="Banca (ex: CESPE)" value={saveBanca} onChange={e => setSaveBanca(e.target.value)} style={{ flex: 1, minWidth: '120px' }} />
                <input className="input" placeholder="Concurso (ex: PF)" value={saveConcurso} onChange={e => setSaveConcurso(e.target.value)} style={{ flex: 2, minWidth: '150px' }} />
                
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
        {!!error && <div className="error">{error}</div>}

      </section>

      {result && (
        <section className="result">
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