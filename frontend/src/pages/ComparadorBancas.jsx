import React, { useState } from "react";
import { GitCompare, Sparkles, Check, Eye, Target } from "lucide-react";
import {
  Button, Badge, Card, CardHead, CardBody, Input, PageHeader, Modal, Notice, EmptyState, Toast,} from "../components/ui";
import { AiKeyBar, AiKeyPanel, useAiKey, getAuthToken } from "../components/AiKeyConfig";
import Md from "../components/Markdown";
import "./ComparadorBancas.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

/* As mesmas bancas que o backend conhece em BANCA_ESTILOS. */
const BANCAS = [
  { id: "CEBRASPE", rotulo: "CEBRASPE / CESPE", nota: "Certo ou errado, erro numa palavra só" },
  { id: "FGV", rotulo: "FGV", nota: "Caso concreto longo, exige aplicar" },
  { id: "FCC", rotulo: "FCC", nota: "Literalidade da lei, memória fina" },
  { id: "VUNESP", rotulo: "VUNESP", nota: "Direta, texto curto, pouca pegadinha" },
  { id: "IBFC", rotulo: "IBFC", nota: "Mescla literal e interpretação" },
  { id: "INSTITUTO AOCP", rotulo: "Instituto AOCP", nota: "Prática, foco em rotina do cargo" },
];

const NIVEIS = ["Iniciante", "Normal", "Avancado", "Expert"];
const ROTULO_NIVEL = { Iniciante: "Iniciante", Normal: "Normal", Avancado: "Avançado", Expert: "Expert" };

export default function ComparadorBancas() {
  const [showConfig, setShowConfig] = useState(false);
  const { userApiKey, userModel, setUserApiKey, setUserModel } = useAiKey();
  const [aviso, setAviso] = useState(null);

  const [tema, setTema] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [nivel, setNivel] = useState("Normal");
  const [escolhidas, setEscolhidas] = useState(["CEBRASPE", "FGV"]);
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [respostas, setRespostas] = useState({});
  const [revelados, setRevelados] = useState({});

  const alternar = (id) => {
    setEscolhidas((atual) => {
      if (atual.includes(id)) return atual.filter((b) => b !== id);
      if (atual.length >= 3) {
        setAviso({ tone: "warn", texto: "Três bancas por comparação. Mais que isso vira tabela, não estudo." });
        return atual;
      }
      return [...atual, id];
    });
  };

  const comparar = async () => {
    if (!tema.trim()) {
      setAviso({ tone: "warn", texto: "Informe o tema a comparar." });
      return;
    }
    if (escolhidas.length < 2) {
      setAviso({ tone: "warn", texto: "Escolha pelo menos duas bancas — a graça é a diferença entre elas." });
      return;
    }
    setCarregando(true);
    setAviso(null);
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_URL}/training/comparador-bancas`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" },
        body: JSON.stringify({
          tema: tema.trim(),
          conteudo: conteudo.trim(),
          bancas: escolhidas,
          nivel,
          model: userModel || null,
          api_key: userApiKey || null,
        }),
      });
      if (res.status === 401 || res.status === 403) {
        setAviso({ tone: "err", texto: "Sua sessão expirou ou não há chave de IA configurada." });
        return;
      }
      if (!res.ok) throw new Error("A IA não conseguiu montar a comparação. Tente de novo.");
      const dados = await res.json();
      if (!Array.isArray(dados?.questoes) || dados.questoes.length === 0) {
        throw new Error("A IA não devolveu questões. Tente descrever o tema com mais precisão.");
      }
      setResultado(dados);
      setRespostas({});
      setRevelados({});
    } catch (e) {
      setAviso({ tone: "err", texto: e.message || "Falha de conexão." });
    } finally {
      setCarregando(false);
    }
  };

  const letraDe = (alt) => String(alt || "").trim().charAt(0).toUpperCase();

  return (
    <div className="cb">
      <PageHeader
        eyebrow="Ferramentas"
        title="Comparador de Bancas"
        description="O mesmo ponto do mesmo tema, cobrado do jeito de cada banca. Responda as duas ou três e veja onde cada uma esconde o erro."
        actions={resultado && (
          <Button onClick={() => setResultado(null)} icon={<GitCompare size={15} />}>Novo tema</Button>
        )}
      />

      <AiKeyBar
        userApiKey={userApiKey}
        userModel={userModel}
        onConfigurar={() => setShowConfig(true)}
        label="IA que elabora as questões"
      />

      {!resultado && (
        <Card>
          <CardHead title="O que comparar" />
          <CardBody className="cb__form">
            <Input
              label="Tema"
              value={tema}
              onChange={(e) => setTema(e.target.value)}
              placeholder="ex: Princípio da impessoalidade na administração pública"
            />

            <div>
              <span className="cb__label">Recorte do conteúdo (opcional)</span>
              <textarea
                className="cb__textarea"
                value={conteudo}
                onChange={(e) => setConteudo(e.target.value)}
                rows={4}
                placeholder="Cole o trecho do edital ou da lei que você quer que seja cobrado. Sem isso, a IA escolhe o recorte mais provável do tema."
              />
            </div>

            <div>
              <span className="cb__label">Bancas — de duas a três</span>
              <div className="cb__bancas">
                {BANCAS.map((b) => {
                  const on = escolhidas.includes(b.id);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      className={`cb__banca${on ? " is-on" : ""}`}
                      onClick={() => alternar(b.id)}
                      aria-pressed={on}
                    >
                      <b>{b.rotulo}{on && <Check size={14} />}</b>
                      <span>{b.nota}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="cb__label">Nível</span>
              <div className="cb__niveis">
                {NIVEIS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`cb__nivel${nivel === n ? " is-on" : ""}`}
                    onClick={() => setNivel(n)}
                    aria-pressed={nivel === n}
                  >
                    {ROTULO_NIVEL[n]}
                  </button>
                ))}
              </div>
            </div>

            <Button variant="primary" size="lg" onClick={comparar} disabled={carregando} icon={<Sparkles size={16} />}>
              {carregando ? "Elaborando as questões…" : `Comparar ${escolhidas.length} banca(s)`}
            </Button>
          </CardBody>
        </Card>
      )}

      {resultado && (
        <>
          <div className="cb__tema">
            <Target size={16} />
            <span>{resultado.tema || tema}</span>
            <Badge outline>{ROTULO_NIVEL[nivel] || nivel}</Badge>
          </div>

          <div className="cb__grade" style={{ "--colunas": resultado.questoes.length }}>
            {resultado.questoes.map((q, i) => {
              const chave = String(i);
              const marcada = respostas[chave];
              const revelado = revelados[chave];
              const gabarito = String(q.gabarito || "").trim().toUpperCase().charAt(0);
              const acertou = marcada && marcada === gabarito;

              return (
                <article key={i} className="cb__coluna">
                  <header className="cb__coluna-topo">
                    <b>{q.banca || "Banca"}</b>
                    <Badge outline>{q.formato || "Múltipla escolha"}</Badge>
                  </header>

                  <div className="cb__enunciado"><Md>{q.enunciado || ""}</Md></div>

                  <div className="cb__alternativas">
                    {(Array.isArray(q.alternativas) ? q.alternativas : []).map((alt, j) => {
                      const letra = letraDe(alt);
                      const estaMarcada = marcada === letra;
                      const eCorreta = letra === gabarito;
                      let classe = "cb__alt";
                      if (revelado && eCorreta) classe += " is-correta";
                      else if (revelado && estaMarcada) classe += " is-errada";
                      else if (estaMarcada) classe += " is-marcada";
                      return (
                        <button
                          key={j}
                          type="button"
                          className={classe}
                          disabled={revelado}
                          onClick={() => setRespostas((p) => ({ ...p, [chave]: letra }))}
                        >
                          <Md inline>{alt}</Md>
                        </button>
                      );
                    })}
                  </div>

                  {!revelado ? (
                    <Button
                      size="sm"
                      onClick={() => setRevelados((p) => ({ ...p, [chave]: true }))}
                      disabled={!marcada}
                      icon={<Eye size={14} />}
                      block
                    >
                      {marcada ? "Ver o gabarito" : "Escolha uma alternativa"}
                    </Button>
                  ) : (
                    <>
                      <div className={`cb__veredito${acertou ? " is-ok" : " is-erro"}`}>
                        {acertou ? "Você acertou" : `Gabarito: ${gabarito}`}
                      </div>
                      {q.comentario && (
                        <div className="cb__comentario"><Md>{q.comentario}</Md></div>
                      )}
                      {q.o_que_a_banca_fez && (
                        <div className="cb__manobra">
                          <b>A manobra desta banca</b>
                          <Md>{q.o_que_a_banca_fez}</Md>
                        </div>
                      )}
                    </>
                  )}
                </article>
              );
            })}
          </div>

          {resultado.sintese && Object.keys(revelados).length === resultado.questoes.length && (
            <Card>
              <CardHead title="O que muda no seu estudo" />
              <CardBody><Md>{resultado.sintese}</Md></CardBody>
            </Card>
          )}
        </>
      )}

      {!resultado && !carregando && !tema && (
        <EmptyState
          icon={<GitCompare size={22} />}
          title="Para que serve"
          description="Quem presta mais de um concurso estuda o mesmo conteúdo para bancas que cobram de formas opostas: a CEBRASPE esconde o erro numa palavra de um item de certo ou errado; a FGV monta um caso e exige aplicar. Ver as duas lado a lado, sobre o mesmo ponto, mostra o que precisa mudar no seu jeito de ler a questão."
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
