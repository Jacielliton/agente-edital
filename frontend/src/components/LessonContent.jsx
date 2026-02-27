import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import QuizCard from "../QuizCard";
import Mermaid from "./Mermaid";

const safeArray = (v) => (Array.isArray(v) ? v : []);
const safeString = (v) => (typeof v === "string" ? v : v == null ? "" : String(v));

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

// ==========================================
// COMPONENTE: CHAT DO TUTOR (FLUTUANTE DIREITO)
// ==========================================
function TutorChat({ area, defaultModel, userApiKey, userModel }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!input.trim()) return;
    
    const newMsg = { role: "user", content: input };
    const updatedMessages = [...messages, newMsg];
    
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);
    
    try {
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          area: area || "Assunto Geral",
          aula_titulo: "Conhecimento Geral da Área",
          mensagem: newMsg.content,
          historico: messages.slice(-4),
          model: userModel || defaultModel || "google/gemini-2.5-flash",
          api_key: userApiKey || null
        })
      });

      if (!res.ok) throw new Error("Erro na API");
      
      const data = await res.json();
      setMessages([...updatedMessages, { role: "assistant", content: data.resposta }]);
    } catch (e) {
      setMessages([...updatedMessages, { role: "assistant", content: "⚠️ *Desculpe, falha na conexão.* Verifique sua chave API ou tente novamente." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tutor-widget-container" style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 9999 }}>
      {isOpen && (
        <div className="tutor-widget-window" style={{ width: '350px', height: '500px', backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="tutor-widget-header" style={{ backgroundColor: '#0f172a', color: '#fff', padding: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 'bold' }}>🎓 Tutor de IA ({safeString(area).substring(0, 15)}...)</span>
            <button className="tutor-widget-close" onClick={() => setIsOpen(false)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
          </div>
          
          <div className="chat-container" style={{ flex: 1, padding: '15px', overflowY: 'auto', backgroundColor: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', color: '#94a3b8', padding: '20px 0', fontStyle: 'italic', fontSize: '0.9rem' }}>
                Olá! Sou o seu professor particular de <strong>{area}</strong>.<br/><br/>Qualquer dúvida sobre o curso, é só perguntar!
              </div>
            )}
            
            {messages.map((msg, idx) => (
              <div key={idx} className={`chat-msg ${msg.role}`} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%', padding: '10px 15px', borderRadius: '12px', backgroundColor: msg.role === 'user' ? '#3b82f6' : '#e2e8f0', color: msg.role === 'user' ? '#fff' : '#0f172a' }}>
                {msg.role === 'assistant' ? (
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                ) : (
                  msg.content
                )}
              </div>
            ))}
            
            {loading && (
              <div className="chat-msg assistant" style={{ alignSelf: 'flex-start', fontStyle: 'italic', color: '#64748b', backgroundColor: '#e2e8f0', padding: '10px 15px', borderRadius: '12px' }}>
                A pensar... ⏳
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="chat-input-area" style={{ padding: '10px', borderTop: '1px solid #e2e8f0', backgroundColor: '#fff', display: 'flex', gap: '10px' }}>
            <input 
              type="text" 
              className="chat-input"
              placeholder="Digite a sua dúvida aqui..." 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              disabled={loading}
              style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }}
            />
            <button className="chat-send-btn" onClick={handleSend} disabled={loading || !input.trim()} style={{ padding: '10px 15px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
              Enviar
            </button>
          </div>
        </div>
      )}

      {!isOpen && (
        <button className="tutor-widget-button" onClick={() => setIsOpen(true)} title="Tirar dúvida com a IA" style={{ width: '60px', height: '60px', borderRadius: '50%', backgroundColor: '#3b82f6', color: '#fff', border: 'none', fontSize: '1.5rem', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          💬
        </button>
      )}
    </div>
  );
}

// ==========================================
// COMPONENTE: PROVA DISCURSIVA
// ==========================================
function EssaySection({ initialDiscursiva, defaultModel, userApiKey, userModel, aula, area }) {
  const [discursiva, setDiscursiva] = useState(initialDiscursiva);
  const [answer, setAnswer] = useState("");
  const [correction, setCorrection] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingGen, setLoadingGen] = useState(false);
  const [error, setError] = useState(null);
  
  if (!discursiva || !discursiva.comando) return null;

  const handleCorrect = async () => {
    if (answer.trim().length < 50) {
      alert("A banca exige mais conteúdo. Desenvolva melhor os seus argumentos antes de enviar.");
      return;
    }
    setLoading(true); setError(null); setCorrection(null);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/correct-essay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texto_motivador: discursiva.texto_motivador || "",
          comando: discursiva.comando || "",
          aspectos: discursiva.aspectos || [],
          resposta_aluno: answer,
          model: userModel || defaultModel || "google/gemini-2.5-flash",
          api_key: userApiKey || null
        })
      });
      if (!res.ok) throw new Error(`Erro do servidor: ${res.status}`);
      const data = await res.json();
      setCorrection(data);
    } catch (err) {
      setError("A IA corretora falhou. Verifique se a sua Chave de API está correta nas configurações.");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateNew = async () => {
    setLoadingGen(true);
    setError(null);
    setCorrection(null);
    setAnswer("");
    
    try {
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/generate-essay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          area: area || "Assunto Geral",
          aula_titulo: aula.titulo || "Aula",
          lesson_content: aula, 
          model: userModel || defaultModel || "google/gemini-2.5-flash",
          api_key: userApiKey || null
        })
      });

      if (!res.ok) throw new Error(`Erro do servidor: ${res.status}`);

      const data = await res.json();
      const novaQuestao = data.discursiva ? data.discursiva : data;

      if (novaQuestao && novaQuestao.comando) {
        setDiscursiva(novaQuestao); 
      } else {
        console.error("Retorno inválido da IA:", data);
        setError("A IA não retornou um formato válido. Tente clicar em Gerar novamente.");
      }
    } catch (err) {
      console.error(err);
      setError("Falha ao gerar nova discursiva. Tente novamente.");
    } finally {
      setLoadingGen(false);
    }
  };

  return (
    // ATENÇÃO: Removida a propriedade 'open' daqui
    <details className="details" style={{ borderColor: '#0f172a', position: 'relative', margin: '20px 0', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
      <summary className="summaryTitle" style={{ color: '#f8fafc', backgroundColor: '#0f172a', padding: '15px', cursor: 'pointer', fontWeight: 'bold', borderRadius: '8px 8px 0 0' }}>
        ✍️ Prova Discursiva (Padrão CESPE)
      </summary>

      <div className="essay-container" style={{ padding: '20px' }}>
        <div style={{ marginBottom: '15px' }}>
          <strong>📋 Cenário / Texto Motivador:</strong>
          <div className="essay-text">
            <ReactMarkdown>{safeString(discursiva.texto_motivador)}</ReactMarkdown>
          </div>
        </div>
        
        <div style={{ marginBottom: '15px', background: '#f1f5f9', padding: '10px', borderRadius: '4px', borderLeft: '4px solid #0f172a' }}>
          <strong>📝 Comando da Questão:</strong>
          <div className="essay-text" style={{ fontWeight: '500', margin: '5px 0 0 0', color: '#0f172a' }}>
            <ReactMarkdown>{safeString(discursiva.comando)}</ReactMarkdown>
          </div>
        </div>
        
        <div style={{ marginBottom: '20px' }}>
          <strong>🎯 Aspectos Avaliados OBRIGATORIAMENTE:</strong>
          <ul style={{ margin: '10px 0', paddingLeft: '20px', color: '#334155' }}>
            {safeArray(discursiva.aspectos).map((asp, i) => (
              <li key={i} style={{marginBottom: '5px'}}>
                {safeString(asp.aspecto)} <span style={{color: '#ef4444', fontWeight: 'bold', marginLeft: '5px'}}>({safeString(asp.valor_maximo)} pts)</span>
              </li>
            ))}
          </ul>
        </div>
        
        <textarea 
          className="essay-textarea" 
          placeholder="Rascunho Oficial: Digite aqui o seu texto dissertativo..." 
          value={answer} 
          onChange={(e) => setAnswer(e.target.value)} 
          disabled={loading || loadingGen || correction !== null} 
          style={{ width: '100%', minHeight: '150px', padding: '15px', borderRadius: '8px', border: '1px solid #cbd5e1', marginBottom: '15px', resize: 'vertical' }}
        />
        
        {!correction && (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="essay-button" onClick={handleCorrect} disabled={loading || loadingGen || answer.trim().length === 0} style={{ flex: 2, padding: '12px', backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
              {loading ? "⏳ A avaliar..." : "✔️ Submeter à Correção da IA"}
            </button>
            <button className="essay-button" onClick={handleGenerateNew} disabled={loading || loadingGen} style={{ flex: 1, backgroundColor: '#475569', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
              {loadingGen ? "⏳ A gerar..." : "🔄 Gerar Nova Prova"}
            </button>
          </div>
        )}

        {error && (<div className="correction-error" style={{ color: '#ef4444', marginTop: '10px' }}><strong>⚠️ Erro: </strong> {error}</div>)}
        
        {correction && (
          <div className="correction-box" style={{ marginTop: '20px', padding: '20px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ marginTop: 0, color: '#10b981', borderBottom: '2px solid #10b981', paddingBottom: '10px' }}>📊 Resultado Final: {safeString(correction.nota_final)} / 10.0</h3>
            <div style={{fontStyle: 'italic'}}><strong>Parecer da Banca:</strong> <ReactMarkdown>{safeString(correction.feedback_geral)}</ReactMarkdown></div>
            <h4 style={{ marginTop: '20px', color: '#0f172a' }}>🔹 Avaliação por Aspecto:</h4>
            {safeArray(correction.avaliacoes_aspectos).map((av, k) => (
              <div key={k} style={{ marginBottom: '15px', background: '#fff', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #3b82f6', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                <div style={{fontWeight: 'bold', color: '#334155'}}>{safeString(av.aspecto)}</div>
                <div style={{ color: '#2563eb', fontWeight: 'bold', margin: '5px 0' }}>Nota: {safeString(av.nota_atribuida)}</div>
                <div style={{fontSize: '0.9em', color: '#475569'}}><em><ReactMarkdown>{safeString(av.comentario)}</ReactMarkdown></em></div>
              </div>
            ))}
            <h4 style={{ marginTop: '20px', color: '#0f172a' }}>🔹 Descontos Gramaticais / Estruturais:</h4>
            <div style={{fontSize: '0.9em', color: '#b91c1c'}}><ReactMarkdown>{safeString(correction.erros_gramaticais)}</ReactMarkdown></div>
            
            <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
              <button onClick={() => {setCorrection(null); setAnswer("");}} style={{background: 'none', color: '#2563eb', border: 'none', cursor: 'pointer', fontWeight: 'bold', textDecoration: 'underline'}}>
                🔄 Tentar responder a esta prova novamente
              </button>
              <button onClick={handleGenerateNew} disabled={loadingGen} style={{background: 'none', color: '#475569', border: 'none', cursor: 'pointer', fontWeight: 'bold', textDecoration: 'underline'}}>
                {loadingGen ? "⏳ A gerar nova questão..." : "🆕 Gerar um novo cenário"}
              </button>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

// ==========================================
// COMPONENTE PRINCIPAL DA PÁGINA
// ==========================================
export default function LessonContent({ result }) {
  const [selectedMap, setSelectedMap] = useState(null);
  
  // ESTADO DO MENU LATERAL
  const [isNavOpen, setIsNavOpen] = useState(false);
  
  // ESTADO GLOBAL DE CONFIGURAÇÃO DE IA
  const [showConfig, setShowConfig] = useState(false);
  const [tempKey, setTempKey] = useState("");
  const [tempModel, setTempModel] = useState("");
  const [userApiKey, setUserApiKey] = useState("");
  const [userModel, setUserModel] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);

  useEffect(() => {
    const fetchDBSettings = async () => {
      try {
        const token = getAuthToken();
        if (!token) return;
        const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
        const res = await fetch(`${apiUrl}/users/me/settings`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.api_key) setUserApiKey(data.api_key);
          if (data.preferred_model) setUserModel(data.preferred_model);
        }
      } catch (err) { console.error("Falha ao buscar configurações de IA", err); }
    };
    fetchDBSettings();
  }, []);

  const openConfigModal = () => {
    setTempKey(userApiKey);
    setTempModel(userModel || result?.modelo_utilizado || "google/gemini-2.5-flash");
    setShowConfig(true);
  };

  const saveConfigToDB = async () => {
    setSavingConfig(true);
    try {
      const token = getAuthToken();
      if (!token) { alert("Sessão expirada. Faça login."); return; }
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/users/me/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ api_key: tempKey.trim(), preferred_model: tempModel.trim() })
      });
      if (res.ok) {
        setUserApiKey(tempKey.trim());
        setUserModel(tempModel.trim());
        setShowConfig(false);
      } else { alert("Erro ao guardar no servidor."); }
    } catch (err) { alert("Falha de conexão."); } finally { setSavingConfig(false); }
  };

  const handleDownloadSVG = (titulo) => {
    const svgElement = document.querySelector('.mermaid-wrapper svg');
    if (!svgElement) { alert("O mapa ainda está a ser gerado."); return; }
    const serializer = new XMLSerializer();
    let svgString = serializer.serializeToString(svgElement);
    if (!svgString.includes('xmlns="http://www.w3.org/2000/svg"')) {
      svgString = svgString.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    }
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Mapa-Mental-${safeString(titulo).replace(/\s+/g, '-')}.svg`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  if (!result) return <div style={{ padding: '20px' }}>A aguardar os dados da lição...</div>;
  const aulas = safeArray(result?.aulas);

  return (
    <div className="result-content" style={{ position: 'relative', maxWidth: '1000px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      
      {/* INJEÇÃO DE CSS PARA A ANIMAÇÃO DO NAVEGADOR */}
      <style>
        {`
          @keyframes slideRightIn {
            from { transform: translateX(-100%); }
            to { transform: translateX(0); }
          }
          .nav-drawer {
            animation: slideRightIn 0.3s ease-out forwards;
          }
          .nav-item-btn:hover {
            border-color: #3b82f6 !important;
            background-color: #eff6ff !important;
          }
        `}
      </style>

      {/* BARRA SUPERIOR DE CONFIGURAÇÃO UNIFICADA */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#e2e8f0', padding: '12px 20px', borderRadius: '8px', marginBottom: '20px' }}>
        <div style={{ fontSize: '0.9rem', color: '#475569' }}>
          <strong>IA Interativa:</strong> {userApiKey ? <span style={{color: '#10b981'}}>Chave Privada Ativa ({userModel})</span> : <span>Padrão do Sistema</span>}
        </div>
        <button onClick={openConfigModal} style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '6px', fontSize: '0.9rem', cursor: 'pointer', fontWeight: 'bold' }}>
          ⚙️ Configurar a Minha IA
        </button>
      </div>

      <div className="summary" style={{ background: '#f8fafc', padding: '20px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
        <div className="summaryItem" style={{ marginBottom: '15px' }}>
          <div className="summaryLabel" style={{ fontWeight: 'bold', color: '#475569' }}>Área</div>
          <div className="summaryValue" style={{ fontSize: '1.1rem', color: '#0f172a' }}>{safeString(result?.area_identificada)}</div>
        </div>
        <div className="summaryItem">
          <div className="summaryLabel" style={{ fontWeight: 'bold', color: '#475569' }}>Resumo do Cargo/Objetivo</div>
          <div className="summaryValue">
            <ReactMarkdown>{safeString(result?.resumo_cargo)}</ReactMarkdown>
          </div>
        </div>
      </div>

      {!!safeString(result?.plano_estudo) && (
        // ATENÇÃO: Removida a propriedade 'open' daqui
        <details className="details" style={{ margin: '20px 0', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
          <summary className="summaryTitle" style={{ padding: '15px', background: '#f1f5f9', fontWeight: 'bold', cursor: 'pointer' }}>📅 Plano de Estudo Estratégico</summary>
          <div className="md" style={{ padding: '20px' }}><ReactMarkdown>{safeString(result?.plano_estudo)}</ReactMarkdown></div>
        </details>
      )}

      {aulas.map((aula, idx) => {
        const quiz = safeArray(aula?.quiz);
        const mapaMental = aula?.mapa_mental || {};

        return (
          // ATENÇÃO: Adicionado ID ao article para o scroll funcionar
          <article id={`aula-${idx}`} className="card" key={idx} style={{ marginBottom: '40px', padding: '20px', border: '1px solid #e2e8f0', borderRadius: '12px', background: '#ffffff', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
           
            <h2 className="lessonTitle" style={{ marginTop: 0, color: '#1e293b', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px' }}>
              <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', color: '#3b82f6', letterSpacing: '0.05em', marginBottom: '6px' }}>
                📚 {safeString(aula?.disciplina)}
              </span>
              {safeString(aula?.titulo)}
            </h2>
            
            <div className="section" style={{ marginBottom: '20px' }}>
              <p><strong>Visão Geral:</strong> <ReactMarkdown components={{ p: 'span' }}>{safeString(aula?.visao_geral)}</ReactMarkdown></p>
            </div>

            {/* 1. Aula Teórica Aprofundada - Removido o 'open' */}
            <details className="details" style={{ marginBottom: '15px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
              <summary className="summaryTitle" style={{ padding: '15px', background: '#f8fafc', fontWeight: 'bold', cursor: 'pointer', borderRadius: '8px' }}>
                📖 Aula Teórica Aprofundada
              </summary>
              <div className="md markdown-format" style={{ padding: '20px' }}>
                <ReactMarkdown>{safeString(aula?.aula_teorica_aprofundada)}</ReactMarkdown>
              </div>
            </details>

            {/* 2. Resumo de Termos Chave */}
            {Array.isArray(aula?.resumo_termos_chave) && aula.resumo_termos_chave.length > 0 && (
              <details className="details" style={{ marginBottom: '15px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                <summary className="summaryTitle" style={{ padding: '15px', background: '#f8fafc', fontWeight: 'bold', cursor: 'pointer', borderRadius: '8px' }}>
                  🔑 Resumo de Termos Chave
                </summary>
                <div style={{ padding: '20px' }}>
                  <ul style={{ listStyleType: 'none', padding: 0, margin: 0 }}>
                    {aula.resumo_termos_chave.map((t, k) => (
                      <li key={k} style={{ marginBottom: '12px', background: '#f1f5f9', padding: '12px', borderRadius: '6px', borderLeft: '4px solid #3b82f6' }}>
                        <strong style={{ color: '#1e40af' }}>{t.termo}:</strong> <ReactMarkdown components={{ p: 'span' }}>{t.definicao}</ReactMarkdown>
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            )}

            {/* 3. Analogias e Contexto */}
            {!!aula?.analogias_contexto && (
              <details className="details" style={{ marginBottom: '15px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                <summary className="summaryTitle" style={{ padding: '15px', background: '#fefce8', color: '#a16207', fontWeight: 'bold', cursor: 'pointer', borderRadius: '8px' }}>
                  💡 Analogias e Contexto
                </summary>
                <div className="md markdown-format" style={{ padding: '20px' }}>
                  <ReactMarkdown>{safeString(aula.analogias_contexto)}</ReactMarkdown>
                </div>
              </details>
            )}

            {/* 4. Aplicação Prática / Exemplos */}
            {!!aula?.aplicacao_pratica_exemplos && (
              <details className="details" style={{ marginBottom: '15px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                <summary className="summaryTitle" style={{ padding: '15px', background: '#f0fdf4', color: '#166534', fontWeight: 'bold', cursor: 'pointer', borderRadius: '8px' }}>
                  🛠️ Aplicação Prática / Exemplos
                </summary>
                <div className="md markdown-format" style={{ padding: '20px' }}>
                  <ReactMarkdown>{safeString(aula.aplicacao_pratica_exemplos)}</ReactMarkdown>
                </div>
              </details>
            )}

            {/* 5. Fixação de Conhecimento (Questões) */}
            {quiz.length > 0 && (
              <details className="details" style={{ marginBottom: '15px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                <summary className="summaryTitle" style={{ padding: '15px', background: '#f8fafc', fontWeight: 'bold', cursor: 'pointer', borderRadius: '8px' }}>
                  📝 Fixação de Conhecimento ({quiz.length} Questões)
                </summary>
                <div style={{ padding: '20px' }}>
                  {quiz.map((q, i) => (
                    <QuizCard key={i} question={q} index={i} />
                  ))}
                </div>
              </details>
            )}

            {/* 6. Prova Discursiva */}
            {aula?.discursiva && Object.keys(aula.discursiva).length > 0 && (
              <EssaySection 
                initialDiscursiva={aula.discursiva} 
                defaultModel={result?.modelo_utilizado} 
                userApiKey={userApiKey} 
                userModel={userModel} 
                aula={aula}
                area={result?.area_identificada}
              />
            )}

            {/* 7. Mapa Mental */}
            {!!mapaMental.codigo_mermaid && (
              <div style={{ margin: '20px 0' }}>
                <button 
                  onClick={() => setSelectedMap({ titulo: mapaMental.titulo, codigo: mapaMental.codigo_mermaid })}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '15px', backgroundColor: '#f0fdfa', color: '#047857', border: '1px solid #10b981', borderRadius: '8px', fontSize: '1.1rem', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', transition: 'background-color 0.2s' }}
                >
                  🧠 Visualizar Mapa Mental do Capítulo
                </button>
              </div>
            )}
          </article>
        );
      })}


      {/* ========================================== */}
      {/* BOTÃO FLUTUANTE DO NAVEGADOR ESQUERDO      */}
      {/* ========================================== */}
      {!isNavOpen && (
        <button 
          onClick={() => setIsNavOpen(true)}
          title="Índice de Tópicos"
          style={{ position: 'fixed', bottom: '20px', left: '20px', width: '60px', height: '60px', borderRadius: '50%', backgroundColor: '#0f172a', color: '#fff', border: 'none', fontSize: '1.8rem', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          📑
        </button>
      )}

      {/* ========================================== */}
      {/* MENU NAVEGADOR LATERAL (DRAWER)            */}
      {/* ========================================== */}
      {isNavOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', zIndex: 10001, display: 'flex' }} onClick={() => setIsNavOpen(false)}>
          <div className="nav-drawer" style={{ width: '320px', maxWidth: '85vw', height: '100%', backgroundColor: '#f8fafc', boxShadow: '4px 0 15px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            
            <div style={{ padding: '20px', backgroundColor: '#0f172a', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>📑 Índice de Aulas</h3>
              <button onClick={() => setIsNavOpen(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
               <button 
                  onClick={() => { window.scrollTo({top: 0, behavior: 'smooth'}); setIsNavOpen(false); }}
                  style={{ textAlign: 'left', padding: '12px', background: '#e2e8f0', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', color: '#1e293b' }}
                >
                  ↑ Voltar ao Topo (Resumo)
                </button>
              
              {aulas.map((aula, i) => (
                <button 
                  key={i}
                  className="nav-item-btn"
                  onClick={() => { document.getElementById(`aula-${i}`)?.scrollIntoView({ behavior: 'smooth' }); setIsNavOpen(false); }}
                  style={{ textAlign: 'left', padding: '12px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', color: '#334155', transition: 'all 0.2s', display: 'flex', flexDirection: 'column', gap: '4px' }}
                >
                  <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#3b82f6', fontWeight: 'bold' }}>{safeString(aula?.disciplina).substring(0, 30)}</span>
                  <span style={{ fontSize: '0.95rem', fontWeight: '600', lineHeight: '1.3' }}>{safeString(aula?.titulo)}</span>
                </button>
              ))}
            </div>

          </div>
        </div>
      )}


      {/* WIDGET FLUTUANTE DO TUTOR DIREITO */}
      <TutorChat 
        area={result?.area_identificada} 
        defaultModel={result?.modelo_utilizado} 
        userApiKey={userApiKey} 
        userModel={userModel} 
      />

      {/* MODAL DO MAPA MENTAL */}
      {selectedMap && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }} onClick={() => setSelectedMap(null)}>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '25px', width: '100%', maxWidth: '1000px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '15px' }}>
              <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.5rem' }}>{selectedMap.titulo}</h3>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => handleDownloadSVG(selectedMap.titulo)} style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', padding: '10px 15px', fontWeight: 'bold', cursor: 'pointer' }}>⬇️ Baixar SVG</button>
                <button onClick={() => setSelectedMap(null)} style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', padding: '10px 15px', fontWeight: 'bold', cursor: 'pointer' }}>✕ Fechar</button>
              </div>
            </div>
            <div className="mermaid-wrapper" style={{ flex: 1, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px', background: '#f8fafc', display: 'flex', justifyContent: 'center' }}>
              <Mermaid chart={selectedMap.codigo} />
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIGURAÇÃO GLOBAL (CHAVE DA IA) */}
      {showConfig && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.8)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '30px', width: '100%', maxWidth: '500px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
            <h3 style={{ marginTop: 0, color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '15px', marginBottom: '20px' }}>⚙️ Configurar a Minha IA</h3>
            <p style={{ fontSize: '0.95rem', color: '#64748b', marginBottom: '20px', lineHeight: '1.5' }}>Insira a sua chave do OpenRouter. As suas correções e dúvidas do chat não consumirão os limites do sistema.</p>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', color: '#334155', marginBottom: '8px' }}>Chave de API (OpenRouter):</label>
              <input type="password" value={tempKey} onChange={(e) => setTempKey(e.target.value)} placeholder="sk-or-v1-..." style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '1rem' }} />
            </div>
            <div style={{ marginBottom: '25px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', color: '#334155', marginBottom: '8px' }}>Modelo de IA Preferido:</label>
              <input type="text" value={tempModel} onChange={(e) => setTempModel(e.target.value)} placeholder="ex: google/gemini-2.5-flash" style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '1rem' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px' }}>
              <button onClick={() => setShowConfig(false)} disabled={savingConfig} style={{ padding: '12px 20px', borderRadius: '6px', border: 'none', background: '#f1f5f9', color: '#475569', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}>Cancelar</button>
              <button onClick={saveConfigToDB} disabled={savingConfig} style={{ padding: '12px 20px', borderRadius: '6px', border: 'none', background: '#10b981', color: 'white', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}>{savingConfig ? "⏳ A guardar..." : "Guardar Configuração"}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}