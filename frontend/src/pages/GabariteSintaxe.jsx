import React, { useState, useEffect } from "react";
import {
  BookOpen, Cpu, CheckCircle, ArrowLeft, FileText, BarChart2, BookOpenCheck, SlidersHorizontal,
} from "lucide-react";
// Markdown único da plataforma: bloco de código, inline, tabelas e fórmulas.
import Md from "../components/Markdown";
import { Modal, ConfirmDialog, Notice, Toast} from "../components/ui";
import { AiKeyBar, AiKeyPanel, useAiKey, getAuthToken } from "../components/AiKeyConfig";
import { registrarSimulado } from "../desempenho";
import { QuestaoCard, PainelErros, HistoricoModal } from "../components/simulador";
import { aulasData } from "../data/sintaxeData";

// Helper para ler token unificado
// getAuthToken vive em components/AiKeyConfig.jsx — uma cópia só para todas as telas.

// ==========================================
// FUNÇÃO ANTI-ERRO (Limpeza agressiva de IA)
// ==========================================
// Função Anti-Erro e Limpeza de Resposta da IA com suporte a Streams e Fallback Supremo
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
  
  // Limpeza inicial de tags de raciocínio (DeepSeek/Thinking models)
  let cleanText = rawText.replace(/<think>[\s\S]*?<\/think>/gi, "").trim(); 
  
  // Tenta isolar o bloco estruturado do JSON
  const jsonMatch = cleanText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) cleanText = jsonMatch[0];

  try {
    // 1. Tenta o parse direto (caso o JSON venha perfeito)
    return JSON.parse(cleanText);
  } catch (e) {
    try {
      // 2. Segunda tentativa limpando quebras de linha literais e vírgulas órfãs
      let processedText = cleanText.replace(/[\n\r\t]+/g, ' ').replace(/,\s*([\]}])/g, '$1');
      return JSON.parse(processedText);
    } catch (secondError) {
      
      // 3. FALLBACK SUPREMO: Ignora JSON corrompido com aspas soltas (Ex: O "Jogo" da CESPE)
      if (cleanText.includes("lesson_markdown")) {
        // Captura TUDO depois de "lesson_markdown": " até o final do texto
        const match = cleanText.match(/"lesson_markdown"\s*:\s*"([\s\S]*)/);
        
        if (match && match[1]) {
          let extractedText = match[1];
          
          // Limpa o fechamento do JSON no final da string ("} ou só ")
          extractedText = extractedText.replace(/"\s*\}\s*$/, '').replace(/"\s*$/, '');
          
          // Restaura quebras de linha e aspas escapadas da IA
          extractedText = extractedText
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"');
          
          return { lesson_markdown: extractedText };
        }
      }
      
      // Se não for aula e falhar mesmo assim, exibe no console e lança o erro padrão
      console.error("TEXTO COM ERRO COMPLETO DA IA:", rawText);
      throw new Error("A IA gerou um formato inválido de dados.");
    }
  }
};

export default function GabariteSintaxe() {
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  // --- ESTADOS DA CONFIGURAÇÃO DA IA ---
  const [showConfig, setShowConfig] = useState(false);
  const { userApiKey, userModel, setUserApiKey, setUserModel, ia } = useAiKey();
  const [aviso, setAviso] = useState(null);
  const [confirmarEntrega, setConfirmarEntrega] = useState(false);

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
    const savedStats = localStorage.getItem('cespe_sintaxe_stats');
    if (savedStats) {
      try { setStats(JSON.parse(savedStats)); } catch (e) { console.error(e); }
    }
  }, []);

  const saveStats = (newStats) => {
    setStats(newStats);
    localStorage.setItem('cespe_sintaxe_stats', JSON.stringify(newStats));
  };

  const handleConnectAI = () => {
    const callbackUrl = encodeURIComponent(`${window.location.origin}/callback`);
    window.location.href = `https://openrouter.ai/auth?callback_url=${callbackUrl}`;
  };

  const selectTopic = (topicId) => {
    const topic = aulasData.find(a => a.id === topicId);
    setCurrentTopic(topic);
    setViewState("lesson");
    window.scrollTo(0, 0);
  };

  const generateQuiz = async () => {
    /* COMENTADO PARA UTILIZAÇÃO DA CHAVE GLOBAL DO USUÁRIO
    if (!userApiKey) {
      setAviso({ tone: "err", texto: "Por favor, configure sua Chave API do OpenRouter ou AI Studio nas configurações para gerar questões." });
      setShowConfig(true);
      return;
    }
      */

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

        // 1. Descobre se a chave é do Google (não começa com sk-or-)
        const isGoogleKey = userApiKey && !userApiKey.startsWith("sk-or-");
        // 2. Define o modelo de segurança compatível
        const defaultModel = isGoogleKey ? "gemini-2.5-flash-lite" : "deepseek/deepseek-v4-flash";

        const payload = {
          subject: "Língua Portuguesa",
          focus: `Sintaxe: ${currentTopic.title}. ATENÇÃO EXAMINADOR: É OBRIGATÓRIO basear o cenário das questões, os gabaritos e os distratores ESTRITAMENTE nas seguintes regras, dicas e pegadinhas desta aula: ${regrasDaAula}`, 
          difficulty: "dificil", 
          amount: currentBatchSize,
          generate_text: false,
          formato: configFormato,
          model: userModel || defaultModel,
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
            
            // NOVO: Aborta na hora se o backend repassar um erro da API
            if (data && data.error) {
              throw new Error(`Erro da API: ${data.error}`);
            }

            if (data && data.questoes && data.questoes.length > 0) break;
            throw new Error("O lote veio vazio.");
          } catch (e) {
            tentativas++;
            // Se o erro for da API, não repete o laço, apenas repassa o erro para a tela
            if (e.message.includes("Erro da API")) throw e; 
            
            if (tentativas >= 2) throw new Error(e.message || "A IA falhou em formatar as opções.");
            setLoadingMsg(`Reajustando os vereditos da IA... (A repetir Lote ${i + 1})`);
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
      setAviso({ tone: "err", texto: err.message || "Falha ao comunicar com a IA. Tente novamente." });
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
      setConfirmarEntrega(true);
      return;
    }
    finalizarProva();
  };

  const finalizarProva = () => {
    setConfirmarEntrega(false);
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

    // Além do painel local, o resultado da sessão vai para o servidor: sem
    // isto, o Meu Desempenho e o ranking ignoram esta ferramenta inteira.
    const respondidas = currentQuestions.filter((q) => userAnswers[q.id]);
    registrarSimulado({
      ferramenta: "sintaxe",
      foco: currentTopic?.title || "",
      acertos: respondidas.filter((q) => userAnswers[q.id] === q.gabarito).length,
      respondidas: respondidas.length,
      formato: configFormato,
    });

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
    setLoadingMsg("O Professor IA está montando a análise textual e traduções para os seus erros...");

    try {
      const token = getAuthToken();
      
      // 1. Resolve o problema de roteamento do modelo (anti-404)
      const isGoogleKey = userApiKey && !userApiKey.startsWith("sk-or-");
      const defaultModel = isGoogleKey ? "gemini-2.5-flash-lite" : "deepseek/deepseek-v4-flash";

      // 2. SUBSTITUI o fetch normal pela sua função blindada fetchStreamAsJson
      const data = await fetchStreamAsJson(`${API_URL}/generate-lesson-cespe`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": token ? `Bearer ${token}` : ""
        },
        body: JSON.stringify({
          wrong_questions: wrongQuestions,
          model: userModel || defaultModel,
          api_key: userApiKey || null
        })
      });

      // 3. Captura possíveis erros que a API possa retornar
      if (data && data.error) {
        throw new Error(`Erro da API: ${data.error}`);
      }

      setLessonContent(data.lesson_markdown || data.text || "Conteúdo não disponível.");
      setViewState("exam"); 
      setShowLessonModal(true);

    } catch (err) {
      console.error(err);
      setAviso({ tone: "err", texto: err.message || "Falha ao gerar a aula explicativa." });
      setViewState("exam");
    }
  };

  const wrongCount = getWrongQuestions().length;
  const showLessonAction = (isExamFinished || (!configExamMode && Object.keys(userAnswers).length === currentQuestions?.length)) && wrongCount > 0;

  return (
    <div className="gab">
      {/* HEADER PRINCIPAL */}
      <header className="gab__topo" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ color: 'var(--fg)', margin: '0 0 5px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileText size={32} color="var(--primary)" /> Sintaxe para Concursos <span style={{ color: 'var(--primary)' }}>CESPE</span>
          </h1>
          <p style={{ color: 'var(--fg-2)', margin: 0 }}>Aprenda profundamente e pratique no padrão CESPE/Cebraspe.</p>
        </div>
        <button onClick={() => setShowStatsModal(true)} className="ui-btn" style={{ fontWeight: 'bold' }}>
          <BarChart2 size={20} /> O meu Desempenho
        </button>
      </header>

      <AiKeyBar
        ia={ia}
        userApiKey={userApiKey}
        userModel={userModel}
        onConfigurar={() => setShowConfig(true)}
        label="IA da Sintaxe"
      />

      {/* VIEW: GRID DE TÓPICOS */}
      {viewState === "topics" && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {aulasData.map(aula => (
            <div 
              key={aula.id}
              onClick={() => selectTopic(aula.id)}
              className="ui-card ui-card--pad"
              style={{ cursor: 'pointer', borderLeft: '5px solid var(--primary)', transition: 'transform 0.2s, box-shadow 0.2s' }}
              onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
              onMouseOut={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}
            >
              <h2 style={{ fontSize: '1.3rem', color: 'var(--primary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <BookOpen size={20} /> {aula.title}
              </h2>
              <p style={{ color: 'var(--fg-2)' }}>{aula.descricao}</p>
            </div>
          ))}
        </div>
      )}

      {/* VIEW: AULA INDIVIDUAL */}
      {viewState === "lesson" && currentTopic && (
        <div className="ui-card ui-card--pad" style={{ padding: '2.5rem' }}>
          <button 
            onClick={() => setViewState("topics")}
            style={{ background: 'transparent', border: 'none', color: 'var(--fg-2)', fontSize: '1rem', cursor: 'pointer', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold' }}
          >
            <ArrowLeft size={18} /> Voltar para as aulas
          </button>
          
          <div style={{ marginBottom: '2rem', borderBottom: '2px solid var(--border)', paddingBottom: '1rem' }}>
            <h2 style={{ fontSize: '2rem', color: 'var(--primary)', margin: 0 }}>{currentTopic.title}</h2>
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ color: 'var(--fg)', fontSize: '1.3rem', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>💡 1. O que é? (Definição Simples)</h3>
            <div style={{ color: 'var(--fg)', lineHeight: '1.6' }}><Md>{currentTopic.def}</Md></div>
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ color: 'var(--fg)', fontSize: '1.3rem', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>🔍 2. Análise Profunda</h3>
            <div style={{ color: 'var(--fg)', lineHeight: '1.6' }}><Md>{currentTopic.deep}</Md></div>
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ color: 'var(--fg)', fontSize: '1.3rem', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>📝 3. Exemplos Comentados</h3>
            {currentTopic.examples.map((ex, i) => (
              <div key={i} style={{ background: 'var(--hover-bg)', borderLeft: '4px solid var(--fg-2)', padding: '1rem', marginBottom: '1rem', borderRadius: '0 8px 8px 0', color: 'var(--fg)' }}>
                <Md>{ex}</Md>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ color: 'var(--fg)', fontSize: '1.3rem', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>🎯 4. Como cai no CESPE/Cebraspe</h3>
            <div style={{ background: 'var(--primary-light)', border: '1px solid var(--primary)', padding: '1.5rem', borderRadius: '8px', color: 'var(--fg)' }}>
              <strong>Dica de Prova:</strong> <Md>{currentTopic.cespeTip}</Md>
            </div>
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ color: 'var(--fg)', fontSize: '1.3rem', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>⚠️ 5. Pegadinhas Comuns</h3>
            <div style={{ background: 'var(--error-bg)', border: '1px solid var(--danger)', padding: '1.5rem', borderRadius: '8px', color: 'var(--error-text)' }}>
              <strong>Alerta:</strong> <Md>{currentTopic.trap}</Md>
            </div>
          </div>

          {/* PAINEL DE CONFIGURAÇÃO DE QUESTÕES */}
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem', marginTop: '2rem' }}>
             <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--fg)' }}>
                <SlidersHorizontal size={20} color="var(--primary)" /> Configurar Simulado
             </h3>
             <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
                <div style={{ flex: '1 1 200px' }}>
                   <label className="ui-field__label">Formato</label>
                   <select className="ui-input" value={configFormato} onChange={e => setConfigFormato(e.target.value)} style={{ width: '100%', padding: '10px' }}>
                     <option value="Certo/Errado">Certo / Errado</option>
                     <option value="Múltipla Escolha">Múltipla Escolha</option>
                   </select>
                </div>
                <div style={{ flex: '1 1 200px' }}>
                   <label className="ui-field__label">Quantidade</label>
                   <select className="ui-input" value={configAmount} onChange={e => setConfigAmount(Number(e.target.value))} style={{ width: '100%', padding: '10px' }}>
                     <option value={5}>5 Questões</option>
                     <option value={10}>10 Questões</option>
                     <option value={15}>15 Questões</option>
                   </select>
                </div>
                <div style={{ flex: '1 1 200px', display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => setConfigExamMode(!configExamMode)}>
                   <div style={{ flex: 1 }}>
                     <span style={{ fontSize: '0.95rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--fg)' }}>
                       <BookOpenCheck size={18} /> Modo Prova
                     </span>
                     <span style={{ fontSize: '0.75rem', color: 'var(--fg-3)' }}>Oculta respostas até o fim</span>
                   </div>
                   <div style={{ width: '40px', height: '22px', background: configExamMode ? 'var(--primary)' : 'var(--border)', borderRadius: '20px', position: 'relative', transition: '0.3s' }}>
                     <div style={{ width: '18px', height: '18px', background: '#fff', borderRadius: '50%', position: 'absolute', top: '2px', left: configExamMode ? '20px' : '2px', transition: '0.3s' }}></div>
                   </div>
                </div>
             </div>
             
             <button onClick={generateQuiz} className="ui-btn ui-btn--primary" style={{ width: '100%', padding: '1rem', fontSize: '1.1rem', marginTop: '20px' }}>
               👉 Gerar questões deste tópico com IA
             </button>
          </div>
        </div>
      )}

      {/* VIEW: LOADING */}
      {viewState === "loading" && (
        <div className="ui-card ui-card--pad" style={{ textAlign: 'center', padding: '3rem' }}>
          <Cpu className="spin" size={48} color="var(--primary)" style={{ margin: '0 auto 20px auto' }} />
          <p style={{ color: 'var(--fg-2)', fontSize: '1.1rem', fontWeight: 'bold' }}>{loadingMsg}</p>
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
              <span style={{ fontSize: '0.85rem', color: 'var(--fg-2)' }}>Respostas ocultas. Finalize para corrigir.</span>
            </div>
          )}

          {currentQuestions.map((q, index) => {
                const uAns = userAnswers[q.id];
                const showExp = Boolean(isExamFinished || (!configExamMode && uAns));
                return (
                  <React.Fragment key={q.id}>
                    <QuestaoCard
                      numero={index + 1}
                      assunto={q.assunto}
                      enunciado={q.enunciado}
                      alternativas={q.alternativas}
                      gabarito={q.gabarito}
                      explicacao={q.explicacao}
                      resposta={uAns}
                      mostrarGabarito={showExp}
                      travado={showExp && !configExamMode}
                      onResponder={(letra) => handleAnswerSelect(q.id, letra)}
                    />
                  </React.Fragment>
                );
              })}

          {!isExamFinished && (
            <button onClick={submitQuiz} className="ui-btn ui-btn--primary" style={{ padding: '15px', fontSize: '1.1rem', margin: '20px auto', display: 'block', maxWidth: '400px', width: '100%', gap: '10px' }}>
              <CheckCircle size={20} /> {configExamMode ? "Entregar Prova e Corrigir" : "Finalizar e Ver Pontuação"}
            </button>
          )}

          {/* GERADOR DE AULA SOBRE OS ERROS */}
          {showLessonAction && (
                <PainelErros
                  titulo="Professor de Sintaxe"
                  descricao={`Você errou ${wrongCount} questão(ões) de Sintaxe. Quer uma revisão detalhada das pegadinhas que derrubaram você?`}
                  rotuloBotao="Gerar revisão detalhada"
                  onGerar={() => generateLesson(getWrongQuestions())}
                />
              )}
        </div>
      )}

      {/* MODAL DA AULA DE REVISÃO DA IA */}
      <Modal
        open={showLessonModal}
        onClose={() => setShowLessonModal(false)}
        title="Revisão de Sintaxe"
        subtitle="Gerada a partir das questões que você errou."
        wide
      >
        <Md>{lessonContent}</Md>
      </Modal>

      {/* MODAL DE CONFIGURAÇÃO DE IA COM ABAS (OPENROUTER / AISTUDIO) */}
      {/* MODAL DE ESTATÍSTICAS */}
      <HistoricoModal
        aberto={showStatsModal}
        titulo="Meu histórico de Sintaxe"
        materia="Sintaxe"
        stats={stats}
        onFechar={() => setShowStatsModal(false)}
        onLimpar={() => { saveStats({ total: 0, correct: 0, wrong: 0, topics: {} }); setShowStatsModal(false); }}
      />

      {/* FOOTER DE CRÉDITO DO DESENVOLVEDOR (Atualizado com sua diretiva) */}
      <div style={{ textAlign: 'center', marginTop: '3rem', paddingBottom: '1rem', color: 'var(--fg-3)', fontSize: '0.85rem' }}>
        Foco na aprovação! Desenvolvido por TecnoPriv.Top
      </div>
      {/* CONFIGURAÇÃO DE IA — painel único, compartilhado com as demais telas */}
      <Modal
        open={showConfig}
        onClose={() => setShowConfig(false)}
        title="Conectar a sua inteligência artificial"
        subtitle="A chave fica na sua conta e vale para todas as ferramentas da plataforma."
      >
        <AiKeyPanel
          userApiKey={userApiKey}
          userModel={userModel}
          onChange={({ apiKey, model }) => { setUserApiKey(apiKey); setUserModel(model); }}
          onFechar={() => setShowConfig(false)}
        />
      </Modal>

      <ConfirmDialog
        open={confirmarEntrega}
        title="Entregar a prova com questões em branco"
        message="Ainda há questões sem resposta neste caderno."
        detail="Itens em branco contam como não respondidos e não entram no cálculo de acertos. Depois de entregar, não é possível voltar e responder."
        confirmLabel="Entregar mesmo assim"
        onConfirm={finalizarProva}
        onCancel={() => setConfirmarEntrega(false)}
      />

      <Toast aviso={aviso} onFechar={() => setAviso(null)} />

    </div>
  );
}