import React, { useState, useEffect, useRef } from "react";
import {
  Calculator, BarChart2, SlidersHorizontal, FileText, BookOpenCheck, Sparkles, Cpu, Binary,
} from "lucide-react";
// Markdown único da plataforma: bloco de código, inline, tabelas e fórmulas.
import Md from "../components/Markdown";
import { Modal, ConfirmDialog, Notice, Toast} from "../components/ui";
import { AiKeyBar, AiKeyPanel, useAiKey, getAuthToken } from "../components/AiKeyConfig";
import { QuestaoCard, TextoBase, PainelErros, HistoricoModal } from "../components/simulador";
import { conteudosTeoricosRLM } from "../data/raciocinioData";

// Helper para ler token unificado
// getAuthToken vive em components/AiKeyConfig.jsx — uma cópia só para todas as telas.

// ==========================================
// NOVA FUNÇÃO ANTI-ERRO (Com limpeza agressiva)
// ==========================================
/// Função Anti-Erro e Limpeza de Resposta da IA com suporte a Streams e Fallback Supremo
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

// ==========================================

export default function GabariteLogica() {
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  // --- ESTADOS DA CONFIGURAÇÃO DA IA ---
  const [showConfig, setShowConfig] = useState(false);
  const { userApiKey, userModel, setUserApiKey, setUserModel } = useAiKey();
  const [aviso, setAviso] = useState(null);

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

  const handleShowTheory = () => {
    // Puxa o conteúdo do arquivo importado com base no foco atual
    setLessonContent(conteudosTeoricosRLM[configFocus] || conteudosTeoricosRLM.completo);
    setShowLessonModal(true);
  };

  useEffect(() => {
    const savedStats = localStorage.getItem('cespe_logica_stats');
    if (savedStats) {
      try { setStats(JSON.parse(savedStats)); } catch (e) { console.error(e); }
    }
  }, []);

  const saveStats = (newStats) => {
    setStats(newStats);
    localStorage.setItem('cespe_logica_stats', JSON.stringify(newStats));
  };

  const handleConnectAI = () => {
    const callbackUrl = encodeURIComponent(`${window.location.origin}/callback`);
    window.location.href = `https://openrouter.ai/auth?callback_url=${callbackUrl}`;
  };

  const generateExam = async () => {
    setError("");
    setViewState("loading");

    // ==========================================
    // MÁGICA: EMBARALHAMENTO FORÇADO VIA CÓDIGO
    // ==========================================
    const embaralharAlternativas = (questao) => {
      // Ignora se for Certo/Errado ou se não tiver opções
      if (!questao.alternativas || questao.alternativas.length < 3) return questao;

      // Se no seu sistema gera até 4 ou 5 opções, adicione a letra 'E' no array se necessário
      const letras = ["A", "B", "C", "D", "E"]; 
      const gabaritoAtual = (questao.gabarito || "A").trim().toUpperCase();
      const idxCorreto = letras.indexOf(gabaritoAtual);

      if (idxCorreto === -1) return questao;

      // 1. Limpa as letras falsas (Tira "A) ", "B) " da string)
      const textos = questao.alternativas.map(alt => alt.replace(/^[A-E]\s*[\)\.\-:]\s*/i, "").trim());
      const textoCorreto = textos[idxCorreto];

      // 2. Algoritmo Profissional de Embaralhamento (Fisher-Yates)
      for (let i = textos.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [textos[i], textos[j]] = [textos[j], textos[i]];
      }

      // 3. Descobre onde a resposta certa foi parar
      const novoIdxCorreto = textos.indexOf(textoCorreto);
      const novoGabarito = letras[novoIdxCorreto];

      // 4. Recria as alternativas prontas
      const novasAlternativas = textos.map((txt, i) => `${letras[i]}) ${txt}`);

      return {
        ...questao,
        alternativas: novasAlternativas,
        gabarito: novoGabarito
      };
    };
    // ==========================================

    try {
      const token = getAuthToken();
      let todasQuestoes = [];
      
      const batchSize = 5; 
      const batches = Math.ceil(configAmount / batchSize);

      for (let i = 0; i < batches; i++) {
        setLoadingMsg(`A formular questões inéditas... (Lote ${i + 1} de ${batches})`);
        const currentBatchSize = Math.min(batchSize, configAmount - (i * batchSize));

        // 1. Descobre se a chave é do Google (não começa com sk-or-)
        const isGoogleKey = userApiKey && !userApiKey.startsWith("sk-or-");
        // 2. Define o modelo de segurança compatível
        const defaultModel = isGoogleKey ? "gemini-2.5-flash-lite" : "deepseek/deepseek-v4-flash";

        const payload = {
          subject: "Raciocínio Lógico", 
          focus: configFocus,
          difficulty: configDifficulty,
          amount: currentBatchSize,
          generate_text: configTextBase, // Agora solicita texto em todos os lotes
          formato: configFormato,
          model: userModel || defaultModel,
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
        // ----------------------------------------------------------------

        // ----------------------------------------------------------------
        const questoesCorrigidas = data.questoes.map((q, idx) => {
          
          // APLICA O EMBARALHAMENTO AQUI SE FOR MÚLTIPLA ESCOLHA!
          const qEmbaralhada = configFormato === "Múltipla Escolha" ? embaralharAlternativas(q) : q;
          
          return {
            ...qEmbaralhada,
            id: `q_prova_${i}_${idx}`,
            textoVinculado: (idx === 0 && configTextBase && data.textoBase) ? data.textoBase : null
          };
        });

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
    setAviso({ tone: "ok", texto: `Simulado RLM finalizado! Pontuação líquida CESPE: ${right - wrong}` });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getWrongQuestions = () => {
    if (!currentData) return [];
    return currentData.questoes.filter(q => {
      const ans = userAnswers[q.id];
      return ans && ans !== q.gabarito;
    });
  };


  const wrongCount = getWrongQuestions().length;
  const showLessonAction = (isExamFinished || (!configExamMode && Object.keys(userAnswers).length === currentData?.questoes?.length)) && wrongCount > 0;

  return (
    <div className="gab">
      <header className="gab__topo" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left', marginBottom: '1rem', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h1 style={{ color: 'var(--fg)', margin: '0 0 5px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Calculator size={32} color="var(--primary)" /> Gabarite Lógica <span style={{ color: 'var(--primary)' }}>CESPE</span>
          </h1>
          <p style={{ color: 'var(--fg-2)', margin: 0 }}>Treino de Raciocínio Lógico com Situações Hipotéticas focadas no edital.</p>
        </div>
        <button onClick={() => setShowStatsModal(true)} className="ui-btn" style={{ fontWeight: 'bold' }}>
          <BarChart2 size={20} /> O meu Desempenho
        </button>
      </header>

      <AiKeyBar
        userApiKey={userApiKey}
        userModel={userModel}
        onConfigurar={() => setShowConfig(true)}
        label="IA do Raciocínio Lógico"
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
          
          <aside style={{ display: 'flex', flexDirection: 'column', gap: '20px', gridColumn: '1 / span 1', maxWidth: '350px' }}>
            <div className="ui-card ui-card--pad" style={{ padding: '20px' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--fg)' }}>
                <SlidersHorizontal size={20} color="var(--primary)" /> Configurar Simulado
              </h2>
              
              <div style={{ marginBottom: '15px' }}>
                <label className="ui-field__label">Foco de Estudo (Frequência CESPE)</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <select className="ui-input" value={configFocus} onChange={e => setConfigFocus(e.target.value)} style={{ padding: '10px', fontSize: '0.9rem', flex: 1 }}>
                    <option value="completo">Simulado Completo (Todos)</option>
                    <option value="negacao">⭐⭐⭐⭐⭐ Negação lógica</option>
                    <option value="condicional">⭐⭐⭐⭐⭐ Condicional (Se..então)</option>
                    <option value="equivalencia">⭐⭐⭐⭐⭐ Equivalência lógica</option>
                    <option value="diagramas">⭐⭐⭐⭐ Diagramas lógicos</option>
                    <option value="argumentacao">⭐⭐⭐⭐ Argumentação lógica</option>
                    <option value="primeira_ordem">⭐⭐⭐⭐ Lógica de primeira ordem</option>
                    <option value="geometria_matricial">⭐⭐⭐ Problemas geométricos e matriciais</option>
                    <option value="probabilidade">⭐⭐⭐ Probabilidade</option>
                    <option value="combinatoria">⭐⭐⭐ Análise combinatória</option>
                    <option value="sequencias">⭐⭐ Sequências lógicas</option>
                  </select>
                  <button 
                    onClick={handleShowTheory} 
                    className="ui-btn" 
                    style={{ 
                      width: '42px',           // Força a largura fixa
                      height: '42px',          // Força a altura fixa
                      display: 'flex',         // Centraliza o ícone
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      padding: '0',            // Remove o padding interno que causava a distorção
                      background: 'var(--primary-light)', 
                      color: 'var(--primary)', 
                      border: '1px solid var(--primary)', 
                      borderRadius: '8px', 
                      flexShrink: 0 
                    }} 
                    title="Ver Resumo Teórico do Assunto Selecionado"
                  >
                    <BookOpenCheck size={20} />
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label className="ui-field__label">Dificuldade</label>
                <select className="ui-input" value={configDifficulty} onChange={e => setConfigDifficulty(e.target.value)}>
                  <option value="medio">Média (Padrão PF/PRF/TJ)</option>
                  <option value="facil">Fácil</option>
                  <option value="dificil">Difícil (Pegadinhas complexas)</option>
                  <option value="avancado">Avançado (Analista/Auditor CGU/TCU)</option>
                </select>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label className="ui-field__label">Formato da Questão</label>
                <select className="ui-input" value={configFormato} onChange={e => setConfigFormato(e.target.value)} style={{ padding: '10px', fontSize: '0.9rem', width: '100%' }}>
                  <option value="Certo/Errado">Certo / Errado (Padrão CESPE)</option>
                  <option value="Múltipla Escolha">Múltipla Escolha (A, B, C, D)</option>
                </select>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label className="ui-field__label">Quantidade de Questões</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {[5, 10, 15, 20].map(val => (
                    <button 
                      key={val}
                      onClick={() => setConfigAmount(val)}
                      style={{ 
                        flex: 1, padding: '8px 0', borderRadius: '8px', fontWeight: 'bold', fontSize: '0.9rem', cursor: 'pointer', transition: 'all 0.2s',
                        background: configAmount === val ? 'var(--primary-light)' : 'var(--bg)',
                        color: configAmount === val ? 'var(--primary)' : 'var(--fg-2)',
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
                <span style={{ fontSize: '0.95rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--fg)' }}>
                  <FileText size={18} /> Gerar Situação Hipotética
                </span>
                <div style={{ width: '40px', height: '22px', background: configTextBase ? 'var(--primary)' : 'var(--border)', borderRadius: '20px', position: 'relative', transition: '0.3s' }}>
                  <div style={{ width: '18px', height: '18px', background: '#fff', borderRadius: '50%', position: 'absolute', top: '2px', left: configTextBase ? '20px' : '2px', transition: '0.3s' }}></div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setConfigExamMode(!configExamMode)}>
                <span style={{ fontSize: '0.95rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--fg)' }}>
                  <BookOpenCheck size={18} /> Modo Prova (Oculta)
                </span>
                <div style={{ width: '40px', height: '22px', background: configExamMode ? 'var(--primary)' : 'var(--border)', borderRadius: '20px', position: 'relative', transition: '0.3s' }}>
                  <div style={{ width: '18px', height: '18px', background: '#fff', borderRadius: '50%', position: 'absolute', top: '2px', left: configExamMode ? '20px' : '2px', transition: '0.3s' }}></div>
                </div>
              </div>

              <button 
                onClick={generateExam} 
                disabled={viewState === "loading"}
                className="ui-btn ui-btn--primary" 
                style={{ width: '100%', marginTop: '25px', padding: '15px', fontSize: '1.05rem', gap: '10px' }}
              >
                <Sparkles size={20} /> Gerar Questões Lógicas
              </button>
              {error && <div style={{ color: 'var(--error-text)', fontSize: '0.85rem', marginTop: '10px', textAlign: 'center', fontWeight: 'bold' }}>{error}</div>}
            </div>

            <div className="ui-card ui-card--pad" style={{ padding: '20px', background: 'var(--card-bg)' }}>
              <h3 style={{ fontSize: '0.85rem', color: 'var(--fg-2)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '15px', textAlign: 'center' }}>Aproveitamento RLM</h3>
              <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: '15px' }}>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--success-text)', margin: 0 }}>{stats.correct}</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--fg-3)', margin: 0 }}>Acertos</p>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--error-text)', margin: 0 }}>{stats.wrong}</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--fg-3)', margin: 0 }}>Erros</p>
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
              <div className="ui-card ui-card--pad" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px', textAlign: 'center', border: '1px dashed var(--border)', background: 'transparent', boxShadow: 'none' }}>
                <div style={{ width: '90px', height: '90px', background: 'var(--primary-light)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
                  <Binary size={48} color="var(--primary)" />
                </div>
                <h2 style={{ fontSize: '1.5rem', color: 'var(--fg)', marginBottom: '10px' }}>Raciocínio Lógico Matemático (CESPE)</h2>
                <p style={{ color: 'var(--fg-2)', maxWidth: '400px', marginBottom: '25px' }}>
                  Treine tabelas-verdade, negações, equivalências e probabilidade com situações hipotéticas inéditas criadas pela IA.
                </p>
                <button onClick={generateExam} className="ui-btn ui-btn--primary" style={{ padding: '10px 25px' }}>Gerar Primeiro Simulado</button>
              </div>
            )}

            {viewState === "loading" && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div className="ui-card ui-card--pad">
                  <div className="ui-skel" style={{ width: '200px', height: '24px', marginBottom: '15px' }}></div>
                  <div className="ui-skel" style={{ width: '100%', height: '16px', marginBottom: '10px' }}></div>
                  <div className="ui-skel" style={{ width: '100%', height: '16px', marginBottom: '10px' }}></div>
                </div>
                <div className="ui-card ui-card--pad" style={{ display: 'flex', gap: '15px' }}>
                  <div className="ui-skel" style={{ width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0 }}></div>
                  <div style={{ flex: 1 }}>
                    <div className="ui-skel" style={{ width: '100%', height: '20px', marginBottom: '10px' }}></div>
                    <div style={{ display: 'flex', gap: '15px' }}>
                      <div className="ui-skel" style={{ width: '120px', height: '45px', borderRadius: '8px' }}></div>
                      <div className="ui-skel" style={{ width: '120px', height: '45px', borderRadius: '8px' }}></div>
                    </div>
                  </div>
                </div>
                <p style={{ textAlign: 'center', color: 'var(--fg-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '20px', fontWeight: 'bold' }}>
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
                    <span style={{ fontSize: '0.85rem', color: 'var(--fg-2)' }}>Respostas ocultas. Finalize para corrigir.</span>
                  </div>
                )}

                {currentData.questoes.map((q, index) => {
                const uAns = userAnswers[q.id];
                const showExp = Boolean(isExamFinished || (!configExamMode && uAns));
                return (
                  <React.Fragment key={q.id}>
                    {q.textoVinculado && <TextoBase texto={q.textoVinculado} />}
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
                      onResponder={(letra) => handleAnswer(q.id, letra)}
                    />
                  </React.Fragment>
                );
              })}

                {configExamMode && !isExamFinished && (
                  <button onClick={finishExam} className="ui-btn ui-btn--primary" style={{ padding: '15px', fontSize: '1.1rem', margin: '20px auto', display: 'block', maxWidth: '400px', width: '100%' }}>
                    Entregar Prova e Corrigir
                  </button>
                )}

                {showLessonAction && (
                <PainelErros
                  titulo="Professor de RLM"
                  descricao={`Você errou ${wrongCount} questão(ões) de Lógica. Quer uma explicação passo a passo, com tabelas-verdade e fórmulas, focada no que errou?`}
                  rotuloBotao="Gerar explicação detalhada"
                  onGerar={() => generateLesson(getWrongQuestions())}
                />
              )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL DE CONFIGURAÇÃO DE IA COM ABAS (OPENROUTER / AISTUDIO) */}
      <HistoricoModal
        aberto={showStatsModal}
        titulo="Histórico de Lógica"
        materia="Raciocínio Lógico"
        stats={stats}
        onFechar={() => setShowStatsModal(false)}
        onLimpar={() => { saveStats({ total: 0, correct: 0, wrong: 0, topics: {} }); setShowStatsModal(false); }}
      />

      <Modal
        open={showLessonModal}
        onClose={() => setShowLessonModal(false)}
        title="Aula de reforço em Raciocínio Lógico"
        subtitle="Gerada a partir das questões que você errou."
        wide
      >
        <Md>{lessonContent}</Md>
      </Modal>

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

      <Toast aviso={aviso} onFechar={() => setAviso(null)} />

    </div>
  );
}