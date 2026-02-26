import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";

// ==========================================
// COMPONENTES SIMULADOS (Para compatibilidade)
// ==========================================
const QuizCard = ({ question, index }) => {
  return (
    <div style={{ padding: '15px', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '10px', background: '#f8fafc' }}>
      <strong style={{ color: '#0f172a' }}>Questão {index + 1}:</strong>
      <p>{question?.enunciado}</p>
      <div style={{ paddingLeft: '15px' }}>
        {Array.isArray(question?.alternativas) && question.alternativas.map((alt, i) => (
          <div key={i} style={{ marginBottom: '5px', color: '#475569' }}>{alt}</div>
        ))}
      </div>
    </div>
  );
};

const Mermaid = ({ chart }) => {
  return (
    <div style={{ padding: '20px', background: '#f1f5f9', border: '1px dashed #94a3b8', borderRadius: '8px', color: '#334155', fontFamily: 'monospace', whiteSpace: 'pre-wrap', overflowX: 'auto' }}>
      <strong>[Diagrama Mermaid]</strong>
      <br /><br />
      {chart}
    </div>
  );
};

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
// COMPONENTE: CHAT DO TUTOR (FLUTUANTE)
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
    <details className="details" style={{ borderColor: '#0f172a', position: 'relative', margin: '20px 0', border: '1px solid #e2e8f0', borderRadius: '8px' }} open>
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
        <details className="details" style={{ margin: '20px 0', border: '1px solid #e2e8f0', borderRadius: '8px' }} open>
          <summary className="summaryTitle" style={{ padding: '15px', background: '#f1f5f9', fontWeight: 'bold', cursor: 'pointer' }}>📅 Plano de Estudo Estratégico</summary>
          <div className="md" style={{ padding: '20px' }}><ReactMarkdown>{safeString(result?.plano_estudo)}</ReactMarkdown></div>
        </details>
      )}

      {aulas.map((aula, idx) => {
        const topicos = safeArray(aula?.topicos_explicados);
        const glossario = safeArray(aula?.glosario);
        const quiz = safeArray(aula?.quiz);
        const aprofundamento = safeArray(aula?.subtemas_aprofundados);
        const flashcards = safeArray(aula?.flashcards);
        const mapaMental = aula?.mapa_mental || {};
        const aulaTeorica = aula?.aula_teorica || {};
        const termosTecnicos = safeArray(aulaTeorica?.termos_tecnicos);

        return (
          <article className="card" key={idx} style={{ marginBottom: '40px', padding: '20px', border: '1px solid #e2e8f0', borderRadius: '12px', background: '#ffffff', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
            <h2 className="lessonTitle" style={{ marginTop: 0, color: '#1e293b', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px' }}>{idx + 1}. {safeString(aula?.titulo)}</h2>
            <div className="section" style={{ marginBottom: '20px' }}>
              <p><strong>Visão Geral:</strong> <ReactMarkdown components={{ p: 'span' }}>{safeString(aula?.visao_geral)}</ReactMarkdown></p>
              {!!aula?.referencia_bibliografica && (
                 <p className="muted" style={{marginTop: '0.5rem', color: '#64748b'}}>📚 <strong>Fonte:</strong> <ReactMarkdown components={{ p: 'span' }}>{safeString(aula?.referencia_bibliografica)}</ReactMarkdown></p>
              )}
            </div>

            <details className="details" style={{ marginBottom: '15px', border: '1px solid #e2e8f0', borderRadius: '8px' }} open>
              <summary className="summaryTitle" style={{ padding: '15px', background: '#f8fafc', fontWeight: 'bold', cursor: 'pointer', borderRadius: '8px 8px 0 0' }}>🎓 Aula Teórica</summary>
              <div className="md" style={{ padding: '20px' }}>
                {!!aulaTeorica.introducao_contextual && (
                  <div style={{ marginBottom: '1.5rem', fontStyle: 'italic', color: '#475569', borderLeft: '4px solid #94a3b8', paddingLeft: '15px' }}>
                    <ReactMarkdown>{aulaTeorica.introducao_contextual}</ReactMarkdown>
                  </div>
                )}
                {termosTecnicos.length > 0 && (
                  <div style={{ background: '#f0f9ff', padding: '20px', borderRadius: '8px', marginBottom: '20px', borderLeft: '4px solid #0ea5e9' }}>
                    <h4 style={{margin: '0 0 15px 0', color: '#0369a1'}}>🧠 Termos Técnicos Essenciais</h4>
                    <ul style={{ margin: 0, paddingLeft: '20px' }}>
                      {termosTecnicos.map((t, k) => (
                        <li key={k} style={{marginBottom: '10px'}}><strong>{t.termo}:</strong> <ReactMarkdown components={{ p: 'span' }}>{t.definicao}</ReactMarkdown></li>
                      ))}
                    </ul>
                  </div>
                )}
                <h3 style={{ color: '#0f172a' }}>1. Conceito Simplificado (Analogia)</h3>
                <div className="markdown-format"><ReactMarkdown>{safeString(aulaTeorica?.conceito_simplificado)}</ReactMarkdown></div>
                
                <h3 style={{ color: '#0f172a', marginTop: '25px' }}>2. Definição Técnica</h3>
                <div className="markdown-format"><ReactMarkdown>{safeString(aulaTeorica?.conceito_tecnico)}</ReactMarkdown></div>
                
                <h3 style={{ color: '#0f172a', marginTop: '25px' }}>3. Como Funciona (Mecanismo)</h3>
                <div className="mechanism-box" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '25px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                   <ReactMarkdown 
                     components={{
                       strong: ({node, ...props}) => <span style={{color: '#d946ef', fontWeight: 'bold'}} {...props} />,
                       ul: ({node, ...props}) => <ul style={{paddingLeft: '20px', marginBottom: '15px'}} {...props} />,
                       li: ({node, ...props}) => <li style={{marginBottom: '10px', lineHeight: '1.6'}} {...props} />
                     }}
                   >
                     {safeString(aulaTeorica?.como_funciona)}
                   </ReactMarkdown>
                </div>
                {!!aulaTeorica?.comparativo && (
                  <>
                    <h3 style={{ color: '#0f172a', marginTop: '25px' }}>4. Comparativo</h3>
                    <div className="table-responsive" style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <ReactMarkdown>
                        {safeString(aulaTeorica?.comparativo)}
                      </ReactMarkdown>
                    </div>
                  </>
                )}
                {!!aulaTeorica?.exemplo_pratico && (
                  <>
                    <h3 style={{ color: '#0f172a', marginTop: '25px' }}>5. Exemplo Prático Resolvido</h3>
                    <div style={{
                      background: '#f0fdf4', 
                      color: '#0f172a', 
                      padding: '20px', 
                      borderRadius: '8px', 
                      borderLeft: '4px solid #0ea5e9',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                      lineHeight: '1.6',
                      overflowX: 'auto'
                    }}>
                      <ReactMarkdown>{safeString(aulaTeorica?.exemplo_pratico)}</ReactMarkdown>
                    </div>
                  </>
                )}
              </div>
            </details>
            
            <details className="details" style={{ marginBottom: '15px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
              <summary className="summaryTitle" style={{ padding: '15px', background: '#f8fafc', fontWeight: 'bold', cursor: 'pointer', borderRadius: '8px' }}>📌 Tópicos Detalhados</summary>
              <div style={{ padding: '20px' }}>
                {topicos.map((t, i) => (
                  <div key={i} className="subCard" style={{ marginBottom: '25px', paddingBottom: '20px', borderBottom: i < topicos.length - 1 ? '1px solid #e2e8f0' : 'none' }}>
                    <div className="subCardTitle" style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#1e293b', marginBottom: '10px' }}>{safeString(t?.topico)}</div>
                    
                    <div className="subCardContent markdown-format">
                      <ReactMarkdown>{safeString(t?.explicacao)}</ReactMarkdown>
                    </div>
                    {!!t?.exemplo_pratico && (
                      <div className="subCardEx" style={{ marginTop: '15px', padding: '15px', background: '#f8fafc', borderRadius: '8px', borderLeft: '4px solid #64748b' }}>
                        <strong style={{ color: '#0f172a', display: 'block', marginBottom: '10px' }}>💡 Exemplo Prático:</strong> 
                        <ReactMarkdown>{safeString(t?.exemplo_pratico)}</ReactMarkdown>
                      </div>
                    )}
                    {!!t?.pegadinha_tipica && (
                      <div className="warningBox" style={{ marginTop: '15px', padding: '15px', background: '#fef2f2', borderRadius: '8px', borderLeft: '4px solid #ef4444' }}>
                        <strong style={{ display: 'block', marginBottom: '10px', color: '#b91c1c' }}>⚠️ Cuidado:</strong> 
                        <ReactMarkdown>{safeString(t?.pegadinha_tipica)}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </details>

            {aprofundamento.length > 0 && (
              <details className="details" style={{ borderColor: '#8b5cf6', marginBottom: '15px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                <summary className="summaryTitle" style={{ color: '#7e22ce', backgroundColor: '#fdf4ff', padding: '15px', fontWeight: 'bold', cursor: 'pointer', borderRadius: '8px' }}>🚀 Painel Avançado</summary>
                <div className="grid" style={{ padding: '20px', display: 'grid', gap: '20px' }}>
                  {aprofundamento.map((item, i) => (
                    <div className="miniCard" key={i} style={{ padding: '20px', background: '#ffffff', borderRadius: '8px', borderLeft: '4px solid #d946ef', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                      <div className="miniTitle" style={{ color: '#a21caf', fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '10px' }}>{safeString(item.subtema)}</div>
                      <div className="md markdown-format" style={{ margin: '15px 0', lineHeight: '1.6' }}><ReactMarkdown>{safeString(item.conteudo_denso)}</ReactMarkdown></div>
                      {item.laboratorio_pratico && (
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '15px', borderRadius: '8px', marginTop: '15px' }}>
                          <strong style={{color: '#059669', fontSize: '1.1rem'}}>🧪 Laboratório Prático:</strong>
                          <div style={{marginTop:'10px', fontSize: '1rem', display: 'flex', flexDirection: 'column', gap: '10px'}}>
                            <div><b>🎯 Cenário:</b> <ReactMarkdown components={{ p: 'span' }}>{safeString(item.laboratorio_pratico.cenario)}</ReactMarkdown></div>
                            <div><b>🛠️ Resolução:</b> <ReactMarkdown components={{ p: 'span' }}>{safeString(item.laboratorio_pratico.resolucao)}</ReactMarkdown></div>
                            <div><b>✅ Resultado:</b> <ReactMarkdown components={{ p: 'span' }}>{safeString(item.laboratorio_pratico.resultado_esperado)}</ReactMarkdown></div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            )}

            {glossario.length > 0 && (
              <details className="details" style={{ marginBottom: '15px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                <summary className="summaryTitle" style={{ padding: '15px', background: '#f8fafc', fontWeight: 'bold', cursor: 'pointer', borderRadius: '8px' }}>📖 Glossário</summary>
                <div className="grid" style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '15px' }}>
                  {glossario.map((g, i) => (
                    <div className="miniCard" key={i} style={{ padding: '15px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                      <div className="miniTitle" style={{ fontWeight: 'bold', color: '#0f172a', marginBottom: '5px' }}>{safeString(g?.termo)}</div>
                      {!!safeString(g?.definicao) && <div className="muted" style={{ color: '#475569', fontSize: '0.95rem' }}><ReactMarkdown>{safeString(g?.definicao)}</ReactMarkdown></div>}
                    </div>
                  ))}
                </div>
              </details>
            )}            

            {flashcards.length > 0 && (
              <details className="details" style={{ borderColor: '#eab308', marginBottom: '15px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                <summary className="summaryTitle" style={{ color: '#a16207', backgroundColor: '#fefce8', padding: '15px', fontWeight: 'bold', cursor: 'pointer', borderRadius: '8px' }}>🃏 Flashcards</summary>
                <div style={{ padding: '20px' }}>
                  {flashcards.map((card, i) => (
                    <details key={i} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderLeft: '4px solid #eab308', borderRadius: '8px', padding: '15px', marginBottom: '15px', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                      <summary style={{ fontWeight: 'bold', outline: 'none', color: '#1e293b', fontSize: '1.1rem' }}>❓ <ReactMarkdown components={{ p: 'span' }}>{safeString(card.frente)}</ReactMarkdown></summary>
                      <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px dashed #cbd5e1', color: '#059669', fontSize: '1.05rem' }}>
                        <strong>💡 Resposta: </strong> <span style={{color: '#334155'}}><ReactMarkdown components={{ p: 'span' }}>{safeString(card.verso)}</ReactMarkdown></span>
                      </div>
                    </details>
                  ))}
                </div>
              </details>
            )}

            {quiz.length > 0 && (
              <details className="details" style={{ marginBottom: '15px', border: '1px solid #e2e8f0', borderRadius: '8px' }} open>
                <summary className="summaryTitle" style={{ padding: '15px', background: '#f8fafc', fontWeight: 'bold', cursor: 'pointer', borderRadius: '8px 8px 0 0' }}>📝 Questões de Fixação</summary>
                <div style={{ padding: '20px' }}>
                  {quiz.map((q, i) => (
                    <QuizCard key={i} question={q} index={i} />
                  ))}
                </div>
              </details>
            )}

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

            {!!mapaMental.codigo_mermaid && (
              <div style={{ margin: '20px 0' }}>
                <button 
                  onClick={() => setSelectedMap({ titulo: mapaMental.titulo, codigo: mapaMental.codigo_mermaid })}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '15px', backgroundColor: '#f0fdfa', color: '#047857', border: '1px solid #10b981', borderRadius: '8px', fontSize: '1.1rem', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', transition: 'background-color 0.2s' }}
                >
                  🧠 Visualizar Mapa Mental: {safeString(mapaMental.titulo)}
                </button>
              </div>
            )}

          </article>
        );
      })}

      {/* AQUI ESTÁ O WIDGET FLUTUANTE DO TUTOR */}
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