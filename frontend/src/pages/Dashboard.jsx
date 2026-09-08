import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  BookOpen, Calendar, ArrowRight, Search, X, ChevronLeft, ChevronRight, TrendingUp, ChevronDown, ChevronUp, Folder, Target, Globe, Lock, Star, Sparkles, PenTool, AlertTriangle, TrendingDown, Minus,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  Button, Card, CardHead, Badge, Input, ProgressBar, StatCard, EmptyState, Skeleton, PageHeader,
} from "../components/ui";
import "./Dashboard.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const LIMIT = 100;
const RECENTES_KEY = "aulas_recentes";

const getToken = () => localStorage.getItem("professor_ai_token") || "";

/* Aulas abertas recentemente ficam no navegador: nao existe endpoint de
   "ultima aula acessada" e nao vale criar um so para isso. */
function lerRecentes() {
  try {
    const raw = localStorage.getItem(RECENTES_KEY);
    const lista = raw ? JSON.parse(raw) : [];
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

const pct = (obtida, maxima) => (maxima > 0 ? (obtida / maxima) * 100 : 0);

/* Agrega o historico de /performance/me nos numeros do topo. */
function resumirDesempenho(historico) {
  const simulados = historico.filter((h) => h.tipo === "simulado");
  const discursivas = historico.filter((h) => h.tipo === "discursiva");

  const questoes = simulados.reduce((s, r) => s + (r.nota_maxima || 0), 0);
  const acertos = simulados.reduce((s, r) => s + (r.nota_obtida || 0), 0);
  const taxa = pct(acertos, questoes);

  // Tendencia: media dos 5 simulados mais recentes contra os 5 anteriores.
  const ordenados = [...simulados].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const recentes = ordenados.slice(-5);
  const anteriores = ordenados.slice(-10, -5);
  const mediaDe = (lista) =>
    lista.length ? lista.reduce((s, r) => s + pct(r.nota_obtida, r.nota_maxima), 0) / lista.length : null;
  const mediaRec = mediaDe(recentes);
  const mediaAnt = mediaDe(anteriores);
  const tendencia = mediaRec !== null && mediaAnt !== null ? mediaRec - mediaAnt : null;

  // Desempenho por tema, do pior para o melhor (so temas com base suficiente).
  const porTema = {};
  simulados.forEach((r) => {
    const tema = (r.tema || "Sem tema").trim();
    if (!porTema[tema]) porTema[tema] = { tema, obtida: 0, maxima: 0, registros: 0 };
    porTema[tema].obtida += r.nota_obtida || 0;
    porTema[tema].maxima += r.nota_maxima || 0;
    porTema[tema].registros += 1;
  });
  const temas = Object.values(porTema)
    .map((t) => ({ ...t, taxa: pct(t.obtida, t.maxima) }))
    .filter((t) => t.maxima >= 5)
    .sort((a, b) => a.taxa - b.taxa);

  return {
    simulados,
    discursivas,
    questoes,
    taxa,
    tendencia,
    temas,
    spark: ordenados.slice(-8).map((r) => pct(r.nota_obtida, r.nota_maxima)),
    pontoFraco: temas[0] || null,
    mediaDiscursivas: discursivas.length
      ? discursivas.reduce((s, r) => s + pct(r.nota_obtida, r.nota_maxima), 0) / discursivas.length
      : null,
  };
}

export default function Dashboard() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const buscaUrl = searchParams.get("busca") || "";

  const [plans, setPlans] = useState([]);
  const [total, setTotal] = useState(0);
  const [historico, setHistorico] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filterAno, setFilterAno] = useState("");
  const [filterBanca, setFilterBanca] = useState("");
  const [filterConcurso, setFilterConcurso] = useState(buscaUrl);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [expandido, setExpandido] = useState(null);

  const fetchPlans = useCallback((ano = "", banca = "", concurso = "", page = 1) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (ano.trim()) params.append("ano", ano.trim());
    if (banca.trim()) params.append("banca", banca.trim());
    if (concurso.trim()) params.append("concurso", concurso.trim());
    params.append("page", page);
    params.append("limit", LIMIT);

    const token = getToken();
    fetch(`${API_URL}/plans?${params.toString()}`, {
      headers: { Authorization: token ? `Bearer ${token}` : "" },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Erro ao buscar aulas");
        return res.json();
      })
      .then((data) => {
        setPlans(data.items || []);
        setTotal(data.total || 0);
        const paginas = Math.ceil((data.total || 0) / LIMIT);
        setTotalPages(paginas > 0 ? paginas : 1);
        setExpandido(null);
      })
      .catch((err) => {
        console.error("Erro ao carregar aulas:", err);
        setPlans([]);
      })
      .finally(() => setLoading(false));
  }, []);

  // Historico so precisa ser buscado uma vez por sessao da tela.
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch(`${API_URL}/performance/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setHistorico(Array.isArray(data) ? data : []))
      .catch(() => setHistorico([]));
  }, []);

  // A busca da barra superior chega pela URL (?busca=).
  useEffect(() => {
    setFilterConcurso(buscaUrl);
    setCurrentPage(1);
    fetchPlans(filterAno, filterBanca, buscaUrl, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaUrl]);

  const aplicarFiltros = () => {
    setCurrentPage(1);
    setSearchParams(filterConcurso.trim() ? { busca: filterConcurso.trim() } : {});
    fetchPlans(filterAno, filterBanca, filterConcurso, 1);
  };

  const limparFiltros = () => {
    setFilterAno("");
    setFilterBanca("");
    setFilterConcurso("");
    setCurrentPage(1);
    setSearchParams({});
    fetchPlans("", "", "", 1);
  };

  const irParaPagina = (n) => {
    if (n < 1 || n > totalPages) return;
    setCurrentPage(n);
    fetchPlans(filterAno, filterBanca, filterConcurso, n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const desempenho = useMemo(() => resumirDesempenho(historico), [historico]);

  const minhasAulas = useMemo(
    () => (user ? plans.filter((p) => p.owner_email === user.email).length : 0),
    [plans, user]
  );

  // "Continuar de onde parou": aulas abertas recentemente que ainda existem
  // na lista atual; se nao houver nenhuma, mostra as mais novas.
  const continuar = useMemo(() => {
    const recentes = lerRecentes();
    const porId = new Map(plans.map((p) => [String(p.id), p]));
    const vistas = recentes.map((r) => porId.get(String(r.id))).filter(Boolean).slice(0, 4);
    if (vistas.length > 0) return { itens: vistas, novas: false };
    const novas = [...plans]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 4);
    return { itens: novas, novas: true };
  }, [plans]);

  const agrupado = useMemo(() => {
    const grupos = {};
    plans.forEach((plan) => {
      const concurso = plan.concurso?.trim().toUpperCase() || "SEM CONCURSO VINCULADO";
      const area = plan.area?.trim().toUpperCase() || "ASSUNTOS GERAIS";
      if (!grupos[concurso]) grupos[concurso] = {};
      if (!grupos[concurso][area]) grupos[concurso][area] = [];
      grupos[concurso][area].push(plan);
    });
    return grupos;
  }, [plans]);

  const temFiltro = Boolean(filterAno || filterBanca || filterConcurso);
  const primeiroNome = user?.email ? user.email.split("@")[0] : "";

  const tendenciaTexto =
    desempenho.tendencia === null
      ? `${desempenho.simulados.length} simulado(s) registrados`
      : `${desempenho.tendencia >= 0 ? "+" : ""}${desempenho.tendencia.toFixed(1)} pts vs. anteriores`;
  const tendenciaTone =
    desempenho.tendencia === null ? "flat" : desempenho.tendencia >= 0 ? "up" : "down";
  const TendenciaIcon =
    desempenho.tendencia === null ? Minus : desempenho.tendencia >= 0 ? TrendingUp : TrendingDown;

  return (
    <div className="dash">
      <PageHeader
        eyebrow="Estudo"
        title={primeiroNome ? `Bom te ver, ${primeiroNome}` : "Minhas Aulas"}
        description="Seus números de desempenho, o que ficou pela metade e a biblioteca completa de aulas."
        actions={
          <>
            <Button to="/performance" icon={<TrendingUp size={15} />}>Meu Desempenho</Button>
            <Button to="/ferramentas" variant="primary" icon={<Sparkles size={15} />}>Ferramentas de IA</Button>
          </>
        }
      />

      {/* ------------------------------ KPIs ------------------------------ */}
      <div className="dash__kpis">
        <StatCard
          label="Aulas disponíveis"
          value={loading ? "—" : total}
          delta={minhasAulas > 0 ? `${minhasAulas} criadas por você` : "biblioteca compartilhada"}
          icon={<BookOpen size={13} />}
        />
        <StatCard
          label="Questões resolvidas"
          value={desempenho.questoes ? Math.round(desempenho.questoes).toLocaleString("pt-BR") : "0"}
          spark={desempenho.spark.length > 1 ? desempenho.spark : null}
          delta={desempenho.spark.length > 1 ? "últimos 8 simulados" : undefined}
        />
        <StatCard
          label="Taxa de acerto"
          value={desempenho.questoes ? `${desempenho.taxa.toFixed(0)}%` : "—"}
          delta={tendenciaTexto}
          deltaTone={tendenciaTone}
          icon={<TendenciaIcon size={13} />}
        />
        <StatCard
          label="Ponto fraco"
          textValue
          value={desempenho.pontoFraco ? desempenho.pontoFraco.tema : "Sem dados ainda"}
          delta={
            desempenho.pontoFraco
              ? `${desempenho.pontoFraco.taxa.toFixed(0)}% de acerto · treinar`
              : "resolva um simulado para medir"
          }
          deltaTone={desempenho.pontoFraco ? "warn" : "flat"}
          icon={desempenho.pontoFraco ? <AlertTriangle size={13} /> : null}
        />
      </div>

      {/* --------------------- Continuar + por tema ----------------------- */}
      <div className="dash__cols">
        <Card>
          <CardHead
            title={continuar.novas ? "Aulas mais recentes" : "Continuar de onde parou"}
            action={<Link to="/gerenciar" style={{ fontSize: "var(--text-xs)", fontWeight: 700 }}>Ver todas</Link>}
          />
          {loading ? (
            <div style={{ padding: "var(--space-4) var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {[0, 1, 2].map((i) => <Skeleton key={i} height={44} />)}
            </div>
          ) : continuar.itens.length === 0 ? (
            <div style={{ padding: "var(--space-5)" }}>
              <EmptyState
                icon={<BookOpen size={22} />}
                title="Nenhuma aula por aqui ainda"
                description="Gere a primeira aula a partir do seu edital e ela aparece nesta lista."
                action={<Button variant="primary" to="/generator" icon={<Sparkles size={15} />}>Criar aula com IA</Button>}
              />
            </div>
          ) : (
            continuar.itens.map((plan) => (
              <Link key={plan.id} to={`/aula/${plan.id}`} className="dash__row">
                <span className="dash__row-icon"><BookOpen size={17} /></span>
                <span className="dash__row-body">
                  <span className="dash__row-title">{plan.title}</span>
                  <span className="dash__row-meta">
                    {plan.concurso && <Badge>{plan.concurso}</Badge>}
                    {plan.banca && <Badge>{plan.banca}</Badge>}
                    <span>{new Date(plan.created_at).toLocaleDateString("pt-BR")}</span>
                  </span>
                </span>
                <ArrowRight size={16} color="var(--fg-3)" />
              </Link>
            ))
          )}
        </Card>

        <Card>
          <CardHead
            title="Onde você erra mais"
            action={<Link to="/performance" style={{ fontSize: "var(--text-xs)", fontWeight: 700 }}>Detalhes</Link>}
          />
          {desempenho.temas.length === 0 ? (
            <div style={{ padding: "var(--space-5)", color: "var(--fg-2)", fontSize: "var(--text-sm)" }}>
              Resolva simulados nas ferramentas de IA para que os temas mais fracos apareçam aqui, ordenados do pior para o melhor.
              <div style={{ marginTop: "var(--space-4)" }}>
                <Button to="/ferramentas" icon={<Target size={15} />} block>Ir para as ferramentas</Button>
              </div>
            </div>
          ) : (
            desempenho.temas.slice(0, 6).map((t) => (
              <div className="dash__topic" key={t.tema}>
                <div className="dash__topic-line">
                  <span className="dash__topic-name" title={t.tema}>{t.tema}</span>
                  <span className="dash__topic-val">{t.taxa.toFixed(0)}%</span>
                </div>
                <ProgressBar
                  value={t.taxa}
                  color={t.taxa < 60 ? "var(--warn)" : t.taxa < 80 ? "var(--accent)" : "var(--ok)"}
                  aria-label={`Acerto em ${t.tema}`}
                />
              </div>
            ))
          )}
          {desempenho.mediaDiscursivas !== null && (
            <div className="dash__topic" style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
              <span className="dash__row-icon"><PenTool size={16} /></span>
              <span style={{ fontSize: "var(--text-sm)", color: "var(--fg-2)" }}>
                <b style={{ color: "var(--fg)" }}>{desempenho.discursivas.length} discursiva(s)</b> corrigidas ·
                média {desempenho.mediaDiscursivas.toFixed(0)}%
              </span>
            </div>
          )}
        </Card>
      </div>

      {/* ---------------------------- Biblioteca -------------------------- */}
      <div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "var(--space-3)", marginBottom: "var(--space-3)", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: "var(--text-xl)", fontWeight: 800, letterSpacing: "-.02em" }}>
            Biblioteca de aulas
          </h2>
          <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-3)" }}>
            {loading ? "carregando…" : `${total} aula(s) em ${Object.keys(agrupado).length} concurso(s)`}
          </span>
        </div>

        <div className="dash__filters">
          <Input
            placeholder="Ano"
            value={filterAno}
            onChange={(e) => setFilterAno(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && aplicarFiltros()}
            aria-label="Filtrar por ano"
          />
          <Input
            placeholder="Banca (ex: FGV)"
            value={filterBanca}
            onChange={(e) => setFilterBanca(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && aplicarFiltros()}
            aria-label="Filtrar por banca"
          />
          <span className="dash__filter-grow">
            <Input
              icon={<Search size={15} />}
              placeholder="Concurso (ex: DATAPREV)"
              value={filterConcurso}
              onChange={(e) => setFilterConcurso(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && aplicarFiltros()}
              aria-label="Filtrar por concurso"
            />
          </span>
          <Button variant="primary" onClick={aplicarFiltros} icon={<Search size={15} />}>Filtrar</Button>
          {temFiltro && (
            <Button variant="danger" onClick={limparFiltros} icon={<X size={15} />} aria-label="Limpar filtros">
              Limpar
            </Button>
          )}
        </div>

        <div style={{ marginTop: "var(--space-4)" }}>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {[0, 1, 2].map((i) => <Skeleton key={i} height={74} radius="var(--radius-md)" />)}
            </div>
          ) : plans.length === 0 ? (
            <EmptyState
              icon={<BookOpen size={22} />}
              title="Nenhuma aula encontrada"
              description={
                temFiltro
                  ? "Nenhum resultado para esses filtros. Tente outra banca, ano ou concurso."
                  : "Sua biblioteca está vazia. Gere a primeira aula a partir de um edital."
              }
              action={
                temFiltro ? (
                  <Button variant="primary" onClick={limparFiltros}>Limpar filtros</Button>
                ) : (
                  <Button variant="primary" to="/generator" icon={<Sparkles size={15} />}>Criar aula com IA</Button>
                )
              }
            />
          ) : (
            Object.entries(agrupado).map(([concurso, areas]) => {
              const todas = Object.values(areas).flat();
              const criador = todas[0]?.owner_email || todas[0]?.email || "";
              const aberto = expandido === concurso;

              return (
                <div className="dash__folder" key={concurso}>
                  <button
                    className={`dash__folder-head${aberto ? " is-open" : ""}`}
                    onClick={() => setExpandido(aberto ? null : concurso)}
                    aria-expanded={aberto}
                  >
                    <span className="dash__folder-id">
                      <span className="dash__folder-icon"><Folder size={20} /></span>
                      <span style={{ minWidth: 0 }}>
                        <span className="dash__folder-name">{concurso}</span>
                        <span className="dash__folder-meta">
                          {todas.length} aula(s) · {Object.keys(areas).length} área(s)
                          {criador ? ` · por ${criador.split("@")[0]}` : ""}
                        </span>
                      </span>
                    </span>
                    {aberto ? <ChevronUp size={20} color="var(--fg-3)" /> : <ChevronDown size={20} color="var(--fg-3)" />}
                  </button>

                  {aberto && (
                    <div className="dash__folder-body">
                      {Object.entries(areas).map(([area, aulas]) => (
                        <div className="dash__area" key={area}>
                          <div className="dash__area-title">
                            <Target size={14} color="var(--ok)" /> {area}
                          </div>
                          {aulas.map((plan) => {
                            const minha = user && plan.owner_email === user.email;
                            const publica = plan.visibility === "public";
                            return (
                              <div className={`dash__lesson${minha ? " is-mine" : ""}`} key={plan.id}>
                                <div className="dash__lesson-body">
                                  <div className="dash__lesson-tags">
                                    {plan.banca && <Badge>{plan.banca}</Badge>}
                                    {plan.ano && <Badge outline>{plan.ano}</Badge>}
                                    <Badge tone={publica ? "ok" : "default"} icon={publica ? <Globe size={11} /> : <Lock size={11} />}>
                                      {publica ? "Público" : "Privado"}
                                    </Badge>
                                    {minha && <Badge tone="accent" icon={<Star size={11} />}>Minha</Badge>}
                                    <Badge outline icon={<Calendar size={11} />}>
                                      {new Date(plan.created_at).toLocaleDateString("pt-BR")}
                                    </Badge>
                                  </div>
                                  <div className="dash__lesson-title">{plan.title}</div>
                                </div>
                                <Button variant="primary" size="sm" to={`/aula/${plan.id}`} icon={<ArrowRight size={14} />}>
                                  Acessar
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {totalPages > 1 && (
          <div className="dash__pager" style={{ marginTop: "var(--space-5)" }}>
            <Button onClick={() => irParaPagina(currentPage - 1)} disabled={currentPage === 1} icon={<ChevronLeft size={15} />}>
              Anterior
            </Button>
            {[...Array(totalPages)].map((_, i) => {
              const n = i + 1;
              if (n === 1 || n === totalPages || (n >= currentPage - 1 && n <= currentPage + 1)) {
                return (
                  <button
                    key={n}
                    className={`dash__page-num${currentPage === n ? " is-current" : ""}`}
                    onClick={() => irParaPagina(n)}
                    aria-current={currentPage === n ? "page" : undefined}
                  >
                    {n}
                  </button>
                );
              }
              if (n === currentPage - 2 || n === currentPage + 2) {
                return <span key={n} style={{ color: "var(--fg-3)" }}>…</span>;
              }
              return null;
            })}
            <Button onClick={() => irParaPagina(currentPage + 1)} disabled={currentPage === totalPages}>
              Próxima <ChevronRight size={15} />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
