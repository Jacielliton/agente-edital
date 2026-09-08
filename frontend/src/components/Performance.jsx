import React, { useEffect, useMemo, useState } from "react";
import {
  Target, PenTool, TrendingUp, AlertTriangle, CheckCircle2, Award, Trophy,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  Card, CardHead, CardBody, Badge, StatCard, ProgressBar,
  PageHeader, EmptyState, Skeleton,
} from "./ui";
import { getAuthToken } from "./AiKeyConfig";
import "./Performance.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

/* Faixas de XP. A cor de cada faixa vira classe, não hexadecimal cravado:
   antes eram #8b5cf6, #3b82f6, #eab308, #94a3b8 e #b45309 no meio do JSX. */
const FAIXAS = [
  { min: 5000, nome: "Elite",    emoji: "💎", classe: "elite" },
  { min: 2000, nome: "Diamante", emoji: "🔷", classe: "diamante" },
  { min: 1000, nome: "Ouro",     emoji: "🏆", classe: "ouro" },
  { min: 500,  nome: "Prata",    emoji: "🥈", classe: "prata" },
  { min: 100,  nome: "Bronze",   emoji: "🥉", classe: "bronze" },
  { min: 0,    nome: "Iniciante", emoji: "•", classe: "inicio" },
];

const META_SEGURANCA = 0.75;

/** Aproveitamento seguro: nota_maxima zerada ou ausente não vira NaN na tela. */
const aproveitamento = (item) => {
  const max = Number(item?.nota_maxima) || 0;
  if (max <= 0) return 0;
  return Math.max(0, Math.min(1, Number(item.nota_obtida || 0) / max));
};

const mediaPercentual = (lista) => {
  const validos = lista.filter((i) => Number(i?.nota_maxima) > 0);
  if (validos.length === 0) return 0;
  const soma = validos.reduce((acc, i) => acc + aproveitamento(i), 0);
  return Number(((soma / validos.length) * 100).toFixed(1));
};

export default function Performance() {
  const { user } = useAuth();
  const [history, setHistory] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const buscar = async () => {
      const token = getAuthToken();
      if (!token) { setCarregando(false); return; }
      try {
        const cabecalho = { headers: { Authorization: `Bearer ${token}` } };
        const [resHist, resRank] = await Promise.all([
          fetch(`${API_URL}/performance/me`, cabecalho),
          fetch(`${API_URL}/performance/leaderboard`, cabecalho),
        ]);
        if (resHist.ok) setHistory(await resHist.json());
        if (resRank.ok) setLeaderboard(await resRank.json());
      } catch (err) {
        console.error("Falha ao buscar o painel de desempenho", err);
      } finally {
        setCarregando(false);
      }
    };
    buscar();
  }, []);

  const simulados = useMemo(() => history.filter((h) => h.tipo === "simulado"), [history]);
  const discursivas = useMemo(() => history.filter((h) => h.tipo === "discursiva"), [history]);

  /* XP: +50 por simulado, +10 por acerto, -5 por erro. Nunca negativo. */
  const rank = useMemo(() => {
    let acertos = 0, questoes = 0;
    simulados.forEach((s) => {
      acertos += Number(s.nota_obtida) || 0;
      questoes += Number(s.nota_maxima) || 0;
    });
    const erros = Math.max(0, questoes - acertos);
    const xp = Math.max(0, simulados.length * 50 + acertos * 10 - erros * 5);
    const faixa = FAIXAS.find((f) => xp >= f.min) || FAIXAS[FAIXAS.length - 1];
    const meu = leaderboard.find((l) => l.email_completo === user?.email);
    return { xp, faixa, acertos, erros, posicao: meu?.posicao ?? "—" };
  }, [simulados, leaderboard, user]);

  /* Um tema por linha, sempre a avaliação mais recente, abaixo da meta. */
  const revisoes = useMemo(() => {
    const porTema = {};
    history.forEach((item) => {
      const atual = porTema[item.tema];
      if (!atual || new Date(item.created_at) > new Date(atual.data)) {
        porTema[item.tema] = { valor: aproveitamento(item), data: item.created_at, tipo: item.tipo };
      }
    });
    return Object.entries(porTema)
      .filter(([, d]) => d.valor < META_SEGURANCA)
      .sort((a, b) => a[1].valor - b[1].valor);
  }, [history]);

  if (carregando) {
    return (
      <div className="perf">
        <PageHeader eyebrow="Estudo" title="Meu desempenho" description="Reunindo os seus simulados e discursivas…" />
        <div className="perf__kpis">
          <Skeleton height={112} radius={12} /><Skeleton height={112} radius={12} /><Skeleton height={112} radius={12} />
        </div>
        <div className="perf__cols"><Skeleton height={300} radius={12} /><Skeleton height={300} radius={12} /></div>
      </div>
    );
  }

  return (
    <div className="perf">
      <PageHeader
        eyebrow="Estudo"
        title="Meu desempenho"
        description="Onde você está acertando, o que precisa voltar a estudar e como está a sua posição entre os outros candidatos."
      />

      <div className="perf__kpis">
        <div className={`perf__liga is-${rank.faixa.classe}`}>
          <span className="perf__liga-topo"><Award size={18} /> Sua liga</span>
          <b className="perf__liga-nome">{rank.faixa.emoji} {rank.faixa.nome}</b>
          <span className="perf__liga-meta">
            <b>{Math.floor(rank.xp)} XP</b> · posição global <b>#{rank.posicao}</b>
          </span>
        </div>

        <StatCard
          label="Taxa de acerto nos simulados"
          value={`${mediaPercentual(simulados)}%`}
          icon={<Target size={16} />}
          delta={`${rank.acertos} acerto(s) · ${rank.erros} erro(s)`}
          deltaTone={rank.acertos >= rank.erros ? "up" : "warn"}
        />

        <StatCard
          label="Provas discursivas"
          value={`${mediaPercentual(discursivas)}%`}
          icon={<PenTool size={16} />}
          delta={`aproveitamento médio em ${discursivas.length} avaliada(s)`}
        />
      </div>

      <div className="perf__cols">
        <Card>
          <CardHead title="Ranking global" action={<Badge outline>top 10</Badge>} />
          <CardBody className="perf__rank">
            {leaderboard.length === 0 ? (
              <EmptyState
                icon={<Trophy size={20} />}
                title="Ranking ainda vazio"
                description="Nenhum simulado registrado na plataforma até agora. O primeiro a responder abre a lista."
              />
            ) : (
              leaderboard.slice(0, 10).map((l) => {
                const souEu = l.email_completo === user?.email;
                const medalha = l.posicao === 1 ? "🥇" : l.posicao === 2 ? "🥈" : l.posicao === 3 ? "🥉" : null;
                return (
                  <div key={l.posicao} className={`perf__rank-linha${souEu ? " is-eu" : ""}`}>
                    <span className={`perf__rank-pos${l.posicao <= 3 ? " is-podio" : ""}`}>
                      {medalha || `${l.posicao}º`}
                    </span>
                    <span className="perf__rank-nome">
                      {l.nickname}
                      {souEu && <Badge tone="accent">você</Badge>}
                    </span>
                    <span className="perf__rank-xp">
                      <span>{String(l.elo || "").split(" ")[0]}</span>
                      <b>{Math.floor(l.xp || 0)} XP</b>
                    </span>
                  </div>
                );
              })
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHead
            title="O que revisar"
            action={revisoes.length > 0 && <Badge tone="warn">{revisoes.length} tema(s)</Badge>}
          />
          <CardBody className="perf__revisar">
            {history.length === 0 ? (
              <EmptyState
                icon={<AlertTriangle size={20} />}
                title="Sem dados ainda"
                description="Responda o primeiro simulado para a plataforma começar a apontar onde você erra mais."
              />
            ) : revisoes.length === 0 ? (
              <div className="perf__meta-ok">
                <CheckCircle2 size={20} />
                <span>Todos os temas acima de {Math.round(META_SEGURANCA * 100)}%. Mantenha a revisão para não perder o que já está firme.</span>
              </div>
            ) : (
              revisoes.map(([tema, d]) => {
                const pct = d.valor * 100;
                const critico = pct < 50;
                return (
                  <div key={tema} className={`perf__tema${critico ? " is-critico" : ""}`}>
                    <div className="perf__tema-topo">
                      <span className="perf__tema-nome">{tema}</span>
                      <b>{pct.toFixed(0)}%</b>
                    </div>
                    <ProgressBar
                      value={pct}
                      color={critico ? "var(--danger)" : "var(--warn)"}
                      aria-label={`Aproveitamento em ${tema}`}
                    />
                    <span className="perf__tema-nota">
                      {critico ? "Abaixo da metade — vale rever a teoria antes de treinar de novo." : "Perto da meta. Mais um caderno costuma resolver."}
                    </span>
                  </div>
                );
              })
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHead
          title="Histórico completo"
          action={<Badge outline>{history.length} avaliação(ões)</Badge>}
        />
        <CardBody className="perf__hist">
          {history.length === 0 ? (
            <EmptyState
              icon={<TrendingUp size={20} />}
              title="Nenhuma atividade registrada"
              description="Simulados e discursivas aparecem aqui assim que você concluir o primeiro."
            />
          ) : (
            history.map((item, i) => {
              const pct = aproveitamento(item);
              const bom = pct >= META_SEGURANCA;
              const data = new Date(item.created_at).toLocaleDateString("pt-BR", {
                day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
              });
              return (
                <div key={`${item.tema}-${i}`} className="perf__item">
                  <div className="perf__item-corpo">
                    <span className="perf__item-tema">{item.tema}</span>
                    <span className="perf__item-tags">
                      {item.concurso && <Badge outline>{item.concurso}</Badge>}
                      {item.nivel && <Badge outline>{item.nivel}</Badge>}
                      {item.formato && <Badge outline>{item.formato}</Badge>}
                    </span>
                    <span className="perf__item-data">{data} · {item.tipo}</span>
                  </div>
                  <span className={`perf__item-nota${bom ? " is-ok" : " is-baixo"}`}>
                    {item.nota_obtida} / {item.nota_maxima}
                  </span>
                </div>
              );
            })
          )}
        </CardBody>
      </Card>
    </div>
  );
}
