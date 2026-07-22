import React, { useState, useEffect } from "react";
import { 
  Brain, BarChart2, SlidersHorizontal, FileText, BookOpenCheck, 
  Sparkles, Cpu, AlignLeft, GraduationCap, Wand2, PieChart, 
  X, CheckCircle, AlertCircle, ArrowLeft, ZoomIn, ZoomOut
} from "lucide-react";
import ReactMarkdown from "react-markdown";

// ==========================================
// 5. REFATORAÇÃO: ISOLAMENTO DE UTILITÁRIOS E SUBS-COMPONENTES
// ==========================================

// Helper para ler token unificado de autenticação
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
      color: 'var(--text-main)', 
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
    fetchUserSettings();
    const savedStats = localStorage.getItem('cespe_portugues_stats');
    if (savedStats) {
      try { setStats(JSON.parse(savedStats)); } catch (e) { console.error(e); }
    }
  }, []);

  const saveStats = (newStats) => {
    setStats(newStats);
    localStorage.setItem('cespe_portugues_stats', JSON.stringify(newStats));
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

  const openConfigModal = () => {
    const isAIStudio = userApiKey && !userApiKey.startsWith("sk-or-");
    setProviderTab(isAIStudio ? "aistudio" : "openrouter");
    setTempApiKey(userApiKey || "");
    setTempModel(userModel || (isAIStudio ? "gemini-2.5-flash-lite" : "google/gemini-2.5-flash-lite"));
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
            instrucaoDetalhada = "O foco da prova deve ser 100% EXCLUSIVO em Compreensão e Interpretação Textual.";
            break;
            
          case "gramatica":
            instrucaoDetalhada = "O foco da prova deve ser 100% EXCLUSIVO em Morfosintaxe, Regência e Crase.";
            break;
            
          case "reescrita":
            instrucaoDetalhada = "O foco da prova deve ser 100% EXCLUSIVO em Reescrita de Frases e Substituição de Conectivos.";
            break;
            
          case "semantica":
            instrucaoDetalhada = "O foco da prova deve ser 100% EXCLUSIVO em Relações Semânticas e Coesão Textual.";
            break;
            
          case "hardcore":
            instrucaoDetalhada = "Nível Máximo CESPE/CEBRASPE (Padrão Auditor/Delegado). Crie uma prova mista com altíssimo nível de dificuldade. Mescle reescritas complexas, dupla negação, inversões sintáticas profundas e pegadinhas sutis de extrapolação interpretativa. Exija do candidato atenção máxima a detalhes microscópicos do texto.";
            break;
            
          default:
            instrucaoDetalhada = "Gere uma prova mista, distribuindo os itens de forma equilibrada entre interpretação de texto, sintaxe, morfologia, coesão referencial e propostas de reescrita de frases.";
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
      alert(err.message || "Falha ao gerar a aula explicativa.");
      setViewState("exam");
    }
  };

  // Coleta o texto focado agrupado de todos os lotes (para exibição contínua no Split-Screen)
  const compiledTexts = currentData?.questoes?.filter(q => q.textoVinculado).map(q => q.textoVinculado) || [];

  return (
    <div className="container" style={{ 
      // 3. MELHORIA: Injeta via CSS Inline a cor customizada do Marca-Texto se ativo
      backgroundSelection: isHighlighterActive ? '#fef08a !important' : 'auto'
    }}>
      {/* CSS injetado localmente para forçar a cor do marca-texto quando ativo */}
      {isHighlighterActive && (
        <style>{`
          .sticky-text-panel ::selection { background-color: #fde047 !important; color: #000000 !important; }
        `}</style>
      )}

      {/* HEADER */}
      <header className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h1 style={{ color: 'var(--heading-color)', margin: '0 0 5px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Brain size={32} color="var(--primary)" /> Gabarite Português <span style={{ color: 'var(--primary)' }}>CESPE</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Simulador exclusivo de Língua Portuguesa focado em interpretação e gramática aplicada.</p>
        </div>
        <button onClick={() => setShowStatsModal(true)} className="btn" style={{ fontWeight: 'bold' }}>
          <BarChart2 size={20} /> Histórico de Erros
        </button>
      </header>

      {/* PAINEL CONFIG CHAVE IA */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--card-bg)', padding: '15px 20px', borderRadius: '12px', marginBottom: '20px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
          <strong>Mecanismo de IA:</strong> {userApiKey ? <span style={{color: 'var(--success-text)'}}>Chave Ativa ({userModel || "Padrão"})</span> : <span>Vincule sua chave gratuita do OpenRouter ou Google AI Studio.</span>}
        </div>
        <button onClick={openConfigModal} style={{ background: 'var(--primary)', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '0.95rem', cursor: 'pointer', fontWeight: 'bold' }}>
          ⚙️ Configurar API
        </button>
      </div>

      {/* TELA INICIAL: WIZARD DE CONFIGURAÇÃO */}
      {viewState === "initial" && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
          <div className="panel" style={{ padding: '25px', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--heading-color)' }}>
              <SlidersHorizontal size={20} color="var(--primary)" /> Montar Caderno de Questões Inéditas
            </h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '20px' }}>
              <div>
                <label className="label">Eixo Temático Principal</label>
                <select className="select" value={configFocus} onChange={e => setConfigFocus(e.target.value)}>
                  <option value="completo">Misto (Interpretação e Gramática)</option>
                  <option value="interpretacao">Compreensão e Inferência Textual</option>
                  <option value="gramatica">Morfosintaxe, Regência e Crase</option>
                  <option value="reescrita">Reescrita de Frases e Substituição de Conectivos</option>
                  <option value="semantica">Relações Semânticas e Coesão Textual</option>
                  <option value="hardcore">Nível Hardcore (Extrapolação e Pegadinhas de Linha)</option>
                </select>
              </div>

              <div>
                <label className="label">Nível de Rigor</label>
                <select className="select" value={configDifficulty} onChange={e => setConfigDifficulty(e.target.value)}>
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
                <label className="label">Tipologia Textual Base</label>
                <select className="select" value={configTypology} onChange={e => setConfigTypology(e.target.value)}>
                  <option value="Dissertativo-Argumentativo">Dissertativo-Argumentativo (Político/Social)</option>
                  <option value="Texto Literário / Crônica">Narrativo / Literário (Poemas e Crônicas)</option>
                  <option value="Jornalístico / Informativo">Jornalístico (Notícias de Geopolítica/Segurança)</option>
                  <option value="Oficial (Manual da Presidência)">Redação Oficial (Padrão Manual da Presidência)</option>
                </select>
              </div>

              <div>
                <label className="label">Tamanho do Texto</label>
                <select className="select" value={configTextSize} onChange={e => setConfigTextSize(e.target.value)}>
                  <option value="Longo">Longo (Padrão 30 linhas CESPE)</option>
                  <option value="Médio">Médio (15 a 20 linhas)</option>
                  <option value="Curto">Curto (Fragmentos de 1 parágrafo)</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '20px' }}>
              <div>
                <label className="label">Formato de Julgamento</label>
                <select className="select" value={configFormato} onChange={e => setConfigFormato(e.target.value)}>
                  <option value="Certo/Errado">Certo / Errado (Clássico UnB/CESPE)</option>
                  <option value="Múltipla Escolha">Múltipla Escolha (A, B, C, D, E)</option>
                </select>
              </div>

              <div>
                <label className="label">Volume de Assertivas</label>
                <select className="select" value={configAmount} onChange={e => setConfigAmount(Number(e.target.value))}>
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
                <span style={{ fontSize: '0.95rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)' }}>
                  <FileText size={18} /> Injetar Texto-Base de Amparo
                </span>
                <div style={{ width: '40px', height: '22px', background: configTextBase ? 'var(--primary)' : 'var(--border)', borderRadius: '20px', position: 'relative', marginLeft: 'auto', transition: '0.2s' }}>
                  <div style={{ width: '18px', height: '18px', background: '#fff', borderRadius: '50%', position: 'absolute', top: '2px', left: configTextBase ? '20px' : '2px', transition: '0.2s' }}></div>
                </div>
              </div>

              <div style={{ flex: '1 1 200px', display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => setConfigExamMode(!configExamMode)}>
                <span style={{ fontSize: '0.95rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)' }}>
                  <BookOpenCheck size={18} /> Ocultar Gabaritos (Modo Simulado)
                </span>
                <div style={{ width: '40px', height: '22px', background: configExamMode ? 'var(--primary)' : 'var(--border)', borderRadius: '20px', position: 'relative', marginLeft: 'auto', transition: '0.2s' }}>
                  <div style={{ width: '18px', height: '18px', background: '#fff', borderRadius: '50%', position: 'absolute', top: '2px', left: configExamMode ? '20px' : '2px', transition: '0.2s' }}></div>
                </div>
              </div>
            </div>

            <button onClick={generateExam} className="btn primary" style={{ width: '100%', padding: '15px', fontSize: '1.1rem', gap: '8px' }}>
              <Sparkles size={20} /> Construir Caderno Inédito
            </button>
            {error && <div style={{ color: 'var(--error-text)', fontSize: '0.85rem', marginTop: '10px', textAlign: 'center', fontWeight: 'bold' }}>{error}</div>}
          </div>
        </div>
      )}

      {/* LOADING */}
      {viewState === "loading" && (
        <div className="panel" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <div className="spinner" style={{ margin: '0 auto 20px auto', width: '40px', height: '40px', border: '4px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', fontWeight: 'bold' }}>{loadingMsg}</p>
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
                  background: isHighlighterActive ? '#fef08a' : 'transparent',
                  borderColor: isHighlighterActive ? '#f59e0b' : 'var(--border)',
                  color: isHighlighterActive ? '#000' : 'var(--text-secondary)'
                }}
                title="Ative e use o mouse para selecionar e realçar trechos do texto."
              >
                Definir Marca-Texto
              </button>

              {/* Controles de Zoom de Fonte */}
              <button onClick={() => setTextFontSize(p => Math.min(p + 0.1, 1.5))} className="btn small" style={{ padding: '4px' }} title="Aumentar Fonte"><ZoomIn size={16}/></button>
              <button onClick={() => setTextFontSize(p => Math.max(p - 0.1, 0.85))} className="btn small" style={{ padding: '4px' }} title="Diminuir Fonte"><ZoomOut size={16}/></button>
            </>
          )}

          {/* NOVO: Botão Mostrar / Ocultar Texto */}
          <button 
            onClick={() => setIsTextVisible(!isTextVisible)} 
            className="btn small" 
            style={{ 
              padding: '4px 12px', 
              fontSize: '0.8rem', 
              fontWeight: 'bold',
              background: 'var(--hover-bg)',
              color: 'var(--text-main)',
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
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Julgue as assertivas e verifique a correção no final.</span>
                </div>
              )}

              {currentData.questoes.map((q, index) => {
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
                        <p style={{ fontSize: '1.05rem', color: 'var(--text-main)', lineHeight: '1.6', marginBottom: '20px', fontWeight: '500' }}>
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
                          <div className="quiz-explanation" style={{ marginTop: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', marginBottom: '8px', color: isCorrect ? 'var(--success-text)' : 'var(--error-text)' }}>
                              {isCorrect ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                              {isCorrect ? "Gabarito Aceito!" : "Julgamento Incorreto."} (Gabarito Oficial: {q.gabarito})
                            </div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.6' }}>
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
                <button onClick={finishExam} className="btn primary" style={{ padding: '15px', fontSize: '1.1rem', margin: '20px auto', display: 'block', maxWidth: '400px', width: '100%' }}>
                  Finalizar e Corrigir Caderno
                </button>
              )}

              {/* CHAMADA DO PARECER DE REVISÃO DO PROFESSOR */}
              {((isExamFinished || (!configExamMode && Object.keys(userAnswers).length === currentData?.questoes?.length)) && currentData.questoes.filter(q => userAnswers[q.id] && userAnswers[q.id] !== q.gabarito).length > 0) && (
                <div style={{ background: 'var(--warning-bg, #fffbeb)', border: '1px solid #fcd34d', padding: '25px', borderRadius: '12px', textAlign: 'center', boxShadow: 'var(--shadow-md)' }}>
                  <h4 style={{ margin: '0 0 10px 0', color: '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '1.2rem' }}>
                    <GraduationCap size={24} /> Professor de Sintaxe e Semântica (IA)
                  </h4>
                  <p style={{ color: '#92400e', fontSize: '0.95rem', marginBottom: '20px' }}>
                    Houve desvios de interpretação ou regras gramaticais. Deseja uma microaula focada exclusivamente nos seus erros deste caderno?
                  </p>
                  <button onClick={() => generateLesson(currentData.questoes.filter(q => userAnswers[q.id] && userAnswers[q.id] !== q.gabarito))} className="btn" style={{ background: '#f59e0b', color: 'white', border: 'none', width: '100%', padding: '12px', fontSize: '1.05rem', fontWeight: 'bold', display: 'flex', justifyContent: 'center', gap: '8px' }}>
                    <Wand2 size={20} /> Estruturar Aula de Revisão
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          5. COMPONENTES MODAIS REFATORADOS À PARTE
         ========================================== */}

      {/* MODAL DA AULA DE REVISÃO */}
      {showLessonModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="panel" style={{ width: '100%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', border: '2px solid #f59e0b' }}>
            <div style={{ background: '#f59e0b', color: 'white', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <GraduationCap size={24} /> Parecer de Análise Gramatical
              </h2>
              <button onClick={() => setShowLessonModal(false)} style={{ background: 'none', border: 'none', color: '#fef3c7', cursor: 'pointer' }}><X size={24} /></button>
            </div>
            <div style={{ padding: '30px', overflowY: 'auto', flex: 1, background: 'var(--card-bg)' }}>
              <div style={{ fontSize: '1.05rem', lineHeight: '1.7', color: 'var(--text-main)' }}>
                <ReactMarkdown>{lessonContent}</ReactMarkdown>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIGURAÇÃO DE IA (PROVEDORES) */}
      {showConfig && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.8)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: '12px', padding: '30px', width: '100%', maxWidth: '500px', border: '1px solid var(--border)' }}>
            <h3 style={{ marginTop: 0, color: 'var(--heading-color)', borderBottom: '1px solid var(--border)', paddingBottom: '15px', marginBottom: '15px' }}>⚙️ Provedores de Inteligência Artificial</h3>
            
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <button onClick={() => { setProviderTab("openrouter"); setTempModel("google/gemini-2.5-flash"); }} className={`btn ${providerTab === "openrouter" ? "primary" : ""}`} style={{ flex: 1, padding: '10px' }}>OpenRouter</button>
              <button onClick={() => { setProviderTab("aistudio"); setTempModel("gemini-2.5-flash"); }} className={`btn ${providerTab === "aistudio" ? "primary" : ""}`} style={{ flex: 1, padding: '10px' }}>Google AI Studio</button>
            </div>

            {providerTab === "openrouter" && (
              <div style={{ marginBottom: '20px' }}>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '15px' }}>Conecte sua conta via OAuth unificado do OpenRouter de forma automatizada.</p>
                {userApiKey && userApiKey.startsWith("sk-or-") ? (
                  <div style={{ padding: '12px', borderRadius: '6px', background: 'var(--success-bg)', border: '1px solid var(--success-text)', color: 'var(--success-text)', fontWeight: 'bold' }}>✅ OpenRouter Ativo!</div>
                ) : (
                  <button onClick={() => window.location.href = `https://openrouter.ai/auth?callback_url=${encodeURIComponent(window.location.origin + "/callback")}`} className="btn primary" style={{ width: '100%' }}>🔗 Autenticar via OpenRouter</button>
                )}
              </div>
            )}

            {providerTab === "aistudio" && (
              <div style={{ marginBottom: '20px' }}>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '15px' }}>Gere e cole a sua chave livre de acessos da API do Google AI Studio.</p>
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="btn" style={{ width: '100%', marginBottom: '15px', display: 'block', textAlign: 'center', background: '#e2e8f0', color: '#1e293b', fontWeight: 'bold', textDecoration: 'none' }}>1️⃣ Criar API Key Oficial</a>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>2️⃣ Token do AI Studio:</label>
                <input type="password" value={tempApiKey} onChange={(e) => setTempApiKey(e.target.value)} placeholder="AIzaSy..." style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-main)' }} />
              </div>
            )}

            <div style={{ marginBottom: '25px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>Modelo Alvo:</label>
              <input type="text" value={tempModel} onChange={(e) => setTempModel(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-main)' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px' }}>
              <button onClick={() => setShowConfig(false)} className="btn">Fechar</button>
              <button onClick={saveConfigToDB} className="btn primary">{savingConfig ? "⏳ Salvando..." : "Gravar Configurações"}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL HISTÓRICO DE DESEMPENHO */}
      {showStatsModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="panel" style={{ width: '100%', maxWidth: '500px', padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg)' }}>
              <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--heading-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <PieChart size={22} color="var(--primary)" /> Rendimento em Língua Portuguesa
              </h2>
              <button onClick={() => setShowStatsModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={24} /></button>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'flex', gap: '15px', marginBottom: '25px' }}>
                <div style={{ flex: 1, background: 'var(--bg)', padding: '15px', borderRadius: '10px', textAlign: 'center' }}><span style={{ display: 'block', fontSize: '1.8rem', fontWeight: 'bold' }}>{stats.total}</span><span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Julgados</span></div>
                <div style={{ flex: 1, background: 'var(--success-bg)', padding: '15px', borderRadius: '10px', textAlign: 'center' }}><span style={{ display: 'block', fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--success-text)' }}>{stats.correct}</span><span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Acertos</span></div>
                <div style={{ flex: 1, background: 'var(--error-bg)', padding: '15px', borderRadius: '10px', textAlign: 'center' }}><span style={{ display: 'block', fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--error-text)' }}>{stats.wrong}</span><span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Erros</span></div>
              </div>

              <h3 style={{ fontSize: '1rem', color: 'var(--heading-color)', marginBottom: '15px' }}>Desempenho por Tópico Lexical</h3>
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {Object.keys(stats.topics).length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Nenhum item computado.</p>
                ) : (
                  Object.entries(stats.topics).map(([name, data]) => {
                    const pct = (data.correct + data.wrong) > 0 ? Math.round((data.correct / (data.correct + data.wrong)) * 100) : 0;
                    return (
                      <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontSize: '0.9rem', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
                        <div style={{ display: 'flex', gap: '15px', fontSize: '0.9rem' }}>
                          <span style={{ color: 'var(--success-text)', fontWeight: 'bold' }}>{data.correct}C</span>
                          <span style={{ color: 'var(--error-text)', fontWeight: 'bold' }}>{data.wrong}E</span>
                          <span style={{ color: pct >= 70 ? 'var(--success-text)' : pct < 50 ? 'var(--error-text)' : '#f59e0b', fontWeight: '900' }}>{pct}%</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <button onClick={() => { if(window.confirm("Zerar estatísticas de Português?")) saveStats({ total: 0, correct: 0, wrong: 0, topics: {} }); }} style={{ width: '100%', marginTop: '20px', background: 'var(--error-bg)', color: 'var(--error-text)', border: '1px solid var(--error-text)', padding: '10px', borderRadius: '8px', fontWeight: 'bold' }}>Limpar Todo o Histórico</button>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <div style={{ textAlign: 'center', marginTop: '3rem', paddingBottom: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        Foco na aprovação! Desenvolvido por TecnoPriv.Top
      </div>
    </div>
  );
}