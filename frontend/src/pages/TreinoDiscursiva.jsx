import React, { useState, useEffect, useMemo } from "react";
import {
  Target, RefreshCw, Send, CheckCircle, Wand2, Save, BookOpen, FileText, CheckSquare, MessageSquare, LayoutTemplate, Database, Timer, ShieldAlert, Edit3, ArrowDown, RotateCcw,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  Button, Card, CardHead, CardBody, Input, PageHeader, Notice, Toast, EmptyState, Tabs, TabPanel,
} from "../components/ui";
// Markdown único da plataforma: bloco de código, inline, tabelas e fórmulas.
import Md from "../components/Markdown";
import "./TreinoDiscursiva.css";

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
  const [aviso, setAviso] = useState(null);

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
    if (!editalTrecho.trim()) return setAviso({ tone: "warn", texto: "Cole o trecho do conteúdo programático no campo primeiro." });
    
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
      setAviso({ tone: "warn", texto: "Tempo esgotado. A prova foi entregue automaticamente." });
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
    if (tipoProva !== "Personalizado" && (!area || !topicos)) return setAviso({ tone: "warn", texto: "Preencha a disciplina e o tópico antes de gerar." });
    if (tipoProva === "Personalizado" && !editalTrecho) return setAviso({ tone: "warn", texto: "Cole o trecho do conteúdo programático do edital na etapa 2." });
    
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
      return setAviso({ tone: "warn", texto: "Escreva ao menos algumas palavras antes de entregar." });
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
    <div className="td">
      <PageHeader
        eyebrow="Ferramentas"
        title="Simulador de discursivas"
        description="Evolua a escrita por degraus: comece por textos curtos e chegue às peças completas, sempre no padrão da sua banca."
        actions={prova && !correcao && (
          <Button onClick={() => setProva(null)}>Abandonar a prova</Button>
        )}
      />

      {/* ---------------------------------------------- configuração */}
      {!prova && !loading && (
        <>
          <Card>
            <CardHead
              title={<span className="td__passo"><b>1</b> Estratégia de treino</span>}
              action={
                <Button size="sm" onClick={handleSavePrefs} icon={showSavedFeedback ? <CheckCircle size={14} /> : <Save size={14} />}>
                  {showSavedFeedback ? "Salvo" : "Salvar como padrão"}
                </Button>
              }
            />
            <CardBody className="td__form">
              <div className="td__linha">
                <label className="ui-field">
                  <span className="ui-field__label">Banca</span>
                  <select className="ui-input" value={banca} onChange={(e) => setBanca(e.target.value)}>
                    <option value="CEBRASPE">CEBRASPE / CESPE</option>
                    <option value="FGV">FGV</option>
                    <option value="FCC">FCC</option>
                    <option value="VUNESP">VUNESP</option>
                    <option value="IDECAN">IDECAN</option>
                  </select>
                </label>
                <Input label="Cargo (opcional)" value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="ex: Analista de TI" />
                <label className="ui-field">
                  <span className="ui-field__label">Dificuldade</span>
                  <select className="ui-input" value={nivel} onChange={(e) => setNivel(e.target.value)}>
                    <option value="Iniciante">Iniciante</option>
                    <option value="Normal">Normal</option>
                    <option value="Avançado">Avançado</option>
                    <option value="Expert">Expert</option>
                  </select>
                </label>
              </div>

              <label className="ui-field">
                <span className="ui-field__label">Formato do treino</span>
                <select className="ui-input" value={tipoProva} onChange={(e) => setTipoProva(e.target.value)}>
                  <optgroup label="Nível 1 — iniciação">
                    <option value="Paráfrase de Texto">Paráfrase — explicar com as próprias palavras</option>
                    <option value="Expansão de Ideia">Expansão de ideia — aprofundar um conceito</option>
                  </optgroup>
                  <optgroup label="Nível 2 — intermediário">
                    <option value="Reescrita de Parágrafo">Reescrita avançada — corrigir e melhorar</option>
                    <option value="Questão Curta (5 a 10 linhas)">Questão curta — 5 a 10 linhas</option>
                  </optgroup>
                  <optgroup label="Nível 3 — simulação completa">
                    <option value="Questão Discursiva (Estudo de Caso)">Questão discursiva — estudo de caso</option>
                    <option value="Redação (Atualidades/Temas Gerais)">Redação — atualidades e impactos sociais</option>
                    <option value="Peça Prático-Profissional">Peça prático-profissional</option>
                  </optgroup>
                  <optgroup label="Modo avançado">
                    <option value="Personalizado">Personalizado — colar trecho do edital</option>
                  </optgroup>
                </select>
              </label>

              {tipoProva === "Personalizado" && (
                <div className="td__campo">
                  <span className="ui-field__label"><LayoutTemplate size={14} /> Regras do edital para a discursiva</span>
                  <p className="td__ajuda">Cole como a prova será cobrada: linhas, pontuação, formato e critérios de correção.</p>
                  <textarea
                    className="td__textarea"
                    value={editalRegrasProva}
                    onChange={(e) => setEditalRegrasProva(e.target.value)}
                    rows={5}
                    placeholder="ex: 9 DA PROVA DISCURSIVA. 9.1 valerá 40,00 pontos e consistirá de redação técnica de até 60 linhas…"
                  />
                </div>
              )}

              <div
                className={`td__pressao${isModoPressao ? " is-on" : ""}`}
                role="switch"
                aria-checked={isModoPressao}
                tabIndex={0}
                onClick={() => setIsModoPressao(!isModoPressao)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setIsModoPressao(!isModoPressao); } }}
              >
                <div>
                  <b><ShieldAlert size={17} /> Modo pressão real</b>
                  <span>Liga o cronômetro, desativa o corretor ortográfico e bloqueia colar texto de fora.</span>
                </div>
                <span className="td__switch" aria-hidden="true"><i /></span>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHead title={<span className="td__passo"><b>2</b> Definição do tema</span>} />
            <CardBody className="td__form">
              {tipoProva === "Personalizado" ? (
                <div className="td__campo">
                  <span className="ui-field__label"><Database size={14} /> Conteúdo programático do seu cargo</span>
                  <p className="td__ajuda">
                    Cole a parte do edital com as disciplinas e assuntos exigidos. A IA usa isso para montar o
                    cenário e sortear o que será cobrado.
                  </p>
                  <textarea
                    className="td__textarea"
                    value={editalTrecho}
                    onChange={(e) => setEditalTrecho(e.target.value)}
                    rows={7}
                    placeholder="ex: CARGO 10: ANALISTA — ENGENHARIA DE DADOS: 1 Dado, informação… 2 Modelagem…"
                  />
                </div>
              ) : (
                <>
                  <div className="td__linha">
                    <Input label="Disciplina" value={area} onChange={(e) => setArea(e.target.value)} placeholder="ex: Direito Constitucional" />
                    <Input label="Tópico específico" value={topicos} onChange={(e) => setTopicos(e.target.value)} placeholder="ex: Direitos fundamentais" />
                  </div>

                  {(tipoProva.includes("Estudo de Caso") || tipoProva.includes("Peça")) && (
                    <div className="td__opcional">
                      <span className="ui-field__label">
                        <Database size={14} /> Análise do edital <span className="td__tag">opcional</span>
                      </span>
                      <p className="td__ajuda">
                        Cole o bloco do edital para a IA extrair os detalhes e moldar o caso com mais precisão.
                      </p>
                      <textarea
                        className="td__textarea"
                        value={editalTrecho}
                        onChange={(e) => setEditalTrecho(e.target.value)}
                        rows={4}
                        placeholder="ex: DIREITO PENAL: 1 Princípios básicos. 2 Aplicação da lei penal…"
                      />
                      <Button
                        onClick={handleAnalisarEdital}
                        disabled={isExtracting || !editalTrecho.trim()}
                        icon={isExtracting ? <RefreshCw size={15} className="spin" /> : <Wand2 size={15} />}
                        block
                      >
                        {isExtracting ? "Analisando o texto…" : "Preencher disciplina e tópicos automaticamente"}
                      </Button>
                    </div>
                  )}
                </>
              )}

              <Button
                variant="primary"
                size="lg"
                onClick={handleGerarProva}
                disabled={tipoProva === "Personalizado" ? !editalTrecho : !area || !topicos}
                icon={<RefreshCw size={16} />}
                block
              >
                Gerar treino inédito
              </Button>

              {error && <Notice tone="err" onClose={() => setError(null)}>{error}</Notice>}
            </CardBody>
          </Card>
        </>
      )}

      {/* ---------------------------------------------- gerando */}
      {loading && (
        <Card>
          <CardBody className="td__carregando">
            <RefreshCw size={40} className="spin" />
            <h2>Elaborando o cenário…</h2>
            <p>{banca} · nível {nivel} · {tipoProva}</p>
          </CardBody>
        </Card>
      )}

      {/* ---------------------------------------------- prova */}
      {prova && !correcao && (
        <>
          {isModoPressao && (
            <div className={`td__cronometro${timeLeft < 60 ? " is-critico" : ""}`}>
              <span><Timer size={20} /> Tempo restante</span>
              <b>{formatTime(timeLeft)}</b>
            </div>
          )}

          <div className="td__prova">
            <Card>
              <CardHead title={<span className="td__passo"><BookOpen size={16} /> Caderno de prova</span>} />
              <CardBody className="td__caderno">
                <section>
                  <h4>Texto motivador</h4>
                  <Md>{safeString(prova.texto_motivador)}</Md>
                </section>

                <section className="td__comando">
                  <h4>Comando da questão</h4>
                  <Md>{safeString(prova.comando)}</Md>
                </section>

                {safeArray(prova.aspectos).length > 0 && (
                  <section>
                    <h4>Aspectos avaliados obrigatoriamente</h4>
                    <ul className="td__aspectos">
                      {safeArray(prova.aspectos).map((asp, i) => (
                        <li key={i}>
                          <span>{safeString(asp.aspecto)}</span>
                          <b>{safeString(asp.valor_maximo)} pts</b>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </CardBody>
            </Card>

            <div className="td__editor">
              {maxLinhas > 15 && (
                <Button size="sm" onClick={() => setUseDraftMode(!useDraftMode)} icon={<Edit3 size={14} />}>
                  {useDraftMode ? "Ir direto ao texto definitivo" : "Abrir esqueleto guiado"}
                </Button>
              )}

              {useDraftMode ? (
                <>
                  <div className="td__bloco">
                    <span className="ui-field__label">1. Tópico frasal — a tese</span>
                    <textarea className="td__textarea" value={draftTese} onChange={(e) => setDraftTese(e.target.value)} rows={3}
                      placeholder="Apresente o conceito principal de forma direta." />
                  </div>
                  <div className="td__bloco">
                    <span className="ui-field__label">2. Desenvolvimento — fundamentação e exemplos</span>
                    <textarea className="td__textarea" value={draftArgs} onChange={(e) => setDraftArgs(e.target.value)} rows={6}
                      placeholder="Responda aos aspectos exigidos, usando conectivos." />
                  </div>
                  <div className="td__bloco">
                    <span className="ui-field__label">3. Conclusão — fechamento</span>
                    <textarea className="td__textarea" value={draftConclusao} onChange={(e) => setDraftConclusao(e.target.value)} rows={3}
                      placeholder="Conclua a ideia ou proponha uma solução." />
                  </div>
                  <Button onClick={handleUnirRascunho} icon={<ArrowDown size={15} />} block>
                    Unir os blocos e revisar o texto definitivo
                  </Button>
                </>
              ) : (
                <div className="td__folha">
                  <textarea
                    className={`td__textarea td__resposta${excedeuLinhas ? " is-excedido" : ""}`}
                    value={resposta}
                    onChange={(e) => setResposta(e.target.value)}
                    disabled={loadingCorrecao}
                    placeholder={placeholderDinamico}
                    spellCheck={!isModoPressao}
                    onPaste={(e) => {
                      if (isModoPressao) {
                        e.preventDefault();
                        setAviso({ tone: "warn", texto: "Modo pressão: colar texto de fora está bloqueado." });
                      }
                    }}
                  />
                  <div className="td__contador">
                    <span>Meta: cerca de {maxLinhas} linhas</span>
                    <b className={excedeuLinhas ? "is-excedido" : palavrasCount >= minPalavrasRecomendado ? "is-ok" : ""}>
                      {linhasEstimadas} linha(s) · {palavrasCount} palavra(s)
                    </b>
                  </div>
                </div>
              )}

              <div className="td__acoes">
                <Button onClick={() => setProva(null)}>Abandonar</Button>
                <Button
                  variant="primary"
                  onClick={handleCorrigir}
                  disabled={loadingCorrecao || (palavrasCount < 5 && !useDraftMode)}
                  icon={loadingCorrecao ? <RefreshCw size={16} className="spin" /> : <Send size={16} />}
                >
                  {loadingCorrecao ? "Avaliando…" : "Entregar prova"}
                </Button>
              </div>

              {error && <Notice tone="err" onClose={() => setError(null)}>{error}</Notice>}
            </div>
          </div>
        </>
      )}

      {/* ---------------------------------------------- correção */}
      {correcao && (
        <Card>
          <div className="td__nota">
            <CheckCircle size={28} />
            <div>
              <b>Nota final: {correcao.nota_final_calculada?.toFixed(1)} / 20,0</b>
              <span>Avaliação concluída</span>
            </div>
          </div>

          <Tabs
            idBase="td-correcao"
            aria="Resultado da correção"
            ativo={activeTab}
            onTrocar={setActiveTab}
            itens={[
              { id: "geral", rotulo: "Visão geral", icone: LayoutTemplate },
              { id: "espelho", rotulo: "Espelho de correção", icone: CheckSquare },
              { id: "sintaxe", rotulo: "Análise sintática", icone: FileText },
            ]}
          />

          {/* Um painel só, trocando de id junto com a aba: é sempre um
              conteúdo de cada vez, e o aria-labelledby acompanha. */}
          <TabPanel id={activeTab} idBase="td-correcao" className="ui-card__body td__resultado">
            {activeTab === "geral" && (
              <>
                <section className="td__parecer">
                  <h4><MessageSquare size={17} /> Parecer da banca</h4>
                  <Md>{safeString(correcao.feedback_geral)}</Md>
                </section>
                {correcao.dica_estudo && (
                  <section className="td__plano">
                    <h4><Target size={17} /> Plano de ação</h4>
                    <Md>{safeString(correcao.dica_estudo)}</Md>
                  </section>
                )}
              </>
            )}

            {activeTab === "espelho" && (
              safeArray(correcao.avaliacoes_aspectos).length === 0 ? (
                <EmptyState icon={<CheckSquare size={20} />} title="Sem espelho detalhado"
                  description="A correção não devolveu a avaliação aspecto a aspecto desta vez." />
              ) : (
                safeArray(correcao.avaliacoes_aspectos).map((av, k) => (
                  <section key={k} className="td__aspecto">
                    <header>
                      <b>{safeString(av.aspecto)}</b>
                      <span className="td__aspecto-nota">{safeString(av.nota_atribuida)}</span>
                    </header>
                    <div className="td__aspecto-analise">
                      <span className="ui-field__label">Análise do seu texto</span>
                      <Md>{safeString(av.comentario)}</Md>
                    </div>
                    {av.padrao_esperado && (
                      <div className="td__espelho">
                        <b>Como a resposta perfeita seria</b>
                        <Md>{safeString(av.padrao_esperado)}</Md>
                      </div>
                    )}
                  </section>
                ))
              )
            )}

            {activeTab === "sintaxe" && (
              safeArray(correcao.analise_sintatica).length === 0 ? (
                correcao.erros_gramaticais ? (
                  <section className="td__gramatica"><Md>{safeString(correcao.erros_gramaticais)}</Md></section>
                ) : (
                  <div className="td__limpo"><CheckCircle size={19} /> Nenhum desvio gramatical grave encontrado.</div>
                )
              ) : (
                <div className="td__desvios">
                  {safeArray(correcao.analise_sintatica).map((erro, i) => (
                    <div key={i} className="td__desvio">
                      <s>{safeString(erro.trecho_original)}</s>
                      <b>{safeString(erro.correcao)}</b>
                      <span>{safeString(erro.motivo)}</span>
                    </div>
                  ))}
                </div>
              )
            )}

            <div className="td__acoes td__acoes--fim">
              <Button onClick={handleRefazerProva} icon={<RotateCcw size={15} />}>
                Reescrever com base no parecer
              </Button>
              <Button variant="primary" onClick={() => { setCorrecao(null); setProva(null); }}>
                Concluir e gerar novo treino
              </Button>
            </div>
          </TabPanel>
        </Card>
      )}

      <Toast aviso={aviso} onFechar={() => setAviso(null)} />
    </div>
  );
}
