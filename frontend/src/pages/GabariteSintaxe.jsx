import React, { useState, useEffect } from "react";
import { 
  Settings, BookOpen, Cpu, CheckCircle, AlertCircle, 
  ArrowLeft, FileText, AlertTriangle, ShieldAlert,
  BarChart2, PieChart, BookOpenCheck, SlidersHorizontal, X,
  GraduationCap, Wand2
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { aulasData } from "../data/sintaxeData";

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
// FUNÇÃO ANTI-ERRO (Limpeza agressiva de IA)
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
    let cleanText = rawText.replace(/<think>[\s\S]*?<\/think>/gi, "").trim(); 
    const jsonMatch = cleanText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) cleanText = jsonMatch[0];
    cleanText = cleanText.replace(/[\n\r\t]+/g, ' ').replace(/,\s*([\]}])/g, '$1');
    
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("TEXTO COM ERRO DA IA:", rawText);
    throw new Error("A IA gerou um formato inválido.");
  }
};

export default function GabariteSintaxe() {
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  // --- ESTADOS DA CONFIGURAÇÃO DA IA ---
  const [showConfig, setShowConfig] = useState(false);
  const [providerTab, setProviderTab] = useState("openrouter"); // Novo estado para abas
  const [tempModel, setTempModel] = useState("");
  const [tempApiKey, setTempApiKey] = useState(""); // Novo estado para chave manual
  const [userApiKey, setUserApiKey] = useState("");
  const [userModel, setUserModel] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);

  // --- ESTADOS DA APLICAÇÃO ---
  const [viewState, setViewState] = useState("topics");
  const [currentTopic, setCurrentTopic] = useState(null);
  const [currentQuestions, setCurrentQuestions] = useState([]);
  const [userAnswers, setUserAnswers] = useState({});
  const [loadingMsg, setLoadingMsg] = useState("");
  const [isExamFinished, setIsExamFinished] = useState(false);

  // --- ESTADOS DE AULA GERADA SOBRE ERROS ---
  const [showLessonModal, setShowLessonModal] = useState(false);
  const [lessonContent, setLessonContent] = useState("");

  // --- ESTADOS DE CONFIGURAÇÃO DO SIMULADO ---
  const [configFormato, setConfigFormato] = useState("Certo/Errado");
  const [configExamMode, setConfigExamMode] = useState(false);
  const [configAmount, setConfigAmount] = useState(10);
  
  // --- ESTADOS DE ESTATÍSTICAS ---
  const [stats, setStats] = useState({ total: 0, correct: 0, wrong: 0, topics: {} });
  const [showStatsModal, setShowStatsModal] = useState(false);

  useEffect(() => {
    fetchUserSettings();
    const savedStats = localStorage.getItem('cespe_sintaxe_stats');
    if (savedStats) {
      try { setStats(JSON.parse(savedStats)); } catch (e) { console.error(e); }
    }
  }, []);

  const saveStats = (newStats) => {
    setStats(newStats);
    localStorage.setItem('cespe_sintaxe_stats', JSON.stringify(newStats));
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
    // Agora verificamos se NÃO é OpenRouter
    const isAIStudio = userApiKey && !userApiKey.startsWith("sk-or-");
    setProviderTab(isAIStudio ? "aistudio" : "openrouter");
    setTempApiKey(userApiKey || "");
    setTempModel(userModel || (isAIStudio ? "gemini-2.5-flash" : "google/gemini-2.5-flash"));
    setShowConfig(true);
  };

  const saveConfigToDB = async () => {
    setSavingConfig(true);
    try {
      const token = getAuthToken();
      if (!token) { 
        alert("Sessão expirada. Faça login."); 
        return; 
      }

      // Lógica da Opção 1: Se for AI Studio, captura o que o usuário digitou no input.
      // Se for OpenRouter, mantém a chave que já veio do OAuth.
      const keyToSave = providerTab === "aistudio" ? tempApiKey.trim() : userApiKey;

      const res = await fetch(`${API_URL}/users/me/settings`, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json", 
          "Authorization": `Bearer ${token}` 
        },
        body: JSON.stringify({ 
          api_key: keyToSave, 
          preferred_model: tempModel.trim() 
        })
      });
      
      if (res.ok) {
        setUserModel(tempModel.trim());
        setUserApiKey(keyToSave);
        setShowConfig(false);
      } else { 
        alert("Erro ao guardar no servidor."); 
      }
    } catch (err) { 
      alert("Falha de conexão."); 
    } finally { 
      setSavingConfig(false); 
    }
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
      if (res.ok) {
        setUserApiKey("");
        setTempApiKey("");
      }
      else alert("Erro ao desvincular no servidor."); 
    } catch (err) { alert("Falha de conexão."); } finally { setSavingConfig(false); }
  };

  const selectTopic = (topicId) => {
    const topic = aulasData.find(a => a.id === topicId);
    setCurrentTopic(topic);
    setViewState("lesson");
    window.scrollTo(0, 0);
  };

  const generateQuiz = async () => {
    if (!userApiKey) {
      alert("Por favor, configure sua Chave API do OpenRouter ou AI Studio nas configurações para gerar questões.");
      openConfigModal();
      return;
    }

    setViewState("loading");

    try {
      const token = getAuthToken();
      let todasQuestoes = [];
      
      const batchSize = 5; 
      const batches = Math.ceil(configAmount / batchSize);

      for (let i = 0; i < batches; i++) {
        setLoadingMsg(`A formular questões inéditas... (Lote ${i + 1} de ${batches})`);
        const currentBatchSize = Math.min(batchSize, configAmount - (i * batchSize));

        const regrasDaAula = `
          Definição: ${currentTopic.def} | 
          Como cai no CESPE: ${currentTopic.cespeTip} | 
          Pegadinhas: ${currentTopic.trap}
        `.replace(/[\n\r]+/g, " ");

        const payload = {
          subject: "Língua Portuguesa",
          focus: `Sintaxe: ${currentTopic.title}. ATENÇÃO EXAMINADOR: É OBRIGATÓRIO basear o cenário das questões, os gabaritos e os distratores ESTRITAMENTE nas seguintes regras, dicas e pegadinhas desta aula: ${regrasDaAula}`, 
          difficulty: "dificil", 
          amount: currentBatchSize,
          generate_text: false,
          formato: configFormato,
          model: userModel || "arcee-ai/trinity-large-thinking:free",
          api_key: userApiKey || null
        };

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
              break; 
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

        const questoesCorrigidas = data.questoes.map((q, idx) => ({
          ...q,
          id: `q_sintaxe_${i}_${idx}`
        }));

        todasQuestoes = [...todasQuestoes, ...questoesCorrigidas];
      }

      setCurrentQuestions(todasQuestoes);
      setUserAnswers({});
      setIsExamFinished(false);
      setViewState("quiz");
      window.scrollTo(0, 0);

    } catch (err) {
      console.error(err);
      alert(err.message || "Falha ao comunicar com a IA. Tente novamente.");
      setViewState("lesson");
    }
  };

  const handleAnswerSelect = (qId, answer) => {
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
    const q = currentQuestions.find(x => x.id === qId);
    const isCorrect = answer === q.gabarito;
    
    let newStats = { ...stats };
    newStats.total++;
    if (isCorrect) newStats.correct++; else newStats.wrong++;

    if (!newStats.topics[currentTopic.title]) newStats.topics[currentTopic.title] = { correct: 0, wrong: 0 };
    if (isCorrect) newStats.topics[currentTopic.title].correct++; 
    else newStats.topics[currentTopic.title].wrong++;

    saveStats(newStats);
  };

  const submitQuiz = () => {
    if (isExamFinished) return;
    
    if (configExamMode && Object.keys(userAnswers).length < currentQuestions.length) {
      if (!window.confirm("Ainda há questões em branco. Deseja entregar a prova mesmo assim?")) return;
    }

    setIsExamFinished(true);

    if (configExamMode) {
      let newStats = { ...stats };
      currentQuestions.forEach(q => {
        const ans = userAnswers[q.id];
        if (ans) {
          newStats.total++;
          if (ans === q.gabarito) newStats.correct++; else newStats.wrong++;
          
          if (!newStats.topics[currentTopic.title]) newStats.topics[currentTopic.title] = { correct: 0, wrong: 0 };
          if (ans === q.gabarito) newStats.topics[currentTopic.title].correct++;
          else newStats.topics[currentTopic.title].wrong++;
        }
      });
      saveStats(newStats);
    }

    setViewState("results");
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getWrongQuestions = () => {
    if (!currentQuestions) return [];
    return currentQuestions.filter(q => {
      const ans = userAnswers[q.id];
      return ans && ans !== q.gabarito;
    });
  };

  const generateLesson = async (wrongQuestions) => {
    setViewState("loading");
    setLoadingMsg("O Professor IA está montando uma revisão focada nos seus erros...");

    try {
      const token = getAuthToken();
      const data = await fetchStreamAsJson(`${API_URL}/generate-lesson-cespe`, {
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

      setLessonContent(data.lesson_markdown || data.text || "Conteúdo não disponível.");
      setViewState("results"); 
      setShowLessonModal(true);

    } catch (err) {
      console.error(err);
      alert("Falha ao gerar a aula. Verifique a conexão com a IA.");
      setViewState("results");
    }
  };

  const wrongCount = getWrongQuestions().length;
  const showLessonAction = (isExamFinished || (!configExamMode && Object.keys(userAnswers).length === currentQuestions?.length)) && wrongCount > 0;

  return (
    <div className="container">
      {/* HEADER PRINCIPAL */}
      <header className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ color: 'var(--heading-color)', margin: '0 0 5px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileText size={32} color="var(--primary)" /> Sintaxe para Concursos <span style={{ color: 'var(--primary)' }}>CESPE</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Aprenda profundamente e pratique no padrão CESPE/Cebraspe.</p>
        </div>
        <button onClick={() => setShowStatsModal(true)} className="btn" style={{ fontWeight: 'bold' }}>
          <BarChart2 size={20} /> O meu Desempenho
        </button>
      </header>

      {/* BARRA DE CONFIGURAÇÃO DE IA */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--card-bg)', padding: '15px 20px', borderRadius: '12px', marginBottom: '20px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
          <strong>IA Geradora:</strong> {userApiKey ? <span style={{color: 'var(--success-text)'}}>Chave Ativa ({userModel || "Padrão"})</span> : <span>Configure a sua IA gratuitamente para geração contínua.</span>}
        </div>
        <button onClick={openConfigModal} style={{ background: 'var(--primary)', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '0.95rem', cursor: 'pointer', fontWeight: 'bold', transition: 'background 0.2s' }}>
          ⚙️ Configurar a Minha IA
        </button>
      </div>

      {/* VIEW: GRID DE TÓPICOS */}
      {viewState === "topics" && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {aulasData.map(aula => (
            <div 
              key={aula.id}
              onClick={() => selectTopic(aula.id)}
              className="panel"
              style={{ cursor: 'pointer', borderLeft: '5px solid var(--primary)', transition: 'transform 0.2s, box-shadow 0.2s' }}
              onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
              onMouseOut={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}
            >
              <h2 style={{ fontSize: '1.3rem', color: 'var(--primary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <BookOpen size={20} /> {aula.title}
              </h2>
              <p style={{ color: 'var(--text-secondary)' }}>{aula.descricao}</p>
            </div>
          ))}
        </div>
      )}

      {/* VIEW: AULA INDIVIDUAL */}
      {viewState === "lesson" && currentTopic && (
        <div className="panel" style={{ padding: '2.5rem' }}>
          <button 
            onClick={() => setViewState("topics")}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '1rem', cursor: 'pointer', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold' }}
          >
            <ArrowLeft size={18} /> Voltar para as aulas
          </button>
          
          <div style={{ marginBottom: '2rem', borderBottom: '2px solid var(--border)', paddingBottom: '1rem' }}>
            <h2 style={{ fontSize: '2rem', color: 'var(--primary)', margin: 0 }}>{currentTopic.title}</h2>
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ color: 'var(--heading-color)', fontSize: '1.3rem', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>💡 1. O que é? (Definição Simples)</h3>
            <div style={{ color: 'var(--text-main)', lineHeight: '1.6' }}><ReactMarkdown>{currentTopic.def}</ReactMarkdown></div>
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ color: 'var(--heading-color)', fontSize: '1.3rem', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>🔍 2. Análise Profunda</h3>
            <div style={{ color: 'var(--text-main)', lineHeight: '1.6' }}><ReactMarkdown>{currentTopic.deep}</ReactMarkdown></div>
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ color: 'var(--heading-color)', fontSize: '1.3rem', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>📝 3. Exemplos Comentados</h3>
            {currentTopic.examples.map((ex, i) => (
              <div key={i} style={{ background: 'var(--hover-bg)', borderLeft: '4px solid var(--text-secondary)', padding: '1rem', marginBottom: '1rem', borderRadius: '0 8px 8px 0', color: 'var(--text-main)' }}>
                <ReactMarkdown>{ex}</ReactMarkdown>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ color: 'var(--heading-color)', fontSize: '1.3rem', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>🎯 4. Como cai no CESPE/Cebraspe</h3>
            <div style={{ background: 'var(--primary-light)', border: '1px solid var(--primary)', padding: '1.5rem', borderRadius: '8px', color: 'var(--text-main)' }}>
              <strong>Dica de Prova:</strong> <ReactMarkdown>{currentTopic.cespeTip}</ReactMarkdown>
            </div>
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ color: 'var(--heading-color)', fontSize: '1.3rem', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>⚠️ 5. Pegadinhas Comuns</h3>
            <div style={{ background: 'var(--error-bg)', border: '1px solid var(--error-border, #fecaca)', padding: '1.5rem', borderRadius: '8px', color: 'var(--error-text)' }}>
              <strong>Alerta:</strong> <ReactMarkdown>{currentTopic.trap}</ReactMarkdown>
            </div>
          </div>

          {/* PAINEL DE CONFIGURAÇÃO DE QUESTÕES */}
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem', marginTop: '2rem' }}>
             <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--heading-color)' }}>
                <SlidersHorizontal size={20} color="var(--primary)" /> Configurar Simulado
             </h3>
             <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
                <div style={{ flex: '1 1 200px' }}>
                   <label className="label">Formato</label>
                   <select className="select" value={configFormato} onChange={e => setConfigFormato(e.target.value)} style={{ width: '100%', padding: '10px' }}>
                     <option value="Certo/Errado">Certo / Errado</option>
                     <option value="Múltipla Escolha">Múltipla Escolha</option>
                   </select>
                </div>
                <div style={{ flex: '1 1 200px' }}>
                   <label className="label">Quantidade</label>
                   <select className="select" value={configAmount} onChange={e => setConfigAmount(Number(e.target.value))} style={{ width: '100%', padding: '10px' }}>
                     <option value={5}>5 Questões</option>
                     <option value={10}>10 Questões</option>
                     <option value={15}>15 Questões</option>
                   </select>
                </div>
                <div style={{ flex: '1 1 200px', display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => setConfigExamMode(!configExamMode)}>
                   <div style={{ flex: 1 }}>
                     <span style={{ fontSize: '0.95rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)' }}>
                       <BookOpenCheck size={18} /> Modo Prova
                     </span>
                     <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Oculta respostas até o fim</span>
                   </div>
                   <div style={{ width: '40px', height: '22px', background: configExamMode ? 'var(--primary)' : 'var(--border)', borderRadius: '20px', position: 'relative', transition: '0.3s' }}>
                     <div style={{ width: '18px', height: '18px', background: '#fff', borderRadius: '50%', position: 'absolute', top: '2px', left: configExamMode ? '20px' : '2px', transition: '0.3s' }}></div>
                   </div>
                </div>
             </div>
             
             <button onClick={generateQuiz} className="btn primary" style={{ width: '100%', padding: '1rem', fontSize: '1.1rem', marginTop: '20px' }}>
               👉 Gerar questões deste tópico com IA
             </button>
          </div>
        </div>
      )}

      {/* VIEW: LOADING */}
      {viewState === "loading" && (
        <div className="panel" style={{ textAlign: 'center', padding: '3rem' }}>
          <Cpu className="spin" size={48} color="var(--primary)" style={{ margin: '0 auto 20px auto' }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', fontWeight: 'bold' }}>{loadingMsg}</p>
        </div>
      )}

      {/* VIEW: QUIZ & RESULTADOS */}
      {(viewState === "quiz" || viewState === "results") && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {viewState === "results" && (
            <div style={{ background: 'var(--primary)', color: 'white', padding: '2rem', borderRadius: '12px', textAlign: 'center', boxShadow: 'var(--shadow-md)' }}>
              <h3 style={{ fontSize: '2rem', margin: '0 0 10px 0' }}>Prova Finalizada!</h3>
              <p style={{ fontSize: '1.1rem', margin: 0, opacity: 0.9 }}>Revise as explicações abaixo para consolidar seu aprendizado.</p>
              <button onClick={() => setViewState("topics")} style={{ marginTop: '1.5rem', background: 'white', color: 'var(--primary)', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                Voltar para as Aulas
              </button>
            </div>
          )}

          {configExamMode && !isExamFinished && (
            <div style={{ background: 'var(--primary-light)', padding: '15px 20px', borderRadius: '12px', border: '1px solid var(--primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)', fontWeight: 'bold' }}>
                <BookOpenCheck size={20} /> Modo Prova Ativado
              </div>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Respostas ocultas. Finalize para corrigir.</span>
            </div>
          )}

          {currentQuestions.map((q, index) => {
            const uAns = userAnswers[q.id];
            const showExp = isExamFinished || (!configExamMode && uAns);
            const isCorrect = uAns === q.gabarito;

            return (
              <div key={q.id} className="panel" style={{ 
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
                              onClick={() => handleAnswerSelect(q.id, letra)}
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
                            onClick={() => handleAnswerSelect(q.id, 'C')}
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
                            onClick={() => handleAnswerSelect(q.id, 'E')}
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
            );
          })}

          {!isExamFinished && (
            <button onClick={submitQuiz} className="btn primary" style={{ padding: '15px', fontSize: '1.1rem', margin: '20px auto', display: 'block', maxWidth: '400px', width: '100%', gap: '10px' }}>
              <CheckCircle size={20} /> {configExamMode ? "Entregar Prova e Corrigir" : "Finalizar e Ver Pontuação"}
            </button>
          )}

          {/* GERADOR DE AULA SOBRE OS ERROS */}
          {showLessonAction && (
            <div style={{ background: 'var(--warning-bg, #fffbeb)', border: '1px solid #fcd34d', padding: '25px', borderRadius: '12px', textAlign: 'center', margin: '20px auto', maxWidth: '500px', boxShadow: 'var(--shadow-md)' }}>
              <h4 style={{ margin: '0 0 10px 0', color: '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '1.2rem' }}>
                <GraduationCap size={24} /> Professor de Sintaxe (IA)
              </h4>
              <p style={{ color: '#92400e', fontSize: '0.95rem', marginBottom: '20px' }}>
                Você errou {wrongCount} questão(ões) de Sintaxe. Quer uma revisão detalhada com dicas para não cair nessas pegadinhas de novo?
              </p>
              <button onClick={() => generateLesson(getWrongQuestions())} className="btn" style={{ background: '#f59e0b', color: 'white', border: 'none', width: '100%', padding: '12px', fontSize: '1.05rem', fontWeight: 'bold', display: 'flex', justifyContent: 'center', gap: '8px' }}>
                <Wand2 size={20} /> Gerar Explicação Detalhada
              </button>
            </div>
          )}
        </div>
      )}

      {/* MODAL DA AULA DE REVISÃO DA IA */}
      {showLessonModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="panel" style={{ width: '100%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', animation: 'fadeIn 0.2s ease-out', border: '2px solid #f59e0b' }}>
            <div style={{ background: '#f59e0b', color: 'white', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <GraduationCap size={24} /> Revisão Passo-a-Passo
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

      {/* MODAL DE CONFIGURAÇÃO DE IA COM ABAS (OPENROUTER / AISTUDIO) */}
      {showConfig && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.8)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: '12px', padding: '30px', width: '100%', maxWidth: '500px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', border: '1px solid var(--border)' }}>
            <h3 style={{ marginTop: 0, color: 'var(--heading-color)', borderBottom: '1px solid var(--border)', paddingBottom: '15px', marginBottom: '15px' }}>⚙️ Configurar a Minha IA</h3>
            
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <button
                onClick={() => {
                  setProviderTab("openrouter");
                  setTempModel("google/gemini-2.5-flash");
                }}
                className={`btn ${providerTab === "openrouter" ? "primary" : ""}`}
                style={{ flex: 1, padding: '10px', fontSize: '0.9rem' }}
              >
                OpenRouter
              </button>
              <button
                onClick={() => {
                  setProviderTab("aistudio");
                  setTempModel("gemini-2.5-flash");
                }}
                className={`btn ${providerTab === "aistudio" ? "primary" : ""}`}
                style={{ flex: 1, padding: '10px', fontSize: '0.9rem' }}
              >
                Google AI Studio
              </button>
            </div>

            {providerTab === "openrouter" && (
              <div style={{ marginBottom: '20px' }}>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '15px' }}>
                  Conecte sua conta OpenRouter para acesso a dezenas de modelos de IA. O login é automático.
                </p>
                {userApiKey && userApiKey.startsWith("sk-or-") ? (
                  <div style={{ padding: '12px', borderRadius: '6px', background: 'var(--success-bg)', border: '1px solid var(--success-text)', color: 'var(--success-text)', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <span>✅ OpenRouter Conectado!</span>
                    <button onClick={handleDisconnectAI} disabled={savingConfig} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}>Desvincular</button>
                  </div>
                ) : (
                  <button onClick={handleConnectAI} className="btn primary" style={{ width: '100%' }}>🔗 Conectar OpenRouter</button>
                )}
              </div>
            )}

            {providerTab === "aistudio" && (
              <div style={{ marginBottom: '20px' }}>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '15px', lineHeight: '1.4' }}>
                  O Google AI Studio exige a geração manual da chave de acesso utilizando o seu Gmail. Siga os passos:
                </p>
                
                {/* PASSO 1: Link direto para a criação da chave no Google */}
                <a 
                  href="https://aistudio.google.com/app/apikey" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="btn" 
                  style={{ width: '100%', marginBottom: '15px', display: 'block', textAlign: 'center', background: '#e2e8f0', color: '#1e293b', textDecoration: 'none', fontWeight: 'bold' }}
                >
                  1️⃣ Obter Chave no AI Studio (Grátis)
                </a>
                
                <label style={{ display: 'block', fontWeight: 'bold', color: 'var(--text-main)', marginBottom: '8px' }}>
                  2️⃣ Cole a Chave Gerada:
                </label>
                
                {/* PASSO 2: Input manual da chave */}
                <input
                  type="password"
                  value={tempApiKey}
                  onChange={(e) => setTempApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-main)' }}
                />
                
                {/* Feedback visual de sucesso */}
                {userApiKey && !userApiKey.startsWith("sk-or-") && tempApiKey === userApiKey && (
                  <div style={{ marginTop: '10px', fontSize: '0.85rem', color: 'var(--success-text)', fontWeight: 'bold' }}>
                    ✅ Chave AI Studio salva no sistema!
                  </div>
                )}
              </div>
            )}

            <div style={{ marginBottom: '25px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', color: 'var(--text-main)', marginBottom: '8px' }}>Modelo de IA:</label>
              <input type="text" value={tempModel} onChange={(e) => setTempModel(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-main)' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px' }}>
              <button onClick={() => setShowConfig(false)} className="btn">Fechar</button>
              <button onClick={saveConfigToDB} className="btn primary">{savingConfig ? "⏳ Salvando..." : "Salvar Configurações"}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE ESTATÍSTICAS */}
      {showStatsModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="panel" style={{ width: '100%', maxWidth: '500px', padding: 0, overflow: 'hidden', animation: 'fadeIn 0.2s ease-out' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg)' }}>
              <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--heading-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <PieChart size={22} color="var(--primary)" /> Meu Histórico de Sintaxe
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
              <button onClick={() => {
                if(window.confirm("Apagar todo o histórico de Sintaxe?")) {
                  saveStats({ total: 0, correct: 0, wrong: 0, topics: {} });
                }
              }} style={{ width: '100%', marginTop: '20px', background: 'var(--error-bg)', color: 'var(--error-text)', border: '1px solid var(--error-text)', padding: '10px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                Zerar Histórico
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER DE CRÉDITO DO DESENVOLVEDOR (Atualizado com sua diretiva) */}
      <div style={{ textAlign: 'center', marginTop: '3rem', paddingBottom: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        Foco na aprovação! Desenvolvido por Jacielliton Palmeira Gonçalves (SD Palmeira)
      </div>
    </div>
  );
}