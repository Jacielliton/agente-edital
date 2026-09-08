import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Layers, RotateCcw, ArrowRight, Search, Check, BookOpen, Info,
} from "lucide-react";
import {
  Button, Badge, Card, CardHead, CardBody, Input, PageHeader,
  ProgressBar, Skeleton, EmptyState, Notice, Toast,} from "../components/ui";
import { getAuthToken } from "../components/AiKeyConfig";
import Md from "../components/Markdown";
import "./Baralho.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const CHAVE_PROGRESSO = "baralho_progresso_v1";

/* ==========================================================================
   Agendamento das cartas.

   Escada simples de intervalos, em dias. Errar volta para o começo; acertar
   sobe um degrau. Não é o SM-2 completo — para um baralho de termos de edital
   a escada resolve, e não exige guardar fator de facilidade por carta.

   O progresso vive no localStorage: vale por navegador e some se o aluno
   limpar os dados. Levar isso para o banco é o passo seguinte, junto da
   revisão espaçada de verdade.
   ========================================================================== */
const ESCADA = [0, 1, 3, 7, 16, 35];

const hoje = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const emDias = (n) => hoje() + n * 86400000;

function lerProgresso() {
  try {
    const cru = localStorage.getItem(CHAVE_PROGRESSO);
    return cru ? JSON.parse(cru) : {};
  } catch (e) {
    return {};
  }
}
function gravarProgresso(dados) {
  try {
    localStorage.setItem(CHAVE_PROGRESSO, JSON.stringify(dados));
  } catch (e) {
    /* modo privado ou armazenamento cheio: o estudo da sessão continua valendo */
  }
}

const chaveDaCarta = (planoId, termo) => `${planoId}::${String(termo).slice(0, 80)}`;

/** Cartas vencidas até hoje.
 *
 *  Fica fora do componente de proposito: nao depende de estado nenhum, e como
 *  funcao de modulo ja existe quando `abrirBaralho` roda. Declarada como
 *  useCallback DEPOIS de abrirBaralho, ela caia na zona morta temporal — a
 *  lista de dependencias e avaliada durante a renderizacao, antes da
 *  inicializacao, e a tela quebrava com "Cannot access before initialization". */
function montarFila(listaCartas, progressoAtual) {
  const agora = hoje();
  return listaCartas.filter((c) => (progressoAtual[c.id]?.proxima ?? 0) <= agora);
}

export default function Baralho() {
  const [planos, setPlanos] = useState([]);
  const [carregandoPlanos, setCarregandoPlanos] = useState(true);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState(null);

  const [planoAberto, setPlanoAberto] = useState(null);
  const [cartas, setCartas] = useState([]);
  const [carregandoCartas, setCarregandoCartas] = useState(false);

  const [progresso, setProgresso] = useState(lerProgresso);
  const [fila, setFila] = useState([]);
  const [indice, setIndice] = useState(0);
  const [virada, setVirada] = useState(false);
  const [revisadasAgora, setRevisadasAgora] = useState(0);

  /* ------------------------------------------------ lista de aulas */
  useEffect(() => {
    const token = getAuthToken();
    setCarregandoPlanos(true);
    fetch(`${API_URL}/plans?page=1&limit=100`, {
      headers: { Authorization: token ? `Bearer ${token}` : "" },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Não foi possível carregar as suas aulas."))))
      .then((d) => setPlanos(Array.isArray(d.items) ? d.items : []))
      .catch((e) => setErro(e.message))
      .finally(() => setCarregandoPlanos(false));
  }, []);

  const planosFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return planos;
    return planos.filter((p) =>
      [p.title, p.area, p.concurso, p.banca].filter(Boolean).some((c) => String(c).toLowerCase().includes(q))
    );
  }, [planos, busca]);

  /* ------------------------------------------------ montar o baralho */
  const abrirBaralho = useCallback(async (plano) => {
    setCarregandoCartas(true);
    setErro(null);
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_URL}/plans/${plano.id}`, {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (!res.ok) throw new Error("Não foi possível abrir esta aula.");
      const conteudo = await res.json();

      const aulas = Array.isArray(conteudo?.aulas) ? conteudo.aulas : [];
      const montadas = [];
      aulas.forEach((aula, iModulo) => {
        const termos = Array.isArray(aula?.resumo_termos_chave) ? aula.resumo_termos_chave : [];
        termos.forEach((t) => {
          const termo = typeof t === "string" ? t : t?.termo;
          const definicao = typeof t === "string" ? "" : t?.definicao;
          if (!termo || !String(termo).trim()) return;
          montadas.push({
            id: chaveDaCarta(plano.id, termo),
            termo: String(termo).trim(),
            definicao: String(definicao || "").trim(),
            modulo: aula?.titulo || `Módulo ${iModulo + 1}`,
          });
        });
      });

      if (montadas.length === 0) {
        setErro("Esta aula não tem termos-chave gravados. Aulas geradas antes desta ferramenta podem não ter o resumo.");
        return;
      }
      setPlanoAberto(plano);
      setCartas(montadas);
      setFila(montarFila(montadas, lerProgresso()));
      setIndice(0);
      setVirada(false);
      setRevisadasAgora(0);
    } catch (e) {
      setErro(e.message || "Falha de conexão.");
    } finally {
      setCarregandoCartas(false);
    }
  }, []);

  const cartaAtual = fila[indice] || null;
  const novas = cartas.filter((c) => !progresso[c.id]).length;
  const dominadas = cartas.filter((c) => (progresso[c.id]?.degrau ?? 0) >= ESCADA.length - 1).length;

  const responder = (resultado) => {
    if (!cartaAtual) return;
    const atual = progresso[cartaAtual.id] || { degrau: 0 };
    let degrau = atual.degrau || 0;
    let dias;
    if (resultado === "errei") {
      degrau = 0;
      dias = 0;                                   // volta ainda hoje
    } else if (resultado === "dificil") {
      dias = Math.max(1, ESCADA[degrau]);         // nunca no mesmo dia
    } else {
      degrau = Math.min(ESCADA.length - 1, degrau + 1);
      dias = ESCADA[degrau];
    }

    const novo = {
      ...progresso,
      [cartaAtual.id]: { degrau, proxima: emDias(dias), visto: hoje() },
    };
    setProgresso(novo);
    gravarProgresso(novo);
    setRevisadasAgora((n) => n + 1);
    setVirada(false);
    setIndice((i) => i + 1);
  };

  const reiniciarSessao = () => {
    setFila(cartas);
    setIndice(0);
    setVirada(false);
    setRevisadasAgora(0);
  };

  /* ------------------------------------------------ telas */
  if (planoAberto) {
    const total = fila.length;
    const terminou = indice >= total;

    return (
      <div className="bl">
        <PageHeader
          eyebrow="Baralho do Edital"
          title={planoAberto.title}
          description={`${cartas.length} carta(s) neste baralho · ${novas} nunca vista(s) · ${dominadas} dominada(s)`}
          actions={
            <Button onClick={() => { setPlanoAberto(null); setCartas([]); setFila([]); }} icon={<Layers size={15} />}>
              Trocar de baralho
            </Button>
          }
        />

        {!terminou && cartaAtual ? (
          <>
            <div className="bl__barra">
              <ProgressBar value={total ? Math.round((indice / total) * 100) : 0} aria-label="Progresso da sessão" />
              <span>{indice} de {total}</span>
            </div>

            <div className="bl__carta">
              <span className="bl__modulo">{cartaAtual.modulo}</span>
              <h2 className="bl__termo">{cartaAtual.termo}</h2>

              {virada ? (
                <div className="bl__definicao">
                  <Md>{cartaAtual.definicao || "_Sem definição gravada para este termo._"}</Md>
                </div>
              ) : (
                <p className="bl__instrucao">
                  Diga a definição em voz alta, com as suas palavras. Só depois vire a carta.
                </p>
              )}

              {!virada ? (
                <Button variant="primary" size="lg" onClick={() => setVirada(true)} block>
                  Virar a carta
                </Button>
              ) : (
                <div className="bl__notas">
                  <button className="bl__nota bl__nota--errei" onClick={() => responder("errei")}>
                    <b>Errei</b><span>hoje de novo</span>
                  </button>
                  <button className="bl__nota bl__nota--dificil" onClick={() => responder("dificil")}>
                    <b>Difícil</b><span>daqui a pouco</span>
                  </button>
                  <button className="bl__nota bl__nota--facil" onClick={() => responder("facil")}>
                    <b>Fácil</b><span>mais para frente</span>
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <Card>
            <CardBody>
              <EmptyState
                icon={<Check size={22} />}
                title={revisadasAgora > 0 ? "Sessão concluída" : "Nada para revisar hoje"}
                description={
                  revisadasAgora > 0
                    ? `Você revisou ${revisadasAgora} carta(s). As que você marcou como fáceis voltam em alguns dias — é o espaçamento que faz o termo grudar.`
                    : "Todas as cartas deste baralho já estão agendadas para outro dia. Volte amanhã ou escolha outro baralho."
                }
                action={
                  <div className="bl__fim-acoes">
                    <Button variant="primary" onClick={reiniciarSessao} icon={<RotateCcw size={15} />}>
                      Repassar mesmo assim
                    </Button>
                    <Button onClick={() => { setPlanoAberto(null); setCartas([]); setFila([]); }} icon={<ArrowRight size={15} />}>
                      Outro baralho
                    </Button>
                  </div>
                }
              />
            </CardBody>
          </Card>
        )}

      <Toast aviso={erro ? { tone: "err", texto: erro } : null} onFechar={() => setErro(null)} />
      </div>
    );
  }

  return (
    <div className="bl">
      <PageHeader
        eyebrow="Ferramentas"
        title="Baralho do Edital"
        description="Os termos-chave que a IA já escreveu em cada aula viram cartas. Você tenta lembrar antes de ver a resposta — e o que você erra volta antes."
      />

      <Notice tone="info">
        O progresso das cartas fica guardado neste navegador. Trocar de aparelho ou limpar os dados recomeça a contagem.
      </Notice>

      <Card>
        <CardHead
          title="Escolha um baralho"
          action={<Badge outline>{planos.length} aula(s)</Badge>}
        />
        <CardBody className="bl__lista">
          <Input
            icon={<Search size={15} />}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por aula, concurso ou banca…"
            aria-label="Buscar baralho"
          />

          {carregandoPlanos ? (
            <>
              <Skeleton height={62} radius={10} />
              <Skeleton height={62} radius={10} />
              <Skeleton height={62} radius={10} />
            </>
          ) : planosFiltrados.length === 0 ? (
            <EmptyState
              icon={<BookOpen size={22} />}
              title={busca ? "Nenhuma aula com esse nome" : "Você ainda não tem aulas"}
              description={
                busca
                  ? "Tente outro termo, ou limpe a busca para ver a biblioteca inteira."
                  : "Gere uma aula pelo seu edital: os termos-chave dela viram cartas automaticamente."
              }
              action={busca
                ? <Button onClick={() => setBusca("")}>Limpar busca</Button>
                : <Button variant="primary" to="/generator">Gerar a primeira aula</Button>}
            />
          ) : (
            planosFiltrados.map((p) => (
              <button
                key={p.id}
                className="bl__item"
                onClick={() => abrirBaralho(p)}
                disabled={carregandoCartas}
              >
                <span className="bl__item-icone"><Layers size={17} /></span>
                <span className="bl__item-corpo">
                  <span className="bl__item-titulo">{p.title}</span>
                  <span className="bl__item-meta">
                    {p.concurso && <Badge>{p.concurso}</Badge>}
                    {p.banca && <Badge outline>{p.banca}</Badge>}
                    {p.area && <span>{p.area}</span>}
                  </span>
                </span>
                <ArrowRight size={16} />
              </button>
            ))
          )}
        </CardBody>
      </Card>

      <div className="bl__porque">
        <Info size={16} />
        <p>
          Reler a aula dá a sensação de que você sabe — reconhecer é fácil. Tentar lembrar antes de
          ver a resposta é o que revela o que ainda não está fixado, e é o que faz o termo durar até
          a prova.
        </p>
      </div>

      <Toast aviso={erro ? { tone: "err", texto: erro } : null} onFechar={() => setErro(null)} />
    </div>
  );
}
