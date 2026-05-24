import React, { useState, useEffect, useRef } from "react";
import { 
  Calculator, BarChart2, SlidersHorizontal, FileText, BookOpenCheck, 
  Sparkles, Bot, Cpu, AlignLeft, GraduationCap, Wand2, PieChart, 
  X, CheckCircle, AlertCircle, Binary
} from "lucide-react";
import ReactMarkdown from "react-markdown";

// Helper para ler token unificado
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

// ==========================================
// NOVA FUNÇÃO ANTI-ERRO (Com limpeza agressiva)
// ==========================================
const fetchStreamAsJson = async (url, options, onProgress = null) => {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`Erro do servidor: ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let rawText = "";
  let bytesReceived = 0;
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesReceived += value.length;
    if (onProgress) onProgress(bytesReceived);
    rawText += decoder.decode(value, { stream: true });
  }
  
  try {
    // 1. Remove blocos de raciocínio da IA
    let cleanText = rawText.replace(/<think>[\s\S]*?<\/think>/gi, "").trim(); 
    
    // 2. Extrai apenas o bloco principal do JSON
    const jsonMatch = cleanText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) cleanText = jsonMatch[0];
    
    // 3. VACINA 1: Remove quebras de linha literais (Enters) dentro das strings
    // Isso é o que mais causa "Formato Inválido" na Múltipla Escolha
    cleanText = cleanText.replace(/[\n\r\t]+/g, ' ');

    // 4. VACINA 2: Remove vírgulas no final de arrays/objetos
    cleanText = cleanText.replace(/,\s*([\]}])/g, '$1');
    
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("TEXTO COM ERRO DA IA:", rawText);
    throw new Error("A IA gerou um formato inválido.");
  }
};

// ==========================================

export default function GabariteLogica() {
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  // --- ESTADOS DA CONFIGURAÇÃO DA IA ---
  const [showConfig, setShowConfig] = useState(false);
  const [tempModel, setTempModel] = useState("");
  const [userApiKey, setUserApiKey] = useState("");
  const [userModel, setUserModel] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);

  // --- ESTADOS DO SIMULADOR (Com os novos focos de RLM) ---
  const [configFocus, setConfigFocus] = useState("completo");
  const [configDifficulty, setConfigDifficulty] = useState("medio");
  const [configFormato, setConfigFormato] = useState("Certo/Errado");
  const [configAmount, setConfigAmount] = useState(10);
  const [configTextBase, setConfigTextBase] = useState(true);
  const [configExamMode, setConfigExamMode] = useState(false);

  // --- ESTADOS DO FLUXO (UI) ---
  const [viewState, setViewState] = useState("initial"); 
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState("");
  
  // --- ESTADOS DOS DADOS DA PROVA ---
  const [currentData, setCurrentData] = useState(null);
  const [userAnswers, setUserAnswers] = useState({});
  const [isExamFinished, setIsExamFinished] = useState(false);

  // --- ESTADOS DE ESTATÍSTICAS E MODAIS ---
  const [stats, setStats] = useState({ total: 0, correct: 0, wrong: 0, topics: {} });
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showLessonModal, setShowLessonModal] = useState(false);
  const [lessonContent, setLessonContent] = useState("");

  useEffect(() => {
    fetchUserSettings();
    const savedStats = localStorage.getItem('cespe_logica_stats');
    if (savedStats) {
      try { setStats(JSON.parse(savedStats)); } catch (e) { console.error(e); }
    }
  }, []);

  const saveStats = (newStats) => {
    setStats(newStats);
    localStorage.setItem('cespe_logica_stats', JSON.stringify(newStats));
  };

  const fetchUserSettings = async () => {
    try {
      const token = getAuthToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/users/me/settings`, { headers: { "Authorization": `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        if (data.api_key) setUserApiKey(data.api_key);
        if (data.preferred_model) setUserModel(data.preferred_model);
      }
    } catch (err) { console.error("Falha ao buscar configurações de IA", err); }
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
    if (!window.confirm("Tem a certeza que deseja desvincular a sua conta?")) return;
    setSavingConfig(true);
    try {
      const token = getAuthToken();
      if (!token) { alert("Sessão expirada. Faça login."); return; }
      const res = await fetch(`${API_URL}/users/me/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ api_key: "", preferred_model: tempModel.trim() })
      });
      if (res.ok) setUserApiKey("");
      else alert("Erro ao desvincular no servidor."); 
    } catch (err) { alert("Falha de conexão."); } finally { setSavingConfig(false); }
  };

  const generateExam = async () => {
    setError("");
    setViewState("loading");

    try {
      const token = getAuthToken();
      let todasQuestoes = [];
      
      const batchSize = 5; 
      const batches = Math.ceil(configAmount / batchSize);

      for (let i = 0; i < batches; i++) {
        setLoadingMsg(`A formular questões inéditas... (Lote ${i + 1} de ${batches})`);
        const currentBatchSize = Math.min(batchSize, configAmount - (i * batchSize));

        const payload = {
          subject: "Raciocínio Lógico", 
          focus: configFocus,
          difficulty: configDifficulty,
          amount: currentBatchSize,
          generate_text: configTextBase, // Agora solicita texto em todos os lotes
          formato: configFormato,
          model: userModel || "arcee-ai/trinity-large-thinking:free",
          api_key: userApiKey || null
        };

        // --- SISTEMA DE AUTO-RETRY (Auto-recuperação de erros da IA) ---
        let data = null;
        let tentativas = 0;
        const maxTentativas = 2;

        while (tentativas < maxTentativas) {
          try {
            data = await fetchStreamAsJson(`${API_URL}/generate-simulado-cespe`, {
              method: "POST",
              headers: { 
                "Content-Type": "application/json",
                "Authorization": token ? `Bearer ${token}` : ""
              },
              body: JSON.stringify(payload)
            });
            
            if (data && data.questoes && data.questoes.length > 0) {
              break; // Sai do loop se teve sucesso
            } else {
              throw new Error("O lote veio vazio.");
            }
          } catch (e) {
            tentativas++;
            if (tentativas >= maxTentativas) {
              throw new Error("A IA falhou seguidamente ao formatar as opções. Tente novamente.");
            }
            setLoadingMsg(`Corrigindo formato da IA... (A repetir o Lote ${i + 1})`);
          }
        }
        // ----------------------------------------------------------------

        const questoesCorrigidas = data.questoes.map((q, idx) => ({
          ...q,
          id: `q_prova_${i}_${idx}`,
          // Injeta o texto-base gerado neste lote apenas na PRIMEIRA questão dele
          textoVinculado: (idx === 0 && configTextBase && data.textoBase) ? data.textoBase : null
        }));

        todasQuestoes = [...todasQuestoes, ...questoesCorrigidas];
      }

      setCurrentData({ questoes: todasQuestoes });
      setUserAnswers({});
      setIsExamFinished(false);
      setViewState("exam");
      window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (err) {
      console.error(err);
      setError(err.message || "Falha ao comunicar com a IA. Tente novamente.");
      setViewState("initial");
    }
  };

  const generateLesson = async (wrongQuestions) => {
    setViewState("loading");
    setLoadingMsg("O Professor IA está montando tabelas-verdade e explicações para os seus erros...");

    try {
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/generate-lesson-cespe`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": token ? `Bearer ${token}` : ""
        },
        body: JSON.stringify({
          wrong_questions: wrongQuestions,
          model: userModel || "arcee-ai/trinity-large-thinking:free",
          api_key: userApiKey || null
        })
      });

      if (!response.ok) throw new Error("Falha ao gerar a aula.");
      const data = await response.json();

      setLessonContent(data.lesson_markdown || data.text || "Conteúdo não disponível.");
      setViewState("exam"); 
      setShowLessonModal(true);

    } catch (err) {
      console.error(err);
      alert("Falha ao gerar a aula.");
      setViewState("exam");
    }
  };

  const handleAnswer = (qId, answer) => {
    if (isExamFinished) return;
    if (!configExamMode) {
      if (userAnswers[qId]) return; 
      const newAnswers = { ...userAnswers, [qId]: answer };
      setUserAnswers(newAnswers);
      processSingleAnswer(qId, answer);
    } else {
      const newAnswers = { ...userAnswers };
      if (newAnswers[qId] === answer) delete newAnswers[qId];
      else newAnswers[qId] = answer; 
      setUserAnswers(newAnswers);
    }
  };

  const processSingleAnswer = (qId, answer) => {
    const q = currentData.questoes.find(x => x.id === qId);
    const isCorrect = answer === q.gabarito;
    
    let newStats = { ...stats };
    newStats.total++;
    if (isCorrect) newStats.correct++; else newStats.wrong++;

    if (!newStats.topics[q.assunto]) newStats.topics[q.assunto] = { correct: 0, wrong: 0 };
    if (isCorrect) newStats.topics[q.assunto].correct++; else newStats.topics[q.assunto].wrong++;

    saveStats(newStats);
  };

  const finishExam = () => {
    if (isExamFinished) return;
    setIsExamFinished(true);

    let newStats = { ...stats };
    let right = 0, wrong = 0;

    currentData.questoes.forEach(q => {
      const ans = userAnswers[q.id];
      if (ans) {
        newStats.total++;
        if (ans === q.gabarito) { right++; newStats.correct++; } 
        else { wrong++; newStats.wrong++; }
        
        if (!newStats.topics[q.assunto]) newStats.topics[q.assunto] = { correct: 0, wrong: 0 };
        if (ans === q.gabarito) newStats.topics[q.assunto].correct++;
        else newStats.topics[q.assunto].wrong++;
      }
    });

    saveStats(newStats);
    alert(`Simulado RLM finalizado! Pontuação líquida CESPE: ${right - wrong}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getWrongQuestions = () => {
    if (!currentData) return [];
    return currentData.questoes.filter(q => {
      const ans = userAnswers[q.id];
      return ans && ans !== q.gabarito;
    });
  };

  const resetStats = () => {
    if(window.confirm("Apagar todo o histórico de Raciocínio Lógico?")) {
      saveStats({ total: 0, correct: 0, wrong: 0, topics: {} });
      setShowStatsModal(false);
    }
  };

  const wrongCount = getWrongQuestions().length;
  const showLessonAction = (isExamFinished || (!configExamMode && Object.keys(userAnswers).length === currentData?.questoes?.length)) && wrongCount > 0;

  return (
    <div className="container">
      <header className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left', marginBottom: '1rem', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h1 style={{ color: 'var(--heading-color)', margin: '0 0 5px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Calculator size={32} color="var(--primary)" /> Gabarite Lógica <span style={{ color: 'var(--primary)' }}>CESPE</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Treino de Raciocínio Lógico com Situações Hipotéticas focadas no edital.</p>
        </div>
        <button onClick={() => setShowStatsModal(true)} className="btn" style={{ fontWeight: 'bold' }}>
          <BarChart2 size={20} /> O meu Desempenho
        </button>
      </header>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--card-bg)', padding: '15px 20px', borderRadius: '12px', marginBottom: '20px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
          <strong>IA Geradora:</strong> {userApiKey ? <span style={{color: 'var(--success-text)'}}>Chave Ativa ({userModel || "Padrão"})</span> : <span>Configure a sua IA gratuitamente para geração contínua.</span>}
        </div>
        <button onClick={openConfigModal} style={{ background: 'var(--primary)', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '0.95rem', cursor: 'pointer', fontWeight: 'bold', transition: 'background 0.2s' }}>
          ⚙️ Configurar a Minha IA
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
          
          <aside style={{ display: 'flex', flexDirection: 'column', gap: '20px', gridColumn: '1 / span 1', maxWidth: '350px' }}>
            <div className="panel" style={{ padding: '20px' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--heading-color)' }}>
                <SlidersHorizontal size={20} color="var(--primary)" /> Configurar Simulado
              </h2>
              
              <div style={{ marginBottom: '15px' }}>
                <label className="label">Foco de Estudo (Frequência CESPE)</label>
                <select className="select" value={configFocus} onChange={e => setConfigFocus(e.target.value)} style={{ padding: '10px', fontSize: '0.9rem' }}>
                  <option value="completo">Simulado Completo (Todos)</option>
                  <option value="negacao">⭐⭐⭐⭐⭐ Negação lógica</option>
                  <option value="condicional">⭐⭐⭐⭐⭐ Condicional (Se..então)</option>
                  <option value="equivalencia">⭐⭐⭐⭐⭐ Equivalência lógica</option>
                  <option value="diagramas">⭐⭐⭐⭐ Diagramas lógicos</option>
                  <option value="argumentacao">⭐⭐⭐⭐ Argumentação lógica</option>
                  <option value="probabilidade">⭐⭐⭐ Probabilidade</option>
                  <option value="combinatoria">⭐⭐⭐ Análise combinatória</option>
                  <option value="sequencias">⭐⭐ Sequências lógicas</option>
                </select>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label className="label">Dificuldade</label>
                <select className="select" value={configDifficulty} onChange={e => setConfigDifficulty(e.target.value)}>
                  <option value="medio">Média (Padrão PF/PRF/TJ)</option>
                  <option value="facil">Fácil</option>
                  <option value="dificil">Difícil (Pegadinhas complexas)</option>
                  <option value="avancado">Avançado (Analista/Auditor CGU/TCU)</option>
                </select>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label className="label">Formato da Questão</label>
                <select className="select" value={configFormato} onChange={e => setConfigFormato(e.target.value)} style={{ padding: '10px', fontSize: '0.9rem', width: '100%' }}>
                  <option value="Certo/Errado">Certo / Errado (Padrão CESPE)</option>
                  <option value="Múltipla Escolha">Múltipla Escolha (A, B, C, D, E)</option>
                </select>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label className="label">Quantidade de Questões</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {[5, 10, 15, 20].map(val => (
                    <button 
                      key={val}
                      onClick={() => setConfigAmount(val)}
                      style={{ 
                        flex: 1, padding: '8px 0', borderRadius: '8px', fontWeight: 'bold', fontSize: '0.9rem', cursor: 'pointer', transition: 'all 0.2s',
                        background: configAmount === val ? 'var(--primary-light)' : 'var(--bg)',
                        color: configAmount === val ? 'var(--primary)' : 'var(--text-secondary)',
                        border: configAmount === val ? '2px solid var(--primary)' : '1px solid var(--border)'
                      }}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }} />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '15px', cursor: 'pointer' }} onClick={() => setConfigTextBase(!configTextBase)}>
                <span style={{ fontSize: '0.95rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)' }}>
                  <FileText size={18} /> Gerar Situação Hipotética
                </span>
                <div style={{ width: '40px', height: '22px', background: configTextBase ? 'var(--primary)' : 'var(--border)', borderRadius: '20px', position: 'relative', transition: '0.3s' }}>
                  <div style={{ width: '18px', height: '18px', background: '#fff', borderRadius: '50%', position: 'absolute', top: '2px', left: configTextBase ? '20px' : '2px', transition: '0.3s' }}></div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setConfigExamMode(!configExamMode)}>
                <span style={{ fontSize: '0.95rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)' }}>
                  <BookOpenCheck size={18} /> Modo Prova (Oculta)
                </span>
                <div style={{ width: '40px', height: '22px', background: configExamMode ? 'var(--primary)' : 'var(--border)', borderRadius: '20px', position: 'relative', transition: '0.3s' }}>
                  <div style={{ width: '18px', height: '18px', background: '#fff', borderRadius: '50%', position: 'absolute', top: '2px', left: configExamMode ? '20px' : '2px', transition: '0.3s' }}></div>
                </div>
              </div>

              <button 
                onClick={generateExam} 
                disabled={viewState === "loading"}
                className="btn primary" 
                style={{ width: '100%', marginTop: '25px', padding: '15px', fontSize: '1.05rem', gap: '10px' }}
              >
                <Sparkles size={20} /> Gerar Questões Lógicas
              </button>
              {error && <div style={{ color: 'var(--error-text)', fontSize: '0.85rem', marginTop: '10px', textAlign: 'center', fontWeight: 'bold' }}>{error}</div>}
            </div>

            <div className="panel" style={{ padding: '20px', background: 'var(--card-bg)' }}>
              <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '15px', textAlign: 'center' }}>Aproveitamento RLM</h3>
              <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: '15px' }}>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--success-text)', margin: 0 }}>{stats.correct}</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>Acertos</p>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--error-text)', margin: 0 }}>{stats.wrong}</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>Erros</p>
                </div>
              </div>
              <div>
                <div style={{ width: '100%', height: '8px', background: 'var(--hover-bg)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: 'var(--primary)', width: `${stats.total > 0 ? (stats.correct / stats.total) * 100 : 0}%`, transition: 'width 0.5s' }}></div>
                </div>
              </div>
            </div>
          </aside>

          <div style={{ gridColumn: 'auto / -1', minWidth: '0' }}>
            
            {viewState === "initial" && (
              <div className="panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px', textAlign: 'center', border: '1px dashed var(--border)', background: 'transparent', boxShadow: 'none' }}>
                <div style={{ width: '90px', height: '90px', background: 'var(--primary-light)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
                  <Binary size={48} color="var(--primary)" />
                </div>
                <h2 style={{ fontSize: '1.5rem', color: 'var(--heading-color)', marginBottom: '10px' }}>Raciocínio Lógico Matemático (CESPE)</h2>
                <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', marginBottom: '25px' }}>
                  Treine tabelas-verdade, negações, equivalências e probabilidade com situações hipotéticas inéditas criadas pela IA.
                </p>
                <button onClick={generateExam} className="btn primary" style={{ padding: '10px 25px' }}>Gerar Primeiro Simulado</button>
              </div>
            )}

            {viewState === "loading" && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div className="panel">
                  <div className="skeleton-box" style={{ width: '200px', height: '24px', marginBottom: '15px' }}></div>
                  <div className="skeleton-box" style={{ width: '100%', height: '16px', marginBottom: '10px' }}></div>
                  <div className="skeleton-box" style={{ width: '100%', height: '16px', marginBottom: '10px' }}></div>
                </div>
                <div className="panel" style={{ display: 'flex', gap: '15px' }}>
                  <div className="skeleton-box" style={{ width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0 }}></div>
                  <div style={{ flex: 1 }}>
                    <div className="skeleton-box" style={{ width: '100%', height: '20px', marginBottom: '10px' }}></div>
                    <div style={{ display: 'flex', gap: '15px' }}>
                      <div className="skeleton-box" style={{ width: '120px', height: '45px', borderRadius: '8px' }}></div>
                      <div className="skeleton-box" style={{ width: '120px', height: '45px', borderRadius: '8px' }}></div>
                    </div>
                  </div>
                </div>
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '20px', fontWeight: 'bold' }}>
                  <Cpu className="spin" size={20} /> {loadingMsg}
                </p>
              </div>
            )}

            {viewState === "exam" && currentData && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {configExamMode && !isExamFinished && (
                  <div style={{ background: 'var(--primary-light)', padding: '15px 20px', borderRadius: '12px', border: '1px solid var(--primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)', fontWeight: 'bold' }}>
                      <BookOpenCheck size={20} /> Modo Prova Ativado
                    </div>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Respostas ocultas. Finalize para corrigir.</span>
                  </div>
                )}

                {currentData.questoes.map((q, index) => {
                  const uAns = userAnswers[q.id];
                  const showExp = isExamFinished || (!configExamMode && uAns);
                  const isCorrect = uAns === q.gabarito;
                  
                  return (
                    <React.Fragment key={q.id}>
                      {/* RENDERIZA O TEXTO-BASE INTERCALADO (Se for a 1ª questão de um lote) */}
                      {q.textoVinculado && (
                        <div className="panel" style={{ borderLeft: '4px solid var(--primary)', position: 'relative', marginTop: index > 0 ? '30px' : '0', marginBottom: '20px' }}>
                          <div style={{ position: 'absolute', top: '-15px', left: '-15px', background: 'var(--primary)', color: 'white', width: '30px', height: '30px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-md)' }}>
                            <AlignLeft size={16} />
                          </div>
                          <h3 style={{ fontSize: '0.8rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '15px', paddingLeft: '15px' }}>Situação Hipotética</h3>
                          <div style={{ fontSize: '1.05rem', lineHeight: '1.8', color: 'var(--text-main)', fontFamily: 'serif' }}>
                            {q.textoVinculado.split('\n').filter(p => p.trim()).map((p, i) => (
                              <p key={`p_${i}`} style={{ textIndent: '2rem', marginBottom: '10px', textAlign: 'justify' }}>{p}</p>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="quiz-card-container" style={{ 
                        borderColor: showExp ? (isCorrect ? 'var(--success-text)' : 'var(--error-text)') : 'var(--border)',
                        boxShadow: showExp ? (isCorrect ? '0 0 0 1px var(--success-text)' : '0 0 0 1px var(--error-text)') : 'var(--shadow-sm)'
                      }}>
                        <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-start' }}>
                          <div style={{ background: 'var(--hover-bg)', color: 'var(--text-secondary)', fontWeight: 'bold', width: '36px', height: '36px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {index + 1}
                          </div>
                          <div style={{ flex: 1 }}>
                            <span style={{ display: 'inline-block', padding: '4px 8px', background: 'var(--hover-bg)', color: 'var(--text-secondary)', fontSize: '0.75rem', borderRadius: '4px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '12px' }}>
                              {q.assunto}
                            </span>
                            <p style={{ fontSize: '1.1rem', color: 'var(--text-main)', lineHeight: '1.6', marginBottom: '20px', fontWeight: '500' }}>
                              {q.enunciado}
                            </p>
                            
                            <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', flexDirection: q.alternativas ? 'column' : 'row' }}>
                              {q.alternativas && q.alternativas.length > 0 ? (
                                q.alternativas.map((alt, altIdx) => {
                                  const letra = alt.charAt(0).toUpperCase(); 
                                  const isCorrectAlt = q.gabarito.toUpperCase() === letra;
                                  return (
                                    <button 
                                      key={altIdx}
                                      onClick={() => handleAnswer(q.id, letra)}
                                      disabled={showExp && !configExamMode}
                                      style={{
                                        padding: '12px 15px', borderRadius: '10px', fontWeight: 'bold', fontSize: '0.95rem', cursor: (showExp && !configExamMode) ? 'default' : 'pointer', transition: 'all 0.2s', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left',
                                        border: '2px solid',
                                        borderColor: uAns === letra ? (showExp ? (isCorrectAlt ? 'var(--success-text)' : 'var(--error-text)') : 'var(--primary)') : 'var(--border)',
                                        background: uAns === letra ? (showExp ? (isCorrectAlt ? 'var(--success-bg)' : 'var(--error-bg)') : 'var(--primary-light)') : 'transparent',
                                        color: uAns === letra && !showExp ? 'var(--primary)' : (showExp && uAns === letra ? 'inherit' : 'var(--text-secondary)'),
                                        opacity: (showExp && uAns !== letra && !isCorrectAlt) ? 0.5 : 1
                                      }}
                                    >
                                      <span style={{ flex: 1 }}>{alt}</span>
                                      {showExp && isCorrectAlt && <CheckCircle size={18} color="var(--success-text)" style={{ flexShrink: 0, marginLeft: '10px' }}/>}
                                    </button>
                                  )
                                })
                              ) : (
                                <>
                                  <button 
                                    onClick={() => handleAnswer(q.id, 'C')}
                                    disabled={showExp && !configExamMode} 
                                    style={{
                                      flex: '1 1 140px', padding: '12px', borderRadius: '10px', fontWeight: 'bold', fontSize: '1rem', cursor: (showExp && !configExamMode) ? 'default' : 'pointer', transition: 'all 0.2s', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px',
                                      border: '2px solid',
                                      borderColor: uAns === 'C' ? (showExp ? (q.gabarito === 'C' ? 'var(--success-text)' : 'var(--error-text)') : 'var(--primary)') : 'var(--border)',
                                      background: uAns === 'C' ? (showExp ? (q.gabarito === 'C' ? 'var(--success-bg)' : 'var(--error-bg)') : 'var(--primary)') : 'transparent',
                                      color: uAns === 'C' && !showExp ? 'white' : (showExp && uAns === 'C' ? 'inherit' : 'var(--text-secondary)'),
                                      opacity: (showExp && uAns !== 'C' && q.gabarito !== 'C') ? 0.5 : 1
                                    }}
                                  >
                                    CERTO {showExp && q.gabarito === 'C' && <CheckCircle size={18} color="var(--success-text)"/>}
                                  </button>
                                  <button 
                                    onClick={() => handleAnswer(q.id, 'E')}
                                    disabled={showExp && !configExamMode}
                                    style={{
                                      flex: '1 1 140px', padding: '12px', borderRadius: '10px', fontWeight: 'bold', fontSize: '1rem', cursor: (showExp && !configExamMode) ? 'default' : 'pointer', transition: 'all 0.2s', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px',
                                      border: '2px solid',
                                      borderColor: uAns === 'E' ? (showExp ? (q.gabarito === 'E' ? 'var(--success-text)' : 'var(--error-text)') : 'var(--primary)') : 'var(--border)',
                                      background: uAns === 'E' ? (showExp ? (q.gabarito === 'E' ? 'var(--success-bg)' : 'var(--error-bg)') : 'var(--primary)') : 'transparent',
                                      color: uAns === 'E' && !showExp ? 'white' : (showExp && uAns === 'E' ? 'inherit' : 'var(--text-secondary)'),
                                      opacity: (showExp && uAns !== 'E' && q.gabarito !== 'E') ? 0.5 : 1
                                    }}
                                  >
                                    ERRADO {showExp && q.gabarito === 'E' && <CheckCircle size={18} color="var(--success-text)"/>}
                                  </button>
                                </>
                              )}
                            </div>

                            {showExp && (
                              <div className="quiz-explanation" style={{ marginTop: '20px', animation: 'fadeIn 0.3s ease-out' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', marginBottom: '8px', color: isCorrect ? 'var(--success-text)' : 'var(--error-text)' }}>
                                  {isCorrect ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                                  {isCorrect ? "Você acertou!" : "Você errou."} (Gabarito: {q.gabarito})
                                </div>
                                <div className="markdown-format" style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.6' }}>
                                  <ReactMarkdown>{q.explicacao}</ReactMarkdown>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}

                {configExamMode && !isExamFinished && (
                  <button onClick={finishExam} className="btn primary" style={{ padding: '15px', fontSize: '1.1rem', margin: '20px auto', display: 'block', maxWidth: '400px', width: '100%' }}>
                    Entregar Prova e Corrigir
                  </button>
                )}

                {showLessonAction && (
                  <div style={{ background: 'var(--warning-bg, #fffbeb)', border: '1px solid #fcd34d', padding: '25px', borderRadius: '12px', textAlign: 'center', margin: '20px auto', maxWidth: '500px', boxShadow: 'var(--shadow-md)' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '1.2rem' }}>
                      <GraduationCap size={24} /> Professor de RLM (IA)
                    </h4>
                    <p style={{ color: '#92400e', fontSize: '0.95rem', marginBottom: '20px' }}>Você errou {wrongCount} questão(ões) de Lógica. Quer uma explicação passo-a-passo (tabelas-verdade e fórmulas) focada no que errou?</p>
                    <button onClick={() => generateLesson(getWrongQuestions())} className="btn" style={{ background: '#f59e0b', color: 'white', border: 'none', width: '100%', padding: '12px', fontSize: '1.05rem', fontWeight: 'bold', display: 'flex', justifyContent: 'center', gap: '8px' }}>
                      <Wand2 size={20} /> Gerar Explicação Detalhada
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showConfig && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.8)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: '12px', padding: '30px', width: '100%', maxWidth: '500px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', border: '1px solid var(--border)' }}>
            <h3 style={{ marginTop: 0, color: 'var(--heading-color)', borderBottom: '1px solid var(--border)', paddingBottom: '15px', marginBottom: '15px' }}>⚙️ Configurar a Minha IA</h3>
            <div style={{ marginBottom: '20px' }}>
              {userApiKey ? (
                <div style={{ padding: '12px', borderRadius: '6px', background: 'var(--success-bg)', border: '1px solid var(--success-text)', color: 'var(--success-text)', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                  <span>✅ IA Conectada!</span>
                  <button onClick={handleDisconnectAI} disabled={savingConfig} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}>Desvincular</button>
                </div>
              ) : (
                <button onClick={handleConnectAI} className="btn primary" style={{ width: '100%' }}>🔗 Conectar IA Gratuitamente</button>
              )}
            </div>
            <div style={{ marginBottom: '25px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', color: 'var(--text-main)', marginBottom: '8px' }}>Modelo de IA (Opcional):</label>
              <input type="text" value={tempModel} onChange={(e) => setTempModel(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-main)' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px' }}>
              <button onClick={() => setShowConfig(false)} className="btn">Fechar</button>
              <button onClick={saveConfigToDB} className="btn primary">{savingConfig ? "⏳ Salvando..." : "Salvar Modelo"}</button>
            </div>
          </div>
        </div>
      )}

      {showStatsModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="panel" style={{ width: '100%', maxWidth: '500px', padding: 0, overflow: 'hidden', animation: 'fadeIn 0.2s ease-out' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg)' }}>
              <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--heading-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <PieChart size={22} color="var(--primary)" /> Histórico de Lógica
              </h2>
              <button onClick={() => setShowStatsModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={24} /></button>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'flex', gap: '15px', marginBottom: '25px' }}>
                <div style={{ flex: 1, background: 'var(--bg)', padding: '15px', borderRadius: '10px', textAlign: 'center' }}>
                  <span style={{ display: 'block', fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{stats.total}</span>
                  <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Resolvidas</span>
                </div>
                <div style={{ flex: 1, background: 'var(--success-bg)', padding: '15px', borderRadius: '10px', textAlign: 'center' }}>
                  <span style={{ display: 'block', fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--success-text)' }}>{stats.correct}</span>
                  <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Certas</span>
                </div>
                <div style={{ flex: 1, background: 'var(--error-bg)', padding: '15px', borderRadius: '10px', textAlign: 'center' }}>
                  <span style={{ display: 'block', fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--error-text)' }}>{stats.wrong}</span>
                  <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Erradas</span>
                </div>
              </div>

              <h3 style={{ fontSize: '1rem', color: 'var(--heading-color)', marginBottom: '15px' }}>Desempenho por Assunto</h3>
              <div style={{ maxHeight: '200px', overflowY: 'auto', paddingRight: '10px' }}>
                {Object.keys(stats.topics).length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Nenhum dado registrado.</p>
                ) : (
                  Object.entries(stats.topics).map(([name, data]) => {
                    const pct = (data.correct + data.wrong) > 0 ? Math.round((data.correct / (data.correct + data.wrong)) * 100) : 0;
                    return (
                      <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--text-main)', fontSize: '0.9rem', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
                        <div style={{ display: 'flex', gap: '15px', fontSize: '0.9rem' }}>
                          <span style={{ color: 'var(--success-text)', fontWeight: 'bold' }}>{data.correct}C</span>
                          <span style={{ color: 'var(--error-text)', fontWeight: 'bold' }}>{data.wrong}E</span>
                          <span style={{ color: pct >= 70 ? 'var(--success-text)' : pct < 50 ? 'var(--error-text)' : '#f59e0b', fontWeight: '900', width: '40px', textAlign: 'right' }}>{pct}%</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <button onClick={resetStats} style={{ width: '100%', marginTop: '20px', background: 'var(--error-bg)', color: 'var(--error-text)', border: '1px solid var(--error-text)', padding: '10px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                Zerar Histórico
              </button>
            </div>
          </div>
        </div>
      )}

      {showLessonModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="panel" style={{ width: '100%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', animation: 'fadeIn 0.2s ease-out', border: '2px solid #f59e0b' }}>
            <div style={{ background: '#f59e0b', color: 'white', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <GraduationCap size={24} /> Resolução Passo-a-Passo
              </h2>
              <button onClick={() => setShowLessonModal(false)} style={{ background: 'none', border: 'none', color: '#fef3c7', cursor: 'pointer' }}><X size={24} /></button>
            </div>
            <div style={{ padding: '30px', overflowY: 'auto', flex: 1, background: 'var(--card-bg)' }}>
              <div className="markdown-format" style={{ fontSize: '1.05rem', lineHeight: '1.7', color: 'var(--text-main)' }}>
                <ReactMarkdown>{lessonContent}</ReactMarkdown>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}