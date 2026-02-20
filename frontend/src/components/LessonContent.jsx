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
    <div className="tutor-widget-container">
      {isOpen && (
        <div className="tutor-widget-window">
          <div className="tutor-widget-header">
            <span>🎓 Tutor de IA ({safeString(area).substring(0, 15)}...)</span>
            <button className="tutor-widget-close" onClick={() => setIsOpen(false)}>✕</button>
          </div>
          
          <div className="chat-container">
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', color: '#94a3b8', padding: '20px 0', fontStyle: 'italic', fontSize: '0.9rem' }}>
                Olá! Sou seu professor particular de <strong>{area}</strong>.<br/><br/>Qualquer dúvida sobre o curso, é só perguntar!
              </div>
            )}
            
            {messages.map((msg, idx) => (
              <div key={idx} className={`chat-msg ${msg.role}`}>
                {msg.role === 'assistant' ? (
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                ) : (
                  msg.content
                )}
              </div>
            ))}
            
            {loading && (
              <div className="chat-msg assistant" style={{ fontStyle: 'italic', color: '#64748b' }}>
                Pensando... ⏳
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="chat-input-area">
            <input 
              type="text" 
              className="chat-input"
              placeholder="Digite sua dúvida aqui..." 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              disabled={loading}
            />
            <button className="chat-send-btn" onClick={handleSend} disabled={loading || !input.trim()}>
              Enviar
            </button>
          </div>
        </div>
      )}

      {!isOpen && (
        <button className="tutor-widget-button" onClick={() => setIsOpen(true)} title="Tirar dúvida com a IA">
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
      alert("A banca exige mais conteúdo. Desenvolva melhor seus argumentos antes de enviar.");
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
      setError("A IA corretora falhou. Verifique se sua Chave de API está correta nas configurações.");
    } finally {
      setLoading(false);
    }
  };

  // --- FUNÇÃO BLINDADA PARA GERAR NOVA PROVA ---
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
      
      // Flexibilidade: a IA pode responder com {"discursiva": {...}} ou direto com o conteúdo
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
    <details className="details" style={{ borderColor: '#0f172a', position: 'relative' }} open>
      <summary className="summaryTitle" style={{ color: '#f8fafc', backgroundColor: '#0f172a' }}>
        ✍️ Prova Discursiva (Padrão CESPE)
      </summary>

      <div className="essay-container">
        <div style={{ marginBottom: '15px' }}>
          <strong>📋 Cenário / Texto Motivador:</strong>
          <p className="essay-text">{safeString(discursiva.texto_motivador)}</p>
        </div>
        
        <div style={{ marginBottom: '15px', background: '#f1f5f9', padding: '10px', borderRadius: '4px', borderLeft: '4px solid #0f172a' }}>
          <strong>📝 Comando da Questão:</strong>
          <p className="essay-text" style={{ fontWeight: '500', margin: '5px 0 0 0', color: '#0f172a' }}>{safeString(discursiva.comando)}</p>
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
        />
        
        {/* BOTÕES: CORRIGIR e GERAR NOVA */}
        {!correction && (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="essay-button" onClick={handleCorrect} disabled={loading || loadingGen || answer.trim().length === 0} style={{ flex: 2 }}>
              {loading ? "⏳ Avaliando..." : "✔️ Submeter à Correção da IA"}
            </button>
            <button className="essay-button" onClick={handleGenerateNew} disabled={loading || loadingGen} style={{ flex: 1, backgroundColor: '#475569' }}>
              {loadingGen ? "⏳ Gerando..." : "🔄 Gerar Nova Prova"}
            </button>
          </div>
        )}

        {error && (<div className="correction-error"><strong>⚠️ Erro: </strong> {error}</div>)}
        
        {/* RESULTADO DA CORREÇÃO */}
        {correction && (
          <div className="correction-box">
            <h3 style={{ marginTop: 0, color: '#10b981', borderBottom: '2px solid #10b981', paddingBottom: '10px' }}>📊 Resultado Final: {safeString(correction.nota_final)} / 10.0</h3>
            <p style={{fontStyle: 'italic'}}><strong>Parecer da Banca:</strong> {safeString(correction.feedback_geral)}</p>
            <h4 style={{ marginTop: '20px', color: '#0f172a' }}>🔹 Avaliação por Aspecto:</h4>
            {safeArray(correction.avaliacoes_aspectos).map((av, k) => (
              <div key={k} style={{ marginBottom: '15px', background: '#f8fafc', padding: '10px', borderLeft: '3px solid #3b82f6' }}>
                <div style={{fontWeight: 'bold', color: '#334155'}}>{safeString(av.aspecto)}</div>
                <div style={{ color: '#2563eb', fontWeight: 'bold', margin: '5px 0' }}>Nota: {safeString(av.nota_atribuida)}</div>
                <div style={{fontSize: '0.9em', color: '#475569'}}><em>{safeString(av.comentario)}</em></div>
              </div>
            ))}
            <h4 style={{ marginTop: '20px', color: '#0f172a' }}>🔹 Descontos Gramaticais / Estruturais:</h4>
            <p style={{fontSize: '0.9em', color: '#b91c1c'}}>{safeString(correction.erros_gramaticais)}</p>
            
            <div style={{ display: 'flex', gap: '20px', marginTop: '15px' }}>
              <button onClick={() => {setCorrection(null); setAnswer("");}} style={{background: 'none', color: '#2563eb', border: 'none', cursor: 'pointer', fontWeight: 'bold', textDecoration: 'underline'}}>
                🔄 Tentar responder esta prova novamente
              </button>
              <button onClick={handleGenerateNew} disabled={loadingGen} style={{background: 'none', color: '#475569', border: 'none', cursor: 'pointer', fontWeight: 'bold', textDecoration: 'underline'}}>
                {loadingGen ? "⏳ Gerando nova questão..." : "🆕 Gerar um novo cenário"}
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
      } else { alert("Erro ao salvar no servidor."); }
    } catch (err) { alert("Falha de conexão."); } finally { setSavingConfig(false); }
  };

  const handleDownloadSVG = (titulo) => {
    const svgElement = document.querySelector('.mermaid-wrapper svg');
    if (!svgElement) { alert("O mapa ainda está sendo gerado."); return; }
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

  if (!result) return null;
  const aulas = safeArray(result?.aulas);

  return (
    <div className="result-content" style={{ position: 'relative' }}>
      
      {/* BARRA SUPERIOR DE CONFIGURAÇÃO UNIFICADA */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#e2e8f0', padding: '12px 20px', borderRadius: '8px', marginBottom: '20px' }}>
        <div style={{ fontSize: '0.9rem', color: '#475569' }}>
          <strong>IA Interativa:</strong> {userApiKey ? <span style={{color: '#10b981'}}>Chave Privada Ativa ({userModel})</span> : <span>Padrão do Sistema</span>}
        </div>
        <button onClick={openConfigModal} style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '6px', fontSize: '0.9rem', cursor: 'pointer', fontWeight: 'bold' }}>
          ⚙️ Configurar Minha IA
        </button>
      </div>

      <div className="summary">
        <div className="summaryItem">
          <div className="summaryLabel">Área</div>
          <div className="summaryValue">{safeString(result?.area_identificada)}</div>
        </div>
        <div className="summaryItem">
          <div className="summaryLabel">Resumo do Cargo/Objetivo</div>
          <div className="summaryValue">
            <ReactMarkdown>{safeString(result?.resumo_cargo)}</ReactMarkdown>
          </div>
        </div>
      </div>

      {!!safeString(result?.plano_estudo) && (
        <details className="details" open>
          <summary className="summaryTitle">📅 Plano de Estudo Estratégico</summary>
          <div className="md"><ReactMarkdown>{safeString(result?.plano_estudo)}</ReactMarkdown></div>
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
          <article className="card" key={idx}>
            <h2 className="lessonTitle">{idx + 1}. {safeString(aula?.titulo)}</h2>
            <div className="section">
              <p><strong>Visão Geral:</strong> {safeString(aula?.visao_geral)}</p>
              {!!aula?.referencia_bibliografica && (
                 <p className="muted" style={{marginTop: '0.5rem'}}>📚 <strong>Fonte:</strong> {safeString(aula?.referencia_bibliografica)}</p>
              )}
            </div>

            <details className="details" open>
              <summary className="summaryTitle">🎓 Aula Teórica</summary>
              <div className="md">
                {!!aulaTeorica.introducao_contextual && (
                  <div style={{ marginBottom: '1.5rem', fontStyle: 'italic', color: '#555', borderLeft: '3px solid #ccc', paddingLeft: '10px' }}>
                    {aulaTeorica.introducao_contextual}
                  </div>
                )}
                {termosTecnicos.length > 0 && (
                  <div style={{ background: '#f0f4f8', padding: '15px', borderRadius: '8px', marginBottom: '20px', borderLeft: '5px solid #007bff' }}>
                    <h4 style={{margin: '0 0 10px 0', color: '#0056b3'}}>🧠 Termos Técnicos Essenciais</h4>
                    <ul style={{ margin: 0, paddingLeft: '20px' }}>
                      {termosTecnicos.map((t, k) => (
                        <li key={k} style={{marginBottom: '5px'}}><strong>{t.termo}:</strong> {t.definicao}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <h3>1. Conceito Simplificado (Analogia)</h3>
                <p>{safeString(aulaTeorica?.conceito_simplificado)}</p>
                <h3>2. Definição Técnica</h3>
                <p>{safeString(aulaTeorica?.conceito_tecnico)}</p>
                <h3>3. Como Funciona (Mecanismo)</h3>
                <div className="mechanism-box" style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                   <ReactMarkdown 
                     components={{
                       strong: ({node, ...props}) => <span style={{color: '#d63384', fontWeight: 'bold'}} {...props} />,
                       ul: ({node, ...props}) => <ul style={{paddingLeft: '20px', marginBottom: '15px'}} {...props} />,
                       li: ({node, ...props}) => <li style={{marginBottom: '5px', lineHeight: '1.6'}} {...props} />
                     }}
                   >
                     {safeString(aulaTeorica?.como_funciona)}
                   </ReactMarkdown>
                </div>
                {!!aulaTeorica?.comparativo && (
                  <><h3>4. Comparativo</h3><p>{safeString(aulaTeorica?.comparativo)}</p></>
                )}
                {!!aulaTeorica?.exemplo_pratico && (
                  <>
                    <h3>5. Exemplo Prático Resolvido</h3>
                    <div className="code-block" style={{background: '#7a7979', color: '#f8f8f2', padding: '15px', borderRadius: '6px', overflowX: 'auto'}}>
                      <ReactMarkdown>{safeString(aulaTeorica?.exemplo_pratico)}</ReactMarkdown>
                    </div>
                  </>
                )}
              </div>
            </details>
            
            <details className="details">
              <summary className="summaryTitle">📌 Tópicos Detalhados</summary>
              {topicos.map((t, i) => (
                <div key={i} className="subCard">
                  <div className="subCardTitle">{safeString(t?.topico)}</div>
                  <div className="subCardContent">{safeString(t?.explicacao)}</div>
                  {!!t?.exemplo_pratico && (
                    <div className="subCardEx"><strong>Exemplo:</strong> {safeString(t?.exemplo_pratico)}</div>
                  )}
                  {!!t?.pegadinha_tipica && (
                    <div className="warningBox">⚠️ <strong>Cuidado:</strong> {safeString(t?.pegadinha_tipica)}</div>
                  )}
                </div>
              ))}
            </details>

            {aprofundamento.length > 0 && (
              <details className="details" style={{ borderColor: '#6f42c1' }}>
                <summary className="summaryTitle" style={{ color: '#6f42c1', backgroundColor: '#f3e5f5' }}>🚀 Painel Avançado</summary>
                <div className="grid">
                  {aprofundamento.map((item, i) => (
                    <div className="miniCard" key={i} style={{ borderLeft: '4px solid #6f42c1' }}>
                      <div className="miniTitle" style={{ color: '#6f42c1', fontSize: '1.1em' }}>{safeString(item.subtema)}</div>
                      <div className="md" style={{ margin: '10px 0', lineHeight: '1.6' }}><ReactMarkdown>{safeString(item.conteudo_denso)}</ReactMarkdown></div>
                      {item.laboratorio_pratico && (
                        <div style={{ background: '#fff', border: '1px solid #e9ecef', padding: '10px', borderRadius: '6px', marginTop: '10px' }}>
                          <strong style={{color: '#28a745'}}>🧪 Laboratório Prático:</strong>
                          <div style={{marginTop:'5px', fontSize: '0.95em'}}>
                            <div style={{marginBottom:'4px'}}><b>🎯 Cenário:</b> {safeString(item.laboratorio_pratico.cenario)}</div>
                            <div style={{marginBottom:'4px'}}><b>🛠️ Resolução:</b> {safeString(item.laboratorio_pratico.resolucao)}</div>
                            <div><b>✅ Resultado:</b> {safeString(item.laboratorio_pratico.resultado_esperado)}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            )}

            {glossario.length > 0 && (
              <details className="details">
                <summary className="summaryTitle">📖 Glossário</summary>
                <div className="grid">
                  {glossario.map((g, i) => (
                    <div className="miniCard" key={i}>
                      <div className="miniTitle">{safeString(g?.termo)}</div>
                      {!!safeString(g?.definicao) && <div className="muted">{safeString(g?.definicao)}</div>}
                    </div>
                  ))}
                </div>
              </details>
            )}            

            {flashcards.length > 0 && (
              <details className="details" style={{ borderColor: '#ffc107' }}>
                <summary className="summaryTitle" style={{ color: '#b28605', backgroundColor: '#fff8e1' }}>🃏 Flashcards</summary>
                <div style={{ padding: '10px' }}>
                  {flashcards.map((card, i) => (
                    <details key={i} style={{ background: '#fff', border: '1px solid #ddd', borderLeft: '4px solid #ffc107', borderRadius: '6px', padding: '15px', marginBottom: '10px', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                      <summary style={{ fontWeight: 'bold', outline: 'none', color: '#333', fontSize: '1.05em' }}>❓ {safeString(card.frente)}</summary>
                      <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px dashed #ccc', color: '#198754' }}>
                        <strong>💡 Resposta: </strong> <span style={{color: '#333'}}>{safeString(card.verso)}</span>
                      </div>
                    </details>
                  ))}
                </div>
              </details>
            )}

            {quiz.length > 0 && (
              <details className="details" open>
                <summary className="summaryTitle">📝 Questões de Fixação</summary>
                {quiz.map((q, i) => (
                  <QuizCard key={i} question={q} index={i} />
                ))}
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
              <div style={{ marginBottom: '1rem' }}>
                <button 
                  onClick={() => setSelectedMap({ titulo: mapaMental.titulo, codigo: mapaMental.codigo_mermaid })}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '15px', backgroundColor: '#e0f8fd', color: '#057a93', border: '1px solid #0dcaf0', borderRadius: '8px', fontSize: '1.1rem', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', transition: 'background-color 0.2s' }}
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
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }} onClick={() => setSelectedMap(null)}>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px', width: '100%', maxWidth: '1000px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #eee', paddingBottom: '15px' }}>
              <h3 style={{ margin: 0, color: '#057a93' }}>{selectedMap.titulo}</h3>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => handleDownloadSVG(selectedMap.titulo)} style={{ background: '#198754', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 15px', fontWeight: 'bold', cursor: 'pointer' }}>⬇️ Baixar SVG</button>
                <button onClick={() => setSelectedMap(null)} style={{ background: '#f8d7da', color: '#842029', border: 'none', borderRadius: '6px', padding: '8px 15px', fontWeight: 'bold', cursor: 'pointer' }}>✕ Fechar</button>
              </div>
            </div>
            <div className="mermaid-wrapper" style={{ flex: 1, overflow: 'auto', border: '1px solid #eee', borderRadius: '8px', padding: '15px', background: '#fafafa', display: 'flex', justifyContent: 'center' }}>
              <Mermaid chart={selectedMap.codigo} />
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIGURAÇÃO GLOBAL (CHAVE DA IA) */}
      {showConfig && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '8px', padding: '25px', width: '100%', maxWidth: '500px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
            <h3 style={{ marginTop: 0, color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>⚙️ Configurar Minha IA</h3>
            <p style={{ fontSize: '0.9rem', color: '#64748b' }}>Insira sua chave do OpenRouter. Suas correções e dúvidas do chat não consumirão os limites do sistema.</p>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>Chave de API (OpenRouter):</label>
              <input type="password" value={tempKey} onChange={(e) => setTempKey(e.target.value)} placeholder="sk-or-v1-..." style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>Modelo de IA Preferido:</label>
              <input type="text" value={tempModel} onChange={(e) => setTempModel(e.target.value)} placeholder="ex: google/gemini-2.5-flash" style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setShowConfig(false)} disabled={savingConfig} style={{ padding: '10px 15px', borderRadius: '4px', border: 'none', background: '#f1f5f9', color: '#475569', cursor: 'pointer', fontWeight: 'bold' }}>Cancelar</button>
              <button onClick={saveConfigToDB} disabled={savingConfig} style={{ padding: '10px 15px', borderRadius: '4px', border: 'none', background: '#10b981', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>{savingConfig ? "⏳ Salvando..." : "Salvar Configuração"}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}