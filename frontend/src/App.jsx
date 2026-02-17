import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  Check,
  X,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Target,
  Sparkles,
} from "lucide-react";
import "./App.css";

// --- COMPONENTES AUXILIARES (QuizCard Integrado) ---

const LETTERS = ["A", "B", "C", "D", "E", "F"];

function safeStringQuiz(v) {
  if (typeof v === "string") return v;
  if (v == null) return "";
  return String(v);
}

function normalizeAlternativeText(alt, idx) {
  if (typeof alt !== "string") return "";
  const ltr = LETTERS[idx] || "[A-F]";
  const re = new RegExp(`^\\s*${ltr}\\s*[\\)\\.\\-:]\\s*`, "i");
  return alt.replace(re, "").trim();
}

function parseCorrectLetter(rawValue) {
  const raw = safeStringQuiz(rawValue).trim();
  if (!raw) return null;
  // pega a primeira ocorrência de A-F em qualquer formato (ex.: "Alternativa C", "Letra: D", "C)")
  const m = raw.toUpperCase().match(/[A-F]/);
  return m ? m[0] : null;
}

function normalizeWrongReasons(v) {
  if (!v) return null;
  if (Array.isArray(v)) {
    const out = {};
    for (const item of v) {
      const s = safeStringQuiz(item).trim();
      const m = s.toUpperCase().match(/^([A-F])\s*[\)\.\-:]\s*(.*)$/);
      if (m) out[m[1]] = m[2]?.trim() || "";
    }
    return Object.keys(out).length ? out : null;
  }
  if (typeof v === "object") {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      const key = safeStringQuiz(k).toUpperCase().match(/[A-F]/)?.[0];
      if (!key) continue;
      out[key] = safeStringQuiz(val).trim();
    }
    return Object.keys(out).length ? out : null;
  }
  return null;
}

function QuizCard({ question, index }) {
  const [selected, setSelected] = useState(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [showFullExplanation, setShowFullExplanation] = useState(false);

  const correctLetter = useMemo(
    () => parseCorrectLetter(question?.resposta_correta),
    [question]
  );

  const topicoRelacionado = safeStringQuiz(question?.topico_relacionado || "");
  const nivel = safeStringQuiz(question?.nivel || "");
  const habilidade = safeStringQuiz(question?.habilidade_cobrada || "");
  const trechoAula = safeStringQuiz(question?.trecho_da_aula_que_sustenta || "");

  const comentarioCorreta = safeStringQuiz(
    question?.comentario_da_correta ?? question?.comentario ?? ""
  );

  const alternativas = Array.isArray(question?.alternativas)
    ? question.alternativas
    : [];

  const explicacoesErradas = useMemo(
    () => normalizeWrongReasons(question?.por_que_as_outras_estao_erradas),
    [question]
  );

  const hasFullBreakdown =
    explicacoesErradas && Object.keys(explicacoesErradas).length > 0;

  const handleSelect = (optionIndex) => {
    if (selected !== null) return;
    const chosen = LETTERS[optionIndex] ?? null;
    setSelected(chosen);
    setShowExplanation(true);
    setShowFullExplanation(false);
  };

  const reset = () => {
    setSelected(null);
    setShowExplanation(false);
    setShowFullExplanation(false);
  };

  return (
    <div className="quiz-card-container">
      <div className="quiz-header">
        <h4 className="quiz-title">
          <HelpCircle size={20} color="#2563eb" />
          Questão {index + 1}
        </h4>

        <div className="quiz-meta">
          {!!topicoRelacionado && (
            <span className="quiz-tag" title="Tópico relacionado">
              <Target size={14} color="#475569" />
              {topicoRelacionado}
            </span>
          )}

          {(!!nivel || !!habilidade) && (
            <span className="quiz-tag meta" title="Metadados da questão">
              <Sparkles size={14} color="#0f172a" />
              {nivel ? `Nível: ${nivel}` : "Nível: —"}
              {habilidade ? ` • ${habilidade}` : ""}
            </span>
          )}

          <button
            type="button"
            className={`quiz-reset-btn ${selected === null ? "disabled" : ""}`}
            onClick={reset}
            disabled={selected === null}
            title="Refazer questão"
          >
            <RotateCcw size={14} />
            Refazer
          </button>
        </div>
      </div>

      <div className="quiz-enunciado">
        <ReactMarkdown>{safeStringQuiz(question?.enunciado ?? "")}</ReactMarkdown>
      </div>

      <div className="quiz-options">
        {alternativas.map((alt, i) => {
          const currentLetter = LETTERS[i] ?? String(i + 1);
          const isSelected = selected === currentLetter;
          const isCorrect = !!correctLetter && currentLetter === correctLetter;

          let optionClass = "quiz-option";
          if (showExplanation && correctLetter) {
            if (isCorrect) optionClass += " correct";
            else if (isSelected && !isCorrect) optionClass += " incorrect";
          } else if (selected && !showExplanation) {
             // Estado visual apenas selecionado (se quiser mudar antes de revelar)
          }

          const displayAlt = normalizeAlternativeText(alt, i);

          return (
            <div
              key={i}
              onClick={() => handleSelect(i)}
              className={`${optionClass} ${selected ? "cursor-default" : "cursor-pointer"}`}
            >
              <span className="option-letter">{currentLetter})</span>
              <div className="option-text">
                <ReactMarkdown>{displayAlt}</ReactMarkdown>
              </div>
              {showExplanation && isCorrect && <Check size={20} color="#15803d" />}
              {showExplanation && isSelected && !isCorrect && <X size={20} color="#b91c1c" />}
            </div>
          );
        })}
      </div>

      {showExplanation && (
        <div className="quiz-explanation">
          <div className="explanation-header">
            <strong className="correct-answer-label">
              Resposta correta: {correctLetter ?? "—"}
            </strong>

            {hasFullBreakdown && (
              <button
                type="button"
                className="toggle-explanation-btn"
                onClick={() => setShowFullExplanation((v) => !v)}
              >
                {showFullExplanation ? (
                  <>
                    Ocultar explicação <ChevronUp size={14} />
                  </>
                ) : (
                  <>
                    Ver explicação completa <ChevronDown size={14} />
                  </>
                )}
              </button>
            )}
          </div>

          {!!trechoAula && (
            <div className="explanation-snippet">
              <strong className="snippet-label">Trecho da aula:</strong>
              <div className="snippet-content">
                <ReactMarkdown>{trechoAula}</ReactMarkdown>
              </div>
            </div>
          )}

          <div className="explanation-comment">
            <strong className="comment-label">Comentário:</strong>
            <div className="comment-text">
              <ReactMarkdown>{comentarioCorreta || "_Sem explicação disponível._"}</ReactMarkdown>
            </div>
          </div>

          {showFullExplanation && hasFullBreakdown && (
            <div className="full-breakdown">
              <strong className="breakdown-label">Por que as outras estão erradas:</strong>
              <div className="breakdown-list">
                {LETTERS.slice(0, alternativas.length)
                  .filter((ltr) => ltr && ltr !== correctLetter)
                  .map((ltr) => {
                    const reason = explicacoesErradas?.[ltr];
                    if (!reason) return null;
                    return (
                      <div key={ltr} className="breakdown-item">
                        <div className="breakdown-letter">{ltr})</div>
                        <div className="breakdown-text">
                          <ReactMarkdown>{safeStringQuiz(reason)}</ReactMarkdown>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- APP PRINCIPAL ---

// Definindo a URL da API
const API_URL = "http://localhost:8000"; 

const safeArray = (v) => (Array.isArray(v) ? v : []);
const safeString = (v) => (typeof v === "string" ? v : v == null ? "" : String(v));

function downloadJson(data, filename = "saida_professor_ai.json") {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        resolve(JSON.parse(r.result));
      } catch (e) {
        reject(e);
      }
    };
    r.onerror = () => reject(new Error("Falha ao ler arquivo"));
    r.readAsText(file);
  });
}

export default function App() {
  const [text, setText] = useState("");

  // Config vindo do backend (.env)
  const [availableModels, setAvailableModels] = useState([]);
  const [model, setModel] = useState(""); 
  const [hasToken, setHasToken] = useState(false);

  // Editor de config
  const [editDefaultModel, setEditDefaultModel] = useState("");
  const [editModelsCsv, setEditModelsCsv] = useState("");
  const [editToken, setEditToken] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configMsg, setConfigMsg] = useState("");

  // Execução
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  // Histórico (PostgreSQL)
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");

  const timeoutsRef = useRef([]);
  const aulas = useMemo(() => safeArray(result?.aulas), [result]);

  const fetchConfig = async () => {
    try {
      const resp = await fetch(`${API_URL}/config`);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.detail || "Falha ao buscar config.");
      const models = safeArray(data?.available_models);
      setAvailableModels(models);
      setHasToken(!!data?.has_token);

      const def = safeString(data?.default_model).trim();
      setModel(def || (models[0] || ""));

      setEditDefaultModel(def);
      setEditModelsCsv(models.join(","));
    } catch (e) {
      console.error(e);
      if (e.message.includes("Failed to fetch")) {
        setError("Backend não detectado. Verifique se o servidor Python (porta 8000) está rodando.");
      } else {
        setError(e.message || "Falha ao buscar configuração do backend.");
      }
    }
  };

  useEffect(() => {
    fetchConfig();
    return () => {
      timeoutsRef.current.forEach((id) => clearTimeout(id));
      timeoutsRef.current = [];
    };
  }, []);

  // --- FUNÇÕES DE HISTÓRICO (BD) ---

  const fetchHistory = async () => {
    try {
      const resp = await fetch(`${API_URL}/plans`);
      if (resp.ok) {
        const data = await resp.json();
        setHistory(data);
      } else {
        console.error("Erro ao buscar histórico");
      }
    } catch (e) {
      console.error("Erro de conexão ao buscar histórico", e);
      setError("Erro ao conectar com o banco de dados.");
    }
  };

  const saveToDb = async () => {
    if (!result) return;
    setError("");
    
    const finalTitle = saveTitle.trim() || safeString(result?.resumo_cargo).substring(0, 60) || "Plano de Estudo Sem Título";
    
    try {
      const resp = await fetch(`${API_URL}/plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: finalTitle,
          area: result.area_identificada || "Geral",
          content: result
        })
      });

      if (resp.ok) {
        setStatus("Salvo no banco com sucesso! ✅");
        setSaveTitle("");
        if (showHistory) fetchHistory();
      } else {
        const errData = await resp.json().catch(() => ({}));
        setError(errData.detail || "Erro ao salvar no banco.");
      }
    } catch (e) {
      console.error(e);
      setError("Erro de conexão ao salvar.");
    }
  };

  const loadFromHistory = async (id) => {
    try {
      setLoading(true);
      setError("");
      setStatus("Carregando do banco de dados...");
      
      const resp = await fetch(`${API_URL}/plans/${id}`);
      if (resp.ok) {
        const data = await resp.json();
        setResult(data); 
        setShowHistory(false); 
        setStatus(`Carregado do histórico ✅`);
      } else {
        const errData = await resp.json().catch(() => ({}));
        setError(errData.detail || "Erro ao carregar plano.");
        setStatus("");
      }
    } catch (e) {
      console.error(e);
      setError("Erro ao conectar com o banco.");
      setStatus("");
    } finally {
      setLoading(false);
    }
  };

  // --- FUNÇÕES DE GERAÇÃO (IA) ---

  const run = async () => {
    setError("");
    setResult(null);
    setLoading(true);
    setStatus("Iniciando análise...");

    timeoutsRef.current.forEach((id) => clearTimeout(id));
    timeoutsRef.current = [];

    timeoutsRef.current.push(
      setTimeout(() => setStatus("Arquiteto: estruturando módulos e âncoras..."), 500)
    );
    timeoutsRef.current.push(
      setTimeout(() => setStatus("Pesquisador/Professor: criando aulas aprofundadas..."), 1800)
    );
    timeoutsRef.current.push(
      setTimeout(() => setStatus("Glossário e questões: consolidando..."), 3500)
    );

    try {
      const resp = await fetch(`${API_URL}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, model: model || null }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.detail || "Erro ao chamar API.");

      setResult(data);
      setStatus("Concluído ✅");
    } catch (e) {
      console.error(e);
      setError(e.message || "Erro inesperado.");
      setStatus("");
    } finally {
      setLoading(false);
      timeoutsRef.current.forEach((id) => clearTimeout(id));
      timeoutsRef.current = [];
    }
  };

  const onLoadJson = async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    setError("");
    try {
      const data = await readJsonFile(file);
      setResult(data);
    } catch (e) {
      console.error(e);
      setError("Arquivo JSON inválido ou corrompido.");
    } finally {
      ev.target.value = "";
    }
  };

  const saveConfig = async () => {
    setConfigSaving(true);
    setConfigMsg("");
    setError("");

    const models = editModelsCsv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const resp = await fetch(`${API_URL}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          default_model: editDefaultModel?.trim() || null,
          available_models: models.length ? models : null,
          token: editToken !== "" ? editToken : null,
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.detail || "Falha ao salvar config.");

      setConfigMsg(`Salvo ✅ (atualizado: ${(data?.updated || []).join(", ") || "nada"})`);
      setEditToken(""); 
      await fetchConfig(); 
    } catch (e) {
      console.error(e);
      setError(e.message || "Falha ao salvar configuração.");
    } finally {
      setConfigSaving(false);
    }
  };

  return (
    <div className="container">
      <header className="header">
        <h1>Professor AI — Concursos</h1>
        <p>Gere aulas aprofundadas e questões a partir do assunto/editais.</p>
      </header>

      <section className="panel">
        <div className="row">
          <label className="label">Modelo (Backend)</label>
          <select
            className="select"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={loading}
          >
            {availableModels.length ? (
              availableModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))
            ) : (
              <option value={model || ""}>{model || "Carregando..."}</option>
            )}
          </select>
          <div className="muted">
            {hasToken ? "Token configurado no backend ✅" : "Token ausente no backend ⚠️"}
          </div>
        </div>

        <div className="row">
          <label className="label">Assunto / Edital</label>
          <textarea
            className="textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Cole aqui o conteúdo do edital/ementa..."
          />
        </div>

        <div className="actions">
          <button className="btn primary" onClick={run} disabled={loading || !text.trim()}>
            {loading ? "Gerando..." : "Gerar conteúdo"}
          </button>

          <button
            className="btn"
            onClick={() => result && downloadJson(result)}
            disabled={!result}
            title="Baixa a saída gerada em JSON"
          >
            Baixar JSON
          </button>

          <label className="btn file">
            Carregar JSON
            <input type="file" accept="application/json" onChange={onLoadJson} hidden />
          </label>

          <button 
            className="btn" 
            onClick={() => setShowConfig((v) => !v)}
            title="Configurações do backend"
          >
            {showConfig ? "Fechar config" : "Configurar"}
          </button>
          
          <button 
            className="btn" 
            style={{ borderColor: showHistory ? '#2563eb' : '#cbd5e1' }}
            onClick={() => {
              if(!showHistory) fetchHistory();
              setShowHistory(!showHistory);
            }}
          >
            {showHistory ? "Fechar Histórico" : "📂 Histórico"}
          </button>

          {result && (
            <div className="save-container">
              <input 
                className="input save-input" 
                placeholder="Nome para salvar..."
                value={saveTitle}
                onChange={e => setSaveTitle(e.target.value)}
              />
              <button className="btn primary" onClick={saveToDb} title="Salvar no PostgreSQL">
                💾 Salvar
              </button>
            </div>
          )}
        </div>

        {!!status && <div className="status">{status}</div>}
        {!!configMsg && <div className="status">{configMsg}</div>}
        {!!error && <div className="error">{error}</div>}

        {showHistory && (
          <div className="history-panel">
            <div className="history-header">
              <span>Aulas Salvas no Banco de Dados</span>
              <button className="btn small" onClick={fetchHistory}>Atualizar lista</button>
            </div>
            
            {history.length === 0 ? (
              <div className="muted">Nenhuma aula salva ainda.</div>
            ) : (
              <div className="grid">
                {history.map(item => (
                  <div 
                    key={item.id} 
                    className="miniCard history-card" 
                    onClick={() => loadFromHistory(item.id)}
                    title="Clique para carregar"
                  >
                    <div className="miniTitle history-title">{item.title}</div>
                    <div className="muted"><strong>Área:</strong> {item.area}</div>
                    <div className="muted history-date">
                      {new Date(item.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {showConfig && (
          <details className="details" open>
            <summary className="summaryTitle">Configuração do backend (.env)</summary>
            <div className="config-content">
              <div className="row">
                <label className="label">Modelo padrão (DEFAULT_MODEL)</label>
                <input
                  className="input"
                  value={editDefaultModel}
                  onChange={(e) => setEditDefaultModel(e.target.value)}
                  placeholder="ex.: openrouter/aurora-alpha"
                />
              </div>

              <div className="row">
                <label className="label">Lista de modelos (AVAILABLE_MODELS)</label>
                <input
                  className="input"
                  value={editModelsCsv}
                  onChange={(e) => setEditModelsCsv(e.target.value)}
                  placeholder="modelo1,modelo2,modelo3"
                />
              </div>

              <div className="row">
                <label className="label">Token OpenRouter</label>
                <input
                  className="input"
                  type="password"
                  value={editToken}
                  onChange={(e) => setEditToken(e.target.value)}
                  placeholder="Cole o token aqui..."
                />
                <div className="muted">
                  Segurança: o backend nunca devolve o token.
                </div>
              </div>

              <div className="actions config-actions">
                <button className="btn primary" onClick={saveConfig} disabled={configSaving}>
                  {configSaving ? "Salvando..." : "Salvar no .env"}
                </button>
                <button className="btn" onClick={fetchConfig} disabled={configSaving}>
                  Recarregar config
                </button>
              </div>
            </div>
          </details>
        )}
      </section>

      {result && (
        <section className="result">
          <div className="summary">
            <div className="summaryItem">
              <div className="summaryLabel">Área</div>
              <div className="summaryValue">{safeString(result?.area_identificada)}</div>
            </div>
            <div className="summaryItem">
              <div className="summaryLabel">Resumo direto</div>
              <div className="summaryValue">
                <ReactMarkdown>{safeString(result?.resumo_cargo)}</ReactMarkdown>
              </div>
            </div>
          </div>

          {!!safeString(result?.plano_estudo) && (
            <details className="details" open>
              <summary className="summaryTitle">Plano de estudo</summary>
              <div className="md">
                <ReactMarkdown>{safeString(result?.plano_estudo)}</ReactMarkdown>
              </div>
            </details>
          )}

          {aulas.map((aula, idx) => {
            const topicos = safeArray(aula?.topicos_explicados);
            const glossario = safeArray(aula?.glosario);
            const quiz = safeArray(aula?.quiz);

            const porQueFunciona = safeArray(aula?.por_que_funciona);
            const microMecanismos = safeArray(aula?.micro_mecanismos);
            const criterios = safeArray(aula?.criterios_de_decisao);
            const validacoes = safeArray(aula?.validacoes_e_checkpoints);
            const confusoes = safeArray(aula?.confusoes_classicas_de_prova);
            const erros = safeArray(aula?.erros_comuns);
            const checklist = safeArray(aula?.checklist_de_revisao);
            const limites = safeArray(aula?.limites_do_escopo);

            const metaResearch = aula?.meta_research || {};
            const mapaEstrutural = safeArray(metaResearch?.mapa_estrutural);
            const correlacoes = safeArray(metaResearch?.correlacoes_entre_partes);

            const aulaTeorica = aula?.aula_teorica || {};
            const definicaoChave = safeString(aulaTeorica?.definicao_chave);
            const comoFunciona = safeString(aulaTeorica?.como_funciona);
            const comparativo = safeString(aulaTeorica?.comparativo);
            const exemploPratico = safeString(aulaTeorica?.exemplo_pratico);

            return (
              <article className="card" key={`${safeString(aula?.titulo)}-${idx}`}>
                <div className="cardHeader">
                  <h2 className="cardTitle">{safeString(aula?.titulo) || `Módulo ${idx + 1}`}</h2>
                  {!!safeString(aula?.visao_geral) && (
                    <div className="md">
                      <ReactMarkdown>{safeString(aula?.visao_geral)}</ReactMarkdown>
                    </div>
                  )}
                </div>

                <details className="details" open>
                  <summary className="summaryTitle">Aula teórica</summary>

                  {!!definicaoChave && (
                    <div className="block">
                      <div className="blockTitle">Definição-chave</div>
                      <div className="md">
                        <ReactMarkdown>{definicaoChave}</ReactMarkdown>
                      </div>
                    </div>
                  )}

                  {!!comoFunciona && (
                    <div className="block">
                      <div className="blockTitle">Como funciona</div>
                      <div className="md">
                        <ReactMarkdown>{comoFunciona}</ReactMarkdown>
                      </div>
                    </div>
                  )}

                  {!!comparativo && (
                    <div className="block">
                      <div className="blockTitle">Comparativo</div>
                      <div className="md">
                        <ReactMarkdown>{comparativo}</ReactMarkdown>
                      </div>
                    </div>
                  )}

                  {!!exemploPratico && (
                    <div className="block">
                      <div className="blockTitle">Exemplos práticos</div>
                      <div className="md">
                        <ReactMarkdown>{exemploPratico}</ReactMarkdown>
                      </div>
                    </div>
                  )}
                </details>

                <details className="details">
                  <summary className="summaryTitle">Painel avançado (aprofundamento)</summary>

                  {(mapaEstrutural.length > 0 || correlacoes.length > 0) && (
                    <div className="block">
                      <div className="blockTitle">Estrutura & correlação entre partes</div>

                      {mapaEstrutural.length > 0 && (
                        <>
                          <div className="subTitle">Mapa estrutural</div>
                          <ul className="list">
                            {mapaEstrutural.map((c, i) => (
                              <li key={i}>
                                <strong>{safeString(c?.componente)}</strong>{" "}
                                <span className="muted">({safeString(c?.origem)})</span>
                                {!!safeString(c?.papel) && <div className="muted">{safeString(c?.papel)}</div>}
                                {safeArray(c?.conecta_com).length > 0 && (
                                  <div className="muted">Conecta com: {safeArray(c?.conecta_com).join(", ")}</div>
                                )}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}

                      {correlacoes.length > 0 && (
                        <>
                          <div className="subTitle">Correlações</div>
                          <ul className="list">
                            {correlacoes.map((t, i) => (
                              <li key={i}>{safeString(t)}</li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  )}

                  {porQueFunciona.length > 0 && (
                    <div className="block">
                      <div className="blockTitle">Por que funciona</div>
                      <ul className="list">
                        {porQueFunciona.map((t, i) => (
                          <li key={i}>{safeString(t)}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {microMecanismos.length > 0 && (
                    <div className="block">
                      <div className="blockTitle">Micro-mecanismos</div>
                      <ul className="list">
                        {microMecanismos.map((t, i) => (
                          <li key={i}>{safeString(t)}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {criterios.length > 0 && (
                    <div className="block">
                      <div className="blockTitle">Critérios de decisão</div>
                      <div className="grid">
                        {criterios.map((c, i) => (
                          <div className="miniCard" key={i}>
                            <div className="miniTitle">{safeString(c?.decisao)}</div>
                            {safeArray(c?.criterios).length > 0 && (
                              <ul className="list">
                                {safeArray(c?.criterios).map((x, j) => (
                                  <li key={j}>{safeString(x)}</li>
                                ))}
                              </ul>
                            )}
                            {!!safeString(c?.risco_de_erro) && (
                              <div className="muted">
                                <strong>Risco:</strong> {safeString(c?.risco_de_erro)}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {validacoes.length > 0 && (
                    <div className="block">
                      <div className="blockTitle">Validações & checkpoints</div>
                      <div className="grid">
                        {validacoes.map((v, i) => (
                          <div className="miniCard" key={i}>
                            <div className="miniTitle">{safeString(v?.checkpoint)}</div>
                            <ul className="list">
                              {safeArray(v?.como_validar).map((x, j) => (
                                <li key={j}>{safeString(x)}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {confusoes.length > 0 && (
                    <div className="block">
                      <div className="blockTitle">Confusões clássicas de prova</div>
                      <ul className="list">
                        {confusoes.map((t, i) => (
                          <li key={i}>{safeString(t)}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {erros.length > 0 && (
                    <div className="block">
                      <div className="blockTitle">Erros comuns</div>
                      <ul className="list">
                        {erros.map((t, i) => (
                          <li key={i}>{safeString(t)}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {checklist.length > 0 && (
                    <div className="block">
                      <div className="blockTitle">Checklist de revisão</div>
                      <ul className="list">
                        {checklist.map((t, i) => (
                          <li key={i}>{safeString(t)}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {!!safeString(aula?.ponto_focal_prova) && (
                    <div className="block">
                      <div className="blockTitle">Ponto focal de prova</div>
                      <div className="md">
                        <ReactMarkdown>{safeString(aula?.ponto_focal_prova)}</ReactMarkdown>
                      </div>
                    </div>
                  )}

                  {limites.length > 0 && (
                    <div className="block">
                      <div className="blockTitle">Limites do escopo</div>
                      <ul className="list">
                        {limites.map((t, i) => (
                          <li key={i}>{safeString(t)}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </details>

                {topicos.length > 0 && (
                  <details className="details">
                    <summary className="summaryTitle">Tópicos explicados</summary>
                    <div className="grid">
                      {topicos.map((t, i) => (
                        <div className="miniCard" key={i}>
                          <div className="miniTitle">{safeString(t?.topico)}</div>
                          {!!safeString(t?.explicacao) && (
                            <div className="md">
                              <ReactMarkdown>{safeString(t?.explicacao)}</ReactMarkdown>
                            </div>
                          )}
                          {!!safeString(t?.exemplo_pratico) && (
                            <div className="muted">
                              <strong>Exemplo:</strong> {safeString(t?.exemplo_pratico)}
                            </div>
                          )}
                          {!!safeString(t?.pegadinha_tipica) && (
                            <div className="muted">
                              <strong>Pegadinha:</strong> {safeString(t?.pegadinha_tipica)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {glossario.length > 0 && (
                  <details className="details">
                    <summary className="summaryTitle">Glossário</summary>
                    <div className="grid">
                      {glossario.map((g, i) => (
                        <div className="miniCard" key={i}>
                          <div className="miniTitle">{safeString(g?.termo)}</div>
                          {!!safeString(g?.definicao) && <div className="muted">{safeString(g?.definicao)}</div>}
                          {!!safeString(g?.trecho_origem) && (
                            <div className="muted">
                              <strong>Origem:</strong> {safeString(g?.trecho_origem)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {quiz.length > 0 && (
                  <details className="details" open>
                    <summary className="summaryTitle">Questões</summary>
                    {quiz.map((q, i) => (
                      <QuizCard key={i} question={q} index={i} />
                    ))}
                  </details>
                )}
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}