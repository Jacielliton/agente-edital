import React, { useState, useEffect, useRef } from "react";
import { 
  Coffee, BarChart2, SlidersHorizontal, FileText, BookOpenCheck, 
  Sparkles, Cpu, AlignLeft, GraduationCap, Wand2, PieChart, 
  X, CheckCircle, AlertCircle, Code
} from "lucide-react";
// Markdown único da plataforma: bloco de código, inline, tabelas e fórmulas.
import Md from "../components/Markdown";
import { Modal, ConfirmDialog, Notice } from "../components/ui";
import { AiKeyBar, AiKeyPanel, useAiKey, getAuthToken } from "../components/AiKeyConfig";

// ==========================================
// CONTEÚDO TEÓRICO (Baseado no Edital Fornecido)
// ==========================================
const conteudosTeoricosJava = {
  completo: `### Mapeamento Completo de Java\nSelecione um módulo específico no menu para visualizar onde focar, o que ler por cima e as métricas de validação de cada assunto para o seu concurso.`,
  sintaxe: `### 1. Módulo 'Sintaxe e Tipos de Dados'\n\n**Peso:** MÉDIO\n\n**Onde focar:** Variáveis (declaração, escopo, inicialização), Tipos Primitivos (int, double, boolean, char, etc. e suas particularidades), Tipos de Referência (objetos, null, como funcionam).\n\n**O que ler por cima:** Entender a diferença conceitual entre primitivo e referência é o suficiente para a maioria das questões.\n\n**Métrica de Validação:** Resolver 90% das questões de múltipla escolha sobre a diferença entre tipos primitivos e de referência, e o comportamento de variáveis em atribuições e passagens de parâmetros.`,
  poo: `### 2. Módulo 'Orientação a Objetos'\n\n**Peso:** MÉDIO\n\n**Onde focar:** Conceitos Fundamentais de OO (classes, objetos, atributos, métodos), Encapsulamento (getters/setters, controle de acesso), Herança (extends, super, herança de métodos e atributos, Object class).\n\n**O que ler por cima:** Polimorfismo (sobrescrita de métodos, instanceof) é importante, mas o foco principal deve ser nos outros três pilares.\n\n**Métrica de Validação:** Acertar 90% das questões que envolvam a criação de classes, a relação entre elas via herança e o controle de acesso de membros.`,
  modificadores: `### 3. Módulo 'Modificadores'\n\n**Peso:** MÉDIO\n\n**Onde focar:** public, private, protected (entender o escopo de acesso em diferentes cenários, incluindo pacotes e herança). Modificador static (variáveis de classe, métodos de classe, acesso sem instância). Modificador final (variáveis constantes, métodos não sobrescritos, classes não herdáveis).\n\n**O que ler por cima:** A aplicação prática de static e final em conjunto com os conceitos de OO.\n\n**Métrica de Validação:** Resolver 90% das questões que testem o entendimento de modificadores de acesso e o comportamento de membros static e final.`,
  colecoes: `### 4. Módulo 'Coleções e Generics'\n\n**Peso:** MÉDIO\n\n**Onde focar:** Interface Collection (conceitos gerais), List (ArrayList, LinkedList - diferenças de performance e uso), Set (HashSet, TreeSet - unicidade, ordenação). Uso de Generics para garantir segurança de tipo.\n\n**O que ler por cima:** Map (HashMap, TreeMap) é crucial, mas a interface Collection e suas implementações básicas são o ponto de partida.\n\n**Métrica de Validação:** Acertar 90% das questões sobre a escolha da coleção adequada para um determinado problema e a manipulação básica de seus elementos.`,
  streams: `### 5. Módulo 'API de Streams e Lambdas'\n\n**Peso:** MÉDIO\n\n**Onde focar:** Expressões Lambda (sintaxe básica, uso com interfaces funcionais), Interfaces Funcionais (Supplier, Consumer, Predicate, Function). API de Streams (métodos intermediários como filter, map, sorted; métodos terminais como collect, forEach, findFirst).\n\n**O que ler por cima:** Métodos de Referência (apenas para entender a sintaxe concisa).\n\n**Métrica de Validação:** Resolver 85% das questões que envolvam a manipulação de coleções utilizando Streams e Lambdas para filtragem, mapeamento e coleta de dados.`,
  excecoes: `### 6. Módulo 'Tratamento de Exceções'\n\n**Peso:** MÉDIO\n\n**Onde focar:** Conceito de Exceção (checked vs unchecked), try-catch (blocos, múltiplos catch), finally, throws (declaração em métodos).\n\n**O que ler por cima:** Hierarquia de exceções (apenas para ter uma noção geral).\n\n**Métrica de Validação:** Acertar 90% das questões sobre como tratar, lançar e propagar exceções em código Java.`,
  jpa: `### 7. Módulo 'Persistência com JPA/Hibernate'\n\n**Peso:** MÉDIO\n\n**Onde focar:** Conceito de ORM, JPA (interfaces e especificações), Hibernate (implementação). Anotações básicas (@Entity, @Table, @Id, @GeneratedValue, @Column, @OneToMany, @ManyToOne).\n\n**O que ler por cima:** Detalhes de configuração de Hibernate, estratégias de geração de ID mais avançadas.\n\n**Métrica de Validação:** Acertar 80% das questões que envolvam a modelagem de entidades com anotações JPA/Hibernate e o entendimento básico do ciclo de vida de entidades.`,
  gof: `### 8. Módulo 'Padrões de Projeto GoF'\n\n**Peso:** MÉDIO\n\n**Onde focar:** Padrões Criacionais (Factory Method, Abstract Factory, Singleton - foco em como implementá-los em Java), Padrões Estruturais (Adapter, Decorator - entender o problema que resolvem e a estrutura básica).\n\n**O que ler por cima:** Padrões Comportamentais e os padrões menos comuns dos grupos Criacional e Estrutural.\n\n**Métrica de Validação:** Identificar e explicar o propósito de 70% dos padrões GoF mais comuns (Singleton, Factory Method, Adapter) em cenários de código Java.`
};

// Helper para ler token unificado
// getAuthToken vive em components/AiKeyConfig.jsx — uma cópia só para todas as telas.

// ==========================================
// FUNÇÃO ANTI-ERRO (Com limpeza agressiva)
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
  
  let cleanText = rawText.replace(/<think>[\s\S]*?<\/think>/gi, "").trim(); 
  
  const jsonMatch = cleanText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) cleanText = jsonMatch[0];

  try {
    return JSON.parse(cleanText);
  } catch (e) {
    try {
      let processedText = cleanText.replace(/[\n\r\t]+/g, ' ').replace(/,\s*([\]}])/g, '$1');
      return JSON.parse(processedText);
    } catch (secondError) {
      if (cleanText.includes("lesson_markdown")) {
        const match = cleanText.match(/"lesson_markdown"\s*:\s*"([\s\S]*)/);
        if (match && match[1]) {
          let extractedText = match[1];
          extractedText = extractedText.replace(/"\s*\}\s*$/, '').replace(/"\s*$/, '');
          extractedText = extractedText.replace(/\\n/g, '\n').replace(/\\"/g, '"');
          return { lesson_markdown: extractedText };
        }
      }
      console.error("TEXTO COM ERRO COMPLETO DA IA:", rawText);
      throw new Error("A IA gerou um formato inválido de dados.");
    }
  }
};

export default function GabariteJava() {
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  // --- ESTADOS DA CONFIGURAÇÃO DA IA ---
  const [showConfig, setShowConfig] = useState(false);
  const { userApiKey, userModel, setUserApiKey, setUserModel } = useAiKey();
  const [aviso, setAviso] = useState(null);
  const [confirmarLimpeza, setConfirmarLimpeza] = useState(false);

  // --- ESTADOS DO SIMULADOR ---
  const [configFocus, setConfigFocus] = useState("completo");
  const [configDifficulty, setConfigDifficulty] = useState("medio");
  const [configFormato, setConfigFormato] = useState("Múltipla Escolha");
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
    setLessonContent(conteudosTeoricosJava[configFocus] || conteudosTeoricosJava.completo);
    setShowLessonModal(true);
  };

  useEffect(() => {
    const savedStats = localStorage.getItem('cespe_java_stats');
    if (savedStats) {
      try { setStats(JSON.parse(savedStats)); } catch (e) { console.error(e); }
    }
  }, []);

  const saveStats = (newStats) => {
    setStats(newStats);
    localStorage.setItem('cespe_java_stats', JSON.stringify(newStats));
  };

  const handleConnectAI = () => {
    const callbackUrl = encodeURIComponent(`${window.location.origin}/callback`);
    window.location.href = `https://openrouter.ai/auth?callback_url=${callbackUrl}`;
  };

  const generateExam = async () => {
    setError("");
    setViewState("loading");

    const embaralharAlternativas = (questao) => {
      if (!questao.alternativas || questao.alternativas.length < 3) return questao;
      const letras = ["A", "B", "C", "D", "E"]; 
      const gabaritoAtual = (questao.gabarito || "A").trim().toUpperCase();
      const idxCorreto = letras.indexOf(gabaritoAtual);

      if (idxCorreto === -1) return questao;

      const textos = questao.alternativas.map(alt => alt.replace(/^[A-E]\s*[\)\.\-:]\s*/i, "").trim());
      const textoCorreto = textos[idxCorreto];

      for (let i = textos.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [textos[i], textos[j]] = [textos[j], textos[i]];
      }

      const novoIdxCorreto = textos.indexOf(textoCorreto);
      const novoGabarito = letras[novoIdxCorreto];
      const novasAlternativas = textos.map((txt, i) => `${letras[i]}) ${txt}`);

      return {
        ...questao,
        alternativas: novasAlternativas,
        gabarito: novoGabarito
      };
    };

    try {
      const token = getAuthToken();
      let todasQuestoes = [];
      const batchSize = 5; 
      const batches = Math.ceil(configAmount / batchSize);

      for (let i = 0; i < batches; i++) {
        setLoadingMsg(`A formular questões inéditas... (Lote ${i + 1} de ${batches})`);
        const currentBatchSize = Math.min(batchSize, configAmount - (i * batchSize));

        const isGoogleKey = userApiKey && !userApiKey.startsWith("sk-or-");
        const defaultModel = isGoogleKey ? "gemini-2.5-flash-lite" : "deepseek/deepseek-v4-flash";

        const payload = {
          subject: "Java", // Adaptado para requisição de Java
          focus: configFocus,
          difficulty: configDifficulty,
          amount: currentBatchSize,
          generate_text: configTextBase,
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
            
            if (data && data.error) throw new Error(`Erro da API: ${data.error}`);
            if (data && data.questoes && data.questoes.length > 0) break;
            throw new Error("O lote veio vazio.");
          } catch (e) {
            tentativas++;
            if (e.message.includes("Erro da API")) throw e; 
            if (tentativas >= 2) throw new Error(e.message || "A IA falhou em formatar as opções.");
            setLoadingMsg(`Reajustando os vereditos da IA... (A repetir Lote ${i + 1})`);
          }
        }

        const questoesCorrigidas = data.questoes.map((q, idx) => {
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
    setLoadingMsg("O Professor IA está montando a análise de código e teoria para os seus erros...");

    try {
      const token = getAuthToken();
      const isGoogleKey = userApiKey && !userApiKey.startsWith("sk-or-");
      const defaultModel = isGoogleKey ? "gemini-2.5-flash-lite" : "deepseek/deepseek-v4-flash";

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

      if (data && data.error) throw new Error(`Erro da API: ${data.error}`);

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
    setAviso({ tone: "ok", texto: `Simulado Java finalizado! Pontuação líquida CESPE: ${right - wrong}` });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getWrongQuestions = () => {
    if (!currentData) return [];
    return currentData.questoes.filter(q => {
      const ans = userAnswers[q.id];
      return ans && ans !== q.gabarito;
    });
  };

  const resetStats = () => setConfirmarLimpeza(true);

  const wrongCount = getWrongQuestions().length;
  const showLessonAction = (isExamFinished || (!configExamMode && Object.keys(userAnswers).length === currentData?.questoes?.length)) && wrongCount > 0;

  // --- ESTILOS CUSTOMIZADOS PARA MARKDOWN (CÓDIGO IDENTADO) ---
  return (
    <div className="container">
      <header className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left', marginBottom: '1rem', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h1 style={{ color: 'var(--heading-color)', margin: '0 0 5px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Coffee size={32} color="var(--primary)" /> Gabarite Java <span style={{ color: 'var(--primary)' }}>CESPE</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Treino avançado de programação Java com questões inéditas focadas em concursos de TI.</p>
        </div>
        <button onClick={() => setShowStatsModal(true)} className="btn" style={{ fontWeight: 'bold' }}>
          <BarChart2 size={20} /> O meu Desempenho
        </button>
      </header>

      <AiKeyBar
        userApiKey={userApiKey}
        userModel={userModel}
        onConfigurar={() => setShowConfig(true)}
        label="IA do Java"
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
          
          <aside style={{ display: 'flex', flexDirection: 'column', gap: '20px', gridColumn: '1 / span 1', maxWidth: '350px' }}>
            <div className="panel" style={{ padding: '20px' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--heading-color)' }}>
                <SlidersHorizontal size={20} color="var(--primary)" /> Configurar Simulado
              </h2>
              
              <div style={{ marginBottom: '15px' }}>
                <label className="label">Foco de Estudo (Edital de TI)</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <select className="select" value={configFocus} onChange={e => setConfigFocus(e.target.value)} style={{ padding: '10px', fontSize: '0.9rem', flex: 1 }}>
                    <option value="completo">Simulado Completo (Todos)</option>
                    <option value="sintaxe">1. Sintaxe e Tipos de Dados</option>
                    <option value="poo">2. Orientação a Objetos (POO)</option>
                    <option value="modificadores">3. Modificadores (static/final)</option>
                    <option value="colecoes">4. Coleções e Generics</option>
                    <option value="streams">5. Streams e Lambdas (Java 8+)</option>
                    <option value="excecoes">6. Tratamento de Exceções</option>
                    <option value="jpa">7. JPA e Hibernate (ORM)</option>
                    <option value="gof">8. Padrões de Projeto GoF</option>
                  </select>
                  <button 
                    onClick={handleShowTheory} 
                    className="btn" 
                    style={{ 
                      width: '42px', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0', background: 'var(--primary-light)', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: '8px', flexShrink: 0 
                    }} 
                    title="Ver Resumo Teórico do Assunto Selecionado"
                  >
                    <BookOpenCheck size={20} />
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label className="label">Dificuldade</label>
                <select className="select" value={configDifficulty} onChange={e => setConfigDifficulty(e.target.value)}>
                  <option value="medio">Média (Padrão Analista de TI)</option>
                  <option value="facil">Fácil (Técnico / Fundamentos)</option>
                  <option value="dificil">Difícil (Pegadinhas de Código e Frameworks)</option>
                  <option value="avancado">Avançado (Auditor de TI / Arquitetura)</option>
                </select>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label className="label">Formato da Questão</label>
                <select className="select" value={configFormato} onChange={e => setConfigFormato(e.target.value)} style={{ padding: '10px', fontSize: '0.9rem', width: '100%' }}>
                  <option value="Múltipla Escolha">Múltipla Escolha (A, B, C, D)</option>
                  <option value="Certo/Errado">Certo / Errado (Padrão CESPE)</option>
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
                  <FileText size={18} /> Gerar Snippet / Classe Base
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
                <Sparkles size={20} /> Gerar Questões de Java
              </button>
              {error && <div style={{ color: 'var(--error-text)', fontSize: '0.85rem', marginTop: '10px', textAlign: 'center', fontWeight: 'bold' }}>{error}</div>}
            </div>

            <div className="panel" style={{ padding: '20px', background: 'var(--card-bg)' }}>
              <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '15px', textAlign: 'center' }}>Aproveitamento em Java</h3>
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
                  <Code size={48} color="var(--primary)" />
                </div>
                <h2 style={{ fontSize: '1.5rem', color: 'var(--heading-color)', marginBottom: '10px' }}>Desenvolvimento Java (CESPE)</h2>
                <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', marginBottom: '25px' }}>
                  Treine POO, Streams, Coleções e JPA com trechos de código e cenários inéditos criados pela Inteligência Artificial com foco em Editais de TI.
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
                      {q.textoVinculado && (
                        <div className="panel" style={{ borderLeft: '4px solid var(--primary)', position: 'relative', marginTop: index > 0 ? '30px' : '0', marginBottom: '20px' }}>
                          <div style={{ position: 'absolute', top: '-15px', left: '-15px', background: 'var(--primary)', color: 'white', width: '30px', height: '30px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-md)' }}>
                            <Code size={16} />
                          </div>
                          <h3 style={{ fontSize: '0.8rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '15px', paddingLeft: '15px' }}>Código Base / Cenário</h3>
                          <div className="markdown-format" style={{ fontSize: '1rem', color: 'var(--text-main)' }}>
                            <Md>
                              {q.textoVinculado}
                            </Md>
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
                            <div className="markdown-format" style={{ fontSize: '1.1rem', color: 'var(--text-main)', lineHeight: '1.6', marginBottom: '20px', fontWeight: '500' }}>
                              <Md>
                                {q.enunciado}
                              </Md>
                            </div>
                            
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
                                      <span style={{ flex: 1, textAlign: 'left', whiteSpace: 'pre-line' }}>
                                        <Md inline>
                                          {alt}
                                        </Md>
                                      </span>
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
                                  <Md>
                                    {q.explicacao}
                                  </Md>
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
                      <GraduationCap size={24} /> Professor Sênior de Java (IA)
                    </h4>
                    <p style={{ color: '#92400e', fontSize: '0.95rem', marginBottom: '20px' }}>Você errou {wrongCount} questão(ões) de Código/Teoria. Quer uma explicação passo-a-passo e análise técnica focada no que errou?</p>
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

      {showStatsModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="panel" style={{ width: '100%', maxWidth: '500px', padding: 0, overflow: 'hidden', animation: 'fadeIn 0.2s ease-out' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg)' }}>
              <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--heading-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <PieChart size={22} color="var(--primary)" /> Histórico de Java
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
                <Md>
                  {lessonContent}
                </Md>
              </div>
            </div>
          </div>
        </div>
      )}

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
        open={confirmarLimpeza}
        title="Limpar o histórico de Java"
        message={`Apagar os ${stats.total} item(ns) já julgados e o desempenho por tópico?`}
        detail="O histórico fica guardado apenas neste navegador e não pode ser recuperado depois."
        confirmLabel="Limpar histórico"
        onConfirm={() => { saveStats({ total: 0, correct: 0, wrong: 0, topics: {} }); setShowStatsModal(false); setConfirmarLimpeza(false); }}
        onCancel={() => setConfirmarLimpeza(false)}
      />

      {aviso && (
        <div style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: '24px', zIndex: 9500, width: 'min(560px, calc(100vw - 32px))', boxShadow: 'var(--shadow-lg, 0 12px 32px rgba(0,0,0,.18))', borderRadius: '10px' }}>
          <Notice tone={aviso.tone} onClose={() => setAviso(null)}>{aviso.texto}</Notice>
        </div>
      )}

    </div>
  );
}