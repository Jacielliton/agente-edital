import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "./Markdown.css";

/* ==========================================================================
   Markdown da plataforma. Um lugar só: a aula, os termos-chave, o enunciado
   da questão, as alternativas e os comentários do gabarito passam por aqui.
   Antes o QuizCard usava <ReactMarkdown> cru — sem remark-gfm e sem estes
   componentes — e por isso o código do simulado saía sem bloco.
   ========================================================================== */

const PLUGINS = { remarkPlugins: [remarkGfm, remarkMath], rehypePlugins: [rehypeKatex] };

/**
 * O react-markdown deixou de passar a prop `inline` para o componente `code`
 * na v9 (o projeto está na v10). O código antigo testava `inline` e recebia
 * sempre `undefined`, então TODO trecho `assim` virava um bloco de código
 * inteiro na tela — era o que acontecia com `persistence.xml` e `META-INF`.
 *
 * A distinção correta na v10: bloco de código tem `language-*` na classe, ou
 * ocupa mais de uma linha na origem. Código inline nunca faz nem um nem outro.
 */
function ehBloco(node, className, texto) {
  if (/language-[\w-]+/.test(className || "")) return true;
  if (texto.includes("\n")) return true;
  const p = node?.position;
  return Boolean(p && p.start && p.end && p.start.line !== p.end.line);
}

export const componentesMarkdown = {
  code({ node, className, children, ...props }) {
    const texto = String(children ?? "");
    if (!ehBloco(node, className, texto)) {
      return <code className="md-inline" {...props}>{children}</code>;
    }
    const idioma = /language-([\w-]+)/.exec(className || "")?.[1] || "código";
    return (
      <div className="md-code">
        <div className="md-code__bar"><span>{idioma}</span></div>
        <pre><code>{texto.replace(/\n$/, "")}</code></pre>
      </div>
    );
  },

  // O bloco acima já devolve o seu próprio <pre>. Sem isto o resultado seria
  // um <div> dentro de um <pre>, que é HTML inválido e o React reclama.
  pre({ children }) {
    return <>{children}</>;
  },

  a({ node, children, ...props }) {
    return <a target="_blank" rel="noopener noreferrer" {...props}>{children}</a>;
  },

  table({ children, ...props }) {
    return <div className="md-table"><table {...props}>{children}</table></div>;
  },
};

const COMPONENTES_INLINE = { ...componentesMarkdown, p: "span" };

/**
 * @param {boolean} inline  Renderiza os parágrafos como <span>, para caber
 *                          dentro de uma frase (definição de termo, etc.).
 */
export default function Md({ children, inline = false }) {
  return (
    <ReactMarkdown {...PLUGINS} components={inline ? COMPONENTES_INLINE : componentesMarkdown}>
      {String(children ?? "")}
    </ReactMarkdown>
  );
}
