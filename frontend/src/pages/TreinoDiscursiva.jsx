import React, { useState, useEffect, useMemo } from "react";
import { 
  PenTool, Target, RefreshCw, Send, CheckCircle, 
  Wand2, Save, BookOpen, FileText, CheckSquare, 
  MessageSquare, AlertCircle, LayoutTemplate, Database,
  Timer, ShieldAlert, Edit3, ArrowDown, RotateCcw
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
// Markdown único da plataforma: bloco de código, inline, tabelas e fórmulas.
import Md from "../components/Markdown";

const getAuthToken = () => {
  const storages = [localStorage, sessionStorage];
  for (const storage of storages) {
    let t = storage.getItem("access_token") || storage.getItem("token") || storage.getItem("professor_ai_token");
    if (t && t.startsWith("eyJ")) return t;
  }
  return null;
};

const safeArray = (v) => (Array.isArray(v) ? v : []);
const safeString = (v) => (typeof v === "string" ? v : v == null ? "" : String(v));

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
      
      // 3. FALLBACK SUPREMO: Ignora JSON corrompido com aspas soltas
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

export default function TreinoDiscursiva() {
  const { user } = useAuth();
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  // Configurações e Parâmetros Complexos da Prova
  const [banca, setBanca] = useState("CEBRASPE");
  const [tipoProva, setTipoProva] = useState("Questão Curta (5 a 10 linhas)"); 
  const [cargo, setCargo] = useState(""); 
  const [nivel, setNivel] = useState("Iniciante"); 
  const [showSavedFeedback, setShowSavedFeedback] = useState(false);
  
  // MODO PRESSÃO REAL
  const [isModoPressao, setIsModoPressao] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  // RASCUNHO GUIADO
  const [useDraftMode, setUseDraftMode] = useState(false);
  const [draftTese, setDraftTese] = useState("");
  const [draftArgs, setDraftArgs] = useState("");
  const [draftConclusao, setDraftConclusao] = useState("");
  
  // Estados para o Trecho do Edital Inteligente
  const [editalTrecho, setEditalTrecho] = useState("");
  const [area, setArea] = useState(""); 
  const [topicos, setTopicos] = useState(""); 
  const [isExtracting, setIsExtracting] = useState(false);
  
  // Estados da Prova e UI
  const [prova, setProva] = useState(null);
  const [resposta, setResposta] = useState("");
  const [correcao, setCorrecao] = useState(null);
  const [activeTab, setActiveTab] = useState("geral"); 
  
  const [loading, setLoading] = useState(false);
  const [loadingCorrecao, setLoadingCorrecao] = useState(false);
  const [error, setError] = useState(null);

  const [userApiKey, setUserApiKey] = useState("");
  const [userModel, setUserModel] = useState("");
  const [editalRegrasProva, setEditalRegrasProva] = useState("");
  const isLoaded = React.useRef(false);

  // 1. CARREGAR AS PREFERÊNCIAS AO ABRIR A TELA
  useEffect(() => {
    const fetchDBSettings = async () => {
      const token = getAuthToken();
      if (!token) return;
      try {
        const res = await fetch(`${API_URL}/users/me/settings`, { headers: { "Authorization": `Bearer ${token}` }});
        if (res.ok) {
          const data = await res.json();
          if (data.api_key) setUserApiKey(data.api_key);
          if (data.preferred_model) setUserModel(data.preferred_model);
        }
      } catch (err) { console.error("Erro ao buscar configurações da IA", err); }
    };
    
    const loadSavedPrefs = () => {
      const savedPrefs = localStorage.getItem("treino_discursiva_prefs");
      if (savedPrefs) {
        try {
          const prefs = JSON.parse(savedPrefs);
          if (prefs.banca !== undefined) setBanca(prefs.banca);
          if (prefs.tipoProva !== undefined) setTipoProva(prefs.tipoProva);
          if (prefs.cargo !== undefined) setCargo(prefs.cargo);
          if (prefs.nivel !== undefined) setNivel(prefs.nivel); 
          if (prefs.editalTrecho !== undefined) setEditalTrecho(prefs.editalTrecho);
          if (prefs.area !== undefined) setArea(prefs.area);
          if (prefs.topicos !== undefined) setTopicos(prefs.topicos);
          if (prefs.editalRegrasProva !== undefined) setEditalRegrasProva(prefs.editalRegrasProva);
        } catch (e) {
          console.error("Erro ao processar preferências salvas", e);
        }
      }
      // Sinaliza que a leitura terminou com sucesso e a trava pode ser liberada
      isLoaded.current = true;
    };

    fetchDBSettings();
    loadSavedPrefs();
  }, [API_URL]);

  // 2. SALVAMENTO AUTOMÁTICO COERENTE (Auto-save com trava de segurança)
  useEffect(() => {
    // Se o carregamento inicial não terminou, não faz nada para não apagar o histórico
    if (!isLoaded.current) return;

    const prefsObj = {
      banca, 
      tipoProva, 
      cargo, 
      nivel, 
      editalTrecho, 
      area, 
      topicos, 
      editalRegrasProva 
    };
    localStorage.setItem("treino_discursiva_prefs", JSON.stringify(prefsObj));
  }, [banca, tipoProva, cargo, nivel, editalTrecho, area, topicos, editalRegrasProva]);

  // 3. Botão manual "Salvar Padrão" de contingência/confirmação
  const handleSavePrefs = () => {
    const prefsObj = {
      banca, tipoProva, cargo, nivel, editalTrecho, area, topicos, editalRegrasProva 
    };
    localStorage.setItem("treino_discursiva_prefs", JSON.stringify(prefsObj));
    setShowSavedFeedback(true);
    setTimeout(() => setShowSavedFeedback(false), 2000); 
  };

  const handleAnalisarEdital = async () => {
    if (!editalTrecho.trim()) return alert("Cole o trecho do conteúdo programático no campo primeiro.");
    
    setIsExtracting(true);
    setError(null);
    try {
      const data = await fetchStreamAsJson(`${API_URL}/extract-topics`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getAuthToken()}` },
        body: JSON.stringify({
          texto: editalTrecho,
          api_key: userApiKey || null, 
          model: userModel || "deepseek/deepseek-v4-flash"
        })
      });

      if (data.area && data.topicos) {
        setArea(data.area);
        setTopicos(data.topicos);
      } else {
        throw new Error("Não foi possível identificar a área. Tente novamente.");
      }
    } catch (err) {
      setError(err.message || "Falha ao extrair as informações com a IA.");
    } finally {
      setIsExtracting(false);
    }
  };

  // Limites Dinâmicos
  const maxLinhas = useMemo(() => {
    if (tipoProva === "Personalizado") return 60;
    if (tipoProva.includes("Curta") || tipoProva.includes("Paráfrase")) return 10;
    if (tipoProva.includes("Expansão") || tipoProva.includes("Reescrita")) return 15;
    if (tipoProva.includes("Peça")) return 120;
    return 30;
  }, [tipoProva]);

  const placeholderDinamico = useMemo(() => {
    if (tipoProva.includes("Paráfrase")) return "Reescreva o texto com as suas próprias palavras de forma clara...";
    if (tipoProva.includes("Expansão")) return "Desenvolva o conceito adicionando exemplos práticos...";
    if (tipoProva.includes("Reescrita")) return "Melhore a estrutura do trecho fornecido...";
    if (tipoProva.includes("Curta")) return "Escreva uma resposta objetiva, direto ao ponto...";
    return "Transcreva aqui o seu texto definitivo detalhado...";
  }, [tipoProva]);

  // EFEITO DO TEMPORIZADOR (MODO PRESSÃO)
  useEffect(() => {
    let interval;
    if (prova && isModoPressao && timeLeft > 0 && !correcao && !loadingCorrecao) {
      interval = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    } else if (timeLeft === 0 && prova && isModoPressao && !correcao && !loadingCorrecao) {
      setIsModoPressao(false); // <-- FIX: Desarma o modo pressão para evitar loop de alerts
      alert("TEMPO ESGOTADO! Sua prova será entregue automaticamente.");
      handleCorrigir();
    }
    return () => clearInterval(interval);
  }, [prova, isModoPressao, timeLeft, correcao, loadingCorrecao]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // FIX: Contador de palavras integrado com Modo Rascunho
  const palavrasCount = useMemo(() => {
    const textoParaContar = useDraftMode 
      ? `${draftTese} ${draftArgs} ${draftConclusao}` 
      : resposta;
    return textoParaContar.trim().split(/\s+/).filter(w => w.length > 0).length;
  }, [resposta, draftTese, draftArgs, draftConclusao, useDraftMode]);

  const linhasEstimadas = Math.ceil(palavrasCount / 9); 
  const excedeuLinhas = linhasEstimadas > maxLinhas;
  const minPalavrasRecomendado = maxLinhas <= 15 ? 15 : 30;

  const handleGerarProva = async () => {
    // 1. Nova validação condicional
    if (tipoProva !== "Personalizado" && (!area || !topicos)) return alert("Por favor, preencha a Disciplina e o Tópico.");
    if (tipoProva === "Personalizado" && !editalTrecho) return alert("Por favor, cole o trecho do conteúdo programático do edital na Etapa 2.");
    
    setLoading(true); setError(null); setCorrecao(null); setProva(null); setResposta("");
    setDraftTese(""); setDraftArgs(""); setDraftConclusao("");
    
    if (isModoPressao) {
      setTimeLeft(maxLinhas * 90); // ~1.5 min por linha permitida
    }

    setUseDraftMode(maxLinhas > 15);

    try {
      // 2. Adaptação dos dados de envio: se for personalizado, passamos o texto bruto como tópico.
      const topicosArray = tipoProva === "Personalizado" 
        ? [editalTrecho] // Envia o edital inteiro como contexto
        : topicos.split(",").map(t => t.trim()).filter(t => t.length > 0);

      const areaFinal = tipoProva === "Personalizado" ? "Conteúdo Programático Específico (Edital)" : area;

      const data = await fetchStreamAsJson(`${API_URL}/generate-treino-discursiva`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getAuthToken()}` },
        body: JSON.stringify({
          area: areaFinal,
          topicos: topicosArray.length > 0 ? topicosArray : ["Tema Geral"],
          tipo_prova: tipoProva,
          cargo: cargo,
          banca: banca,
          nivel: nivel,
          edital_regras_prova: tipoProva === "Personalizado" ? editalRegrasProva : null,
          api_key: userApiKey || null, 
          model: userModel || "deepseek/deepseek-v4-flash"
        })
      });
      
      const novaQuestao = data.discursiva ? data.discursiva : data;
      if (novaQuestao && novaQuestao.comando) setProva(novaQuestao);
      else throw new Error("Retorno inválido da IA.");
    } catch (err) {
      setError(err.message || "Erro ao gerar a prova. Verifique sua conexão ou chave de API.");
    } finally { setLoading(false); }
  };

  const handleCorrigir = async () => {
    let textoFinal = resposta;
    if (useDraftMode) {
      textoFinal = `${draftTese}\n\n${draftArgs}\n\n${draftConclusao}`.trim();
      setResposta(textoFinal);
      setUseDraftMode(false);
    }

    if (textoFinal.trim().split(/\s+/).filter(w => w.length > 0).length < 5) {
      return alert("Escreva ao menos algumas palavras antes de enviar.");
    }
    
    setLoadingCorrecao(true); setError(null);
    try {
      const data = await fetchStreamAsJson(`${API_URL}/correct-essay`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getAuthToken()}` },
        body: JSON.stringify({
          texto_motivador: prova.texto_motivador || "",
          comando: prova.comando || "",
          aspectos: prova.aspectos || [],
          resposta_aluno: textoFinal,
          api_key: userApiKey || null, 
          model: userModel || "deepseek/deepseek-v4-flash"
        })
      });

      const notaCalculada = Array.isArray(data.avaliacoes_aspectos) 
        ? data.avaliacoes_aspectos.reduce((acc, curr) => acc + (parseFloat(curr.nota_atribuida) || 0), 0)
        : (parseFloat(data.nota_final) || 0);
        
      data.nota_final_calculada = notaCalculada;
      setCorrecao(data);
      setActiveTab("geral"); 

      await fetch(`${API_URL}/performance`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getAuthToken()}` },
        body: JSON.stringify({
          tipo: "discursiva",
          tema: `Treino: ${area} (${topicos.split(',')[0]})`,
          nota_obtida: notaCalculada,
          nota_maxima: 20.0,
          formato: tipoProva,
          nivel: nivel,
          concurso: `${banca} - ${cargo}`
        })
      });

    } catch (err) {
      setError("Erro ao corrigir a redação.");
    } finally { setLoadingCorrecao(false); }
  };

  const handleUnirRascunho = () => {
    const textoUnido = `${draftTese}\n\n${draftArgs}\n\n${draftConclusao}`.trim();
    setResposta(textoUnido);
    setUseDraftMode(false);
  };

  const handleRefazerProva = () => {
    setCorrecao(null);
    setIsModoPressao(false); // Desativa a pressão para o aluno focar na correção
  };

  return (
    <div className="container" style={{ padding: '2rem 1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      
      <header className="header" style={{ marginBottom: '2rem', textAlign: 'left' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '0 0 10px 0' }}>
          <PenTool size={32} color="var(--primary)" /> Simulador de Discursivas
        </h1>
        <p style={{ margin: 0 }}>Evolua a sua escrita gradativamente. Comece com textos curtos e chegue até peças complexas.</p>
      </header>

      {/* TELA DE CONFIGURAÇÃO (WIZARD VISUAL) */}
      {!prova && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
          
          <div className="panel" style={{ padding: '25px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', flexWrap: 'wrap', gap: '10px' }}>
              <h3 style={{ margin: 0, color: 'var(--heading-color)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.25rem' }}>
                <span style={{ background: 'var(--primary)', color: 'white', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>1</span>
                Estratégia de Treino
              </h3>
              <button onClick={handleSavePrefs} className="btn small" style={{ background: 'var(--success-bg)', color: 'var(--success-text)', borderColor: 'var(--success-text)' }}>
                {showSavedFeedback ? <><CheckCircle size={14} /> Salvo!</> : <><Save size={14} /> Salvar Padrão</>}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '25px' }}>
              <div>
                <label className="label">Banca</label>
                <select value={banca} onChange={e => setBanca(e.target.value)} className="select">
                  <option value="CEBRASPE">CEBRASPE / CESPE</option>
                  <option value="FGV">FGV</option>
                  <option value="FCC">FCC</option>
                  <option value="VUNESP">VUNESP</option>
                  <option value="IDECAN">IDECAN</option>
                </select>
              </div>
              <div>
                <label className="label">Cargo (Opcional)</label>
                <input type="text" value={cargo} onChange={e => setCargo(e.target.value)} className="input" placeholder="Ex: Analista de TI..." />
              </div>
              <div>
                <label className="label">Dificuldade</label>
                <select value={nivel} onChange={e => setNivel(e.target.value)} className="select">
                  <option value="Iniciante">Iniciante</option>
                  <option value="Normal">Normal</option>
                  <option value="Avançado">Avançado</option>
                  <option value="Expert">Expert</option>
                </select>
              </div>
            </div>

            <label className="label" style={{ marginBottom: '10px' }}>Formato do Treino</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '25px' }}>
               <select value={tipoProva} onChange={e => setTipoProva(e.target.value)} className="select" style={{ width: '100%' }}>
                  <optgroup label="Nível 1: Iniciação (Micro-treinos)">
                    <option value="Paráfrase de Texto">Paráfrase (Explicar com próprias palavras)</option>
                    <option value="Expansão de Ideia">Expansão de Ideia (Aprofundar um conceito)</option>
                  </optgroup>
                  <optgroup label="Nível 2: Intermediário">
                    <option value="Reescrita de Parágrafo">Reescrita Avançada (Correção e Melhoria)</option>
                    <option value="Questão Curta (5 a 10 linhas)">Questão Curta (5 a 10 linhas)</option>
                  </optgroup>
                  <optgroup label="Nível 3: Simulação Completa">
                    <option value="Questão Discursiva (Estudo de Caso)">Questão Discursiva (Estudo de Caso)</option>
                    <option value="Redação (Atualidades/Temas Gerais)">Redação (Atualidades e Impactos Sociais)</option>
                    <option value="Peça Prático-Profissional">Peça Prático-Profissional</option>
                  </optgroup>
                  <optgroup label="Modo Avançado">
                    <option value="Personalizado">Personalizado (Colar Trecho do Edital)</option>
                  </optgroup>
              </select>

              {/* RENDERIZAÇÃO CONDICIONAL PARA O EDITAL */}
              {tipoProva === "Personalizado" && (
                <div style={{ animation: 'slideUp 0.3s ease-out' }}>
                  <label className="label" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <LayoutTemplate size={16} /> Regras do Edital para a Prova Discursiva
                  </label>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
                    Cole aqui como será a prova (ex: linhas, pontuação, formato e critérios de correção).
                  </p>
                  <textarea 
                    value={editalRegrasProva} 
                    onChange={e => setEditalRegrasProva(e.target.value)} 
                    className="textarea" 
                    style={{ minHeight: '120px' }}
                    placeholder="Ex: 9 DA PROVA DISCURSIVA. 9.1 valerá 40,00 pontos e consistirá de redação técnica de até 60 linhas..." 
                  />
                </div>
              )}
            </div>

            <div style={{ background: isModoPressao ? 'var(--error-bg)' : 'var(--hover-bg)', border: `1px solid ${isModoPressao ? 'var(--error-text)' : 'var(--border)'}`, padding: '15px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', transition: 'all 0.2s' }} onClick={() => setIsModoPressao(!isModoPressao)}>
              <div>
                <strong style={{ display: 'flex', alignItems: 'center', gap: '8px', color: isModoPressao ? 'var(--error-text)' : 'var(--text-main)' }}>
                  <ShieldAlert size={18} /> Modo Pressão Real
                </strong>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Ativa temporizador rigoroso, desabilita corretor ortográfico e impede colar textos externos.
                </span>
              </div>
              <div style={{ width: '40px', height: '24px', background: isModoPressao ? 'var(--error-text)' : 'var(--text-muted)', borderRadius: '12px', position: 'relative' }}>
                <div style={{ width: '18px', height: '18px', background: 'white', borderRadius: '50%', position: 'absolute', top: '3px', left: isModoPressao ? '19px' : '3px', transition: 'left 0.2s' }} />
              </div>
            </div>
          </div>
          
          <div className="panel" style={{ padding: '25px' }}>
            <h3 style={{ margin: '0 0 20px 0', color: 'var(--heading-color)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.25rem' }}>
              <span style={{ background: 'var(--primary)', color: 'white', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>2</span>
              Definição do Tema
            </h3>

            {tipoProva === "Personalizado" ? (
              
              /* ====== MODO PERSONALIZADO ====== */
              <div style={{ animation: 'slideUp 0.3s ease-out', marginBottom: '20px' }}>
                <label className="label" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Database size={16} /> Conteúdo Programático Específico
                </label>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
                  Cole aqui a parte do edital com as disciplinas e assuntos exigidos para o seu cargo. A IA usará essas informações para elaborar o contexto da prova e sortear a cobrança.
                </p>
                <textarea 
                  value={editalTrecho} 
                  onChange={e => setEditalTrecho(e.target.value)} 
                  className="textarea" 
                  style={{ minHeight: '150px' }}
                  placeholder="Ex: CARGO 10: ANALISTA... ENGENHARIA DE DADOS: 1 Dado, informação... 2 Modelagem..." 
                />
              </div>

            ) : (

              /* ====== MODO NORMAL ====== */
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px', marginBottom: '20px' }}>
                  <div>
                    <label className="label">Disciplina</label>
                    <input type="text" value={area} onChange={e => setArea(e.target.value)} className="input" placeholder="Ex: Direito Constitucional, TI..." />
                  </div>
                  <div>
                    <label className="label">Tópico Específico</label>
                    <input type="text" value={topicos} onChange={e => setTopicos(e.target.value)} className="input" placeholder="Ex: Direitos Fundamentais..." />
                  </div>
                </div>

                {(tipoProva.includes("Estudo de Caso") || tipoProva.includes("Peça")) && (
                  <div style={{ background: 'var(--hover-bg)', padding: '20px', borderRadius: '8px', border: '1px dashed var(--border)', marginBottom: '20px', animation: 'slideUp 0.3s ease-out' }}>
                    <label className="label" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Database size={16} /> Análise Inteligente do Edital <span style={{ color: 'var(--text-muted)', textTransform: 'none', fontWeight: 'normal' }}>(Opcional)</span>
                    </label>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '10px' }}>Cole o bloco do edital abaixo para a IA extrair detalhes complexos e moldar o caso prático com maior precisão.</p>
                    <textarea 
                      value={editalTrecho} 
                      onChange={e => setEditalTrecho(e.target.value)} 
                      className="textarea" 
                      style={{ minHeight: '100px', marginBottom: '10px' }}
                      placeholder="Ex: DIREITO PENAL: 1 Princípios básicos. 2 Aplicação da lei penal..." 
                    />
                    <button 
                      onClick={handleAnalisarEdital} 
                      disabled={isExtracting || !editalTrecho.trim()} 
                      className="btn" 
                      style={{ width: '100%', background: 'var(--card-bg)' }}
                    >
                      {isExtracting ? <RefreshCw className="spin" size={18} /> : <Wand2 size={18} color="var(--primary)" />}
                      {isExtracting ? "A analisar texto..." : "Preencher Disciplina e Tópicos Automaticamente"}
                    </button>
                  </div>
                )}
              </>
            )}

            <button onClick={handleGerarProva} disabled={(tipoProva === "Personalizado" ? !editalTrecho : (!area || !topicos))} className="btn primary" style={{ width: '100%', padding: '15px', fontSize: '1.1rem', marginTop: '10px', display: 'flex', justifyContent: 'center', gap: '10px' }}>
              <RefreshCw size={20} /> Gerar Treino Inédito
            </button>
            {error && <div className="error" style={{ marginTop: '15px' }}>{error}</div>}
          </div>
        </div>
      )}

      {/* ESTADO DE CARREGAMENTO */}
      {loading && (
        <div className="panel" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <RefreshCw size={48} className="spin" color="var(--primary)" style={{ margin: '0 auto 20px auto' }} />
          <h2 style={{ color: 'var(--heading-color)', margin: '0 0 10px 0' }}>Elaborando o Cenário...</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Configurando: {banca} • Nível {nivel} • {tipoProva}</p>
        </div>
      )}

      {/* AMBIENTE DE PROVA (SPLIT VIEW) */}
      {prova && !correcao && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          
          {isModoPressao && (
            <div style={{ background: 'var(--error-bg)', color: 'var(--error-text)', padding: '15px 20px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--error-text)', fontWeight: 'bold' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Timer size={24} className={timeLeft < 60 ? "pulse" : ""} />
                <span>Tempo Restante (Modo Pressão):</span>
              </div>
              <div style={{ fontSize: '1.5rem', fontFamily: 'monospace' }}>
                {formatTime(timeLeft)}
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '20px', alignItems: 'stretch' }}>
            
            <div className="panel" style={{ display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
              <div style={{ background: 'var(--hover-bg)', padding: '15px 20px', borderBottom: '1px solid var(--border)' }}>
                <h3 style={{ margin: 0, color: 'var(--heading-color)', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <BookOpen size={18} /> Caderno de Prova
                </h3>
              </div>
              <div className="md" style={{ padding: '20px', overflowY: 'auto', maxHeight: 'calc(100vh - 250px)' }}>
                <div style={{ marginBottom: '25px' }}>
                  <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: '10px' }}>Texto Motivador</strong>
                  <Md>{safeString(prova.texto_motivador)}</Md>
                </div>
                <div style={{ background: 'var(--primary-light)', padding: '15px', borderRadius: '8px', borderLeft: '4px solid var(--primary)', marginBottom: '25px' }}>
                  <strong style={{ color: 'var(--primary)', display: 'block', marginBottom: '5px' }}>Comando:</strong>
                  <Md>{safeString(prova.comando)}</Md>
                </div>
                {safeArray(prova.aspectos).length > 0 && (
                  <div>
                    <strong style={{ color: 'var(--text-main)' }}>Abordagem Obrigatória</strong>
                    <ul className="list" style={{ marginTop: '10px' }}>
                      {safeArray(prova.aspectos).map((asp, i) => (
                        <li key={i} style={{ marginBottom: '12px', fontSize: '0.95rem' }}>
                          {safeString(asp.aspecto)} <strong style={{ color: 'var(--error-text)' }}>({safeString(asp.valor_maximo)} pts)</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              
              {maxLinhas > 15 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={() => setUseDraftMode(!useDraftMode)} className="btn small" style={{ background: 'var(--hover-bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Edit3 size={14} /> {useDraftMode ? "Ir direto para Texto Definitivo" : "Abrir Esqueleto Guiado (Rascunho)"}
                  </button>
                </div>
              )}

              {useDraftMode ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', flex: 1 }}>
                  <div style={{ background: 'var(--card-bg)', padding: '15px', borderRadius: '12px', border: '1px dashed var(--primary)' }}>
                    <label className="label" style={{ color: 'var(--primary)' }}>1. Tópico Frasal (A tese / Introdução)</label>
                    <textarea value={draftTese} onChange={e => setDraftTese(e.target.value)} className="textarea" style={{ minHeight: '80px', background: 'var(--bg)' }} placeholder="Apresente o conceito principal de forma direta..." />
                  </div>
                  <div style={{ background: 'var(--card-bg)', padding: '15px', borderRadius: '12px', border: '1px dashed var(--primary)' }}>
                    <label className="label" style={{ color: 'var(--primary)' }}>2. Desenvolvimento (Fundamentação e Exemplos)</label>
                    <textarea value={draftArgs} onChange={e => setDraftArgs(e.target.value)} className="textarea" style={{ minHeight: '150px', background: 'var(--bg)' }} placeholder="Responda aos aspectos exigidos, usando conectivos..." />
                  </div>
                  <div style={{ background: 'var(--card-bg)', padding: '15px', borderRadius: '12px', border: '1px dashed var(--primary)' }}>
                    <label className="label" style={{ color: 'var(--primary)' }}>3. Conclusão (Fechamento)</label>
                    <textarea value={draftConclusao} onChange={e => setDraftConclusao(e.target.value)} className="textarea" style={{ minHeight: '80px', background: 'var(--bg)' }} placeholder="Conclua a ideia ou proponha solução..." />
                  </div>
                  <button onClick={handleUnirRascunho} className="btn" style={{ background: 'var(--primary-light)', color: 'var(--primary)', borderColor: 'var(--primary)', padding: '15px', display: 'flex', justifyContent: 'center', gap: '10px', fontWeight: 'bold' }}>
                    <ArrowDown size={18} /> Unir blocos e Revisar Texto Definitivo
                  </button>
                </div>
              ) : (
                <div style={{ position: 'relative', flex: 1, display: 'flex' }}>
                  <textarea 
                    value={resposta}
                    onChange={e => setResposta(e.target.value)}
                    disabled={loadingCorrecao}
                    placeholder={placeholderDinamico}
                    className="textarea"
                    spellCheck={!isModoPressao} 
                    onPaste={(e) => { if(isModoPressao) { e.preventDefault(); alert("Modo Pressão: Colar bloqueado!"); } }}
                    style={{ 
                      flex: 1, paddingBottom: '60px', borderRadius: '12px',
                      minHeight: '400px', resize: 'none',
                      borderColor: excedeuLinhas ? 'var(--error-text)' : 'var(--border)'
                    }}
                  />
                  
                  <div style={{ 
                    position: 'absolute', bottom: '15px', right: '15px', left: '15px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: 'var(--card-bg)', padding: '10px 15px', borderRadius: '8px',
                    border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)'
                  }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Meta: ~{maxLinhas} linhas</span>
                    <span style={{ 
                      fontSize: '0.9rem', fontWeight: '700',
                      color: excedeuLinhas ? 'var(--error-text)' : (palavrasCount >= minPalavrasRecomendado ? 'var(--success-text)' : 'var(--text-main)')
                    }}>
                      {linhasEstimadas} linhas ({palavrasCount} pal.)
                    </span>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setProva(null)} className="btn" style={{ flex: 1 }}>Abandonar</button>
                <button onClick={handleCorrigir} disabled={loadingCorrecao || (palavrasCount < 5 && !useDraftMode)} className="btn primary" style={{ flex: 2 }}>
                  {loadingCorrecao ? <RefreshCw size={20} className="spin" /> : <Send size={20} />}
                  {loadingCorrecao ? "Avaliando..." : "Entregar Prova"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RESULTADO DA CORREÇÃO (TABS) */}
      {correcao && (
        <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          
          <div style={{ background: 'var(--success-bg)', padding: '20px 25px', borderBottom: '1px solid var(--success-text)', display: 'flex', alignItems: 'center', gap: '15px' }}>
            <CheckCircle size={32} color="var(--success-text)" />
            <div>
              <h2 style={{ margin: 0, color: 'var(--success-text)', fontSize: '1.75rem' }}>Nota Final: {correcao.nota_final_calculada?.toFixed(1)} / 20.0</h2>
              <span style={{ color: 'var(--success-text)', opacity: 0.8, fontSize: '0.9rem' }}>Avaliação concluída pela IA</span>
            </div>
          </div>

          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--hover-bg)', overflowX: 'auto' }}>
            <button 
              onClick={() => setActiveTab("geral")} 
              style={{ padding: '15px 25px', border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: '600', fontSize: '0.95rem', borderBottom: activeTab === "geral" ? '3px solid var(--primary)' : '3px solid transparent', color: activeTab === "geral" ? 'var(--primary)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}
            >
              <LayoutTemplate size={18} /> Visão Geral
            </button>
            <button 
              onClick={() => setActiveTab("espelho")} 
              style={{ padding: '15px 25px', border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: '600', fontSize: '0.95rem', borderBottom: activeTab === "espelho" ? '3px solid var(--primary)' : '3px solid transparent', color: activeTab === "espelho" ? 'var(--primary)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}
            >
              <CheckSquare size={18} /> Espelho de Correção
            </button>
            <button 
              onClick={() => setActiveTab("sintaxe")} 
              style={{ padding: '15px 25px', border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: '600', fontSize: '0.95rem', borderBottom: activeTab === "sintaxe" ? '3px solid var(--primary)' : '3px solid transparent', color: activeTab === "sintaxe" ? 'var(--primary)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}
            >
              <FileText size={18} /> Análise Sintática
            </button>
          </div>

          <div style={{ padding: '30px' }}>
            
            {activeTab === "geral" && (
              <div className="md" style={{ animation: 'slideUp 0.3s ease-out' }}>
                <div style={{ background: 'var(--bg)', padding: '20px', borderRadius: '10px', borderLeft: '4px solid var(--primary)', marginBottom: '25px' }}>
                  <h4 style={{ margin: '0 0 10px 0', color: 'var(--heading-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <MessageSquare size={20} /> Parecer da Banca
                  </h4>
                  <Md>{safeString(correcao.feedback_geral)}</Md>
                </div>

                {correcao.dica_estudo && (
                  <div style={{ padding: '20px', background: 'var(--primary-light)', borderRadius: '10px', border: '1px solid var(--primary)', boxShadow: 'var(--shadow-sm)' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Target size={20} /> Plano de Ação / Dica de Estudo
                    </h4>
                    <Md>{safeString(correcao.dica_estudo)}</Md>
                  </div>
                )}
              </div>
            )}

            {activeTab === "espelho" && (
              <div className="md" style={{ animation: 'slideUp 0.3s ease-out' }}>
                {safeArray(correcao.avaliacoes_aspectos).map((av, k) => (
                  <div key={k} style={{ marginBottom: '25px', background: 'var(--card-bg)', padding: '20px', borderRadius: '10px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '15px' }}>
                      <div style={{ fontWeight: '700', color: 'var(--heading-color)', fontSize: '1.05rem', flex: 1 }}>{safeString(av.aspecto)}</div>
                      <div style={{ color: 'var(--primary)', fontWeight: '800', fontSize: '1.15rem', background: 'var(--primary-light)', padding: '4px 12px', borderRadius: '999px' }}>
                        Nota: {safeString(av.nota_atribuida)}
                      </div>
                    </div>
                    
                    <div style={{ marginBottom: '20px', color: 'var(--text-secondary)' }}>
                      <strong style={{ color: 'var(--text-main)', fontSize: '0.9rem', textTransform: 'uppercase' }}>Análise do seu texto:</strong>
                      <div style={{ marginTop: '8px' }}><Md>{safeString(av.comentario)}</Md></div>
                    </div>

                    {av.padrao_esperado && (
                      <div style={{ background: 'var(--success-bg)', border: '1px dashed var(--success-text)', padding: '15px', borderRadius: '8px' }}>
                        <strong style={{ color: 'var(--success-text)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                          💡 O que era esperado (Espelho Ideal):
                        </strong>
                        <div style={{ color: 'var(--text-main)', fontSize: '0.95em' }}>
                          <Md>{safeString(av.padrao_esperado)}</Md>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ABA SINTAXE REVISADA COM COMPATIBILIDADE VISUAL DE ERROS */}
            {activeTab === "sintaxe" && (
              <div className="md" style={{ animation: 'slideUp 0.3s ease-out' }}>
                <div style={{ background: 'var(--error-bg)', padding: '25px', borderRadius: '10px', border: '1px solid var(--error-text)' }}>
                  <h4 style={{ margin: '0 0 15px 0', color: 'var(--error-text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertCircle size={20} /> Erros Gramaticais e Coesão
                  </h4>
                  
                  {safeArray(correcao.analise_sintatica).length === 0 ? (
                     correcao.erros_gramaticais ? (
                        <div style={{ color: 'var(--text-main)' }}>
                          <Md>{safeString(correcao.erros_gramaticais)}</Md>
                        </div>
                     ) : (
                        <div style={{ color: 'var(--success-text)', fontWeight: 'bold' }}>Nenhum erro gramatical grave encontrado. Parabéns!</div>
                     )
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                      {safeArray(correcao.analise_sintatica).map((erro, index) => (
                        <div key={index} style={{ background: 'var(--card-bg)', padding: '15px', borderRadius: '8px', borderLeft: '4px solid var(--error-text)', boxShadow: 'var(--shadow-sm)' }}>
                          <div style={{ textDecoration: 'line-through', color: 'var(--error-text)', marginBottom: '5px' }}>
                            "{safeString(erro.trecho_original)}"
                          </div>
                          <div style={{ color: 'var(--success-text)', fontWeight: 'bold', marginBottom: '5px' }}>
                            Sugestão: "{safeString(erro.correcao)}"
                          </div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            <strong>Motivo:</strong> {safeString(erro.motivo)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* BOTÕES DE AÇÃO: CICLO DE REFAÇÃO */}
            <div style={{ marginTop: '35px', paddingTop: '20px', borderTop: '1px solid var(--border)', display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
              <button onClick={handleRefazerProva} className="btn" style={{ flex: 1, padding: '15px', fontSize: '1.05rem', color: 'var(--primary)', borderColor: 'var(--primary)', display: 'flex', justifyContent: 'center', gap: '8px' }}>
                <RotateCcw size={18} /> Reescrever com base no Feedback
              </button>
              <button onClick={() => { setCorrecao(null); setProva(null); }} className="btn primary" style={{ flex: 1, padding: '15px', fontSize: '1.05rem' }}>
                Concluir e Gerar Novo Treino
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}