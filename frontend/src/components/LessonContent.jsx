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

// NOVA FUNÇÃO: Dispara o salvamento da nota para o backend
const savePerformance = async (tipo, tema, notaObtida, notaMaxima) => {
  const token = getAuthToken();
  if (!token) return; 

  try {
    const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
    await fetch(`${apiUrl}/performance`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        tipo: tipo,
        tema: tema,
        nota_obtida: parseFloat(notaObtida) || 0,
        nota_maxima: parseFloat(notaMaxima) || 10.0
      })
    });
  } catch (err) {
    console.error("Erro ao salvar desempenho silenciosamente:", err);
  }
};
// NOVA FUNÇÃO: Lê o stream e possui extração inteligente de blocos JSON
const fetchStreamAsJson = async (url, options) => {
  const res = await fetch(url, options);
  
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Erro do servidor: ${res.status} - ${errText}`);
  }
  
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let rawText = "";
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    rawText += decoder.decode(value, { stream: true });
  }
  
  try {
    // 1. Limpa tags de raciocínio da IA
    let cleanText = rawText.replace(/<think>[\s\S]*?<\/think>/gi, "").trim(); 
    
    // 2. Extração Robusta: Pega apenas o que estiver entre a primeira e a última chave { } ou [ ]
    const jsonMatch = cleanText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      cleanText = jsonMatch[0];
    }
    
    // 3. Remove vírgulas sobrando no final de listas (erro clássico de LLMs)
    cleanText = cleanText.replace(/,\s*([\]}])/g, '$1');
    
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("Erro ao parsear JSON. Texto recebido:", rawText);
    throw new Error("A IA gerou um formato inválido ou incompleto.");
  }
};
// ==========================================
// COMPONENTE: CHAT DO TUTOR (FLUTUANTE DIREITO)
// ==========================================
function TutorChat({ area, defaultModel, userApiKey, userModel, onOpenConfig }) { 
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
    // --- NOVA TRAVA ---
    if (!userApiKey) {
      setIsOpen(false); // Fecha o chat
      onOpenConfig();   // Abre o modal de configuração
      return;
    }
    
    const newMsg = { role: "user", content: input };
    const updatedMessages = [...messages, newMsg];
    
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);
    
    try {
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
      const data = await fetchStreamAsJson(`${apiUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          area: area || "Assunto Geral",
          aula_titulo: "Conhecimento Geral da Área",
          mensagem: newMsg.content,
          historico: messages.slice(-4),
          model: userModel || defaultModel || "arcee-ai/trinity-large-thinking:free",
          api_key: userApiKey || null
        })
      });

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
        <div className="tutor-widget-window" style={{ width: '350px', height: '500px', backgroundColor: 'var(--card-bg)', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.3)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="tutor-widget-header" style={{ backgroundColor: 'var(--hover-bg)', color: 'var(--text-main)', borderBottom: '1px solid var(--border)', padding: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 'bold' }}>🎓 Tutor de IA ({safeString(area).substring(0, 15)}...)</span>
            <button className="tutor-widget-close" onClick={() => setIsOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
          </div>
          
          <div className="chat-container" style={{ flex: 1, padding: '15px', overflowY: 'auto', backgroundColor: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px 0', fontStyle: 'italic', fontSize: '0.9rem' }}>
                Olá! Sou o seu professor particular de <strong>{area}</strong>.<br/><br/>Qualquer dúvida sobre o curso, é só perguntar!
              </div>
            )}
            
            {messages.map((msg, idx) => (
              <div key={idx} className={`chat-msg ${msg.role}`} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%', padding: '10px 15px', borderRadius: '12px', backgroundColor: msg.role === 'user' ? 'var(--primary)' : 'var(--card-bg)', color: msg.role === 'user' ? '#fff' : 'var(--text-main)', border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none' }}>
                {msg.role === 'assistant' ? (
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                ) : (
                  msg.content
                )}
              </div>
            ))}
            
            {loading && (
              <div className="chat-msg assistant" style={{ alignSelf: 'flex-start', fontStyle: 'italic', color: 'var(--text-muted)', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)', padding: '10px 15px', borderRadius: '12px' }}>
                A pensar... ⏳
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="chat-input-area" style={{ padding: '10px', borderTop: '1px solid var(--border)', backgroundColor: 'var(--card-bg)', display: 'flex', gap: '10px' }}>
            <input 
              type="text" 
              className="chat-input"
              placeholder="Digite a sua dúvida aqui..." 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              disabled={loading}
              style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'var(--input-bg)', color: 'var(--text-main)', outline: 'none' }}
            />
            <button className="chat-send-btn" onClick={handleSend} disabled={loading || !input.trim()} style={{ padding: '10px 15px', backgroundColor: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
              Enviar
            </button>
          </div>
        </div>
      )}

      {!isOpen && (
        <button className="tutor-widget-button" onClick={() => setIsOpen(true)} title="Tirar dúvida com a IA" style={{ width: '60px', height: '60px', borderRadius: '50%', backgroundColor: 'var(--primary)', color: '#fff', border: 'none', fontSize: '1.5rem', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          💬
        </button>
      )}
    </div>
  );
}

// ==========================================
// COMPONENTE: PROVA DISCURSIVA
// ==========================================
function EssaySection({ initialDiscursiva, defaultModel, userApiKey, userModel, aula, area, onOpenConfig }) {
  const [discursiva, setDiscursiva] = useState(initialDiscursiva);
  const [answer, setAnswer] = useState("");
  const [correction, setCorrection] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingGen, setLoadingGen] = useState(false);
  const [error, setError] = useState(null);
  
  if (!discursiva || !discursiva.comando) return null;

  const handleCorrect = async () => {
    // --- NOVA TRAVA ---
    if (!userApiKey) { onOpenConfig(); return; }

    if (answer.trim().length < 50) {
      alert("A banca exige mais conteúdo. Desenvolva melhor os seus argumentos antes de enviar.");
      return;
    }
    setLoading(true); setError(null); setCorrection(null);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
      const data = await fetchStreamAsJson(`${apiUrl}/correct-essay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texto_motivador: discursiva.texto_motivador || "",
          comando: discursiva.comando || "",
          aspectos: discursiva.aspectos || [],
          resposta_aluno: answer,
          model: userModel || defaultModel || "arcee-ai/trinity-large-thinking:free",
          api_key: userApiKey || null
        })
      });
      
      // --- NOVA LÓGICA: O JS SOMA A NOTA E IGNORA A MATEMÁTICA DA IA ---
      const notaCalculada = Array.isArray(data.avaliacoes_aspectos) 
        ? data.avaliacoes_aspectos.reduce((acc, curr) => acc + (parseFloat(curr.nota_atribuida) || 0), 0)
        : (parseFloat(data.nota_final) || 0);
        
      data.nota_final_calculada = notaCalculada; // Guarda o valor correto
      // ------------------------------------------------------------------

      setCorrection(data);
      
      // Salva a nota real no banco
      await savePerformance("discursiva", area ? `${area} - ${aula?.titulo || 'Tópico'}` : "Prova Discursiva", notaCalculada, 10.0);
      
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
      const data = await fetchStreamAsJson(`${apiUrl}/generate-essay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          area: area || "Assunto Geral",
          aula_titulo: aula.titulo || "Aula",
          lesson_content: aula, 
          model: userModel || defaultModel || "arcee-ai/trinity-large-thinking:free",
          api_key: userApiKey || null
        })
      });

      
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
    <details className="details" style={{ position: 'relative', margin: '20px 0', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--card-bg)' }}>
      <summary className="summaryTitle" style={{ color: 'var(--text-main)', backgroundColor: 'var(--hover-bg)', padding: '15px', cursor: 'pointer', fontWeight: 'bold', borderRadius: '8px 8px 0 0' }}>
        ✍️ Prova Discursiva (Padrão CESPE)
      </summary>

      <div className="essay-container" style={{ padding: '20px', background: 'var(--card-bg)' }}>
        <div style={{ marginBottom: '15px' }}>
          <strong style={{color: 'var(--text-main)'}}>📋 Cenário / Texto Motivador:</strong>
          <div className="essay-text" style={{color: 'var(--text-secondary)'}}>
            <ReactMarkdown>{safeString(discursiva.texto_motivador)}</ReactMarkdown>
          </div>
        </div>
        
        <div style={{ marginBottom: '15px', background: 'var(--bg)', padding: '10px', borderRadius: '4px', borderLeft: '4px solid var(--primary)' }}>
          <strong style={{color: 'var(--text-main)'}}>📝 Comando da Questão:</strong>
          <div className="essay-text" style={{ fontWeight: '500', margin: '5px 0 0 0', color: 'var(--text-main)' }}>
            <ReactMarkdown>{safeString(discursiva.comando)}</ReactMarkdown>
          </div>
        </div>
        
        <div style={{ marginBottom: '20px' }}>
          <strong style={{color: 'var(--text-main)'}}>🎯 Aspectos Avaliados OBRIGATORIAMENTE:</strong>
          <ul style={{ margin: '10px 0', paddingLeft: '20px', color: 'var(--text-secondary)' }}>
            {safeArray(discursiva.aspectos).map((asp, i) => (
              <li key={i} style={{marginBottom: '5px'}}>
                {safeString(asp.aspecto)} <span style={{color: 'var(--error-text)', fontWeight: 'bold', marginLeft: '5px'}}>({safeString(asp.valor_maximo)} pts)</span>
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
          style={{ width: '100%', minHeight: '150px', padding: '15px', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '15px', resize: 'vertical', backgroundColor: 'var(--input-bg)', color: 'var(--text-main)' }}
        />
        
        {!correction && (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="essay-button" onClick={handleCorrect} disabled={loading || loadingGen || answer.trim().length === 0} style={{ flex: 2, padding: '12px', backgroundColor: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
              {loading ? "⏳ A avaliar..." : "✔️ Submeter à Correção da IA"}
            </button>
            <button className="essay-button" onClick={handleGenerateNew} disabled={loadingGen} style={{ flex: 1, backgroundColor: 'var(--hover-bg)', color: 'var(--text-main)', border: '1px solid var(--border)', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
              {loadingGen ? "⏳ A gerar..." : "🔄 Gerar Nova Prova"}
            </button>
          </div>
        )}

        {error && (<div className="correction-error" style={{ color: 'var(--error-text)', backgroundColor: 'var(--error-bg)', padding: '10px', borderRadius: '6px', border: '1px solid var(--error-text)', marginTop: '10px' }}><strong>⚠️ Erro: </strong> {error}</div>)}
        
        {correction && (
          <div className="correction-box" style={{ marginTop: '20px', padding: '20px', backgroundColor: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <h3 style={{ marginTop: 0, color: 'var(--success-text)', borderBottom: '2px solid var(--success-text)', paddingBottom: '10px' }}>📊 Resultado Final: {safeString(correction.nota_final_calculada?.toFixed(1))} / 10.0</h3>
            <div style={{fontStyle: 'italic', color: 'var(--text-secondary)'}}><strong>Parecer da Banca:</strong> <ReactMarkdown>{safeString(correction.feedback_geral)}</ReactMarkdown></div>
            <h4 style={{ marginTop: '20px', color: 'var(--heading-color)' }}>🔹 Avaliação por Aspecto:</h4>
            {safeArray(correction.avaliacoes_aspectos).map((av, k) => (
              <div key={k} style={{ marginBottom: '15px', background: 'var(--card-bg)', padding: '15px', borderRadius: '8px', borderLeft: '4px solid var(--primary)', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                <div style={{fontWeight: 'bold', color: 'var(--text-main)'}}>{safeString(av.aspecto)}</div>
                <div style={{ color: 'var(--primary)', fontWeight: 'bold', margin: '5px 0' }}>Nota: {safeString(av.nota_atribuida)}</div>
                <div style={{fontSize: '0.9em', color: 'var(--text-secondary)'}}><em><ReactMarkdown>{safeString(av.comentario)}</ReactMarkdown></em></div>
              </div>
            ))}
            <h4 style={{ marginTop: '20px', color: 'var(--heading-color)' }}>🔹 Descontos Gramaticais / Estruturais:</h4>
            <div style={{fontSize: '0.9em', color: 'var(--error-text)'}}><ReactMarkdown>{safeString(correction.erros_gramaticais)}</ReactMarkdown></div>
            
            <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
              <button onClick={() => {setCorrection(null); setAnswer("");}} style={{background: 'none', color: 'var(--primary)', border: 'none', cursor: 'pointer', fontWeight: 'bold', textDecoration: 'underline'}}>
                🔄 Tentar responder a esta prova novamente
              </button>
              <button onClick={handleGenerateNew} disabled={loadingGen} style={{background: 'none', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontWeight: 'bold', textDecoration: 'underline'}}>
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
// COMPONENTE: PROVA DISCURSIVA GERAL (GLOBAL)
// ==========================================
function GlobalEssaySection({ defaultModel, userApiKey, userModel, area, aulas, onOpenConfig }) {
  const [discursiva, setDiscursiva] = useState(null);
  const [answer, setAnswer] = useState("");
  const [correction, setCorrection] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingGen, setLoadingGen] = useState(false);
  const [error, setError] = useState(null);

  const handleGenerateNew = async () => {
    // --- NOVA TRAVA ---
    if (!userApiKey) { onOpenConfig(); return; }
    // ------------------
    
    setLoadingGen(true);
    setError(null);
    setCorrection(null);
    setAnswer("");
    
    try {
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
      const aulasTitulos = aulas.map(a => a.titulo);
      
      const data = await fetchStreamAsJson(`${apiUrl}/generate-global-essay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          area: area || "Assunto Geral",
          aulas_titulos: aulasTitulos,
          model: userModel || defaultModel || "arcee-ai/trinity-large-thinking:free",
          api_key: userApiKey || null
        })
      });
      
      const novaQuestao = data.discursiva ? data.discursiva : data;

      if (novaQuestao && novaQuestao.comando) {
        setDiscursiva(novaQuestao);
      } else {
        setError("A IA não retornou um formato válido. Tente gerar novamente.");
      }
    } catch (err) {
      console.error(err);
      setError("Falha de conexão ao gerar a discursiva geral.");
    } finally {
      setLoadingGen(false);
    }
  };

  const handleCorrect = async () => {
    // --- NOVA TRAVA ---
    if (!userApiKey) { onOpenConfig(); return; }

    if (answer.trim().length < 50) {
      alert("A banca exige mais conteúdo. Desenvolva melhor os seus argumentos antes de enviar.");
      return;
    }
    setLoading(true); setError(null); setCorrection(null);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
      const data = await fetchStreamAsJson(`${apiUrl}/correct-essay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texto_motivador: discursiva.texto_motivador || "",
          comando: discursiva.comando || "",
          aspectos: discursiva.aspectos || [],
          resposta_aluno: answer,
          model: userModel || defaultModel || "arcee-ai/trinity-large-thinking:free",
          api_key: userApiKey || null
        })
      });      
      
      // --- NOVA LÓGICA: O JS SOMA A NOTA E IGNORA A MATEMÁTICA DA IA ---
      const notaCalculada = Array.isArray(data.avaliacoes_aspectos) 
        ? data.avaliacoes_aspectos.reduce((acc, curr) => acc + (parseFloat(curr.nota_atribuida) || 0), 0)
        : (parseFloat(data.nota_final) || 0);
        
      data.nota_final_calculada = notaCalculada; // Guarda o valor correto
      // ------------------------------------------------------------------

      setCorrection(data); 
      
      // Salva a nota real no banco
      await savePerformance("discursiva", area ? `${area} (Simulado Global)` : "Discursiva Global", notaCalculada, 20.0);
      
    } catch (err) {
      setError("A IA corretora falhou ao processar a redação.");
    } finally {
      setLoading(false);
    }
  };

  if (!discursiva) {
    return (
      <div style={{ textAlign: 'center', marginTop: '20px' }}>
        <button onClick={handleGenerateNew} disabled={loadingGen} style={{ padding: '15px 30px', backgroundColor: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '1.1rem', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)' }}>
          {loadingGen ? "⏳ A sortear temas e gerar prova..." : "📝 Gerar Prova Discursiva Oficial"}
        </button>
        {error && <div style={{ color: 'var(--error-text)', marginTop: '15px', fontWeight: 'bold' }}>⚠️ {error}</div>}
      </div>
    );
  }

  return (
    <div className="essay-container" style={{ padding: '20px', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)', marginTop: '20px' }}>
      <div style={{ marginBottom: '15px' }}>
        <strong style={{color: 'var(--text-main)'}}>📋 Cenário / Texto Motivador:</strong>
        <div className="essay-text" style={{color: 'var(--text-secondary)'}}><ReactMarkdown>{safeString(discursiva.texto_motivador)}</ReactMarkdown></div>
      </div>
      
      <div style={{ marginBottom: '15px', background: 'var(--card-bg)', padding: '10px', borderRadius: '4px', borderLeft: '4px solid var(--primary)' }}>
        <strong style={{color: 'var(--text-main)'}}>📝 Comando da Questão:</strong>
        <div className="essay-text" style={{ fontWeight: '500', margin: '5px 0 0 0', color: 'var(--text-main)' }}>
          <ReactMarkdown>{safeString(discursiva.comando)}</ReactMarkdown>
        </div>
      </div>
      
      <div style={{ marginBottom: '20px' }}>
        <strong style={{color: 'var(--text-main)'}}>🎯 Aspectos Avaliados (Total: 19.0 Pontos):</strong>
        <ul style={{ margin: '10px 0', paddingLeft: '20px', color: 'var(--text-secondary)' }}>
          {safeArray(discursiva.aspectos).map((asp, i) => (
            <li key={i} style={{marginBottom: '5px'}}>
              {safeString(asp.aspecto)} <span style={{color: 'var(--error-text)', fontWeight: 'bold', marginLeft: '5px'}}>({safeString(asp.valor_maximo)} pts)</span>
            </li>
          ))}
        </ul>
      </div>
      
      <textarea 
        className="essay-textarea" 
        placeholder="FOLHA DE TEXTO DEFINITIVO: Digite aqui a sua resposta estruturada..." 
        value={answer} 
        onChange={(e) => setAnswer(e.target.value)} 
        disabled={loading || loadingGen || correction !== null} 
        style={{ width: '100%', minHeight: '200px', padding: '15px', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '15px', resize: 'vertical', backgroundColor: 'var(--input-bg)', color: 'var(--text-main)' }}
      />
      
      {!correction && (
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="essay-button" onClick={handleCorrect} disabled={loading || loadingGen || answer.trim().length === 0} style={{ flex: 2, padding: '15px', backgroundColor: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '1.05rem' }}>
            {loading ? "⏳ Avaliando sua redação..." : "✔️ Enviar para a Banca IA (Correção)"}
          </button>
          <button className="essay-button" onClick={handleGenerateNew} disabled={loadingGen} style={{ flex: 1, backgroundColor: 'var(--hover-bg)', color: 'var(--text-main)', border: '1px solid var(--border)', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
            {loadingGen ? "⏳..." : "🔄 Sortear Outro Tema"}
          </button>
        </div>
      )}

      {error && (<div className="correction-error" style={{ color: 'var(--error-text)', backgroundColor: 'var(--error-bg)', padding: '10px', borderRadius: '6px', border: '1px solid var(--error-text)', marginTop: '10px' }}><strong>⚠️ Erro: </strong> {error}</div>)}
      
      {correction && (
        <div className="correction-box" style={{ marginTop: '20px', padding: '20px', backgroundColor: 'var(--card-bg)', borderRadius: '8px', border: '1px solid var(--border)', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
          <h3 style={{ marginTop: 0, color: 'var(--success-text)', borderBottom: '2px solid var(--success-text)', paddingBottom: '10px' }}>📊 Nota no Domínio do Conteúdo: {safeString(correction.nota_final_calculada?.toFixed(1))} / 19.0</h3>
          <div style={{fontStyle: 'italic', marginBottom: '20px', color: 'var(--text-secondary)'}}><strong>Parecer Oficial da Banca:</strong> <ReactMarkdown>{safeString(correction.feedback_geral)}</ReactMarkdown></div>
          
          <h4 style={{ color: 'var(--heading-color)' }}>🔹 Detalhamento por Aspecto:</h4>
          {safeArray(correction.avaliacoes_aspectos).map((av, k) => (
            <div key={k} style={{ marginBottom: '15px', background: 'var(--bg)', padding: '15px', borderRadius: '8px', borderLeft: '4px solid var(--primary)' }}>
              <div style={{fontWeight: 'bold', color: 'var(--text-main)'}}>{safeString(av.aspecto)}</div>
              <div style={{ color: 'var(--primary)', fontWeight: 'bold', margin: '5px 0' }}>Nota Atribuída: {safeString(av.nota_atribuida)}</div>
              <div style={{fontSize: '0.9em', color: 'var(--text-secondary)'}}><em><ReactMarkdown>{safeString(av.comentario)}</ReactMarkdown></em></div>
            </div>
          ))}

          <h4 style={{ marginTop: '20px', color: 'var(--heading-color)' }}>🔹 Estrutura e Aspectos Gramaticais (Vale até 1.0 ponto):</h4>
          <div style={{fontSize: '0.95em', color: 'var(--error-text)', background: 'var(--error-bg)', padding: '15px', borderRadius: '8px', border: '1px solid var(--error-text)'}}><ReactMarkdown>{safeString(correction.erros_gramaticais)}</ReactMarkdown></div>
          
          <div style={{ display: 'flex', gap: '20px', marginTop: '25px' }}>
            <button onClick={() => {setCorrection(null); setAnswer("");}} style={{background: 'var(--bg)', color: 'var(--primary)', border: '1px solid var(--border)', padding: '10px 15px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
              🔄 Refazer esta redação
            </button>
            <button onClick={handleGenerateNew} disabled={loadingGen} style={{background: 'var(--hover-bg)', color: 'var(--text-main)', border: '1px solid var(--border)', padding: '10px 15px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
              {loadingGen ? "⏳ A gerar..." : "🆕 Gerar Nova Discursiva Inédita"}
            </button>
          </div>
        </div>
      )}
    </div>
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

  // ---> NOVA FUNÇÃO: Redireciona para o OpenRouter
  const handleConnectAI = () => {
    const callbackUrl = encodeURIComponent(`${window.location.origin}/callback`);
    window.location.href = `https://openrouter.ai/auth?callback_url=${callbackUrl}`;
  };
  
  
  // ESTADOS PARA O SIMULADO GERAL COM IA
  const [simuladoQuestoes, setSimuladoQuestoes] = useState(null);
  const [simuladoLoading, setSimuladoLoading] = useState(false);
  const [simuladoProgress, setSimuladoProgress] = useState(0);
  const [simuladoAcertos, setSimuladoAcertos] = useState(0);
  const [simuladoFinalizado, setSimuladoFinalizado] = useState(false);
  const [simuladoQtd, setSimuladoQtd] = useState(5);
  const [simuladoNivel, setSimuladoNivel] = useState("Superior");

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
    setTempModel(userModel || result?.modelo_utilizado || "arcee-ai/trinity-large-thinking:free");
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
      
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
      // Envia uma string vazia para apagar a chave no banco de dados
      const res = await fetch(`${apiUrl}/users/me/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ api_key: "", preferred_model: tempModel.trim() })
      });
      
      if (res.ok) {
        setUserApiKey(""); // Limpa do estado da tela imediatamente
      } else { 
        alert("Erro ao desvincular no servidor."); 
      }
    } catch (err) { 
      alert("Falha de conexão."); 
    } finally { 
      setSavingConfig(false); 
    }
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

  // FUNÇÃO PARA GERAR O SIMULADO EM TEMPO REAL COM A IA (COM RETRIES)
  const handleGerarSimuladoIA = async () => {
    if (!userApiKey) {
      openConfigModal();
      return;
    }
    
    setSimuladoAcertos(0);
    setSimuladoFinalizado(false);
    setSimuladoLoading(true);
    setSimuladoQuestoes(null);
    setSimuladoProgress(0);
    
    let questoesGeradas = [];
    const totalAulas = safeArray(result?.aulas).length;

    try {
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
      
      for (let i = 0; i < totalAulas; i++) {
        const aula = result.aulas[i];
        
        // --- INÍCIO DA LÓGICA DE TENTATIVAS DA IA ---
        let maxTentativas = 3;
        let tentativaAtual = 0;
        let sucessoNoTopico = false;

        while (tentativaAtual < maxTentativas && !sucessoNoTopico) {
          try {
            setSimuladoProgress(Math.round((i / totalAulas) * 100)); // Atualiza progresso

            const data = await fetchStreamAsJson(`${apiUrl}/generate-simulado-topic`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                area: aula.disciplina || result?.area_identificada || "Conhecimentos Gerais",
                topico: aula.titulo || `Tópico ${i+1}`,
                conteudo: aula.aula_teorica_aprofundada || aula.visao_geral || "",
                model: userModel || defaultModel || "arcee-ai/trinity-large-thinking:free",
                api_key: userApiKey || null,
                qtd_questoes: parseInt(simuladoQtd, 10), // <-- Adicionado
                nivel: simuladoNivel                     // <-- Adicionado
              })
            });
            
            // Verifica se a API da IA repassou um erro de limite (Rate Limit 429)
            if (data && data.error) {
              throw new Error(data.error); 
            }
            
            // Salva as questões geradas
            if (data && data.simulado) {
              questoesGeradas.push(...data.simulado);
              sucessoNoTopico = true;
            } else if (Array.isArray(data)) {
              questoesGeradas.push(...data);
              sucessoNoTopico = true;
            } else {
              throw new Error("O JSON retornou vazio ou em formato imprevisto.");
            }
            
          } catch (err) {
            tentativaAtual++;
            console.warn(`⚠️ IA falhou no tópico ${i+1} (Tentativa ${tentativaAtual}/${maxTentativas}). Refazendo... Motivo:`, err.message);
            
            if (tentativaAtual >= maxTentativas) {
              throw new Error(`A IA falhou repetidamente ao processar o tópico "${aula.titulo}". Isso geralmente ocorre devido a sobrecarga no provedor do modelo gratuito.`);
            }
            // Aguarda 2.5 segundos antes de tentar novamente (Evita bloqueios por excesso de requisições)
            await new Promise(resolve => setTimeout(resolve, 2500));
          }
        }
        // --- FIM DA LÓGICA DE TENTATIVAS ---
      } // Fim do Loop For
      
      setSimuladoProgress(100);
      
      if (questoesGeradas.length === 0) {
        alert("Não foi possível gerar as questões. A IA retornou respostas vazias consecutivamente.");
        setSimuladoLoading(false);
        return;
      }

      // Mistura as questões antes de as apresentar
      questoesGeradas = questoesGeradas.sort(() => 0.5 - Math.random());
      setSimuladoQuestoes(questoesGeradas);
      
      setTimeout(() => {
        document.getElementById('simulado-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 300);

    } catch (err) {
      console.error(err);
      alert(err.message || "Ocorreu um erro de conexão ininterrupto ao tentar gerar o simulado.");
    } finally {
      setSimuladoLoading(false);
    }
  };

  if (!result) return <div style={{ padding: '20px', color: 'var(--text-main)' }}>A aguardar os dados da lição...</div>;
  const aulas = safeArray(result?.aulas);

  return (
    <div className="result-content" style={{ position: 'relative', maxWidth: '1000px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      
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
            border-color: var(--primary) !important;
            background-color: var(--primary-light) !important;
          }
        `}
      </style>

      {/* BARRA SUPERIOR DE CONFIGURAÇÃO UNIFICADA */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--hover-bg)', padding: '12px 20px', borderRadius: '8px', marginBottom: '20px', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          <strong>IA Interativa:</strong> {userApiKey ? <span style={{color: 'var(--success-text)'}}>Chave Privada Ativa ({userModel})</span> : <span>Configure sua IA gratuitamente para desbloquear o Tutor IA, Gerar Simulado e Discursiva.</span>}
        </div>
        <button onClick={openConfigModal} style={{ background: 'var(--primary)', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '6px', fontSize: '0.9rem', cursor: 'pointer', fontWeight: 'bold' }}>
          ⚙️ Configurar a Minha IA
        </button>
      </div>

      <div className="summary" style={{ background: 'var(--card-bg)', padding: '20px', borderRadius: '8px', marginBottom: '20px', border: '1px solid var(--border)' }}>
        <div className="summaryItem" style={{ marginBottom: '15px', background: 'var(--bg)', border: '1px solid var(--border)' }}>
          <div className="summaryLabel" style={{ fontWeight: 'bold', color: 'var(--text-secondary)' }}>Área</div>
          <div className="summaryValue" style={{ fontSize: '1.1rem', color: 'var(--text-main)' }}>{safeString(result?.area_identificada)}</div>
        </div>
        <div className="summaryItem" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
          <div className="summaryLabel" style={{ fontWeight: 'bold', color: 'var(--text-secondary)' }}>Resumo do Cargo/Objetivo</div>
          <div className="summaryValue" style={{ color: 'var(--text-main)' }}>
            <ReactMarkdown>{safeString(result?.resumo_cargo)}</ReactMarkdown>
          </div>
        </div>
      </div>

      {!!safeString(result?.plano_estudo) && (
        <details className="details" style={{ margin: '20px 0', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--card-bg)' }}>
          <summary className="summaryTitle" style={{ padding: '15px', background: 'var(--hover-bg)', color: 'var(--text-main)', fontWeight: 'bold', cursor: 'pointer' }}>📅 Plano de Estudo Estratégico</summary>
          <div className="md" style={{ padding: '20px', color: 'var(--text-main)' }}><ReactMarkdown>{safeString(result?.plano_estudo)}</ReactMarkdown></div>
        </details>
      )}

      {aulas.map((aula, idx) => {
        const quiz = safeArray(aula?.quiz);
        const mapaMental = aula?.mapa_mental || {};

        return (
          <article id={`aula-${idx}`} className="card" key={idx} style={{ marginBottom: '40px', padding: '20px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--card-bg)', boxShadow: 'var(--shadow-sm)' }}>
           
            <h2 className="lessonTitle" style={{ marginTop: 0, color: 'var(--heading-color)', borderBottom: '2px solid var(--border)', paddingBottom: '10px' }}>
              <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--primary)', letterSpacing: '0.05em', marginBottom: '6px' }}>
                📚 {safeString(aula?.disciplina)}
              </span>
              {safeString(aula?.titulo)}
            </h2>
            
            <div className="section" style={{ marginBottom: '20px', color: 'var(--text-main)' }}>
              <p><strong>Visão Geral:</strong> <ReactMarkdown components={{ p: 'span' }}>{safeString(aula?.visao_geral)}</ReactMarkdown></p>
            </div>

            {/* 1. Aula Teórica Aprofundada */}
            <details className="details" style={{ marginBottom: '15px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg)' }}>
              <summary className="summaryTitle" style={{ padding: '15px', background: 'var(--hover-bg)', color: 'var(--text-main)', fontWeight: 'bold', cursor: 'pointer', borderRadius: '8px' }}>
                📖 Aula Teórica Aprofundada
              </summary>
              <div className="md markdown-format" style={{ padding: '20px', color: 'var(--text-main)' }}>
                <ReactMarkdown>{safeString(aula?.aula_teorica_aprofundada)}</ReactMarkdown>
              </div>
            </details>

            {/* 2. Resumo de Termos Chave */}
            {Array.isArray(aula?.resumo_termos_chave) && aula.resumo_termos_chave.length > 0 && (
              <details className="details" style={{ marginBottom: '15px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg)' }}>
                <summary className="summaryTitle" style={{ padding: '15px', background: 'var(--hover-bg)', color: 'var(--text-main)', fontWeight: 'bold', cursor: 'pointer', borderRadius: '8px' }}>
                  🔑 Resumo de Termos Chave
                </summary>
                <div style={{ padding: '20px' }}>
                  <ul style={{ listStyleType: 'none', padding: 0, margin: 0 }}>
                    {aula.resumo_termos_chave.map((t, k) => (
                      <li key={k} style={{ marginBottom: '12px', background: 'var(--card-bg)', color: 'var(--text-main)', padding: '12px', borderRadius: '6px', borderLeft: '4px solid var(--primary)' }}>
                        <strong style={{ color: 'var(--primary)' }}>{t.termo}:</strong> <ReactMarkdown components={{ p: 'span' }}>{t.definicao}</ReactMarkdown>
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            )}

            {/* 3. Analogias e Contexto */}
            {!!aula?.analogias_contexto && (
              <details className="details" style={{ marginBottom: '15px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg)' }}>
                <summary className="summaryTitle" style={{ padding: '15px', background: 'var(--hover-bg)', color: 'var(--text-main)', fontWeight: 'bold', cursor: 'pointer', borderRadius: '8px' }}>
                  💡 Analogias e Contexto
                </summary>
                <div className="md markdown-format" style={{ padding: '20px', color: 'var(--text-main)' }}>
                  <ReactMarkdown>{safeString(aula.analogias_contexto)}</ReactMarkdown>
                </div>
              </details>
            )}

            {/* 4. Aplicação Prática / Exemplos */}
            {!!aula?.aplicacao_pratica_exemplos && (
              <details className="details" style={{ marginBottom: '15px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg)' }}>
                <summary className="summaryTitle" style={{ padding: '15px', background: 'var(--hover-bg)', color: 'var(--text-main)', fontWeight: 'bold', cursor: 'pointer', borderRadius: '8px' }}>
                  🛠️ Aplicação Prática / Exemplos
                </summary>
                <div className="md markdown-format" style={{ padding: '20px', color: 'var(--text-main)' }}>
                  <ReactMarkdown>{safeString(aula.aplicacao_pratica_exemplos)}</ReactMarkdown>
                </div>
              </details>
            )}

            {/* 5. Fixação de Conhecimento (Questões) */}
            {quiz.length > 0 && (
              <details className="details" style={{ marginBottom: '15px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg)' }}>
                <summary className="summaryTitle" style={{ padding: '15px', background: 'var(--hover-bg)', color: 'var(--text-main)', fontWeight: 'bold', cursor: 'pointer', borderRadius: '8px' }}>
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
                onOpenConfig={openConfigModal}
              />
            )}

            {/* 7. Mapa Mental */}
            {!!mapaMental.codigo_mermaid && (
              <div style={{ margin: '20px 0' }}>
                <button 
                  onClick={() => setSelectedMap({ titulo: mapaMental.titulo, codigo: mapaMental.codigo_mermaid })}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '15px', backgroundColor: 'var(--success-bg)', color: 'var(--success-text)', border: '1px solid var(--success-text)', borderRadius: '8px', fontSize: '1.1rem', fontWeight: 'bold', cursor: 'pointer', boxShadow: 'var(--shadow-sm)', transition: 'background-color 0.2s' }}
                >
                  🧠 Visualizar Mapa Mental do Capítulo
                </button>
              </div>
            )}
          </article>
        );
      })}

      {/* ========================================== */}
      {/* BOTÃO E BLOCO DO SIMULADO GERAL (COM IA)     */}
      {/* ========================================== */}
      <div style={{ marginTop: '50px', padding: '40px 20px', background: 'linear-gradient(135deg, var(--bg) 0%, var(--hover-bg) 100%)', borderRadius: '12px', border: '1px solid var(--border)', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
        <h2 style={{ color: 'var(--heading-color)', margin: '0 0 15px 0', fontSize: '1.8rem' }}>🏆 Simulado Final Inédito (Gerado por IA)</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '25px', fontSize: '1.1rem', maxWidth: '600px', margin: '0 auto' }}>
          A Inteligência Artificial vai analisar o conteúdo estudado e criar questões inéditas em tempo real.
        </p>
        
        {/* NOVOS CONTROLES DE CONFIGURAÇÃO DO SIMULADO */}
        {!simuladoLoading && !simuladoQuestoes && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginBottom: '25px', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'left' }}>
              <label style={{ display: 'block', color: 'var(--text-main)', fontWeight: 'bold', marginBottom: '8px' }}>Nível de Exigência:</label>
              <select 
                value={simuladoNivel} 
                onChange={(e) => setSimuladoNivel(e.target.value)} 
                style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-main)', fontSize: '1rem', outline: 'none', cursor: 'pointer' }}
              >
                <option value="Médio">Ensino Médio</option>
                <option value="Superior">Ensino Superior</option>
              </select>
            </div>
            <div style={{ textAlign: 'left' }}>
              <label style={{ display: 'block', color: 'var(--text-main)', fontWeight: 'bold', marginBottom: '8px' }}>Questões por Módulo:</label>
              <input 
                type="number" 
                min="1" 
                max="10" 
                value={simuladoQtd} 
                onChange={(e) => setSimuladoQtd(e.target.value)} 
                style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-main)', fontSize: '1rem', width: '100px', outline: 'none' }} 
              />
            </div>
          </div>
        )}

        {simuladoLoading ? (
          <div style={{ margin: '0 auto', maxWidth: '500px', padding: '20px', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <div style={{ marginBottom: '10px', fontWeight: 'bold', color: 'var(--primary)', fontSize: '1.1rem' }}>
              A analisar tópicos e a gerar questões... {simuladoProgress}%
            </div>
            <div style={{ width: '100%', backgroundColor: 'var(--bg)', borderRadius: '8px', height: '12px', overflow: 'hidden' }}>
              <div style={{ width: `${simuladoProgress}%`, backgroundColor: 'var(--primary)', height: '100%', transition: 'width 0.4s ease' }}></div>
            </div>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '12px', marginBottom: 0 }}>
              Isto pode demorar alguns instantes. Por favor, não feche a página.
            </p>
          </div>
        ) : (
          <button 
            onClick={handleGerarSimuladoIA} 
            style={{ padding: '15px 30px', backgroundColor: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '1.1rem', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 12px var(--primary-light)', transition: 'background-color 0.2s' }}
          >
            ✨ Gerar Simulado com IA Agora
          </button>
        )}
      </div>

      {simuladoQuestoes && (
        <div id="simulado-section" style={{ marginTop: '40px', padding: '30px', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--border)', paddingBottom: '20px', marginBottom: '30px' }}>
            <h2 style={{ margin: 0, color: 'var(--heading-color)', fontSize: '1.6rem' }}>🎓 Simulado Geral ({simuladoQuestoes.length} Questões)</h2>
            <button onClick={() => setSimuladoQuestoes(null)} style={{ background: 'var(--error-bg)', color: 'var(--error-text)', border: '1px solid var(--error-text)', padding: '10px 15px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', transition: 'background 0.2s' }}>
              ✕ Fechar Simulado
            </button>
          </div>
          
          {simuladoQuestoes.map((q, i) => (
            <div key={i} style={{ marginBottom: '35px', padding: '20px', background: 'var(--bg)', borderRadius: '8px', borderLeft: '4px solid var(--primary)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '12px', letterSpacing: '0.05em' }}>
                📚 {safeString(q.contexto_disciplina)} <span style={{ margin: '0 8px', color: 'var(--border)' }}>|</span> 📌 {safeString(q.contexto_topico)}
              </div>
              <QuizCard 
                question={q} 
                index={i} 
                onAnswer={(isCorrect, isReset) => {
                  if (isReset) {
                    setSimuladoAcertos(prev => Math.max(0, prev - 1)); 
                  } else if (isCorrect) {
                    setSimuladoAcertos(prev => prev + 1); 
                  }
                }}
              />
            </div>
          ))}

          <div style={{ textAlign: 'center', marginTop: '40px', paddingTop: '30px', borderTop: '2px solid var(--border)' }}>
            {!simuladoFinalizado ? (
              <button 
                onClick={async () => {
                  await savePerformance("simulado", result?.area_identificada ? `${result.area_identificada} (Simulado Geral)` : "Simulado Geral", simuladoAcertos, simuladoQuestoes.length);
                  setSimuladoFinalizado(true);
                }} 
                style={{ padding: '15px 30px', background: 'var(--success-bg)', color: 'var(--success-text)', border: '1px solid var(--success-text)', borderRadius: '8px', fontWeight: 'bold', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✅ Finalizar Simulado e Salvar Nota
              </button>
            ) : (
              <div style={{ padding: '20px', background: 'var(--success-bg)', color: 'var(--success-text)', borderRadius: '8px', border: '1px solid var(--success-text)', fontWeight: 'bold', fontSize: '1.2rem', marginBottom: '20px' }}>
                🏆 Simulado Concluído! Você acertou {simuladoAcertos} de {simuladoQuestoes.length}. Nota salva no seu Desempenho.
              </div>
            )}
            
            <div style={{ marginTop: '20px' }}>
              <button onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})} style={{ padding: '10px 20px', background: 'var(--hover-bg)', color: 'var(--text-main)', border: '1px solid var(--border)', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                ↑ Voltar ao Início da Aula
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* BLOCO DA DISCURSIVA GERAL (COM IA)         */}
      {/* ========================================== */}
      <div style={{ marginTop: '40px', padding: '40px 20px', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)' }}>
        <h2 style={{ color: 'var(--heading-color)', margin: '0 0 15px 0', fontSize: '1.8rem', textAlign: 'center' }}>✍️ Prova Discursiva Geral (Padrão CEBRASPE)</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '25px', fontSize: '1.1rem', maxWidth: '700px', margin: '0 auto', textAlign: 'center' }}>
          A IA sorteará <strong>2 temas aleatórios</strong> do curso e criará um cenário inédito. A prova distribuirá 19.0 pontos para o domínio técnico e 1.0 ponto para estrutura e gramática.
        </p>
        
        <GlobalEssaySection 
          defaultModel={result?.modelo_utilizado} 
          userApiKey={userApiKey} 
          userModel={userModel} 
          area={result?.area_identificada}
          aulas={aulas}
          onOpenConfig={openConfigModal}
        />
      </div>

      {/* BOTÃO FLUTUANTE DO NAVEGADOR ESQUERDO */}
      {!isNavOpen && (
        <button 
          onClick={() => setIsNavOpen(true)}
          title="Índice de Tópicos"
          style={{ position: 'fixed', bottom: '20px', left: '20px', width: '60px', height: '60px', borderRadius: '50%', backgroundColor: 'var(--card-bg)', color: 'var(--text-main)', border: '1px solid var(--border)', fontSize: '1.8rem', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          📑
        </button>
      )}

      {/* MENU NAVEGADOR LATERAL (DRAWER) */}
      {isNavOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.6)', zIndex: 10001, display: 'flex' }} onClick={() => setIsNavOpen(false)}>
          <div className="nav-drawer" style={{ width: '320px', maxWidth: '85vw', height: '100%', backgroundColor: 'var(--card-bg)', boxShadow: '4px 0 15px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            
            <div style={{ padding: '20px', backgroundColor: 'var(--hover-bg)', color: 'var(--text-main)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>📑 Índice de Aulas</h3>
              <button onClick={() => setIsNavOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-main)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
               <button 
                  onClick={() => { window.scrollTo({top: 0, behavior: 'smooth'}); setIsNavOpen(false); }}
                  style={{ textAlign: 'left', padding: '12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', color: 'var(--text-main)' }}
                >
                  ↑ Voltar ao Topo (Resumo)
                </button>
              
              {aulas.map((aula, i) => (
                <button 
                  key={i}
                  className="nav-item-btn"
                  onClick={() => { document.getElementById(`aula-${i}`)?.scrollIntoView({ behavior: 'smooth' }); setIsNavOpen(false); }}
                  style={{ textAlign: 'left', padding: '12px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-secondary)', transition: 'all 0.2s', display: 'flex', flexDirection: 'column', gap: '4px' }}
                >
                  <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--primary)', fontWeight: 'bold' }}>{safeString(aula?.disciplina).substring(0, 30)}</span>
                  <span style={{ fontSize: '0.95rem', fontWeight: '600', lineHeight: '1.3', color: 'var(--text-main)' }}>{safeString(aula?.titulo)}</span>
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
        onOpenConfig={openConfigModal}
      />

      {/* MODAL DO MAPA MENTAL */}
      {selectedMap && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }} onClick={() => setSelectedMap(null)}>
          <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', padding: '25px', width: '100%', maxWidth: '1000px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '15px' }}>
              <h3 style={{ margin: 0, color: 'var(--heading-color)', fontSize: '1.5rem' }}>{selectedMap.titulo}</h3>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => handleDownloadSVG(selectedMap.titulo)} style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '6px', padding: '10px 15px', fontWeight: 'bold', cursor: 'pointer' }}>⬇️ Baixar SVG</button>
                <button onClick={() => setSelectedMap(null)} style={{ background: 'var(--hover-bg)', color: 'var(--text-main)', border: '1px solid var(--border)', borderRadius: '6px', padding: '10px 15px', fontWeight: 'bold', cursor: 'pointer' }}>✕ Fechar</button>
              </div>
            </div>
            <div className="mermaid-wrapper" style={{ flex: 1, overflow: 'auto', border: '1px solid var(--border)', borderRadius: '8px', padding: '20px', background: 'var(--bg)', display: 'flex', justifyContent: 'center' }}>
              <Mermaid chart={selectedMap.codigo} />
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIGURAÇÃO GLOBAL (CHAVE DA IA) */}
      {showConfig && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.8)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: '12px', padding: '30px', width: '100%', maxWidth: '500px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', border: '1px solid var(--border)' }}>
            <h3 style={{ marginTop: 0, color: 'var(--heading-color)', borderBottom: '1px solid var(--border)', paddingBottom: '15px', marginBottom: '15px' }}>⚙️ Configurar a Minha IA</h3>
            
            <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: '1.5', background: 'var(--bg)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              Vincule a sua conta do OpenRouter para desbloquear o Tutor IA e a Correção de Redações. <br/><br/>
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
              <input type="text" value={tempModel} onChange={(e) => setTempModel(e.target.value)} placeholder="ex: google/gemini-2.5-flash-lite" style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '1rem', backgroundColor: 'var(--input-bg)', color: 'var(--text-main)' }} />
              
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '8px', display: 'block', lineHeight: '1.4' }}>
                O sistema já utiliza um modelo rápido e gratuito por padrão. Se desejar, você pode escolher outras opções de IAs gratuitas. <a href="https://openrouter.ai/models?max_price=0" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', fontWeight: 'bold', textDecoration: 'underline' }}>Clique aqui para ver a lista de modelos 100% gratuitos</a>.
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