import React, { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, CheckCircle2, ChevronDown, X, Info,
} from "lucide-react";
import "./ui.css";

const cx = (...parts) => parts.filter(Boolean).join(" ");

/* ------------------------------------------------------------------ Button
   Renderiza <button>, <a> ou <Link> conforme as props recebidas.        */
export function Button({
  variant = "default",   // default | primary | ghost | danger
  size = "md",           // sm | md | lg
  block = false,
  to,
  href,
  icon = null,
  children,
  className,
  ...rest
}) {
  const cls = cx(
    "ui-btn",
    variant !== "default" && `ui-btn--${variant}`,
    size !== "md" && `ui-btn--${size}`,
    block && "ui-btn--block",
    className
  );

  const content = (
    <>
      {icon}
      {children}
    </>
  );

  if (to) return <Link to={to} className={cls} {...rest}>{content}</Link>;
  if (href) return <a href={href} className={cls} {...rest}>{content}</a>;
  return <button className={cls} {...rest}>{content}</button>;
}

/* -------------------------------------------------------------------- Card */
export function Card({ raised = false, pad = false, className, children, ...rest }) {
  return (
    <div
      className={cx("ui-card", raised && "ui-card--raised", pad && "ui-card--pad", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHead({ title, action = null, children }) {
  return (
    <div className="ui-card__head">
      {children || <h3>{title}</h3>}
      {action}
    </div>
  );
}

export function CardBody({ className, children, ...rest }) {
  return <div className={cx("ui-card__body", className)} {...rest}>{children}</div>;
}

/* ------------------------------------------------------------------- Badge */
export function Badge({ tone = "default", outline = false, icon = null, children, className }) {
  return (
    <span className={cx("ui-badge", tone !== "default" && `ui-badge--${tone}`, outline && "ui-badge--outline", className)}>
      {icon}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------- Input */
export function Input({ label, icon = null, className, ...rest }) {
  const field = icon ? (
    <span className="ui-input-wrap">
      {icon}
      <input className={cx("ui-input", "ui-input--icon", className)} {...rest} />
    </span>
  ) : (
    <input className={cx("ui-input", className)} {...rest} />
  );

  if (!label) return field;
  return (
    <label className="ui-field">
      <span className="ui-field__label">{label}</span>
      {field}
    </label>
  );
}

/* ------------------------------------------------------------------ Select
   Herda a caixa do Input. Existia como `<select className="select">` do CSS
   legado ao lado de `<Input>` do sistema novo, na mesma tela.               */
export function Select({ label, className, children, ...rest }) {
  const campo = (
    <span className="ui-select">
      <select className={cx("ui-input", className)} {...rest}>{children}</select>
      <ChevronDown size={15} aria-hidden="true" />
    </span>
  );
  if (!label) return campo;
  return (
    <label className="ui-field">
      <span className="ui-field__label">{label}</span>
      {campo}
    </label>
  );
}

/* ---------------------------------------------------------------- Textarea */
export function Textarea({ label, hint, className, ...rest }) {
  const campo = <textarea className={cx("ui-textarea", className)} {...rest} />;
  if (!label) return campo;
  return (
    <label className="ui-field">
      <span className="ui-field__label">{label}</span>
      {hint && <span className="ui-field__hint">{hint}</span>}
      {campo}
    </label>
  );
}

/* -------------------------------------------------------------------- Tabs
   `itens` e uma lista de { id, rotulo, icone? }; o conteudo fica por conta de
   quem chama. Semantica de tablist, para o leitor de tela anunciar as abas.  */
/* Move o foco com as setas dentro de um grupo de botoes (aba ou segmento).
   E o que o teclado espera de tablist e de radiogroup: Tab entra e sai do
   grupo inteiro, as setas andam de opcao em opcao. */
function navegarComSetas(e, ids, atual, escolher) {
  const passo = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  let alvo = null;
  if (passo) alvo = ids[(ids.indexOf(atual) + passo + ids.length) % ids.length];
  else if (e.key === "Home") alvo = ids[0];
  else if (e.key === "End") alvo = ids[ids.length - 1];
  if (!alvo) return;
  e.preventDefault();
  escolher(alvo);
  e.currentTarget.parentElement?.querySelector(`[data-id="${alvo}"]`)?.focus();
}

export function Tabs({ itens = [], ativo, onTrocar, aria = "Seções", variante = "cheia", idBase }) {
  const auto = useId();
  const base = idBase || auto;
  const ids = itens.map((i) => i.id);
  return (
    <div className={cx("ui-tabs", variante === "linha" && "ui-tabs--linha")} role="tablist" aria-label={aria}>
      {itens.map(({ id, rotulo, icone: Icone }) => (
        <button
          key={id}
          id={`${base}-aba-${id}`}
          data-id={id}
          role="tab"
          type="button"
          aria-selected={ativo === id}
          aria-controls={`${base}-painel-${id}`}
          /* Só a aba ativa fica no caminho do Tab; as outras se alcançam
             pelas setas. Sem isso o Tab visita uma aba de cada vez. */
          tabIndex={ativo === id ? 0 : -1}
          className={cx("ui-tab", ativo === id && "is-on")}
          onClick={() => onTrocar?.(id)}
          onKeyDown={(e) => navegarComSetas(e, ids, ativo, (alvo) => onTrocar?.(alvo))}
        >
          {Icone && <Icone size={16} />}
          {rotulo}
        </button>
      ))}
    </div>
  );
}

/* O painel que a aba controla. Sem ele o role="tab" mente: aria-controls
   aponta para nada e o leitor de tela nao sabe o que a aba abriu. */
export function TabPanel({ id, idBase, className, children }) {
  return (
    <div
      id={`${idBase}-painel-${id}`}
      role="tabpanel"
      aria-labelledby={`${idBase}-aba-${id}`}
      tabIndex={0}
      className={cx("ui-tabpanel", className)}
    >
      {children}
    </div>
  );
}

/* --------------------------------------------------- SegmentedControl
   Escolhe UM valor entre poucos, sem trocar de painel — por isso e
   radiogroup, e nao tablist. O de pilula que existia na Lei Seca dizia
   role="tab" sem ter tabpanel nenhum do outro lado.                    */
export function SegmentedControl({ itens = [], valor, onTrocar, aria = "Opções", className }) {
  const ids = itens.map((i) => i.id);
  return (
    <div className={cx("ui-seg", className)} role="radiogroup" aria-label={aria}>
      {itens.map(({ id, rotulo, icone: Icone, aria: ariaItem }) => (
        <button
          key={id}
          data-id={id}
          type="button"
          role="radio"
          /* Quando o rotulo visivel nao basta (tres "A" de tamanhos
             diferentes, por exemplo), o item traz o seu proprio aria. */
          aria-label={ariaItem}
          aria-checked={valor === id}
          tabIndex={valor === id ? 0 : -1}
          className={cx("ui-seg__item", valor === id && "is-on")}
          onClick={() => onTrocar?.(id)}
          onKeyDown={(e) => navegarComSetas(e, ids, valor, (alvo) => onTrocar?.(alvo))}
        >
          {Icone && <Icone size={14} />}
          {rotulo}
        </button>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------- Tooltip
   Aparece no hover E no foco: um tooltip so de hover nao existe para
   quem navega por teclado. Vai por aria-describedby, nao pelo atributo
   title do HTML, que nao aparece no toque e demora ~1s no desktop.    */
export function Tooltip({ texto, lado = "cima", children, className }) {
  const id = useId();
  const [aberto, setAberto] = useState(false);
  if (!texto) return <>{children}</>;
  return (
    <span
      className={cx("ui-tip", `ui-tip--${lado}`, className)}
      onMouseEnter={() => setAberto(true)}
      onMouseLeave={() => setAberto(false)}
      onFocus={() => setAberto(true)}
      onBlur={() => setAberto(false)}
      /* Esc fecha: e a saida esperada de qualquer coisa que sobrepoe. */
      onKeyDown={(e) => e.key === "Escape" && setAberto(false)}
    >
      {React.isValidElement(children)
        ? React.cloneElement(children, { "aria-describedby": aberto ? id : undefined })
        : children}
      <span className="ui-tip__balao" role="tooltip" id={id} hidden={!aberto}>
        {texto}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------- Table
   Tabela larga rola dentro da propria caixa: a pagina nunca rola na
   horizontal por causa dela.                                                */
export function Table({ className, children, ...rest }) {
  return (
    <div className="ui-table">
      <table className={className} {...rest}>{children}</table>
    </div>
  );
}

/* -------------------------------------------------------------- ProgressBar */
export function ProgressBar({ value = 0, color, "aria-label": ariaLabel }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div
      className="ui-progress"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
    >
      <i style={{ width: `${pct}%`, ...(color ? { background: color } : null) }} />
    </div>
  );
}

/* ---------------------------------------------------------------- StatCard */
export function StatCard({ label, value, textValue = false, delta, deltaTone = "flat", icon = null, spark = null }) {
  return (
    <div className="ui-stat">
      <span className="ui-stat__label">{label}</span>
      <span className={cx("ui-stat__value", textValue && "ui-stat__value--text")}>{value}</span>
      {spark && spark.length > 0 && (
        <span className="ui-spark" aria-hidden="true">
          {spark.map((h, i) => (
            <i
              key={i}
              className={i === spark.length - 1 ? "is-last" : undefined}
              style={{ height: `${Math.max(6, Math.min(100, h))}%` }}
            />
          ))}
        </span>
      )}
      {delta && (
        <span className={cx("ui-stat__delta", deltaTone !== "flat" && `ui-stat__delta--${deltaTone}`)}>
          {icon}
          {delta}
        </span>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- EmptyState */
export function EmptyState({ icon = null, title, description, action = null }) {
  return (
    <div className="ui-empty">
      {icon && <span className="ui-empty__icon">{icon}</span>}
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

/* ---------------------------------------------------------------- Skeleton */
export function Skeleton({ width = "100%", height = 16, radius, style }) {
  return (
    <span
      className="ui-skel"
      style={{
        display: "block",
        width,
        height: typeof height === "number" ? `${height}px` : height,
        ...(radius ? { borderRadius: radius } : null),
        ...style,
      }}
    />
  );
}

/* -------------------------------------------------------------- PageHeader */
export function PageHeader({ eyebrow, title, description, actions = null }) {
  return (
    <div className="ui-pagehead">
      <div style={{ minWidth: 0 }}>
        {eyebrow && <div className="ui-pagehead__eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="ui-pagehead__actions">{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------- Modal
   Fecha com Esc e com clique no fundo. Substitui os modais montados a mao
   espalhados pelas telas.

   O FOCO (corrigido em 13/09/2026)
   --------------------------------
   Medido no navegador ANTES desta correcao, com a confirmacao do painel
   admin aberta:

     focoFoiParaODialogo: false     ->  o foco ficava no <body>
     9 de 14 Tabs caiam ATRAS do modal, com 81 focaveis alcancaveis la

   Na pratica: quem usa teclado abria "Excluir conta" e tinha de percorrer a
   barra lateral inteira — 23 elementos — para alcancar o botao Cancelar. E o
   aria-modal="true" afirmava ao leitor de tela que o resto da pagina estava
   inerte, o que nao era verdade. A promessa e o comportamento discordavam.

   O modal de formulario disfarcava o problema porque o primeiro <input> tem
   autoFocus. O ConfirmDialog nao tem campo nenhum — e e justamente ele que
   guarda as acoes irreversiveis.

   Agora: ao abrir, o foco ENTRA no dialogo; o Tab CIRCULA dentro dele; ao
   fechar, o foco VOLTA para o elemento que o abriu.                        */

/* Quem tinha o foco ANTES de qualquer dialogo abrir.

   Nao da para descobrir isso de dentro do Modal: o autoFocus do React roda
   na fase de commit, ANTES do useEffect. Quando o efeito do Modal olha para
   document.activeElement, o campo do proprio modal ja se focou — e foi
   exatamente o que aconteceu na primeira tentativa desta correcao: o modal
   guardava a si mesmo como "origem", e ao fechar tentava devolver o foco a
   um no que tinha acabado de sumir.

   Por isso a anotacao e continua e fica FORA do componente: todo foco que
   cai em algo que nao esta dentro de um dialogo vira o ponto de retorno.  */
let ultimoFocoForaDeDialogo = null;
if (typeof document !== "undefined") {
  document.addEventListener(
    "focusin",
    (e) => {
      const alvo = e.target;
      if (alvo && alvo !== document.body && !alvo.closest?.("[role='dialog']")) {
        ultimoFocoForaDeDialogo = alvo;
      }
    },
    true
  );
}

const FOCAVEIS = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function Modal({ open, onClose, title, subtitle, wide = false, footer = null, children }) {
  const caixa = useRef(null);
  const tituloId = useId();

  /* Entra ao abrir, volta ao fechar.

     O "volta ao fechar" tem uma armadilha que so apareceu ao medir: ao abrir
     o dialogo, o React re-renderiza a tela de tras e o botao que o abriu
     PODE DEIXAR DE EXISTIR (medido: `botaoAindaNoDom: false` logo apos o
     clique, na tabela do painel admin). Guardar so a referencia ao elemento
     nao basta — ela aponta para um no morto. Por isso guardamos tambem o
     aria-label, que aqui nomeia a conta, para reencontrar o botao novo; e,
     se nem ele existir mais (a acao excluiu a linha), o foco vai para o
     <main>, nao para lugar nenhum.                                        */
  useEffect(() => {
    if (!open) return undefined;
    const veioDe = ultimoFocoForaDeDialogo;
    const rotuloDeOrigem = veioDe ? veioDe.getAttribute?.("aria-label") : null;

    const quadro = requestAnimationFrame(() => {
      const el = caixa.current;
      if (!el) return;
      // Se algum campo ja se focou sozinho (autoFocus), respeita a escolha dele.
      if (el.contains(document.activeElement)) return;
      // data-foco-inicial marca o destino seguro (no ConfirmDialog, o Cancelar).
      const preferido = el.querySelector("[data-foco-inicial]:not([disabled])");
      (preferido || el).focus();
    });

    return () => {
      cancelAnimationFrame(quadro);
      // Espera a tela de tras terminar de se redesenhar antes de procurar
      // o destino — senao o botao novo ainda nao esta no DOM.
      requestAnimationFrame(() => {
        if (veioDe && veioDe.isConnected && typeof veioDe.focus === "function") {
          veioDe.focus();
          if (document.activeElement === veioDe) return;
        }
        if (rotuloDeOrigem) {
          const novo = [...document.querySelectorAll("[aria-label]")].find(
            (el) => el.getAttribute("aria-label") === rotuloDeOrigem && el.offsetParent !== null
          );
          if (novo) { novo.focus(); if (document.activeElement === novo) return; }
        }
        // Ultimo recurso: devolve o foco ao conteudo da pagina. Melhor do que
        // o <body>, onde o proximo Tab recomeca do topo do documento.
        const principal = document.querySelector("main");
        if (principal) {
          if (!principal.hasAttribute("tabindex")) principal.setAttribute("tabindex", "-1");
          principal.focus();
        }
      });
    };
  }, [open]);

  /* Esc fecha; Tab circula dentro do dialogo. */
  useEffect(() => {
    if (!open) return undefined;

    const onKey = (e) => {
      if (e.key === "Escape") { onClose?.(); return; }
      if (e.key !== "Tab") return;

      const el = caixa.current;
      if (!el) return;

      const itens = [...el.querySelectorAll(FOCAVEIS)].filter(
        (n) => n.offsetParent !== null || getComputedStyle(n).position === "fixed"
      );
      if (!itens.length) { e.preventDefault(); el.focus(); return; }

      const primeiro = itens[0];
      const ultimo = itens[itens.length - 1];
      const atual = document.activeElement;

      if (!el.contains(atual)) {                       // fugiu: traz de volta
        e.preventDefault();
        (e.shiftKey ? ultimo : primeiro).focus();
      } else if (e.shiftKey && (atual === primeiro || atual === el)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && atual === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="ui-overlay" onClick={onClose} role="presentation">
      <div
        ref={caixa}
        className={cx("ui-modal", wide && "ui-modal--wide")}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        /* aria-labelledby em vez de aria-label: o titulo as vezes chega como
           elemento React (<>Excluir a conta de <b>x</b>?</>), e nesse caso o
           aria-label antigo virava undefined — o dialogo ficava sem nome. */
        aria-labelledby={tituloId}
        tabIndex={-1}
      >
        <div className="ui-modal__head">
          <div style={{ minWidth: 0 }}>
            <h3 id={tituloId}>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="ui-btn ui-btn--ghost ui-btn--sm" onClick={onClose} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        <div className="ui-modal__body">{children}</div>
        {footer && <div className="ui-modal__foot">{footer}</div>}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- ConfirmDialog
   Confirmacao de acao destrutiva. Sempre nomeia o que sera afetado — um
   window.confirm generico ("Tem certeza?") nao da essa informacao.         */
export function ConfirmDialog({
  open,
  title = "Confirmar ação",
  message,
  detail = null,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  danger = true,
  loading = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal
      open={open}
      onClose={loading ? () => {} : onCancel}
      title={title}
      footer={
        <>
          {/* data-foco-inicial: ao abrir, o foco vai para o CANCELAR — nunca
              para o botao que executa. Um Enter apressado nao exclui nada. */}
          <Button onClick={onCancel} disabled={loading} data-foco-inicial>{cancelLabel}</Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={loading}>
            {loading ? "Aguarde…" : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="ui-confirm">
        <span className={cx("ui-confirm__icon", !danger && "ui-confirm__icon--neutral")}>
          <AlertTriangle size={20} />
        </span>
        <div>
          <p>{message}</p>
          {detail && <p>{detail}</p>}
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ Notice
   Mensagem inline de resultado. Ocupa o lugar dos alert() nativos.         */
const ICONES_NOTICE = { ok: CheckCircle2, err: AlertTriangle, warn: AlertTriangle, info: Info };

/* ---------------------------------------------------------------- Toast
   O mesmo aviso do Notice, mas ancorado no rodape da janela. Estava copiado
   como <div style={{position:'fixed', left:'50%', ...}}> em oito arquivos —
   e em mais tres como uma classe `__toast` propria de cada folha.            */
export function Toast({ aviso, onFechar }) {
  if (!aviso) return null;
  return (
    <div className="ui-toast" role="status" aria-live="polite">
      <Notice tone={aviso.tone} onClose={onFechar}>{aviso.texto}</Notice>
    </div>
  );
}

export function Notice({ tone = "info", children, onClose }) {
  const Icon = ICONES_NOTICE[tone] || Info;
  return (
    <div className={cx("ui-notice", `ui-notice--${tone}`)} role={tone === "err" ? "alert" : "status"}>
      <Icon size={17} />
      <span className="ui-notice__text">{children}</span>
      {onClose && (
        <button className="ui-notice__close" onClick={onClose} aria-label="Dispensar aviso">
          <X size={15} />
        </button>
      )}
    </div>
  );
}
