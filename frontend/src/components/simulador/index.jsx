import React from "react";
import { AlignLeft, CheckCircle2, AlertCircle, GraduationCap, Wand2, PieChart } from "lucide-react";
import { Button, Badge, Modal, ConfirmDialog } from "../ui";
import Md from "../Markdown";
import "./Simulador.css";

/* ==========================================================================
   Peças do simulador, compartilhadas pelas seis telas Gabarite.

   Antes deste módulo, o cartão de questão, o texto-base, o painel de erros e o
   modal de histórico estavam copiados em seis arquivos, cada cópia com o seu
   bloco de `style={{ … }}`. Eram 232 linhas idênticas em quatro ou mais telas,
   e o painel de erros carregava as cores literais (#f59e0b, #fef3c7, #b45309,
   #92400e) que não trocavam no tema escuro.

   Regra: nenhuma cor literal aqui. Tudo em token.
   ========================================================================== */

/** Painel do texto-base — "Situação Hipotética", texto motivador, trecho de lei. */
export function TextoBase({ titulo = "Situação hipotética", texto, serif = true }) {
  const paragrafos = String(texto || "").split("\n").filter((p) => p.trim());
  if (paragrafos.length === 0) return null;
  return (
    <section className="sim-texto">
      <span className="sim-texto__marca"><AlignLeft size={15} /></span>
      <h3>{titulo}</h3>
      <div className={`sim-texto__corpo${serif ? " is-serif" : ""}`}>
        {paragrafos.map((p, i) => <p key={i}>{p}</p>)}
      </div>
    </section>
  );
}

/**
 * Cartão de uma questão: número, assunto, enunciado, alternativas e o gabarito
 * comentado. Cobre os dois formatos das telas Gabarite — múltipla escolha
 * (letras vindas da própria alternativa) e certo/errado.
 *
 * @param {Function} renderEnunciado  Opcional. A tela de Inglês troca o
 *   enunciado por um texto com palavras clicáveis para tradução; em vez de
 *   duplicar o cartão inteiro por causa disso, ela passa o próprio render.
 */
export function QuestaoCard({
  numero,
  assunto,
  enunciado,
  alternativas,
  gabarito,
  explicacao,
  resposta,
  mostrarGabarito = false,
  travado = false,
  onResponder,
  renderEnunciado,
  children,
}) {
  const gab = String(gabarito || "").trim().toUpperCase();
  const acertou = resposta && resposta === gab;
  const temAlternativas = Array.isArray(alternativas) && alternativas.length > 0;

  const estado = mostrarGabarito ? (acertou ? " is-certo" : " is-errado") : "";

  const classeOpcao = (letra, correta) => {
    let c = "sim-opcao";
    if (resposta === letra) c += mostrarGabarito ? (correta ? " is-acerto" : " is-erro") : " is-marcada";
    if (mostrarGabarito && correta && resposta !== letra) c += " is-gabarito";
    if (mostrarGabarito && resposta !== letra && !correta) c += " is-apagada";
    return c;
  };

  return (
    <article className={`sim-questao${estado}`}>
      <span className="sim-questao__n">{numero}</span>

      <div className="sim-questao__corpo">
        {assunto && <span className="sim-questao__assunto">{assunto}</span>}

        <div className="sim-questao__enunciado">
          {renderEnunciado ? renderEnunciado(enunciado) : <Md>{String(enunciado || "")}</Md>}
        </div>

        <div className={`sim-opcoes${temAlternativas ? "" : " is-binaria"}`}>
          {temAlternativas
            ? alternativas.map((alt, i) => {
                const letra = String(alt).trim().charAt(0).toUpperCase();
                const correta = gab === letra;
                return (
                  <button
                    key={i}
                    className={classeOpcao(letra, correta)}
                    disabled={travado}
                    onClick={() => onResponder?.(letra)}
                  >
                    <span className="sim-opcao__texto"><Md inline>{String(alt)}</Md></span>
                    {mostrarGabarito && correta && <CheckCircle2 size={17} className="sim-opcao__marca" />}
                  </button>
                );
              })
            : ["C", "E"].map((letra) => {
                const correta = gab === letra;
                return (
                  <button
                    key={letra}
                    className={classeOpcao(letra, correta)}
                    disabled={travado}
                    onClick={() => onResponder?.(letra)}
                  >
                    <span className="sim-opcao__texto">{letra === "C" ? "CERTO" : "ERRADO"}</span>
                    {mostrarGabarito && correta && <CheckCircle2 size={17} className="sim-opcao__marca" />}
                  </button>
                );
              })}
        </div>

        {mostrarGabarito && (
          <div className="sim-gabarito">
            <div className={`sim-gabarito__topo${acertou ? " is-certo" : " is-errado"}`}>
              {acertou ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <b>{acertou ? "Você acertou" : "Você errou"}</b>
              <span>Gabarito: {gab}</span>
            </div>
            {explicacao && <div className="sim-gabarito__texto"><Md>{String(explicacao)}</Md></div>}
          </div>
        )}

        {children}
      </div>
    </article>
  );
}

/**
 * Convite para a aula de reforço sobre o que o aluno errou.
 * Era o bloco com as cores âmbar cravadas em hexadecimal nas seis telas.
 */
export function PainelErros({ titulo, descricao, rotuloBotao = "Gerar explicação detalhada", onGerar, carregando = false }) {
  return (
    <section className="sim-erros">
      <h4><GraduationCap size={20} /> {titulo}</h4>
      <p>{descricao}</p>
      <Button variant="primary" onClick={onGerar} disabled={carregando} icon={<Wand2 size={16} />} block>
        {carregando ? "Preparando a explicação…" : rotuloBotao}
      </Button>
    </section>
  );
}

/** Barra de resultado no fim do simulado. */
export function Placar({ acertos, total, liquida = null, children }) {
  const pct = total > 0 ? Math.round((acertos / total) * 100) : 0;
  const tom = pct >= 70 ? " is-alto" : pct < 50 ? " is-baixo" : "";
  return (
    <section className={`sim-placar${tom}`}>
      <div className="sim-placar__num"><b>{acertos}</b><span>de {total}</span></div>
      <div className="sim-placar__info">
        <b>{pct}% de acerto</b>
        {liquida !== null && <span>Pontuação líquida no padrão CEBRASPE: {liquida}</span>}
      </div>
      {children && <div className="sim-placar__acoes">{children}</div>}
    </section>
  );
}

/** Histórico por tópico — o modal que existia igual nas seis telas. */
export function HistoricoModal({ aberto, titulo, materia, stats, onFechar, onLimpar }) {
  const [confirmar, setConfirmar] = React.useState(false);
  const topicos = Object.entries(stats?.topics || {});

  return (
    <>
      <Modal open={aberto} onClose={onFechar} title={titulo} subtitle={`Desempenho acumulado em ${materia}`}>
        <div className="sim-hist">
          <div className="sim-hist__resumo">
            <div className="sim-hist__caixa">
              <b>{stats?.total ?? 0}</b><span>Julgados</span>
            </div>
            <div className="sim-hist__caixa is-ok">
              <b>{stats?.correct ?? 0}</b><span>Acertos</span>
            </div>
            <div className="sim-hist__caixa is-erro">
              <b>{stats?.wrong ?? 0}</b><span>Erros</span>
            </div>
          </div>

          <h4 className="sim-hist__titulo"><PieChart size={15} /> Desempenho por tópico</h4>

          {topicos.length === 0 ? (
            <p className="sim-hist__vazio">Nenhum item computado ainda. Responda um simulado para ver onde você erra mais.</p>
          ) : (
            <ul className="sim-hist__lista">
              {topicos.map(([nome, d]) => {
                const somaTopico = (d.correct || 0) + (d.wrong || 0);
                const pct = somaTopico > 0 ? Math.round((d.correct / somaTopico) * 100) : 0;
                const tom = pct >= 70 ? "ok" : pct < 50 ? "erro" : "atencao";
                return (
                  <li key={nome} className="sim-hist__item">
                    <span className="sim-hist__nome" title={nome}>{nome}</span>
                    <span className="sim-hist__nums">
                      <Badge tone="ok">{d.correct || 0}C</Badge>
                      <Badge tone="danger">{d.wrong || 0}E</Badge>
                      <b className={`sim-hist__pct is-${tom}`}>{pct}%</b>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {onLimpar && (
            <Button variant="danger" onClick={() => setConfirmar(true)} block>
              Limpar todo o histórico
            </Button>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmar}
        title={`Limpar o histórico de ${materia}`}
        message={`Apagar os ${stats?.total ?? 0} item(ns) já julgados e o desempenho por tópico?`}
        detail="O histórico fica guardado apenas neste navegador e não pode ser recuperado depois."
        confirmLabel="Limpar histórico"
        onConfirm={() => { onLimpar?.(); setConfirmar(false); }}
        onCancel={() => setConfirmar(false)}
      />
    </>
  );
}
