import React, { useMemo, useRef, useState } from "react";
import {
  Scale, Eraser, Check, X, RotateCcw, Eye, Lightbulb, Sparkles, ClipboardPaste,
  AlertTriangle, ExternalLink,
} from "lucide-react";
import {
  Button, Badge, Card, CardHead, CardBody, Input, PageHeader, Modal, Notice, EmptyState, Toast,
  SegmentedControl,
} from "../components/ui";
import { AiKeyBar, AiKeyPanel, useAiKey, getAuthToken } from "../components/AiKeyConfig";
import "./LeiSeca.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const INTENSIDADES = [
  { valor: "Leve", rotulo: "Leve", ajuda: "Poucas lacunas — para a primeira leitura do artigo." },
  { valor: "Media", rotulo: "Média", ajuda: "O equilíbrio para revisão. Começa por aqui." },
  { valor: "Pesada", rotulo: "Pesada", ajuda: "Quase toda palavra que a banca troca. Para a véspera." },
];

const ROTULO_CATEGORIA = {
  operador: "operador",
  limite: "limite/prazo",
  ressalva: "ressalva",
  competencia: "competência",
  conectivo: "conectivo",
};

/** Normaliza para comparar sem punir acento, caixa ou espaço a mais. */
const normalizar = (t) =>
  String(t || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.,;:]$/, "");

export default function LeiSeca() {
  const [showConfig, setShowConfig] = useState(false);
  const { userApiKey, userModel, setUserApiKey, setUserModel, ia } = useAiKey();
  const [aviso, setAviso] = useState(null);

  const [modo, setModo] = useState("colar");   // colar | ia
  const [dispositivo, setDispositivo] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [origemIa, setOrigemIa] = useState(null);

  const [texto, setTexto] = useState("");
  const [intensidade, setIntensidade] = useState("Media");
  const [carregando, setCarregando] = useState(false);
  const [exercicio, setExercicio] = useState(null);

  const [respostas, setRespostas] = useState({});
  const [conferido, setConferido] = useState(false);
  const [revelados, setRevelados] = useState({});
  const primeiroCampo = useRef(null);

  const lacunas = useMemo(() => {
    const lista = Array.isArray(exercicio?.lacunas) ? exercicio.lacunas : [];
    const porId = {};
    lista.forEach((l) => { if (l && l.id != null) porId[String(l.id)] = l; });
    return porId;
  }, [exercicio]);

  const total = Object.keys(lacunas).length;

  const acertos = useMemo(() => {
    if (!conferido) return 0;
    return Object.keys(lacunas).filter(
      (id) => normalizar(respostas[id]) === normalizar(lacunas[id]?.resposta)
    ).length;
  }, [conferido, lacunas, respostas]);

  const buscarTexto = async () => {
    const pedido = dispositivo.trim();
    if (pedido.length < 3) {
      setAviso({ tone: "warn", texto: "Diga qual dispositivo você quer — por exemplo, art. 37 da CF/88." });
      return;
    }
    setBuscando(true);
    setAviso(null);
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_URL}/training/texto-legal`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" },
        body: JSON.stringify({
          dispositivo: pedido,
          contexto: "",
          model: userModel || null,
          api_key: userApiKey || null,
        }),
      });
      if (res.status === 401 || res.status === 403) {
        setAviso({ tone: "err", texto: "Sua sessão expirou ou não há chave de IA configurada." });
        return;
      }
      if (!res.ok) throw new Error("A IA não conseguiu trazer o dispositivo. Tente escrever a referência de outro jeito.");
      const dados = await res.json();
      if (!dados?.texto || String(dados.texto).trim().length < 20) {
        throw new Error(dados?.observacao || "A IA não devolveu o texto. Tente outra referência ou cole o texto você mesmo.");
      }
      setTexto(String(dados.texto).trim());
      setOrigemIa({
        titulo: dados.titulo || pedido,
        fonte: dados.fonte || "",
        confiavel: dados.confiavel !== false,
        observacao: dados.observacao || "",
      });
    } catch (e) {
      setAviso({ tone: "err", texto: e.message || "Falha de conexão." });
    } finally {
      setBuscando(false);
    }
  };

  const gerar = async () => {
    const limpo = texto.trim();
    if (limpo.length < 40) {
      setAviso({ tone: "warn", texto: "Cole um trecho maior — pelo menos algumas linhas do texto legal." });
      return;
    }
    setCarregando(true);
    setAviso(null);
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_URL}/training/lei-seca`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" },
        body: JSON.stringify({
          texto: limpo,
          intensidade,
          model: userModel || null,
          api_key: userApiKey || null,
        }),
      });
      if (res.status === 401 || res.status === 403) {
        setAviso({ tone: "err", texto: "Sua sessão expirou ou não há chave de IA configurada." });
        return;
      }
      if (!res.ok) throw new Error("A IA não conseguiu preparar o exercício. Tente de novo.");
      const dados = await res.json();
      if (!dados?.texto_com_lacunas || !Array.isArray(dados?.lacunas) || dados.lacunas.length === 0) {
        throw new Error("A IA não encontrou palavras para apagar neste trecho. Tente um texto normativo.");
      }
      setExercicio(dados);
      setRespostas({});
      setRevelados({});
      setConferido(false);
      setTimeout(() => primeiroCampo.current?.focus(), 60);
    } catch (e) {
      setAviso({ tone: "err", texto: e.message || "Falha de conexão." });
    } finally {
      setCarregando(false);
    }
  };

  const trocarModo = (novo) => {
    setModo(novo);
    setAviso(null);
    if (novo === "colar") setOrigemIa(null);
  };

  const recomecar = () => {
    setRespostas({});
    setRevelados({});
    setConferido(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /* O texto vem com marcadores {{1}}, {{2}}… — cada um vira um campo. */
  const pedacos = useMemo(() => {
    if (!exercicio?.texto_com_lacunas) return [];
    return String(exercicio.texto_com_lacunas).split(/(\{\{\s*\d+\s*\}\})/g);
  }, [exercicio]);

  const campo = (marcador, indice) => {
    const id = marcador.replace(/[^\d]/g, "");
    const lacuna = lacunas[id];
    if (!lacuna) return <span key={indice} className="ls__ausente">______</span>;

    const dada = respostas[id] || "";
    const certa = normalizar(dada) === normalizar(lacuna.resposta);
    const revelada = revelados[id];
    const estado = conferido ? (certa ? " is-certo" : " is-errado") : revelada ? " is-revelado" : "";
    const largura = Math.max(6, Math.min(26, String(lacuna.resposta || "").length + 3));

    return (
      <span key={indice} className="ls__lacuna">
        <input
          ref={indice === 1 ? primeiroCampo : null}
          className={`ls__campo${estado}`}
          style={{ width: `${largura}ch` }}
          value={revelada ? lacuna.resposta : dada}
          readOnly={conferido || revelada}
          onChange={(e) => setRespostas((p) => ({ ...p, [id]: e.target.value }))}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setConferido(true); } }}
          aria-label={`Lacuna ${id}`}
          placeholder="…"
        />
        {conferido && (certa
          ? <Check size={14} className="ls__marca ls__marca--ok" aria-label="certo" />
          : <X size={14} className="ls__marca ls__marca--erro" aria-label="errado" />)}
      </span>
    );
  };

  return (
    <div className="ls">
      <PageHeader
        eyebrow="Ferramentas"
        title="Lei Seca em Lacunas"
        description="Cole o artigo. A ferramenta apaga exatamente as palavras que a banca troca — devera, ate, salvo, no minimo — e você escreve de volta."
        actions={exercicio && (
          <Button onClick={() => setExercicio(null)} icon={<Eraser size={15} />}>Outro texto</Button>
        )}
      />

      <AiKeyBar
        ia={ia}
        userApiKey={userApiKey}
        userModel={userModel}
        onConfigurar={() => setShowConfig(true)}
        label="IA que prepara o exercício"
      />

      {!exercicio && (
        <Card>
          <CardHead
            title="Texto oficial"
            action={
              <SegmentedControl
                aria="Origem do texto"
                valor={modo}
                onTrocar={trocarModo}
                itens={[
                  { id: "colar", rotulo: "Colar", icone: ClipboardPaste },
                  { id: "ia", rotulo: "Pedir à IA", icone: Sparkles },
                ]}
              />
            }
          />
          <CardBody className="ls__form">
            {modo === "ia" && (
              <div className="ls__busca">
                <Input
                  label="Qual dispositivo você quer treinar"
                  value={dispositivo}
                  onChange={(e) => setDispositivo(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); buscarTexto(); } }}
                  placeholder="ex: art. 37 da CF/88 · Lei 8.112/90, arts. 116 e 117 · art. 5º, LXIX da CF"
                />
                <Button variant="primary" onClick={buscarTexto} disabled={buscando} icon={<Sparkles size={15} />}>
                  {buscando ? "Buscando…" : "Trazer o texto"}
                </Button>
              </div>
            )}

            {origemIa && (
              <div className={`ls__origem${origemIa.confiavel ? "" : " is-duvida"}`}>
                <AlertTriangle size={17} />
                <div>
                  <b>
                    {origemIa.confiavel
                      ? "Texto reconstituído pela IA — confira antes de treinar"
                      : "A IA não tem certeza da literalidade deste dispositivo"}
                  </b>
                  <p>
                    {origemIa.confiavel
                      ? "Um modelo de linguagem escreve de memória e pode trocar uma palavra — exatamente o erro que esta ferramenta existe para combater. Leia o texto abaixo contra a fonte oficial e corrija o que estiver diferente antes de gerar as lacunas."
                      : origemIa.observacao || "Confira o texto na fonte oficial e corrija o que estiver diferente antes de gerar as lacunas."}
                  </p>
                  <span className="ls__origem-meta">
                    {origemIa.fonte && <span>{origemIa.fonte}</span>}
                    <a href="https://www.planalto.gov.br/ccivil_03/" target="_blank" rel="noopener noreferrer">
                      Abrir o Planalto <ExternalLink size={12} />
                    </a>
                  </span>
                </div>
              </div>
            )}

            <label className="ls__label" htmlFor="ls-texto">
              {modo === "ia" && origemIa
                ? "Revise o texto — o exercício vai usar exatamente o que estiver aqui"
                : "Cole o artigo, o inciso ou o trecho da lei — direto da fonte oficial, sem resumir"}
            </label>
            <textarea
              id="ls-texto"
              className="ls__textarea"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={"Art. 37. A administração pública direta e indireta de qualquer dos Poderes da União, dos Estados, do Distrito Federal e dos Municípios obedecerá aos princípios de legalidade, impessoalidade, moralidade, publicidade e eficiência e, também, ao seguinte:\n\nI - os cargos, empregos e funções públicas são acessíveis aos brasileiros que preencham os requisitos estabelecidos em lei…"}
              rows={12}
            />
            <div className="ls__contagem">{texto.trim().split(/\s+/).filter(Boolean).length} palavra(s)</div>

            <div>
              <span className="ls__label">Intensidade</span>
              <div className="ls__intensidades">
                {INTENSIDADES.map((op) => (
                  <button
                    key={op.valor}
                    type="button"
                    className={`ls__intensidade${intensidade === op.valor ? " is-on" : ""}`}
                    onClick={() => setIntensidade(op.valor)}
                    aria-pressed={intensidade === op.valor}
                  >
                    <b>{op.rotulo}</b>
                    <span>{op.ajuda}</span>
                  </button>
                ))}
              </div>
            </div>

            <Button variant="primary" size="lg" onClick={gerar} disabled={carregando} icon={<Scale size={16} />}>
              {carregando ? "Preparando o exercício…" : "Apagar as palavras da banca"}
            </Button>
          </CardBody>
        </Card>
      )}

      {exercicio && (
        <>
          <Card>
            <CardHead
              title={exercicio.titulo || "Exercício"}
              action={<Badge tone="accent">{total} lacuna(s)</Badge>}
            />
            <CardBody>
              <p className="ls__texto">
                {pedacos.map((p, i) => (/^\{\{\s*\d+\s*\}\}$/.test(p) ? campo(p, i) : <span key={i}>{p}</span>))}
              </p>

              <div className="ls__acoes">
                {!conferido ? (
                  <Button variant="primary" onClick={() => setConferido(true)} icon={<Check size={15} />}>
                    Conferir contra o texto oficial
                  </Button>
                ) : (
                  <Button variant="primary" onClick={recomecar} icon={<RotateCcw size={15} />}>
                    Refazer este texto
                  </Button>
                )}
                {!conferido && (
                  <Button
                    onClick={() => setRevelados(Object.fromEntries(Object.keys(lacunas).map((id) => [id, true])))}
                    icon={<Eye size={15} />}
                  >
                    Revelar tudo
                  </Button>
                )}
              </div>

              {conferido && (
                <div className={`ls__placar${acertos === total ? " is-cheio" : ""}`}>
                  <b>{acertos} de {total}</b>
                  <span>
                    {acertos === total
                      ? "Texto na ponta da língua. Volte a este artigo em alguns dias."
                      : "Cada erro abaixo é uma palavra que mudaria o sentido da norma numa assertiva."}
                  </span>
                </div>
              )}
            </CardBody>
          </Card>

          {conferido && (
            <Card>
              <CardHead title="O que cada palavra muda" />
              <CardBody className="ls__revisao">
                {Object.values(lacunas)
                  .sort((a, b) => Number(a.id) - Number(b.id))
                  .map((l) => {
                    const dada = respostas[String(l.id)] || "";
                    const certa = normalizar(dada) === normalizar(l.resposta);
                    return (
                      <div key={l.id} className={`ls__item${certa ? " is-certo" : " is-errado"}`}>
                        <div className="ls__item-topo">
                          <span className="ls__item-n">{String(l.id).padStart(2, "0")}</span>
                          <code className="ls__resposta">{l.resposta}</code>
                          {!certa && (
                            <span className="ls__dada">
                              você escreveu {dada ? <code>{dada}</code> : <i>nada</i>}
                            </span>
                          )}
                          <Badge outline>{ROTULO_CATEGORIA[l.categoria] || l.categoria || "termo"}</Badge>
                        </div>
                        {l.por_que_importa && (
                          <p className="ls__porque"><Lightbulb size={14} /> {l.por_que_importa}</p>
                        )}
                        {Array.isArray(l.distratores) && l.distratores.length > 0 && (
                          <p className="ls__trocas">
                            A banca costuma trocar por: {l.distratores.map((d, i) => (
                              <code key={i}>{d}</code>
                            ))}
                          </p>
                        )}
                      </div>
                    );
                  })}
              </CardBody>
            </Card>
          )}
        </>
      )}

      {!exercicio && !carregando && texto.trim().length === 0 && (
        <EmptyState
          icon={<Scale size={22} />}
          title="Por que treinar assim"
          description="Em Direito, boa parte do erro não é de conceito: o candidato sabe o artigo e não percebe que a assertiva trocou “poderá” por “deverá”. Num simulado esse erro vem escondido dentro da questão. Aqui ele é o próprio exercício."
        />
      )}

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

      <Toast aviso={aviso} onFechar={() => setAviso(null)} />
    </div>
  );
}
