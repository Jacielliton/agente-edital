import React, { useState, useEffect } from "react";
import {
  Brain, BarChart2, SlidersHorizontal, FileText, BookOpenCheck, Sparkles, AlignLeft, ZoomIn, ZoomOut,
} from "lucide-react";
// Markdown único da plataforma: bloco de código, inline, tabelas e fórmulas.
import Md from "../components/Markdown";
import { Modal, ConfirmDialog, Notice, Toast} from "../components/ui";
import { AiKeyBar, AiKeyPanel, useAiKey, getAuthToken } from "../components/AiKeyConfig";
import { registrarSimulado } from "../desempenho";
import { QuestaoCard, PainelErros, HistoricoModal } from "../components/simulador";

// ==========================================
// 5. REFATORAÇÃO: ISOLAMENTO DE UTILITÁRIOS E SUBS-COMPONENTES
// ==========================================

// getAuthToken vive em components/AiKeyConfig.jsx — uma cópia só para as nove telas.

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

// 2. MELHORIA: COMPONENTE DE TEXTO RESPONSIVO E FLUIDO
const LineNumberedText = ({ text, fontSize }) => {
  if (!text) return null;
  
  // Divide o texto pelas quebras de linha reais (parágrafos do texto base)
  const paragraphs = text.split('\n').filter(p => p.trim() !== "");

  return (
    <div style={{ 
      fontSize: `${fontSize}rem`, 
      lineHeight: '1.9', 
      fontFamily: 'serif', 
      color: 'var(--fg)', 
      textAlign: 'justify',
      paddingLeft: '10px',
      paddingRight: '10px'
    }}>
      {paragraphs.map((para, pIdx) => (
        <p key={pIdx} style={{ 
          textIndent: '2.5rem', 
          marginBottom: '18px',
          wordWrap: 'break-word',
          hyphens: 'auto'
        }}>
          {para}
        </p>
      ))}
    </div>
  );
};

// COMPONENTE PRINCIPAL
export default function GabariteCespe() {
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  // --- ESTADOS DE CONFIGURAÇÃO DE IA ---
  const [showConfig, setShowConfig] = useState(false);
  const { userApiKey, userModel, setUserApiKey, setUserModel, ia } = useAiKey();
  const [aviso, setAviso] = useState(null);

  // --- ESTADOS DO SIMULADOR ---
  const [configFocus, setConfigFocus] = useState("completo");
  const [configDifficulty, setConfigDifficulty] = useState("medio");
  const [configFormato, setConfigFormato] = useState("Certo/Errado");
  const [configAmount, setConfigAmount] = useState(10);
  const [configTextBase, setConfigTextBase] = useState(true);
  const [configExamMode, setConfigExamMode] = useState(false);
  
  // 4. MELHORIA: CONTROLE DE TAMANHO E TIPOLOGIA TEXTUAL
  const [configTextSize, setConfigTextSize] = useState("Longo"); 
  const [configTypology, setConfigTypology] = useState("Dissertativo-Argumentativo");

  // 3. MELHORIA: ESTADO DE CONFIGURAÇÃO VISUAL (FONTE E MARCA-TEXTO)
  const [textFontSize, setTextFontSize] = useState(1.05); // Multiplicador de escala rem
  const [isHighlighterActive, setIsHighlighterActive] = useState(false);
  const [isTextVisible, setIsTextVisible] = useState(true);

  // --- ESTADOS DE CONTROLE DE FLUXO ---
  const [viewState, setViewState] = useState("initial"); 
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState("");
  const [currentData, setCurrentData] = useState(null);
  const [userAnswers, setUserAnswers] = useState({});
  const [isExamFinished, setIsExamFinished] = useState(false);

  // --- ESTADOS DE MÉTRICAS E MODAIS DE REVISÃO ---
  const [stats, setStats] = useState({ total: 0, correct: 0, wrong: 0, topics: {} });
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showLessonModal, setShowLessonModal] = useState(false);
  const [lessonContent, setLessonContent] = useState("");

  useEffect(() => {
    const savedStats = localStorage.getItem('cespe_portugues_stats');
    if (savedStats) {
      try { setStats(JSON.parse(savedStats)); } catch (e) { console.error(e); }
    }
  }, []);

  const saveStats = (newStats) => {
    setStats(newStats);
    localStorage.setItem('cespe_portugues_stats', JSON.stringify(newStats));
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
        setLoadingMsg(`A analisar e estruturar textos gramaticais... (Lote ${i + 1} de ${batches})`);
        const currentBatchSize = Math.min(batchSize, configAmount - (i * batchSize));

        // Mapeia o foco selecionado para uma instrução exclusiva e rigorosa
        let instrucaoDetalhada = "";
        switch (configFocus) {
          case "interpretacao":
            instrucaoDetalhada = "O foco da prova deve ser 100% EXCLUSIVO em Compreensão e Interpretação Textual, incluindo reconhecimento e diferenciação de tipos e gêneros textuais variados.";
            break;

          case "generos":
            instrucaoDetalhada = "O foco da prova deve ser 100% EXCLUSIVO em Reconhecimento de Tipos e Gêneros Textuais (narrativo, descritivo, dissertativo-argumentativo, injuntivo, expositivo, e gêneros como notícia, editorial, carta, e-mail, etc.).";
            break;

          case "ortografia":
            instrucaoDetalhada = "O foco da prova deve ser 100% EXCLUSIVO em Domínio da Ortografia Oficial (acentuação gráfica, uso de letras, hífen e demais regras ortográficas vigentes).";
            break;
            
          case "gramatica":
            instrucaoDetalhada = "O foco da prova deve ser 100% EXCLUSIVO em Morfosintaxe, Regência, Crase, Concordância Verbal e Nominal, e Classes de Palavras.";
            break;

          case "verbos":
            instrucaoDetalhada = "O foco da prova deve ser 100% EXCLUSIVO em Emprego de Tempos e Modos Verbais no contexto do texto base.";
            break;

          case "pontuacao":
            instrucaoDetalhada = "O foco da prova deve ser 100% EXCLUSIVO em Emprego dos Sinais de Pontuação e Colocação dos Pronomes Átonos (próclise, mesóclise e ênclise).";
            break;
            
          case "reescrita":
            instrucaoDetalhada = "O foco da prova deve ser 100% EXCLUSIVO em Reescrita de Frases e Substituição de Conectivos, incluindo significação e substituição de palavras ou trechos do texto.";
            break;
            
          case "semantica":
            instrucaoDetalhada = "O foco da prova deve ser 100% EXCLUSIVO em Relações Semânticas e Coesão Textual (referenciação, substituição, repetição e conectores).";
            break;
            
          case "hardcore":
            instrucaoDetalhada = "Nível Máximo CESPE/CEBRASPE (Padrão Auditor/Delegado). Crie uma prova mista com altíssimo nível de dificuldade. Mescle reescritas complexas, dupla negação, inversões sintáticas profundas e pegadinhas sutis de extrapolação interpretativa. Exija do candidato atenção máxima a detalhes microscópicos do texto.";
            break;
            
          default:
            instrucaoDetalhada = "Gere uma prova mista, distribuindo os itens de forma equilibrada entre: compreensão e interpretação textual, tipos e gêneros textuais, ortografia oficial, coesão textual, tempos e modos verbais, morfossintaxe (classes de palavras, concordância, regência, crase, pontuação, colocação pronominal) e reescrita de frases e parágrafos.";
        }

        // Comando linear e ultra-imperativo para blindar o escopo da IA
        const instrucoesFocoCompletas = `DIRETRIZ OBRIGATÓRIA: ${instrucaoDetalhada} PROIBIDO abordar qualquer outro assunto de língua portuguesa que fuja dessa vertente. Estilo do Texto Base: ${configTypology}. Extensão: ${configTextSize}.`.trim();

        // Descobre se a chave é do Google
        const isGoogleKey = userApiKey && !userApiKey.startsWith("sk-or-");
        // Define um modelo padrão seguro dependendo do provedor
        const defaultModel = isGoogleKey ? "gemini-2.5-flash-lite" : "nvidia/nemotron-3-super-120b-a12b:free";

        const payload = {
          subject: "Língua Portuguesa", 
          focus: instrucoesFocoCompletas,
          difficulty: configDifficulty,
          amount: currentBatchSize,
          generate_text: configTextBase, 
          formato: configFormato,
          model: userModel || defaultModel, // Usa o fallback inteligente
          api_key: userApiKey || null
        };

        let data = null;
        let tentativas = 0;

        while (tentativas < 2) {
          try {
            data = await fetchStreamAsJson(`${API_URL}/generate-simulado-cespe`, {
              method: "POST",
              headers: { 
                "Content-Type": "application/json",
                "Authorization": token ? `Bearer ${token}` : ""
              },
              body: JSON.stringify(payload)
            });
            
            // NOVO: Aborta imediatamente e avisa o usuário se a API recusar (ex: 404, 401)
            if (data && data.error) {
              throw new Error(`Erro da API: ${data.error}`);
            }

            if (data && data.questoes && data.questoes.length > 0) break;
            throw new Error("Lote retornado vazio pela IA.");
          } catch (e) {
            tentativas++;
            // Se o erro vier direto da API (Google/OpenRouter), não adianta tentar de novo.
            if (e.message.includes("Erro da API")) throw e; 
            
            if (tentativas >= 2) throw new Error(e.message || "A IA falhou em estruturar os itens de Língua Portuguesa.");
            setLoadingMsg(`Corrigindo alinhamento léxico... (A repetir Lote ${i + 1})`);
          }
        }

        const questoesCorrigidas = data.questoes.map((q, idx) => ({
          ...q,
          id: `q_pt_${i}_${idx}`,
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

  const handleAnswer = (qId, answer) => {
    if (isExamFinished) return;
    if (!configExamMode) {
      if (userAnswers[qId]) return; 
      const newAnswers = { ...userAnswers, [qId]: answer };
      setUserAnswers(newAnswers);
      
      const q = currentData.questoes.find(x => x.id === qId);
      const isCorrect = answer === q.gabarito;
      let newStats = { ...stats };
      newStats.total++;
      if (isCorrect) newStats.correct++; else newStats.wrong++;
      if (!newStats.topics[q.assunto]) newStats.topics[q.assunto] = { correct: 0, wrong: 0 };
      if (isCorrect) newStats.topics[q.assunto].correct++; else newStats.topics[q.assunto].wrong++;
      saveStats(newStats);
    } else {
      const newAnswers = { ...userAnswers };
      if (newAnswers[qId] === answer) delete newAnswers[qId];
      else newAnswers[qId] = answer; 
      setUserAnswers(newAnswers);
    }
  };

  const finishExam = () => {
    if (isExamFinished) return;
    setIsExamFinished(true);

    if (configExamMode) {
      let newStats = { ...stats };
      currentData.questoes.forEach(q => {
        const ans = userAnswers[q.id];
        if (ans) {
          newStats.total++;
          if (ans === q.gabarito) newStats.correct++; else newStats.wrong++;
          if (!newStats.topics[q.assunto]) newStats.topics[q.assunto] = { correct: 0, wrong: 0 };
          if (ans === q.gabarito) newStats.topics[q.assunto].correct++; else newStats.topics[q.assunto].wrong++;
        }
      });
      saveStats(newStats);
    }
    // Além do painel local, o resultado da sessão vai para o servidor: sem
    // isto, o Meu Desempenho e o ranking ignoram esta ferramenta inteira.
    const respondidas = currentData.questoes.filter((q) => userAnswers[q.id]);
    registrarSimulado({
      ferramenta: "cespe",
      foco: configFocus,
      acertos: respondidas.filter((q) => userAnswers[q.id] === q.gabarito).length,
      respondidas: respondidas.length,
      nivel: configDifficulty,
      formato: configFormato,
    });

    setViewState("results");
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

  // Coleta o texto focado agrupado de todos os lotes (para exibição contínua no Split-Screen)
  const compiledTexts = currentData?.questoes?.filter(q => q.textoVinculado).map(q => q.textoVinculado) || [];

  return (
    <div className="gab" style={{ 
      // 3. MELHORIA: Injeta via CSS Inline a cor customizada do Marca-Texto se ativo
      backgroundSelection: isHighlighterActive ? 'var(--highlight) !important' : 'auto'
    }}>
      {/* CSS injetado localmente para forçar a cor do marca-texto quando ativo */}
      {isHighlighterActive && (
        <style>{`
          .sticky-text-panel ::selection { background-color: var(--highlight) !important; color: var(--highlight-fg) !important; }
        `}</style>
      )}

      {/* HEADER */}
      <header className="gab__topo" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h1 style={{ color: 'var(--fg)', margin: '0 0 5px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Brain size={32} color="var(--primary)" /> Gabarite Português <span style={{ color: 'var(--primary)' }}>CESPE</span>
          </h1>
          <p style={{ color: 'var(--fg-2)', margin: 0 }}>Simulador exclusivo de Língua Portuguesa focado em interpretação e gramática aplicada.</p>
        </div>
        <button onClick={() => setShowStatsModal(true)} className="ui-btn" style={{ fontWeight: 'bold' }}>
          <BarChart2 size={20} /> Histórico de Erros
        </button>
      </header>

      <AiKeyBar
        ia={ia}
        userApiKey={userApiKey}
        userModel={userModel}
        onConfigurar={() => setShowConfig(true)}
        label="IA da prova de Português"
      />

      {/* TELA INICIAL: WIZARD DE CONFIGURAÇÃO */}
      {viewState === "initial" && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
          <div className="ui-card ui-card--pad" style={{ padding: '25px', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--fg)' }}>
              <SlidersHorizontal size={20} color="var(--primary)" /> Montar Caderno de Questões Inéditas
            </h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '20px' }}>
              <div>
                <label className="ui-field__label">Eixo Temático Principal</label>
                <select className="ui-input" value={configFocus} onChange={e => setConfigFocus(e.target.value)}>
                  <option value="completo">Misto (Interpretação e Gramática)</option>
                  <option value="interpretacao">Compreensão e Inferência Textual</option>
                  <option value="generos">Tipos e Gêneros Textuais</option>
                  <option value="ortografia">Ortografia Oficial</option>
                  <option value="gramatica">Morfosintaxe, Regência e Crase</option>
                  <option value="verbos">Tempos e Modos Verbais</option>
                  <option value="pontuacao">Pontuação e Colocação Pronominal</option>
                  <option value="reescrita">Reescrita de Frases e Substituição de Conectivos</option>
                  <option value="semantica">Relações Semânticas e Coesão Textual</option>
                  <option value="hardcore">Nível Hardcore (Extrapolação e Pegadinhas de Linha)</option>
                </select>
              </div>

              <div>
                <label className="ui-field__label">Nível de Rigor</label>
                <select className="ui-input" value={configDifficulty} onChange={e => setConfigDifficulty(e.target.value)}>
                  <option value="medio">Médio (Padrão Agente/Escrivão)</option>
                  <option value="facil">Introdutório</option>
                  <option value="dificil">Complexo (Pegadinhas sutis de pontuação)</option>
                  <option value="avancado">Extremo (Padrão Auditor / Consultor Legislativo)</option>
                </select>
              </div>
            </div>

            {/* 4. MELHORIA: NOVOS SELETORES DE TIPOLOGIA E EXTENSÃO TEXTUAL */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '20px' }}>
              <div>
                <label className="ui-field__label">Tipologia Textual Base</label>
                <select className="ui-input" value={configTypology} onChange={e => setConfigTypology(e.target.value)}>
                  <option value="Dissertativo-Argumentativo">Dissertativo-Argumentativo (Político/Social)</option>
                  <option value="Texto Literário / Crônica">Narrativo / Literário (Poemas e Crônicas)</option>
                  <option value="Jornalístico / Informativo">Jornalístico (Notícias de Geopolítica/Segurança)</option>
                  <option value="Oficial (Manual da Presidência)">Redação Oficial (Padrão Manual da Presidência)</option>
                </select>
              </div>

              <div>
                <label className="ui-field__label">Tamanho do Texto</label>
                <select className="ui-input" value={configTextSize} onChange={e => setConfigTextSize(e.target.value)}>
                  <option value="Longo">Longo (Padrão 30 linhas CESPE)</option>
                  <option value="Médio">Médio (15 a 20 linhas)</option>
                  <option value="Curto">Curto (Fragmentos de 1 parágrafo)</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '20px' }}>
              <div>
                <label className="ui-field__label">Formato de Julgamento</label>
                <select className="ui-input" value={configFormato} onChange={e => setConfigFormato(e.target.value)}>
                  <option value="Certo/Errado">Certo / Errado (Clássico UnB/CESPE)</option>
                  <option value="Múltipla Escolha">Múltipla Escolha (A, B, C, D, E)</option>
                </select>
              </div>

              <div>
                <label className="ui-field__label">Volume de Assertivas</label>
                <select className="ui-input" value={configAmount} onChange={e => setConfigAmount(Number(e.target.value))}>
                  <option value={5}>5 Itens</option>
                  <option value={10}>10 Itens</option>
                  <option value={15}>15 Itens</option>
                  <option value={20}>20 Itens</option>
                </select>
              </div>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }} />

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', marginBottom: '25px' }}>
              <div style={{ flex: '1 1 200px', display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => setConfigTextBase(!configTextBase)}>
                <span style={{ fontSize: '0.95rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--fg)' }}>
                  <FileText size={18} /> Injetar Texto-Base de Amparo
                </span>
                <div style={{ width: '40px', height: '22px', background: configTextBase ? 'var(--primary)' : 'var(--border)', borderRadius: '20px', position: 'relative', marginLeft: 'auto', transition: '0.2s' }}>
                  <div style={{ width: '18px', height: '18px', background: '#fff', borderRadius: '50%', position: 'absolute', top: '2px', left: configTextBase ? '20px' : '2px', transition: '0.2s' }}></div>
                </div>
              </div>

              <div style={{ flex: '1 1 200px', display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => setConfigExamMode(!configExamMode)}>
                <span style={{ fontSize: '0.95rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--fg)' }}>
                  <BookOpenCheck size={18} /> Ocultar Gabaritos (Modo Simulado)
                </span>
                <div style={{ width: '40px', height: '22px', background: configExamMode ? 'var(--primary)' : 'var(--border)', borderRadius: '20px', position: 'relative', marginLeft: 'auto', transition: '0.2s' }}>
                  <div style={{ width: '18px', height: '18px', background: '#fff', borderRadius: '50%', position: 'absolute', top: '2px', left: configExamMode ? '20px' : '2px', transition: '0.2s' }}></div>
                </div>
              </div>
            </div>

            <button onClick={generateExam} className="ui-btn ui-btn--primary" style={{ width: '100%', padding: '15px', fontSize: '1.1rem', gap: '8px' }}>
              <Sparkles size={20} /> Construir Caderno Inédito
            </button>
            {error && <div style={{ color: 'var(--error-text)', fontSize: '0.85rem', marginTop: '10px', textAlign: 'center', fontWeight: 'bold' }}>{error}</div>}
          </div>
        </div>
      )}

      {/* LOADING */}
      {viewState === "loading" && (
        <div className="ui-card ui-card--pad" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <div className="spinner" style={{ margin: '0 auto 20px auto', width: '40px', height: '40px', border: '4px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <p style={{ color: 'var(--fg-2)', fontSize: '1.1rem', fontWeight: 'bold' }}>{loadingMsg}</p>
        </div>
      )}

      {/* 1. MELHORIA: AMBIENTE DE PROVA COM LAYOUT EM DUAS COLUNAS (SPLIT-SCREEN) */}
      {(viewState === "exam" || viewState === "results") && currentData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {viewState === "results" && (
            <div style={{ background: 'var(--primary)', color: 'white', padding: '2rem', borderRadius: '12px', textAlign: 'center', boxShadow: 'var(--shadow-md)' }}>
              <h3 style={{ fontSize: '2rem', margin: '0 0 10px 0' }}>Caderno Finalizado!</h3>
              <p style={{ fontSize: '1.1rem', margin: 0, opacity: 0.9 }}>Analise a justificativa sintática dos seus erros.</p>
              <button onClick={() => setViewState("initial")} style={{ marginTop: '1.5rem', background: 'white', color: 'var(--primary)', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                Gerar Novo Caderno
              </button>
            </div>
          )}

          {/* PAINEL DINÂMICO SPLIT-SCREEN RECONFIGURADO */}
<div style={{ 
  display: 'grid', 
  gridTemplateColumns: (compiledTexts.length > 0 && isTextVisible) ? 'repeat(auto-fit, minmax(450px, 1fr))' : '1fr', 
  gap: '25px', 
  alignItems: 'start' 
}}>
  
  {/* COLUNA ESQUERDA: TEXTO-BASE COM ALTURA LIMITADA, SCROLL E MINIMIZAÇÃO */}
  {compiledTexts.length > 0 && (
    <div className="sticky-text-panel" style={{ 
      position: 'sticky', 
      top: '20px', 
      // Garante que o painel caiba na tela do usuário e acione o scroll interno
      maxHeight: 'min(750px, calc(100vh - 60px))', 
      overflowY: isTextVisible ? 'auto' : 'visible', 
      background: 'var(--card-bg)', 
      border: '1px solid var(--border)', 
      borderRadius: '12px', 
      padding: '20px',
      boxShadow: 'var(--shadow-md)',
      transition: 'all 0.3s ease'
    }}>
      
      {/* BARRA DE UTILITÁRIOS INTERATIVOS */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        borderBottom: isTextVisible ? '1px solid var(--border)' : 'none', 
        paddingBottom: '10px', 
        marginBottom: isTextVisible ? '15px' : '0' 
      }}>
        <span style={{ fontWeight: 'bold', color: 'var(--primary)', fontSize: '0.85rem', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <AlignLeft size={16} /> Texto de Apoio
        </span>
        
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {isTextVisible && (
            <>
              {/* Botão Liga/Desliga Marca-Texto */}
              <button 
                onClick={() => setIsHighlighterActive(!isHighlighterActive)}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.8rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  border: '1px solid',
                  background: isHighlighterActive ? 'var(--highlight)' : 'transparent',
                  borderColor: isHighlighterActive ? 'var(--highlight-strong)' : 'var(--border)',
                  color: isHighlighterActive ? 'var(--highlight-fg)' : 'var(--fg-2)'
                }}
                title="Ative e use o mouse para selecionar e realçar trechos do texto."
              >
                Definir Marca-Texto
              </button>

              {/* Controles de Zoom de Fonte */}
              <button onClick={() => setTextFontSize(p => Math.min(p + 0.1, 1.5))} className="ui-btn ui-btn--sm" style={{ padding: '4px' }} title="Aumentar Fonte"><ZoomIn size={16}/></button>
              <button onClick={() => setTextFontSize(p => Math.max(p - 0.1, 0.85))} className="ui-btn ui-btn--sm" style={{ padding: '4px' }} title="Diminuir Fonte"><ZoomOut size={16}/></button>
            </>
          )}

          {/* NOVO: Botão Mostrar / Ocultar Texto */}
          <button 
            onClick={() => setIsTextVisible(!isTextVisible)} 
            className="ui-btn ui-btn--sm" 
            style={{ 
              padding: '4px 12px', 
              fontSize: '0.8rem', 
              fontWeight: 'bold',
              background: 'var(--hover-bg)',
              color: 'var(--fg)',
              border: '1px solid var(--border)'
            }}
          >
            {isTextVisible ? "👁️ Ocultar Texto" : "👁️ Mostrar Texto"}
          </button>
        </div>
      </div>

      {/* Renderização condicional do conteúdo baseado no estado do botão */}
      {isTextVisible && compiledTexts.map((txt, idx) => (
        <LineNumberedText key={idx} text={txt} fontSize={textFontSize} />
      ))}
    </div>
  )}

  {/* COLUNA DIREITA: LISTA DE QUESTÕES CAUTELARES */}
  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {configExamMode && !isExamFinished && (
                <div style={{ background: 'var(--primary-light)', padding: '15px 20px', borderRadius: '12px', border: '1px solid var(--primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)', fontWeight: 'bold' }}>
                    <BookOpenCheck size={20} /> Resoluções Ocultadas
                  </div>
                  <span style={{ fontSize: '0.85rem', color: 'var(--fg-2)' }}>Julgue as assertivas e verifique a correção no final.</span>
                </div>
              )}

              {currentData.questoes.map((q, index) => {
                const uAns = userAnswers[q.id];
                const showExp = Boolean(isExamFinished || (!configExamMode && uAns));
                return (
                  <QuestaoCard
                    key={q.id}
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
                );
              })}

              {!isExamFinished && (
                <button onClick={finishExam} className="ui-btn ui-btn--primary" style={{ padding: '15px', fontSize: '1.1rem', margin: '20px auto', display: 'block', maxWidth: '400px', width: '100%' }}>
                  Finalizar e Corrigir Caderno
                </button>
              )}

              {/* CHAMADA DO PARECER DE REVISÃO DO PROFESSOR */}
              {(() => {
                const erradas = currentData.questoes.filter((q) => userAnswers[q.id] && userAnswers[q.id] !== q.gabarito);
                const fechou = isExamFinished || (!configExamMode && Object.keys(userAnswers).length === currentData?.questoes?.length);
                if (!fechou || erradas.length === 0) return null;
                return (
                  <PainelErros
                    titulo="Professor de Sintaxe e Semântica"
                    descricao={`Você errou ${erradas.length} questão(ões) deste caderno. Quer uma microaula focada exclusivamente nesses erros?`}
                    rotuloBotao="Estruturar aula de revisão"
                    onGerar={() => generateLesson(erradas)}
                  />
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          5. COMPONENTES MODAIS REFATORADOS À PARTE
         ========================================== */}

      {/* MODAL DA AULA DE REVISÃO */}
      <Modal
        open={showLessonModal}
        onClose={() => setShowLessonModal(false)}
        title="Parecer de análise gramatical"
        subtitle="Microaula gerada a partir das questões que você errou neste caderno."
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

      {/* MODAL HISTÓRICO DE DESEMPENHO */}
      <HistoricoModal
        aberto={showStatsModal}
        titulo="Rendimento em Língua Portuguesa"
        materia="Língua Portuguesa"
        stats={stats}
        onFechar={() => setShowStatsModal(false)}
        onLimpar={() => { saveStats({ total: 0, correct: 0, wrong: 0, topics: {} }); setShowStatsModal(false); }}
      />

      <Toast aviso={aviso} onFechar={() => setAviso(null)} />

      {/* FOOTER */}
      <div style={{ textAlign: 'center', marginTop: '3rem', paddingBottom: '1rem', color: 'var(--fg-3)', fontSize: '0.85rem' }}>
        Foco na aprovação! Desenvolvido por TecnoPriv.Top
      </div>
    </div>
  );
}