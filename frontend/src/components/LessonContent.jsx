import React, { useState, useEffect, useRef, lazy, Suspense } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css"; // Estilo obrigatório para formatar a fórmula corretamente
import {
  BookOpen, Lightbulb, Wrench, ClipboardList, PenLine, Network, Settings,
  Sparkles, ChevronDown, ChevronsDownUp, ChevronsUpDown, X, Send, MessageCircle,
  List, Check, CheckCircle2,
  AlertTriangle, Download, Trophy, ArrowUp, KeyRound, Target, GraduationCap,
  RefreshCw, Calendar,
} from "lucide-react";
import QuizCard from "../QuizCard";
import { Button, Badge, ProgressBar } from "./ui";
import "./LessonContent.css";

// O Mermaid arrasta cytoscape e treemap junto (~900 kB). Como so aparece quando
// alguem abre o mapa mental, ele e carregado sob demanda: a aula abre sem esse peso.
const Mermaid = lazy(() => import("./Mermaid"));

// Aquece o modulo quando o mouse passa pelo botao, para o clique parecer instantaneo.
const prefetchMermaid = () => { import("./Mermaid"); };

const MD_PLUGINS = { remarkPlugins: [remarkGfm, remarkMath], rehypePlugins: [rehypeKatex] };

// --- RENDERIZAÇÃO DE CÓDIGO E LINKS DENTRO DO MARKDOWN ---
const markdownComponents = {
  code({ node, inline, className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "");
    if (inline) {
      return <code className="lc-inline" {...props}>{children}</code>;
    }
    return (
      <div className="lc-code">
        <div className="lc-code__bar">
          <span>{match ? match[1] : "código"}</span>
        </div>
        <pre>
          <code className={className} {...props}>{children}</code>
        </pre>
      </div>
    );
  },
  a({ node, children, ...props }) {
    return <a target="_blank" rel="noopener noreferrer" {...props}>{children}</a>;
  },
};

// Markdown reaproveitado em todo o arquivo, sempre com os mesmos plugins.
const Md = ({ children, inline = false }) => (
  <ReactMarkdown
    {...MD_PLUGINS}
    components={inline ? { ...markdownComponents, p: "span" } : markdownComponents}
  >
    {children}
  </ReactMarkdown>
);

const safeArray = (v) => (Array.isArray(v) ? v : []);
const safeString = (v) => {
  let str = typeof v === "string" ? v : v == null ? "" : String(v);
  // Previne que o símbolo de Real (R$) inicie acidentalmente uma equação matemática (LaTeX)
  return str.replace(/R\$/g, 'R\\$');
};

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
    
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      const val = storage.getItem(key);
      if (typeof val === "string" && val.startsWith("eyJ")) return val;
      try {
        if (val && val.startsWith("{")) {
          const obj = JSON.parse(val);
          for (let k in obj) {
            if (typeof obj[k] === "string" && obj[k].startsWith("eyJ")) return obj[k];
          }
        }
      } catch(e) {}
    }
  }
  return null;
};

// NOVA FUNÇÃO: Dispara o salvamento da nota para o backend
const savePerformance = async (tipo, tema, notaObtida, notaMaxima, nivel, formato, concurso) => {
  const token = getAuthToken();
  if (!token) return; 

  try {
    const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
    await fetch(`${apiUrl}/performance`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        tipo: tipo,
        tema: tema,
        nota_obtida: parseFloat(notaObtida) || 0,
        nota_maxima: parseFloat(notaMaxima) || 10.0,
        nivel: nivel || null,
        formato: formato || null,
        concurso: concurso || null
      })
    });
  } catch (err) {
    console.error("Erro ao salvar desempenho:", err);
  }
};

// NOVA FUNÇÃO: Lê o stream e possui extração inteligente e VACINA ANTI-QUEBRA
const fetchStreamAsJson = async (url, options) => {
  const res = await fetch(url, options);
  
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Erro do servidor: ${res.status} - ${errText}`);
  }
  
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let rawText = "";
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    rawText += decoder.decode(value, { stream: true });
  }
  
  try {
    let cleanText = rawText.replace(/<think>[\s\S]*?<\/think>/gi, "").trim(); 
    cleanText = cleanText.replace(/^```json/i, "").replace(/```$/i, "").trim();
    
    const jsonMatch = cleanText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      cleanText = jsonMatch[0];
    }
    
    cleanText = cleanText.replace(/,\s*([\]}])/g, '$1');

    if (!cleanText.endsWith("}") && !cleanText.endsWith("]")) {
        cleanText += '"}'; 
    }
    
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("Erro ao parsear JSON. Texto bruto recebido:", rawText);
    
    const fallbackMatch = rawText.match(/"resposta"\s*:\s*"([\s\S]*)/);
    if (fallbackMatch && fallbackMatch[1]) {
        let extracted = fallbackMatch[1].replace(/"\s*\}\s*$/, ''); 
        extracted = extracted.replace(/\\n/g, '\n'); 
        return { resposta: extracted + "..." }; 
    }
    
    throw new Error("A IA gerou um formato inválido ou a conexão foi interrompida.");
  }
};

// ==========================================
// PEÇAS DE INTERFACE REAPROVEITADAS
// ==========================================

// Bloco recolhível padrão da aula (teoria, termos, analogias, quiz...).
function Disclosure({ icon: Icon, title, count, defaultOpen = false, children }) {
  return (
    <details className="lc__block" open={defaultOpen}>
      <summary>
        <span className="lc__block-icon"><Icon size={16} /></span>
        {title}
        {count != null && <span className="lc__block-count">{count}</span>}
        <ChevronDown className="lc__block-chev" size={18} />
      </summary>
      <div className="lc__block-body">{children}</div>
    </details>
  );
}

function NivelSelect({ value, onChange, label = "Nível de dificuldade" }) {
  return (
    <label className="lc__control">
      <span>{label}</span>
      <select className="lc__select" value={value} onChange={onChange}>
        <option value="Iniciante">Iniciante</option>
        <option value="Normal">Normal</option>
        <option value="Avançado">Avançado</option>
        <option value="Expert">Expert</option>
      </select>
    </label>
  );
}

// Enunciado da discursiva: cenário, comando e aspectos avaliados.
function EssayBrief({ discursiva, tituloAspectos }) {
  return (
    <>
      <div className="lc__essay-part">
        <h4>Cenário / texto motivador</h4>
        <div className="lc__essay-text"><Md>{safeString(discursiva.texto_motivador)}</Md></div>
      </div>

      <div className="lc__command">
        <div className="lc__essay-part">
          <h4>Comando da questão</h4>
          <div className="lc__essay-text"><Md>{safeString(discursiva.comando)}</Md></div>
        </div>
      </div>

      <div className="lc__essay-part">
        <h4>{tituloAspectos}</h4>
        <ul className="lc__aspects">
          {safeArray(discursiva.aspectos).map((asp, i) => (
            <li className="lc__aspect" key={i}>
              <span>{safeString(asp.aspecto)}</span>
              <b>{safeString(asp.valor_maximo)} pts</b>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

// Folha de resposta com contador de palavras e estimativa de linhas.
function EssayEditor({ answer, setAnswer, disabled, placeholder }) {
  const palavras = answer.trim() === "" ? 0 : answer.trim().split(/\s+/).length;
  const linhas = Math.ceil(palavras / 9);
  const excedeu = linhas > 30;
  const perto = !excedeu && linhas > 25;

  return (
    <div className={`lc__editor${excedeu ? " is-over" : ""}`}>
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        aria-label="Folha de resposta"
      />
      <span className={`lc__counter${excedeu ? " is-over" : perto ? " is-warn" : ""}`}>
        {palavras} palavras · ~{linhas}/30 linhas{excedeu ? " · excedeu" : ""}
      </span>
    </div>
  );
}

// Relatório da banca: nota, parecer, espelho por aspecto, gramática e plano de ação.
function CorrectionReport({ correction, notaMaxima = "10.0", children }) {
  return (
    <div className="lc__report">
      <div className="lc__grade">
        <b>{safeString(correction.nota_final_calculada?.toFixed(1))}</b>
        <span>de {notaMaxima} pontos</span>
      </div>

      <div className="lc__essay-part">
        <h4>Parecer da banca</h4>
        <div className="lc__essay-text"><Md>{safeString(correction.feedback_geral)}</Md></div>
      </div>

      <h4 className="lc__report-h">Avaliação por aspecto e espelho de resposta</h4>
      {safeArray(correction.avaliacoes_aspectos).map((av, k) => (
        <div className="lc__criterion" key={k}>
          <div className="lc__criterion-top">
            <b>{safeString(av.aspecto)}</b>
            <span className="lc__criterion-note">{safeString(av.nota_atribuida)}</span>
          </div>
          <div className="lc__essay-text"><Md>{safeString(av.comentario)}</Md></div>
          {av.padrao_esperado && (
            <div className="lc__mirror">
              <b><Check size={14} /> Como a resposta perfeita seria</b>
              <Md>{safeString(av.padrao_esperado)}</Md>
            </div>
          )}
        </div>
      ))}

      <h4 className="lc__report-h">Estrutura e gramática</h4>
      <div className="lc__grammar"><Md>{safeString(correction.erros_gramaticais)}</Md></div>

      {correction.dica_estudo && (
        <div className="lc__tip">
          <b><Lightbulb size={14} /> Plano de ação</b>
          <Md>{safeString(correction.dica_estudo)}</Md>
        </div>
      )}

      {children}
    </div>
  );
}

// ==========================================
// COMPONENTE: CHAT DO TUTOR (FLUTUANTE DIREITO)
// ==========================================
function TutorChat({ area, defaultModel, userApiKey, userModel, onOpenConfig }) { 
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!input.trim()) return;
    
    const newMsg = { role: "user", content: input };
    const updatedMessages = [...messages, newMsg];
    
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);
    
    try {
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
      const token = getAuthToken();

      const data = await fetchStreamAsJson(`${apiUrl}/chat`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": token ? `Bearer ${token}` : ""
        },
        body: JSON.stringify({
          area: area || "Assunto Geral",
          aula_titulo: "Conhecimento Geral da Área",
          mensagem: newMsg.content,
          historico: messages.slice(-4),
          model: userModel || defaultModel || "deepseek/deepseek-v4-flash",
          api_key: userApiKey || null
        })
      });

      if (data && data.error) {
        throw new Error(data.error);
      }

      setMessages([...updatedMessages, { role: "assistant", content: data.resposta }]);
    } catch (e) {
      setMessages([...updatedMessages, { role: "assistant", content: `⚠️ *${e.message || "Desculpe, falha na conexão."}*` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lc__tutor">
      {isOpen ? (
        <div className="lc__tutor-win" role="dialog" aria-label="Tutor de IA">
          <div className="lc__tutor-head">
            <span className="lc__block-icon"><GraduationCap size={16} /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <b>Tutor de IA</b>
              <small>{safeString(area) || "Assunto geral"}</small>
            </span>
            <button className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => setIsOpen(false)} aria-label="Fechar tutor">
              <X size={16} />
            </button>
          </div>

          <div className="lc__tutor-msgs">
            {messages.length === 0 && (
              <p className="lc__tutor-empty">
                Pergunte qualquer coisa sobre <strong>{safeString(area) || "o conteúdo"}</strong> sem
                sair da aula. A resposta considera o que você está estudando agora.
              </p>
            )}

            {messages.map((msg, idx) => (
              <div key={idx} className={`lc__msg lc__msg--${msg.role === "user" ? "user" : "bot"}`}>
                {msg.role === "assistant" ? <Md>{msg.content}</Md> : msg.content}
              </div>
            ))}

            {loading && <div className="lc__msg lc__msg--bot" style={{ color: "var(--fg-3)" }}>Pensando…</div>}
            <div ref={chatEndRef} />
          </div>

          <form
            className="lc__tutor-form"
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          >
            <input
              type="text"
              placeholder="Digite a sua dúvida…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              aria-label="Sua dúvida"
            />
            <Button variant="primary" type="submit" disabled={loading || !input.trim()} aria-label="Enviar">
              <Send size={16} />
            </Button>
          </form>
        </div>
      ) : (
        <button className="lc__tutor-fab" onClick={() => setIsOpen(true)} title="Tirar dúvida com o tutor de IA" aria-label="Abrir tutor de IA">
          <MessageCircle size={22} />
        </button>
      )}
    </div>
  );
}

// ==========================================
// COMPONENTE: PROVA DISCURSIVA
// ==========================================
function EssaySection({ initialDiscursiva, defaultModel, userApiKey, userModel, aula, area, onOpenConfig }) {
  const [discursiva, setDiscursiva] = useState(initialDiscursiva);
  const [answer, setAnswer] = useState("");
  const [correction, setCorrection] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingGen, setLoadingGen] = useState(false);
  const [error, setError] = useState(null);
  const [nivel, setNivel] = useState("Normal");

  if (!discursiva || !discursiva.comando) return null;


  const handleCorrect = async () => {
    if (answer.trim().length < 50) {
      alert("A banca exige mais conteúdo. Desenvolva melhor os seus argumentos antes de enviar.");
      return;
    }
    setLoading(true); setError(null); setCorrection(null);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
      const token = getAuthToken();

      const data = await fetchStreamAsJson(`${apiUrl}/correct-essay`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": token ? `Bearer ${token}` : ""
        },
        body: JSON.stringify({
          texto_motivador: discursiva.texto_motivador || "",
          comando: discursiva.comando || "",
          aspectos: discursiva.aspectos || [],
          resposta_aluno: answer,
          model: userModel || defaultModel || "deepseek/deepseek-v4-flash",
          api_key: userApiKey || null
        })
      });
      
      if (data && data.error) throw new Error(data.error);
      
      const notaCalculada = Array.isArray(data.avaliacoes_aspectos) 
        ? data.avaliacoes_aspectos.reduce((acc, curr) => acc + (parseFloat(curr.nota_atribuida) || 0), 0)
        : (parseFloat(data.nota_final) || 0);
        
      data.nota_final_calculada = notaCalculada; 
      setCorrection(data);
      
      await savePerformance("discursiva", area ? `${area} - ${aula?.titulo || 'Tópico'}` : "Prova Discursiva", notaCalculada, 10.0, nivel);
      
    } catch (err) {
      setError("A IA corretora falhou. Verifique se a sua Chave de API está correta nas configurações.");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateNew = async () => {
    setLoadingGen(true); setError(null); setCorrection(null); setAnswer("");
    try {
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
      const token = getAuthToken();

      const data = await fetchStreamAsJson(`${apiUrl}/generate-essay`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": token ? `Bearer ${token}` : ""
        },
        body: JSON.stringify({
          area: area || "Assunto Geral",
          aula_titulo: aula.titulo || "Aula",
          lesson_content: aula, 
          nivel: nivel, 
          model: userModel || defaultModel || "deepseek/deepseek-v4-flash",
          api_key: userApiKey || null
        })
      });
      
      if (data && data.error) throw new Error(data.error);
      
      const novaQuestao = data.discursiva ? data.discursiva : data;
      if (novaQuestao && novaQuestao.comando) {
        setDiscursiva(novaQuestao); 
      } else {
        setError("A IA não retornou um formato válido. Tente clicar em Gerar novamente.");
      }
    } catch (err) {
      setError("Falha ao gerar nova discursiva. Tente novamente.");
    } finally {
      setLoadingGen(false);
    }
  };

  if (!discursiva) return null;

  const emAndamento = loading || loadingGen;

  return (
    <Disclosure icon={PenLine} title="Prova discursiva desta aula">
      <div className="lc__essay">
        <EssayBrief discursiva={discursiva} tituloAspectos="Aspectos avaliados obrigatoriamente" />

        <EssayEditor
          answer={answer}
          setAnswer={setAnswer}
          disabled={emAndamento || correction !== null}
          placeholder="Rascunho oficial: escreva aqui o seu texto dissertativo."
        />

        {!correction && (
          <div className="lc__controls">
            <Button variant="primary" onClick={handleCorrect} disabled={emAndamento || answer.trim().length === 0}>
              {loading ? "Avaliando…" : "Enviar para correção"}
            </Button>
            <NivelSelect value={nivel} onChange={(e) => setNivel(e.target.value)} />
            <Button onClick={handleGenerateNew} disabled={loadingGen} icon={<RefreshCw size={15} />}>
              {loadingGen ? "Gerando…" : "Nova prova"}
            </Button>
          </div>
        )}

        {error && (
          <div className="lc__grammar" style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <AlertTriangle size={17} style={{ flex: "none", color: "var(--danger)" }} />
            <span>{error}</span>
          </div>
        )}

        {correction && (
          <CorrectionReport correction={correction}>
            <div className="lc__controls">
              <Button onClick={() => { setCorrection(null); setAnswer(""); }} icon={<RefreshCw size={15} />}>
                Refazer esta redação
              </Button>
              <Button onClick={handleGenerateNew} disabled={loadingGen} icon={<Sparkles size={15} />}>
                {loadingGen ? "Gerando…" : "Gerar outra discursiva"}
              </Button>
            </div>
          </CorrectionReport>
        )}
      </div>
    </Disclosure>
  );
}

// ==========================================
// COMPONENTE: PROVA DISCURSIVA GERAL (GLOBAL)
// ==========================================
function GlobalEssaySection({ defaultModel, userApiKey, userModel, area, aulas, onOpenConfig }) {
  const [discursiva, setDiscursiva] = useState(null);
  const [answer, setAnswer] = useState("");
  const [correction, setCorrection] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingGen, setLoadingGen] = useState(false);
  const [error, setError] = useState(null);
  const [nivel, setNivel] = useState("Normal");


  const handleGenerateNew = async () => {
    setLoadingGen(true); setError(null); setCorrection(null); setAnswer("");
    try {
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
      const aulasTitulos = aulas.map(a => a.titulo);
      const token = getAuthToken();
      
      const data = await fetchStreamAsJson(`${apiUrl}/generate-global-essay`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": token ? `Bearer ${token}` : ""
        },
        body: JSON.stringify({
          area: area || "Assunto Geral",
          aulas_titulos: aulasTitulos,
          nivel: nivel,
          model: userModel || defaultModel || "deepseek/deepseek-v4-flash",
          api_key: userApiKey || null
        })
      });

      if (data && data.error) throw new Error(data.error);
      
      const novaQuestao = data.discursiva ? data.discursiva : data;
      if (novaQuestao && novaQuestao.comando) {
        setDiscursiva(novaQuestao);
      } else {
        setError("A IA não retornou um formato válido. Tente gerar novamente.");
      }
    } catch (err) {
      setError(err.message || "Falha ao comunicar com os servidores da IA.");
    } finally {
      setLoadingGen(false);
    }
  };

  const handleCorrect = async () => {
    if (answer.trim().length < 50) {
      alert("A banca exige mais conteúdo. Desenvolva melhor os seus argumentos antes de enviar.");
      return;
    }
    setLoading(true); setError(null); setCorrection(null);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
      const token = getAuthToken();

      const data = await fetchStreamAsJson(`${apiUrl}/correct-essay`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": token ? `Bearer ${token}` : ""
        },
        body: JSON.stringify({
          texto_motivador: discursiva.texto_motivador || "",
          comando: discursiva.comando || "",
          aspectos: discursiva.aspectos || [],
          resposta_aluno: answer,
          model: userModel || defaultModel || "deepseek/deepseek-v4-flash",
          api_key: userApiKey || null
        })
      });      
      
      if (data && data.error) throw new Error(data.error);    
      
      const notaCalculada = Array.isArray(data.avaliacoes_aspectos) 
        ? data.avaliacoes_aspectos.reduce((acc, curr) => acc + (parseFloat(curr.nota_atribuida) || 0), 0)
        : (parseFloat(data.nota_final) || 0);
        
      data.nota_final_calculada = notaCalculada; 
      setCorrection(data); 
      
      await savePerformance("discursiva", area ? `${area} (Simulado Global)` : "Discursiva Global", notaCalculada, 20.0, nivel);
      
    } catch (err) {
      setError("A IA corretora falhou ao processar a redação.");
    } finally {
      setLoading(false);
    }
  };

  if (!discursiva) {
    return (
      <div className="lc__controls" style={{ alignItems: "flex-end" }}>
        <NivelSelect value={nivel} onChange={(e) => setNivel(e.target.value)} />
        <Button variant="primary" size="lg" onClick={handleGenerateNew} disabled={loadingGen} icon={<Sparkles size={16} />}>
          {loadingGen ? "Sorteando temas e gerando a prova…" : "Gerar prova discursiva"}
        </Button>
        {error && (
          <span style={{ color: "var(--danger)", fontSize: "var(--text-sm)", fontWeight: 600 }}>{error}</span>
        )}
      </div>
    );
  }

  const emAndamento = loading || loadingGen;

  return (
    <div className="lc__essay">
      <EssayBrief discursiva={discursiva} tituloAspectos="Aspectos avaliados · 19,0 pontos" />

      <EssayEditor
        answer={answer}
        setAnswer={setAnswer}
        disabled={emAndamento || correction !== null}
        placeholder="Folha de texto definitivo: escreva aqui a sua resposta estruturada."
      />

      {!correction && (
        <div className="lc__controls">
          <Button variant="primary" onClick={handleCorrect} disabled={emAndamento || answer.trim().length === 0}>
            {loading ? "Avaliando a sua redação…" : "Enviar para a banca de IA"}
          </Button>
          <NivelSelect value={nivel} onChange={(e) => setNivel(e.target.value)} />
          <Button onClick={handleGenerateNew} disabled={loadingGen} icon={<RefreshCw size={15} />}>
            {loadingGen ? "Sorteando…" : "Sortear outro tema"}
          </Button>
        </div>
      )}

      {error && (
        <div className="lc__grammar" style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <AlertTriangle size={17} style={{ flex: "none", color: "var(--danger)" }} />
          <span>{error}</span>
        </div>
      )}

      {correction && (
        <CorrectionReport correction={correction} notaMaxima="20,0">
          <div className="lc__controls">
            <Button onClick={() => { setCorrection(null); setAnswer(""); }} icon={<RefreshCw size={15} />}>
              Refazer esta redação
            </Button>
            <Button onClick={handleGenerateNew} disabled={loadingGen} icon={<Sparkles size={15} />}>
              {loadingGen ? "Sorteando…" : "Sortear nova prova"}
            </Button>
          </div>
        </CorrectionReport>
      )}
    </div>
  );
}

// ==========================================
// COMPONENTE PRINCIPAL DA PÁGINA
// ==========================================
export default function LessonContent({ result }) {
  const [selectedMap, setSelectedMap] = useState(null);
  
  const [isNavOpen, setIsNavOpen] = useState(false);
  
  const [showConfig, setShowConfig] = useState(false);
  const [providerTab, setProviderTab] = useState("openrouter");
  const [tempKey, setTempKey] = useState("");
  const [tempModel, setTempModel] = useState("");
  const [userApiKey, setUserApiKey] = useState("");
  const [userModel, setUserModel] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);

  const handleConnectAI = () => {
    const callbackUrl = encodeURIComponent(`${window.location.origin}/callback`);
    window.location.href = `https://openrouter.ai/auth?callback_url=${callbackUrl}`;
  };
  
  const [simuladoQuestoes, setSimuladoQuestoes] = useState(null);
  const [simuladoLoading, setSimuladoLoading] = useState(false);
  const [simuladoProgress, setSimuladoProgress] = useState(0);
  const [simuladoAcertos, setSimuladoAcertos] = useState(0);
  const [simuladoFinalizado, setSimuladoFinalizado] = useState(false);
  const [simuladoQtd, setSimuladoQtd] = useState(5);
  const [simuladoNivel, setSimuladoNivel] = useState("Normal");
  const [simuladoFormato, setSimuladoFormato] = useState("Múltipla Escolha");

  useEffect(() => {
    const fetchDBSettings = async () => {
      try {
        const token = getAuthToken();
        if (!token) return;
        const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
        const res = await fetch(`${apiUrl}/users/me/settings`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.api_key) setUserApiKey(data.api_key);
          if (data.preferred_model) setUserModel(data.preferred_model);
        }
      } catch (err) { console.error("Falha ao buscar configurações de IA", err); }
    };
    fetchDBSettings();
  }, []);

  const openConfigModal = () => {
    const isAIStudio = userApiKey && !userApiKey.startsWith("sk-or-");
    setProviderTab(isAIStudio ? "aistudio" : "openrouter");
    setTempKey(userApiKey || "");
    setTempModel(userModel || result?.modelo_utilizado || (isAIStudio ? "gemini-2.5-flash" : "google/gemini-2.5-flash"));
    setShowConfig(true);
  };

  const saveConfigToDB = async () => {
    setSavingConfig(true);
    try {
      const token = getAuthToken();
      if (!token) { alert("Sessão expirada. Faça login."); return; }
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
      
      const keyToSave = providerTab === "aistudio" ? tempKey.trim() : userApiKey;

      const res = await fetch(`${apiUrl}/users/me/settings`, {
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
    if (!window.confirm("Tem a certeza que deseja desvincular a sua conta? Os recursos interativos de IA serão bloqueados.")) return;
    
    setSavingConfig(true);
    try {
      const token = getAuthToken();
      if (!token) { alert("Sessão expirada. Faça login."); return; }
      
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/users/me/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ api_key: "", preferred_model: tempModel.trim() })
      });
      
      if (res.ok) {
        setUserApiKey(""); 
        setTempKey("");
      } else { 
        alert("Erro ao desvincular no servidor."); 
      }
    } catch (err) { alert("Falha de conexão."); } finally { setSavingConfig(false); }
  };

  const handleDownloadSVG = (titulo) => {
    const svgElement = document.querySelector('.mermaid-wrapper svg');
    if (!svgElement) { alert("O mapa ainda está a ser gerado."); return; }
    const serializer = new XMLSerializer();
    let svgString = serializer.serializeToString(svgElement);
    if (!svgString.includes('xmlns="http://www.w3.org/2000/svg"')) {
      svgString = svgString.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    }
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Mapa-Mental-${safeString(titulo).replace(/\s+/g, '-')}.svg`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const handleGerarSimuladoIA = async () => {
    setSimuladoAcertos(0);
    setSimuladoFinalizado(false);
    setSimuladoLoading(true);
    setSimuladoQuestoes([]); 
    setSimuladoProgress(0);
    
    let errorGlobal = false;
    const totalAulas = safeArray(result?.aulas).length;
    const token = getAuthToken(); 

    setTimeout(() => {
      document.getElementById('simulado-progress-anchor')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);

    try {
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
      
      for (let i = 0; i < totalAulas; i++) {
        const aula = result.aulas[i];
        
        let maxTentativas = 3;
        let tentativaAtual = 0;
        let sucessoNoTopico = false;

        while (tentativaAtual < maxTentativas && !sucessoNoTopico) {
          try {
            setSimuladoProgress(Math.round((i / totalAulas) * 100)); 

            const data = await fetchStreamAsJson(`${apiUrl}/generate-simulado-topic`, {
              method: "POST",
              headers: { 
                "Content-Type": "application/json",
                "Authorization": token ? `Bearer ${token}` : "" 
              },
              body: JSON.stringify({
                area: aula.disciplina || result?.area_identificada || "Conhecimentos Gerais",
                topico: aula.titulo || `Tópico ${i+1}`,
                conteudo: aula.aula_teorica_aprofundada || aula.visao_geral || "",
                model: userModel || result?.modelo_utilizado || "deepseek/deepseek-v4-flash",
                api_key: userApiKey || null,
                qtd_questoes: parseInt(simuladoQtd, 10), 
                nivel: simuladoNivel,
                formato: simuladoFormato
              })
            });
            
            if (data && data.error) throw new Error(data.error); 
            
            if (data && data.simulado) {
              setSimuladoQuestoes(prev => [...prev, ...data.simulado]);
              sucessoNoTopico = true;
            } else if (Array.isArray(data)) {
              setSimuladoQuestoes(prev => [...prev, ...data]);
              sucessoNoTopico = true;
            } else {
              throw new Error("O JSON retornou vazio.");
            }
            
          } catch (err) {
            tentativaAtual++;
            console.warn(`⚠️ Falha no tópico ${i+1} (Tentativa ${tentativaAtual}/${maxTentativas}).`, err.message);
            
            if (tentativaAtual >= maxTentativas) {
              console.error("🕵️ ERRO BRUTO DETECTADO:", err); 
              throw new Error(`Falha crítica no tópico "${aula.titulo}".`);
            }

            await new Promise(resolve => setTimeout(resolve, 2500));
          }
        }
      }
      
      setSimuladoProgress(100);

    } catch (err) {
      console.error(err);
      alert(err.message || "Ocorreu um erro ao gerar algumas questões. O processo foi interrompido.");
      errorGlobal = true;
    } finally {
      setSimuladoLoading(false);
      setSimuladoQuestoes(prev => {
        if (prev.length === 0 && !errorGlobal) {
          alert("Não foi possível gerar as questões.");
          return null;
        }
        return prev;
      });
    }
  };

  // Indice lateral: marca a aula visivel enquanto a pessoa rola a pagina.
  const [aulaAtiva, setAulaAtiva] = useState(0);
  const totalAulas = safeArray(result?.aulas).length;

  useEffect(() => {
    if (!totalAulas) return undefined;
    const alvos = Array.from(document.querySelectorAll("[data-aula-idx]"));
    if (alvos.length === 0) return undefined;

    const observer = new IntersectionObserver(
      (entradas) => {
        const visivel = entradas
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visivel) setAulaAtiva(Number(visivel.target.dataset.aulaIdx));
      },
      { rootMargin: "-96px 0px -66% 0px", threshold: 0 }
    );

    alvos.forEach((alvo) => observer.observe(alvo));
    return () => observer.disconnect();
  }, [totalAulas]);

  // Recolher/expandir todos os blocos de um modulo de uma vez. Os <details> sao
  // nao-controlados, entao alternamos a propriedade open direto no DOM do artigo.
  const [modulosRecolhidos, setModulosRecolhidos] = useState({});

  // Todo modulo comeca com os blocos fechados, entao o estado padrao e "recolhido".
  const estaRecolhido = (idx) => modulosRecolhidos[idx] ?? true;

  const alternarModulo = (idx, evento) => {
    const artigo = evento.currentTarget.closest("article");
    if (!artigo) return;
    const vaiRecolher = !estaRecolhido(idx);
    artigo.querySelectorAll("details").forEach((bloco) => { bloco.open = !vaiRecolher; });
    setModulosRecolhidos((anterior) => ({ ...anterior, [idx]: vaiRecolher }));
    if (vaiRecolher) artigo.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const irParaAula = (i) => {
    document.getElementById(`aula-${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setIsNavOpen(false);
  };

  if (!result) {
    return <p style={{ color: "var(--fg-2)" }}>Carregando o conteúdo da aula…</p>;
  }

  const aulas = safeArray(result?.aulas);
  const temChave = Boolean(userApiKey);

  const indice = (
    <nav className="lc__toc">
      <button onClick={() => { window.scrollTo({ top: 0, behavior: "smooth" }); setIsNavOpen(false); }}>
        <span className="lc__toc-n">00</span>
        <span className="lc__toc-label">Visão geral do curso</span>
      </button>
      {aulas.map((aula, i) => (
        <button
          key={i}
          className={aulaAtiva === i ? "is-on" : undefined}
          onClick={() => irParaAula(i)}
          title={safeString(aula?.titulo)}
        >
          <span className="lc__toc-n">{String(i + 1).padStart(2, "0")}</span>
          <span className="lc__toc-label">{safeString(aula?.titulo)}</span>
        </button>
      ))}
    </nav>
  );

  return (
    <div className="lc">
      {/* -------------------- Estado da IA do usuário -------------------- */}
      {temChave ? (
        <span className="lc__ai-ok">
          <CheckCircle2 size={15} /> IA conectada ({userModel || result?.modelo_utilizado || "modelo padrão"})
          <button
            className="ui-btn ui-btn--ghost ui-btn--sm"
            onClick={openConfigModal}
            style={{ marginLeft: 4 }}
          >
            <Settings size={14} /> Alterar
          </button>
        </span>
      ) : (
        <div className="lc__ai-alert">
          <KeyRound size={18} />
          <span>
            Conecte a sua IA para liberar o tutor dentro da aula, a geração de simulados inéditos e a
            correção de discursivas. A configuração leva menos de um minuto e há modelos gratuitos.
          </span>
          <Button variant="primary" size="sm" onClick={openConfigModal} icon={<Settings size={14} />}>
            Configurar minha IA
          </Button>
        </div>
      )}

      {/* ---------------------------- Cabeçalho -------------------------- */}
      <header className="lc__head">
        <span className="lc__eyebrow">{safeString(result?.area_identificada) || "Aula gerada por IA"}</span>
        <h1>{safeString(result?.title) || safeString(result?.area_identificada) || "Aula"}</h1>

        <div className="lc__head-meta">
          {result?.banca && <Badge>{result.banca}</Badge>}
          {result?.ano && <Badge outline>{result.ano}</Badge>}
          {result?.concurso && <Badge outline>{result.concurso}</Badge>}
          <Badge outline icon={<BookOpen size={11} />}>{aulas.length} módulo(s)</Badge>
        </div>

        {!!safeString(result?.resumo_cargo) && (
          <div className="lc__resumo"><Md>{safeString(result?.resumo_cargo)}</Md></div>
        )}
      </header>

      {!!safeString(result?.plano_estudo) && (
        <div className="lc__lesson">
          <Disclosure icon={Calendar} title="Plano de estudo estratégico">
            <div className="lc__prose"><Md>{safeString(result?.plano_estudo)}</Md></div>
          </Disclosure>
        </div>
      )}

      <div className="lc__body">
        <div className="lc__stream">
          {/* ---------------------------- Aulas ---------------------------- */}
          {aulas.map((aula, idx) => {
            const quiz = safeArray(aula?.quiz);
            const mapaMental = aula?.mapa_mental || {};
            const termos = Array.isArray(aula?.resumo_termos_chave) ? aula.resumo_termos_chave : [];

            return (
              <article className="lc__lesson" id={`aula-${idx}`} data-aula-idx={idx} key={idx}>
                <div className="lc__lesson-head">
                  <div className="lc__lesson-top">
                    <span className="lc__lesson-n">
                      MÓDULO {String(idx + 1).padStart(2, "0")} · {safeString(aula?.disciplina)}
                    </span>
                    <button
                      className="lc__collapse"
                      onClick={(e) => alternarModulo(idx, e)}
                      title={estaRecolhido(idx) ? "Abrir todos os blocos deste módulo" : "Fechar todos os blocos deste módulo"}
                    >
                      {estaRecolhido(idx) ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />}
                      {estaRecolhido(idx) ? "Expandir módulo" : "Recolher módulo"}
                    </button>
                  </div>
                  <h2>{safeString(aula?.titulo)}</h2>
                  {!!safeString(aula?.visao_geral) && (
                    <p className="lc__visao"><Md inline>{safeString(aula?.visao_geral)}</Md></p>
                  )}
                </div>

                {!!safeString(aula?.aula_teorica_aprofundada) && (
                  <Disclosure icon={BookOpen} title="Aula teórica aprofundada">
                    <div className="lc__prose markdown-format" style={{ padding: 0 }}>
                      <Md>{safeString(aula?.aula_teorica_aprofundada)}</Md>
                    </div>
                  </Disclosure>
                )}

                {termos.length > 0 && (
                  <Disclosure icon={Target} title="Termos-chave" count={`${termos.length} termos`}>
                    <ul className="lc__terms">
                      {termos.map((t, k) => (
                        <li className="lc__term" key={k}>
                          <b>{t.termo}:</b> <Md inline>{t.definicao}</Md>
                        </li>
                      ))}
                    </ul>
                  </Disclosure>
                )}

                {!!aula?.analogias_contexto && (
                  <Disclosure icon={Lightbulb} title="Analogias e contexto">
                    <div className="lc__prose markdown-format" style={{ padding: 0 }}>
                      <Md>{safeString(aula.analogias_contexto)}</Md>
                    </div>
                  </Disclosure>
                )}

                {!!aula?.aplicacao_pratica_exemplos && (
                  <Disclosure icon={Wrench} title="Aplicação prática e exemplos">
                    <div className="lc__prose markdown-format" style={{ padding: 0 }}>
                      <Md>{safeString(aula.aplicacao_pratica_exemplos)}</Md>
                    </div>
                  </Disclosure>
                )}

                {quiz.length > 0 && (
                  <Disclosure icon={ClipboardList} title="Fixação de conhecimento" count={`${quiz.length} questões`}>
                    {quiz.map((q, i) => (
                      <QuizCard key={i} question={q} index={i} />
                    ))}
                  </Disclosure>
                )}

                {aula?.discursiva && Object.keys(aula.discursiva).length > 0 && (
                  <EssaySection
                    initialDiscursiva={aula.discursiva}
                    defaultModel={result?.modelo_utilizado}
                    userApiKey={userApiKey}
                    userModel={userModel}
                    aula={aula}
                    area={result?.area_identificada}
                    onOpenConfig={openConfigModal}
                  />
                )}

                {!!mapaMental.codigo_mermaid && (
                  <button
                    className="lc__map-btn"
                    onMouseEnter={prefetchMermaid}
                    onFocus={prefetchMermaid}
                    onClick={() => setSelectedMap({ titulo: mapaMental.titulo, codigo: mapaMental.codigo_mermaid })}
                  >
                    <Network size={17} /> Ver o mapa mental deste módulo
                  </button>
                )}
              </article>
            );
          })}

          {/* ----------------------- Simulado final ------------------------ */}
          <section className="lc__panel">
            <div className="lc__panel-head">
              <div>
                <h2>Simulado final inédito</h2>
                <p>
                  A IA percorre os {aulas.length} módulos acima e escreve questões novas sobre o que
                  você acabou de estudar. O resultado entra no seu painel de desempenho.
                </p>
              </div>
              <Badge tone="accent" icon={<Sparkles size={11} />}>gerado na hora</Badge>
            </div>

            <div className="lc__panel-body">
              {simuladoLoading ? (
                <div className="lc__progress-box">
                  <div className="lc__progress-line">
                    <span>Analisando tópicos e gerando questões…</span>
                    <b>{simuladoProgress}%</b>
                  </div>
                  <ProgressBar value={simuladoProgress} aria-label="Progresso da geração do simulado" />
                  <p className="lc__progress-note">
                    Isto pode levar alguns instantes. Não feche a página enquanto a geração acontece.
                  </p>
                </div>
              ) : !simuladoQuestoes ? (
                <div className="lc__controls">
                  <NivelSelect value={simuladoNivel} onChange={(e) => setSimuladoNivel(e.target.value)} />

                  <label className="lc__control">
                    <span>Formato</span>
                    <select className="lc__select" value={simuladoFormato} onChange={(e) => setSimuladoFormato(e.target.value)}>
                      <option value="Múltipla Escolha">Múltipla escolha (A–E)</option>
                      <option value="Certo/Errado">Certo ou errado</option>
                    </select>
                  </label>

                  <label className="lc__control">
                    <span>Questões por módulo</span>
                    <input
                      className="lc__select"
                      type="number"
                      min="1"
                      max="10"
                      value={simuladoQtd}
                      onChange={(e) => setSimuladoQtd(e.target.value)}
                      style={{ width: 110 }}
                    />
                  </label>

                  <Button variant="primary" size="lg" onClick={handleGerarSimuladoIA} icon={<Sparkles size={16} />}>
                    Gerar simulado
                  </Button>
                </div>
              ) : (
                <Button onClick={handleGerarSimuladoIA} icon={<RefreshCw size={15} />}>
                  Gerar um novo simulado
                </Button>
              )}
            </div>
          </section>

          <div id="simulado-progress-anchor" />

          {simuladoQuestoes && simuladoQuestoes.length > 0 && (
            <section className="lc__panel" id="simulado-section">
              <div className="lc__panel-head">
                <div>
                  <h2>Simulado geral</h2>
                  <p>{simuladoQuestoes.length} questões · nível {simuladoNivel} · {simuladoFormato}</p>
                </div>
                <Button variant="danger" onClick={() => setSimuladoQuestoes(null)} icon={<X size={15} />}>
                  Fechar simulado
                </Button>
              </div>

              <div className="lc__panel-body" style={{ padding: 0 }}>
                {simuladoQuestoes.map((q, i) => (
                  <div className="lc__q" key={i}>
                    <div className="lc__q-ctx">
                      <span>{safeString(q.contexto_disciplina)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{safeString(q.contexto_topico)}</span>
                    </div>
                    <QuizCard
                      question={q}
                      index={i}
                      onAnswer={(isCorrect, isReset) => {
                        if (isReset) {
                          setSimuladoAcertos((prev) => Math.max(0, prev - 1));
                        } else if (isCorrect) {
                          setSimuladoAcertos((prev) => prev + 1);
                        }
                      }}
                    />
                  </div>
                ))}
              </div>

              <div className="lc__panel-body" style={{ borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                {!simuladoFinalizado ? (
                  <Button
                    variant="primary"
                    size="lg"
                    icon={<Check size={16} />}
                    onClick={async () => {
                      const concursoAtual = result?.banca
                        ? `${result.banca} ${result.concurso || ""}`.trim()
                        : (result?.concurso || "Geral");
                      await savePerformance(
                        "simulado",
                        result?.area_identificada ? `${result.area_identificada} (Simulado Geral)` : "Simulado Geral",
                        simuladoAcertos,
                        simuladoQuestoes.length,
                        simuladoNivel,
                        simuladoFormato,
                        concursoAtual
                      );
                      setSimuladoFinalizado(true);
                    }}
                  >
                    Finalizar e salvar a nota
                  </Button>
                ) : (
                  <div className="lc__score">
                    <Trophy size={20} />
                    <span>
                      Simulado concluído: {simuladoAcertos} de {simuladoQuestoes.length} acertos.
                      A nota já está no seu painel de desempenho.
                    </span>
                  </div>
                )}

                <Button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} icon={<ArrowUp size={15} />}>
                  Voltar ao início da aula
                </Button>
              </div>
            </section>
          )}

          {/* --------------------- Discursiva geral ------------------------ */}
          <section className="lc__panel">
            <div className="lc__panel-head">
              <div>
                <h2>Prova discursiva geral</h2>
                <p>
                  A IA sorteia dois temas do curso e monta um cenário inédito no padrão CEBRASPE:
                  19,0 pontos para o domínio técnico e 1,0 ponto para estrutura e gramática.
                </p>
              </div>
              <Badge outline icon={<PenLine size={11} />}>padrão CEBRASPE</Badge>
            </div>

            <div className="lc__panel-body">
              <GlobalEssaySection
                defaultModel={result?.modelo_utilizado}
                userApiKey={userApiKey}
                userModel={userModel}
                area={result?.area_identificada}
                aulas={aulas}
                onOpenConfig={openConfigModal}
              />
            </div>
          </section>
        </div>

        {/* -------------------- Índice lateral (desktop) ------------------- */}
        <aside className="lc__aside">
          <div className="lc__aside-card">
            <div className="lc__aside-title">Nesta aula</div>
            {indice}
          </div>
        </aside>
      </div>

      {/* --------------------- Índice em gaveta (mobile) ------------------ */}
      {!isNavOpen && (
        <button className="lc__drawer-fab" onClick={() => setIsNavOpen(true)} title="Índice de módulos" aria-label="Abrir índice">
          <List size={20} />
        </button>
      )}

      {isNavOpen && (
        <div className="lc__overlay" style={{ justifyContent: "flex-start", padding: 0 }} onClick={() => setIsNavOpen(false)}>
          <div className="lc__drawer" onClick={(e) => e.stopPropagation()}>
            <div className="lc__modal-head">
              <h3>Índice de módulos</h3>
              <button className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => setIsNavOpen(false)} aria-label="Fechar índice">
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: "var(--space-3)", overflowY: "auto" }}>{indice}</div>
          </div>
        </div>
      )}

      <TutorChat
        area={result?.area_identificada}
        defaultModel={result?.modelo_utilizado}
        userApiKey={userApiKey}
        userModel={userModel}
        onOpenConfig={openConfigModal}
      />

      {/* ------------------------- Modal: mapa mental --------------------- */}
      {selectedMap && (
        <div className="lc__overlay" onClick={() => setSelectedMap(null)}>
          <div className="lc__modal lc__modal--map" onClick={(e) => e.stopPropagation()}>
            <div className="lc__modal-head">
              <h3>{safeString(selectedMap.titulo) || "Mapa mental"}</h3>
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <Button onClick={() => handleDownloadSVG(selectedMap.titulo)} icon={<Download size={15} />}>
                  Baixar SVG
                </Button>
                <Button onClick={() => setSelectedMap(null)} icon={<X size={15} />}>Fechar</Button>
              </div>
            </div>
            <div className="lc__modal-body">
              <div className="lc__mermaid mermaid-wrapper">
                <Suspense fallback={<p className="lc__map-loading">Preparando o diagrama…</p>}>
                  <Mermaid chart={selectedMap.codigo} />
                </Suspense>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------- Modal: IA ---------------------------- */}
      {showConfig && (
        <div className="lc__overlay" onClick={() => setShowConfig(false)}>
          <div className="lc__modal lc__modal--config" onClick={(e) => e.stopPropagation()}>
            <div className="lc__modal-head">
              <h3>Configurar a minha IA</h3>
              <button className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => setShowConfig(false)} aria-label="Fechar">
                <X size={16} />
              </button>
            </div>

            <div className="lc__modal-body">
              <div className="lc__tabs">
                <Button
                  variant={providerTab === "openrouter" ? "primary" : "default"}
                  onClick={() => { setProviderTab("openrouter"); setTempModel("google/gemini-2.5-flash"); }}
                >
                  OpenRouter
                </Button>
                <Button
                  variant={providerTab === "aistudio" ? "primary" : "default"}
                  onClick={() => { setProviderTab("aistudio"); setTempModel("gemini-2.5-flash"); }}
                >
                  Google AI Studio
                </Button>
              </div>

              {providerTab === "openrouter" && (
                <>
                  <p className="lc__hint">
                    Conecte a sua conta OpenRouter para usar dezenas de modelos, inclusive gratuitos.
                    O login é automático — você é levado ao site e volta já conectado.
                  </p>
                  {userApiKey && userApiKey.startsWith("sk-or-") ? (
                    <div className="lc__mirror" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)" }}>
                      <b style={{ margin: 0 }}><CheckCircle2 size={15} /> OpenRouter conectado</b>
                      <button
                        className="ui-btn ui-btn--sm ui-btn--danger"
                        onClick={handleDisconnectAI}
                        disabled={savingConfig}
                      >
                        Desvincular
                      </button>
                    </div>
                  ) : (
                    <Button variant="primary" block onClick={handleConnectAI} icon={<KeyRound size={15} />}>
                      Conectar OpenRouter
                    </Button>
                  )}
                </>
              )}

              {providerTab === "aistudio" && (
                <>
                  <p className="lc__hint">
                    O Google AI Studio exige gerar a chave manualmente com a sua conta Google.
                    São dois passos:
                  </p>
                  <Button href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" block>
                    1. Obter a chave no AI Studio (gratuito)
                  </Button>
                  <label className="ui-field">
                    <span className="ui-field__label">2. Cole a chave gerada</span>
                    <input
                      className="ui-input"
                      type="password"
                      value={tempKey}
                      onChange={(e) => setTempKey(e.target.value)}
                      placeholder="AIzaSy… ou AQ.Ab8…"
                    />
                  </label>
                  {userApiKey && !userApiKey.startsWith("sk-or-") && tempKey === userApiKey && (
                    <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--ok)" }}>
                      Chave do AI Studio salva no sistema.
                    </span>
                  )}
                </>
              )}

              <label className="ui-field">
                <span className="ui-field__label">Modelo de IA</span>
                <input
                  className="ui-input"
                  type="text"
                  value={tempModel}
                  onChange={(e) => setTempModel(e.target.value)}
                />
              </label>
            </div>

            <div className="lc__modal-foot">
              <Button onClick={() => setShowConfig(false)}>Fechar</Button>
              <Button variant="primary" onClick={saveConfigToDB} disabled={savingConfig}>
                {savingConfig ? "Salvando…" : "Salvar configurações"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
