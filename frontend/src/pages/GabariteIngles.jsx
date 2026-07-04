import React, { useState, useEffect, useRef } from "react";
import { 
  Calculator, BarChart2, SlidersHorizontal, FileText, BookOpenCheck, 
  Sparkles, Bot, Cpu, AlignLeft, GraduationCap, Wand2, PieChart, 
  X, CheckCircle, AlertCircle, Binary, Type, Wrench
} from "lucide-react";
import ReactMarkdown from "react-markdown";

// Dados teóricos integrados para Língua Inglesa
const conteudosTeoricosIngles = {
  completo: `
# Língua Inglesa - CESPE
A banca CESPE foca muito mais na **compreensão textual** e **aplicação gramatical** dentro do contexto do que em regras gramaticais isoladas. 

**Dicas Gerais:**
1. Leia sempre o título e a fonte do texto para entender o contexto.
2. Não tente traduzir palavra por palavra; foque no sentido geral da frase.
3. Fique atento aos cognatos e falsos cognatos (false friends).
4. As questões gramaticais geralmente envolvem coesão (pronomes) e coerência (conjunções).
  `,
  compreensao: `
# Compreensão de Textos
O CESPE utiliza textos autênticos.

**Estratégias de Leitura:**
- **Skimming:** Leitura rápida para pegar a ideia principal.
- **Scanning:** Busca por informações específicas sem ler tudo.
- **Inferência:** Muitas vezes a resposta não está explícita.
  `,
  vocabulario: `
# Itens Gramaticais e Vocabulário
A gramática é cobrada como ferramenta para a compreensão.

**Tópicos Frequentes:**
- **Sinônimos e Antônimos:** A questão afirma que a palavra X pode ser substituída por Y.
- **Tempos Verbais e Voz Passiva:** Reescrita mantendo o sentido original.
- **Verbos Modais:** Alteram drasticamente o sentido da frase.
  `,
  coesao: `
# Coesão e Referência Pronominal
Um dos temas favoritos do CESPE.

**O que costuma cair:**
- **Referência Pronominal:** A questão destaca um pronome no texto e afirma que ele se refere a uma palavra anterior.
- **Conectivos (Linking Words):** Contraste (but, however), Adição (and, moreover), Causa/Efeito (because, therefore), Condição (if, unless).
  `
};

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
    let cleanText = rawText.replace(/<think>[\s\S]*?<\/think>/gi, "").trim(); 
    const jsonMatch = cleanText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) cleanText = jsonMatch[0];
    cleanText = cleanText.replace(/[\n\r\t]+/g, ' ');
    cleanText = cleanText.replace(/,\s*([\]}])/g, '$1');
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("TEXTO COM ERRO DA IA:", rawText);
    throw new Error("A IA gerou um formato inválido.");
  }
};

// ==========================================

export default function GabariteIngles() {
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  // --- ESTADOS DA CONFIGURAÇÃO DA IA ---
  const [showConfig, setShowConfig] = useState(false);
  const [providerTab, setProviderTab] = useState("openrouter");
  const [tempModel, setTempModel] = useState("");
  const [tempApiKey, setTempApiKey] = useState("");
  const [userApiKey, setUserApiKey] = useState("");
  const [userModel, setUserModel] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);

  // --- ESTADOS DO SIMULADOR ---
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

  const handleShowTheory = () => {
    setLessonContent(conteudosTeoricosIngles[configFocus] || conteudosTeoricosIngles.completo);
    setShowLessonModal(true);
  };

  useEffect(() => {
    fetchUserSettings();
    const savedStats = localStorage.getItem('cespe_ingles_stats');
    if (savedStats) {
      try { setStats(JSON.parse(savedStats)); } catch (e) { console.error(e); }
    }
  }, []);

  const saveStats = (newStats) => {
    setStats(newStats);
    localStorage.setItem('cespe_ingles_stats', JSON.stringify(newStats));
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
      if (!token) { alert("Sessão expirada. Faça login."); return; }

      const keyToSave = providerTab === "aistudio" ? tempApiKey.trim() : userApiKey;

      const res = await fetch(`${API_URL}/users/me/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ api_key: keyToSave, preferred_model: tempModel.trim() })
      });
      
      if (res.ok) {
        setUserModel(tempModel.trim());
        setUserApiKey(keyToSave);
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
      if (res.ok) {
        setUserApiKey("");
        setTempApiKey("");
      }
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
        setLoadingMsg(`A formular textos e questões inéditas... (Lote ${i + 1} de ${batches})`);
        const currentBatchSize = Math.min(batchSize, configAmount - (i * batchSize));

        const payload = {
          subject: "Língua Inglesa", 
          focus: configFocus,
          difficulty: configDifficulty,
          amount: currentBatchSize,
          generate_text: configTextBase, // Crucial para Língua Inglesa (textos)
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
          id: `q_prova_${i}_${idx}`,
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
    setLoadingMsg("O Professor IA está montando a análise textual e traduções para os seus erros...");

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

  // Corrigido problema de Mutação de Estado (deep copy de topics)
  const processSingleAnswer = (qId, answer) => {
    const q = currentData.questoes.find(x => x.id === qId);
    const isCorrect = answer === q.gabarito;
    
    let newStats = { 
      ...stats,
      topics: { ...stats.topics }
    };
    
    newStats.total++;
    if (isCorrect) newStats.correct++; else newStats.wrong++;

    if (!newStats.topics[q.assunto]) {
      newStats.topics[q.assunto] = { correct: 0, wrong: 0 };
    } else {
      newStats.topics[q.assunto] = { ...newStats.topics[q.assunto] };
    }

    if (isCorrect) newStats.topics[q.assunto].correct++; 
    else newStats.topics[q.assunto].wrong++;

    saveStats(newStats);
  };

  // Corrigido problema de Mutação de Estado no fechamento da prova
  const finishExam = () => {
    if (isExamFinished) return;
    setIsExamFinished(true);

    let newStats = { 
      ...stats,
      topics: { ...stats.topics }
    };
    let right = 0, wrong = 0;

    currentData.questoes.forEach(q => {
      const ans = userAnswers[q.id];
      if (ans) {
        newStats.total++;
        if (ans === q.gabarito) { right++; newStats.correct++; } 
        else { wrong++; newStats.wrong++; }
        
        if (!newStats.topics[q.assunto]) {
          newStats.topics[q.assunto] = { correct: 0, wrong: 0 };
        } else {
          newStats.topics[q.assunto] = { ...newStats.topics[q.assunto] };
        }

        if (ans === q.gabarito) newStats.topics[q.assunto].correct++;
        else newStats.topics[q.assunto].wrong++;
      }
    });

    saveStats(newStats);
    alert(`Simulado de Inglês finalizado! Pontuação líquida CESPE: ${right - wrong}`);
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
    if(window.confirm("Apagar todo o histórico de Língua Inglesa?")) {
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
            <Type size={32} color="var(--primary)" /> Gabarite Inglês <span style={{ color: 'var(--primary)' }}>CESPE</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Treino de Compreensão Textual e Gramática focadas no edital.</p>
        </div>
        <button onClick={() => setShowStatsModal(true)} className="btn" style={{ fontWeight: 'bold' }}>
          <BarChart2 size={20} /> O meu Desempenho
        </button>
      </header>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--card-bg)', padding: '15px 20px', borderRadius: '12px', marginBottom: '20px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
          Modelo Atual: <strong style={{ color: 'var(--primary)' }}>{userModel || "arcee-ai/trinity-large-thinking:free"}</strong>
        </div>
        <button onClick={openConfigModal} className="btn outline" style={{ padding: '8px 12px', fontSize: '0.85rem' }}>
          <SlidersHorizontal size={16} /> Configurar IA
        </button>
      </div>

      {viewState === "initial" && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          <div className="panel" style={{ padding: '25px', background: 'var(--card-bg)' }}>
            <h2 style={{ fontSize: '1.1rem', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={20} color="var(--primary)" /> Novo Simulado
            </h2>

            <div style={{ marginBottom: '15px' }}>
              <label className="label">Foco de Estudo</label>
              <select className="select" value={configFocus} onChange={e => setConfigFocus(e.target.value)}>
                <option value="completo">Completo (Todos os assuntos)</option>
                <option value="compreensao">Compreensão de Textos (Skimming/Scanning)</option>
                <option value="vocabulario">Itens Gramaticais e Vocabulário</option>
                <option value="coesao">Coesão e Referência Pronominal</option>
              </select>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label className="label">Dificuldade</label>
              <select className="select" value={configDifficulty} onChange={e => setConfigDifficulty(e.target.value)}>
                <option value="medio">Média (Textos Curtos e Diretos)</option>
                <option value="facil">Fácil</option>
                <option value="dificil">Difícil (Artigos Acadêmicos, Vocabulário Denso)</option>
                <option value="avancado">Avançado (Textos complexos com ambiguidades)</option>
              </select>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label className="label">Formato da Questão</label>
              <select className="select" value={configFormato} onChange={e => setConfigFormato(e.target.value)}>
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
                    style={{ flex: 1, padding: '8px 0', borderRadius: '8px', fontWeight: 'bold', 
                             border: configAmount === val ? '2px solid var(--primary)' : '1px solid var(--border)',
                             background: configAmount === val ? 'var(--primary-light)' : 'transparent',
                             color: configAmount === val ? 'var(--primary)' : 'var(--text-secondary)' }}
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '25px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input type="checkbox" id="textMode" checked={configTextBase} onChange={e => setConfigTextBase(e.target.checked)} style={{ width: '18px', height: '18px', accentColor: 'var(--primary)' }} />
              <label htmlFor="textMode" style={{ fontSize: '0.95rem', color: 'var(--text-main)', cursor: 'pointer', margin: 0 }}>
                Incluir texto base (Sempre recomendado em Inglês)
              </label>
            </div>

            <div style={{ marginBottom: '25px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input type="checkbox" id="examMode" checked={configExamMode} onChange={e => setConfigExamMode(e.target.checked)} style={{ width: '18px', height: '18px', accentColor: 'var(--primary)' }} />
              <label htmlFor="examMode" style={{ fontSize: '0.95rem', color: 'var(--text-main)', cursor: 'pointer', margin: 0 }}>
                Modo Prova (Respostas ocultas até o fim)
              </label>
            </div>

            <button onClick={generateExam} className="btn primary" style={{ width: '100%', padding: '15px', fontSize: '1.05rem' }}>
              <Sparkles size={20} /> Gerar Simulado com IA
            </button>
            <button onClick={handleShowTheory} className="btn" style={{ width: '100%', padding: '12px', marginTop: '10px', fontSize: '0.95rem' }}>
              <BookOpenCheck size={18} /> Resumo Teórico do Foco
            </button>
            
            {error && <div style={{ color: 'var(--error-text)', background: 'var(--error-bg)', padding: '12px', borderRadius: '8px', marginTop: '15px', textAlign: 'center', fontWeight: 'bold' }}>{error}</div>}
          </div>

          <div className="panel" style={{ padding: '20px', background: 'var(--card-bg)' }}>
            <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '15px', textAlign: 'center' }}>Aproveitamento Inglês</h3>
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
              <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
                {stats.total > 0 ? `${Math.round((stats.correct / stats.total) * 100)}% de precisão` : 'Nenhum simulado feito'}
              </p>
            </div>
          </div>
        </div>
      )}

      {viewState === "loading" && (
        <div className="panel" style={{ textAlign: 'center', padding: '50px 20px' }}>
          <Bot size={48} color="var(--primary)" className="bounce" style={{ margin: '0 auto 20px auto' }} />
          <h2 style={{ color: 'var(--text-main)', marginBottom: '10px' }}>Processando Inteligência Artificial</h2>
          <p style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '20px', fontWeight: 'bold' }}>
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
                {q.textoVinculado && (
                  <div className="panel" style={{ background: 'var(--card-bg)', borderLeft: '4px solid var(--primary)', padding: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)', fontWeight: 'bold', marginBottom: '10px' }}>
                      <AlignLeft size={20} /> Texto Base
                    </div>
                    <div className="markdown-format" style={{ fontSize: '0.95rem', color: 'var(--text-main)', lineHeight: '1.6' }}>
                      <ReactMarkdown>{q.textoVinculado}</ReactMarkdown>
                    </div>
                  </div>
                )}

                <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ background: 'var(--hover-bg)', padding: '12px 20px', fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                    <span>Questão {index + 1}</span>
                    <span>{q.assunto}</span>
                  </div>
                  <div style={{ padding: '20px' }}>
                    <div style={{ fontSize: '1.05rem', color: 'var(--text-main)', lineHeight: '1.5', marginBottom: '25px', fontWeight: '500' }}>
                      {q.enunciado}
                    </div>

                    <div style={{ display: 'flex', gap: '15px', flexDirection: q.alternativas ? 'column' : 'row' }}>
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
                              {alt}
                              {showExp && isCorrectAlt && <CheckCircle size={18} color="var(--success-text)"/>}
                            </button>
                          )
                        })
                      ) : (
                        <>
                          <button 
                            onClick={() => handleAnswer(q.id, 'C')}
                            disabled={showExp && !configExamMode}
                            style={{ flex: 1, padding: '15px', borderRadius: '12px', fontWeight: 'bold', fontSize: '1rem', cursor: (showExp && !configExamMode) ? 'default' : 'pointer', transition: 'all 0.2s', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px',
                              border: '2px solid',
                              borderColor: uAns === 'C' ? (showExp ? (isCorrect ? 'var(--success-text)' : 'var(--error-text)') : 'var(--primary)') : 'var(--border)',
                              background: uAns === 'C' ? (showExp ? (isCorrect ? 'var(--success-bg)' : 'var(--error-bg)') : 'var(--primary)') : 'transparent',
                              color: uAns === 'C' && !showExp ? 'white' : (showExp && uAns === 'C' ? 'inherit' : 'var(--text-secondary)'),
                              opacity: (showExp && uAns !== 'C' && q.gabarito !== 'C') ? 0.5 : 1
                            }}
                          >
                            CERTO
                            {showExp && q.gabarito === 'C' && <CheckCircle size={18} color="var(--success-text)"/>}
                          </button>
                          <button 
                            onClick={() => handleAnswer(q.id, 'E')}
                            disabled={showExp && !configExamMode}
                            style={{ flex: 1, padding: '15px', borderRadius: '12px', fontWeight: 'bold', fontSize: '1rem', cursor: (showExp && !configExamMode) ? 'default' : 'pointer', transition: 'all 0.2s', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px',
                              border: '2px solid',
                              borderColor: uAns === 'E' ? (showExp ? (isCorrect ? 'var(--success-text)' : 'var(--error-text)') : 'var(--primary)') : 'var(--border)',
                              background: uAns === 'E' ? (showExp ? (isCorrect ? 'var(--success-bg)' : 'var(--error-bg)') : 'var(--primary)') : 'transparent',
                              color: uAns === 'E' && !showExp ? 'white' : (showExp && uAns === 'E' ? 'inherit' : 'var(--text-secondary)'),
                              opacity: (showExp && uAns !== 'E' && q.gabarito !== 'E') ? 0.5 : 1
                            }}
                          >
                            ERRADO
                            {showExp && q.gabarito === 'E' && <CheckCircle size={18} color="var(--success-text)"/>}
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
              </React.Fragment>
            );
          })}

          {configExamMode && !isExamFinished && (
            <button onClick={finishExam} className="btn primary" style={{ width: '100%', padding: '15px', fontSize: '1.05rem', margin: '20px 0' }}>
              Finalizar Prova e Ver Correção
            </button>
          )}

          <div style={{ display: 'flex', gap: '15px', marginTop: '20px' }}>
            <button onClick={() => setViewState("initial")} className="btn" style={{ flex: 1, padding: '15px' }}>
              Voltar ao Início
            </button>
            
            {showLessonAction && (
              <button onClick={() => generateLesson(getWrongQuestions())} className="btn primary" style={{ flex: 2, padding: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                <Wrench size={20} /> Professor IA: Explicar meus erros
              </button>
            )}
          </div>
        </div>
      )}

      {showConfig && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="panel" style={{ width: '100%', maxWidth: '500px', animation: 'fadeIn 0.2s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '10px' }}><SlidersHorizontal size={24} color="var(--primary)" /> Configurar IA</h2>
              <button onClick={() => setShowConfig(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={24} /></button>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <button 
                onClick={() => { setProviderTab("openrouter"); setTempModel("google/gemini-2.5-flash"); }} 
                className={`btn ${providerTab === "openrouter" ? "primary" : ""}`} 
                style={{ flex: 1, padding: '10px', fontSize: '0.9rem' }}
              > OpenRouter </button>
              <button 
                onClick={() => { setProviderTab("aistudio"); setTempModel("gemini-2.5-flash"); }} 
                className={`btn ${providerTab === "aistudio" ? "primary" : ""}`} 
                style={{ flex: 1, padding: '10px', fontSize: '0.9rem' }}
              > Google AI Studio </button>
            </div>

            {providerTab === "openrouter" && (
              <div style={{ marginBottom: '20px' }}>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '15px' }}>
                  Conecte sua conta OpenRouter para acesso a dezenas de modelos de IA. O login é automático.
                </p>
                {userApiKey && userApiKey.startsWith("sk-or-") ? (
                  <div style={{ padding: '12px', borderRadius: '6px', background: 'var(--success-bg)', border: '1px solid var(--success-text)', color: 'var(--success-text)', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle size={18} /> Conta Vinculada</div>
                    <button onClick={handleDisconnectAI} disabled={savingConfig} style={{ background: 'none', border: 'none', color: 'var(--error-text)', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.85rem' }}>Desvincular</button>
                  </div>
                ) : (
                  <button onClick={handleConnectAI} className="btn primary" style={{ width: '100%', padding: '12px', display: 'flex', justifyContent: 'center', gap: '8px' }}>
                    <Bot size={18} /> Conectar ao OpenRouter
                  </button>
                )}
              </div>
            )}

            {providerTab === "aistudio" && (
              <div style={{ marginBottom: '20px' }}>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '15px' }}>
                  Use sua chave direta do Google AI Studio (Gemini). É gratuita e rápida.
                </p>
                <div style={{ marginBottom: '15px' }}>
                  <label className="label">Chave de API (Google AI Studio)</label>
                  <input type="password" placeholder="AIzaSy..." value={tempApiKey} onChange={(e) => setTempApiKey(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-main)' }} />
                </div>
              </div>
            )}

            <div style={{ marginBottom: '25px' }}>
              <label className="label">Modelo Preferido</label>
              <input type="text" placeholder="Ex: google/gemini-2.5-flash" value={tempModel} onChange={(e) => setTempModel(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-main)' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px' }}>
              <button onClick={() => setShowConfig(false)} className="btn">Fechar</button>
              <button onClick={saveConfigToDB} className="btn primary">{savingConfig ? "⏳ Salvando..." : "Salvar Configurações"}</button>
            </div>
          </div>
        </div>
      )}

      {showStatsModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="panel" style={{ width: '100%', maxWidth: '500px', padding: 0, overflow: 'hidden', animation: 'fadeIn 0.2s ease-out' }}>
            <div style={{ padding: '20px', background: 'var(--card-bg)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '10px' }}><PieChart size={24} color="var(--primary)" /> Seu Desempenho Global</h2>
              <button onClick={() => setShowStatsModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={24} /></button>
            </div>
            <div style={{ padding: '20px', maxHeight: '60vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', padding: '15px', background: 'var(--hover-bg)', borderRadius: '12px' }}>
                <div style={{ textAlign: 'center' }}><p style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0, color: 'var(--text-main)' }}>{stats.total}</p><p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>Total</p></div>
                <div style={{ textAlign: 'center' }}><p style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0, color: 'var(--success-text)' }}>{stats.correct}</p><p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>Certas</p></div>
                <div style={{ textAlign: 'center' }}><p style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0, color: 'var(--error-text)' }}>{stats.wrong}</p><p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>Erradas</p></div>
              </div>
              <h3 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '10px', textTransform: 'uppercase' }}>Por Assunto</h3>
              {Object.entries(stats.topics).length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '20px' }}>Nenhum dado registrado ainda.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {Object.entries(stats.topics).map(([topic, data]) => {
                    const tTotal = data.correct + data.wrong;
                    const pct = Math.round((data.correct / tTotal) * 100);
                    return (
                      <div key={topic} style={{ padding: '12px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <span style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>{topic}</span>
                          <div style={{ display: 'flex', gap: '15px', fontSize: '0.9rem' }}>
                            <span style={{ color: 'var(--success-text)', fontWeight: 'bold' }}>{data.correct}C</span>
                            <span style={{ color: 'var(--error-text)', fontWeight: 'bold' }}>{data.wrong}E</span>
                            <span style={{ color: pct >= 70 ? 'var(--success-text)' : pct < 50 ? 'var(--error-text)' : 'var(--text-main)', fontWeight: 'bold' }}>{pct}%</span>
                          </div>
                        </div>
                        <div style={{ width: '100%', height: '6px', background: 'var(--hover-bg)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', background: pct >= 70 ? 'var(--success-text)' : pct < 50 ? 'var(--error-text)' : 'var(--primary)', width: `${pct}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div style={{ padding: '15px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'center' }}>
               <button onClick={resetStats} className="btn outline" style={{ color: 'var(--error-text)', borderColor: 'var(--error-text)', width: '100%' }}>Zerar Histórico</button>
            </div>
          </div>
        </div>
      )}

      {showLessonModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="panel" style={{ width: '100%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', animation: 'fadeIn 0.2s ease-out', border: '2px solid #f59e0b' }}>
            <div style={{ background: '#f59e0b', color: 'white', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <GraduationCap size={24} /> Resumo / Correção
              </h2>
              <button onClick={() => setShowLessonModal(false)} style={{ background: 'none', border: 'none', color: '#fef3c7', cursor: 'pointer' }}><X size={24} /></button>
            </div>
            <div style={{ padding: '30px', overflowY: 'auto', flex: 1, background: 'var(--card-bg)' }}>
              <div className="markdown-format" style={{ fontSize: '1rem', lineHeight: '1.7', color: 'var(--text-main)' }}>
                <ReactMarkdown>{lessonContent}</ReactMarkdown>
              </div>
            </div>
            <div style={{ padding: '15px 20px', borderTop: '1px solid var(--border)', background: 'var(--hover-bg)', textAlign: 'right' }}>
              <button onClick={() => setShowLessonModal(false)} className="btn primary">Entendi, fechar</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}