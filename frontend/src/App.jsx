import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import QuizCard from "./QuizCard";
import "./App.css";

const API_URL = import.meta?.env?.VITE_API_URL || "http://localhost:8000";

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
  const [model, setModel] = useState(""); // preenchido via /config
  const [hasToken, setHasToken] = useState(false);

  // Editor de config (atualiza backend/.env via /config)
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

      // preenche editor (sem expor token)
      setEditDefaultModel(def);
      setEditModelsCsv(models.join(","));
    } catch (e) {
      console.error(e);
      setError(e.message || "Falha ao buscar configuração do backend.");
    }
  };

  useEffect(() => {
    fetchConfig();
    return () => {
      timeoutsRef.current.forEach((id) => clearTimeout(id));
      timeoutsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        // model vai junto (se vazio, backend usa DEFAULT_MODEL)
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

    // parse models CSV
    const models = editModelsCsv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const resp = await fetch(`${API_URL}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // token: se vazio, remove/limpa no backend (útil quando for trocar)
        body: JSON.stringify({
          default_model: editDefaultModel?.trim() || null,
          available_models: models.length ? models : null,
          token: editToken !== "" ? editToken : null, // só envia se o usuário digitou algo
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.detail || "Falha ao salvar config.");

      setConfigMsg(`Salvo ✅ (atualizado: ${(data?.updated || []).join(", ") || "nada"})`);
      setEditToken(""); // nunca manter token em memória
      await fetchConfig(); // recarrega e aplica no selector
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
        {/* Modelo */}
        <div className="row">
          <label className="label">Modelo (do backend/.env)</label>
          <select
            className="input"
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
            {hasToken ? "Token configurado no backend ✅" : "Token ausente no backend ⚠️ (configure abaixo)"}
          </div>
        </div>

        {/* Assunto */}
        <div className="row">
          <label className="label">Assunto / Edital</label>
          <textarea
            className="textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Cole aqui o conteúdo do edital/ementa..."
            rows={8}
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

          <button className="btn" onClick={() => setShowConfig((v) => !v)}>
            {showConfig ? "Fechar config" : "Configurar backend (.env)"}
          </button>
        </div>

        {!!status && <div className="status">{status}</div>}
        {!!configMsg && <div className="status">{configMsg}</div>}
        {!!error && <div className="error">{error}</div>}

        {showConfig && (
          <details className="details" open>
            <summary className="summaryTitle">Configuração do backend (.env)</summary>

            <div className="block">
              <div className="blockTitle">Modelo padrão (DEFAULT_MODEL)</div>
              <input
                className="input"
                value={editDefaultModel}
                onChange={(e) => setEditDefaultModel(e.target.value)}
                placeholder="ex.: openrouter/aurora-alpha"
              />
              <div className="muted">
                Se o frontend enviar model vazio, o backend usa DEFAULT_MODEL.
              </div>
            </div>

            <div className="block">
              <div className="blockTitle">Lista de modelos (AVAILABLE_MODELS)</div>
              <input
                className="input"
                value={editModelsCsv}
                onChange={(e) => setEditModelsCsv(e.target.value)}
                placeholder="modelo1,modelo2,modelo3"
              />
              <div className="muted">Separados por vírgula.</div>
            </div>

            <div className="block">
              <div className="blockTitle">Token OpenRouter (OPENROUTER_API_KEY)</div>
              <input
                className="input"
                type="password"
                value={editToken}
                onChange={(e) => setEditToken(e.target.value)}
                placeholder="Cole o token aqui (não será exibido depois)"
              />
              <div className="muted">
                Segurança: o backend nunca devolve o token. Ele só é gravado no .env.
              </div>
            </div>

            <div className="actions" style={{ padding: "0 1rem 1rem" }}>
              <button className="btn primary" onClick={saveConfig} disabled={configSaving}>
                {configSaving ? "Salvando..." : "Salvar no .env"}
              </button>
              <button className="btn" onClick={fetchConfig} disabled={configSaving}>
                Recarregar config
              </button>
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
