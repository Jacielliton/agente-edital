import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import './Mermaid.css';

/* ==========================================================================
   Saneamento do código Mermaid gerado pela IA.

   O parser do Mermaid trata "(" dentro de um rótulo como início de outra forma
   de nó. Por isso E[Fórmula: k = N / (a + b + c)] derruba o diagrama inteiro
   com "Expecting 'SQE'... got 'PS'". A saída suportada pelo próprio Mermaid é
   envolver o rótulo em aspas: E["Fórmula: k = N / (a + b + c)"].

   O prompt do backend pede isso, mas a IA erra — e as aulas já gravadas no
   banco continuam com o código antigo. Então o conserto precisa morar aqui.
   ========================================================================== */

// abertura -> fechamento. Ordem só importa para o comprimento; a escolha é
// sempre pelo token de abertura mais longo que casa.
const FORMAS = [
  ['[[', ']]'], ['[(', ')]'], ['([', '])'], ['((', '))'], ['{{', '}}'],
  ['[/', '/]'], ['[/', '\\]'], ['[\\', '\\]'], ['[\\', '/]'],
  ['[', ']'], ['(', ')'], ['{', '}'],
];

// Um nó só pode ser seguido por conector, fim de instrução, "&", ":::" ou fim
// da linha. É isso que distingue o "]" que fecha o rótulo de um "]" que faz
// parte do texto.
const DEPOIS_DO_NO = /^\s*($|;|&|:::|<?[-=~.ox]{2,}[>ox]?)/;

const ID = /^[A-Za-z0-9_À-ɏ]+/;

const DIRETIVAS = /^\s*(graph|flowchart|subgraph|end|classDef|class|style|linkStyle|click|direction|%%|accTitle|accDescr)\b/;

function citar(texto) {
  const limpo = texto.trim();
  if (!limpo) return texto;
  if (limpo.length >= 2 && limpo.startsWith('"') && limpo.endsWith('"')) return texto;
  // rótulo em markdown-string o Mermaid já trata sozinho
  if (limpo.startsWith('`') && limpo.endsWith('`')) return texto;
  return '"' + limpo.replace(/"/g, '#quot;') + '"';
}

/** Primeiro fechamento que é de fato seguido por um conector ou pelo fim da
 *  instrução. Se nenhum for, cai no mais próximo. */
function acharFechamento(linha, inicio, tokens) {
  const candidatos = [];
  for (const token of tokens) {
    let i = linha.indexOf(token, inicio);
    while (i !== -1) { candidatos.push({ fim: i, token }); i = linha.indexOf(token, i + 1); }
  }
  candidatos.sort((a, b) => a.fim - b.fim || b.token.length - a.token.length);
  for (const c of candidatos) {
    if (DEPOIS_DO_NO.test(linha.slice(c.fim + c.token.length))) return c;
  }
  return candidatos[0] || null;
}

function citarLinha(linha) {
  let saida = '';
  let i = 0;
  while (i < linha.length) {
    // rótulo de aresta: -->|texto|
    if (linha[i] === '|') {
      const fim = linha.indexOf('|', i + 1);
      if (fim !== -1) {
        saida += '|' + citar(linha.slice(i + 1, fim)) + '|';
        i = fim + 1;
        continue;
      }
    }

    const m = ID.exec(linha.slice(i));
    if (!m) { saida += linha[i]; i += 1; continue; }

    const id = m[0];
    const apos = i + id.length;
    const casam = FORMAS.filter(([abre]) => linha.startsWith(abre, apos));
    if (!casam.length) { saida += id; i = apos; continue; }

    const maior = Math.max(...casam.map(([abre]) => abre.length));
    const usaveis = casam.filter(([abre]) => abre.length === maior);
    const abre = usaveis[0][0];
    const inicio = apos + abre.length;

    const alvo = acharFechamento(linha, inicio, usaveis.map(([, fecha]) => fecha));
    if (!alvo) { saida += id; i = apos; continue; }

    saida += id + abre + citar(linha.slice(inicio, alvo.fim)) + alvo.token;
    i = alvo.fim + alvo.token.length;
  }
  return saida;
}

export function sanitizarMermaid(codigo) {
  const base = String(codigo || '')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\r\n?/g, '\n')
    .trim();

  // Só fluxogramas. Em mindmap, sequenceDiagram, gantt etc. os colchetes têm
  // outro significado e citar quebraria o diagrama.
  if (!/^(graph|flowchart)\b/i.test(base)) return base;

  return base
    .split('\n')
    .map((linha) => (!linha.trim() || DIRETIVAS.test(linha) ? linha : citarLinha(linha)))
    .join('\n');
}

/* ========================================================================== */

export default function Mermaid({ chart }) {
  const containerRef = useRef(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let cancelado = false;

    const renderizar = async () => {
      if (!containerRef.current || !chart) return;
      const alvo = containerRef.current;

      const temaEscuro = document.documentElement.classList.contains('dark');
      mermaid.initialize({
        startOnLoad: false,
        theme: temaEscuro ? 'dark' : 'default',
        securityLevel: 'loose',
        fontFamily: 'system-ui, sans-serif',
      });

      const original = String(chart).trim();
      const saneado = sanitizarMermaid(chart);

      // 1ª tentativa com o código saneado; 2ª com o original, caso o
      // saneamento tenha atrapalhado um diagrama que já estava correto.
      let ultimoErro = null;
      for (const codigo of [saneado, saneado === original ? null : original]) {
        if (!codigo) continue;
        const id = `mermaid-svg-${Math.random().toString(36).slice(2, 9)}`;
        try {
          const { svg } = await mermaid.render(id, codigo);
          if (cancelado) return;
          alvo.innerHTML = svg;
          setErro(null);
          return;
        } catch (e) {
          if (cancelado) return;
          ultimoErro = e;
          // o mermaid deixa um nó órfão no body quando a renderização falha
          document.getElementById(id)?.remove();
          document.getElementById(`d${id}`)?.remove();
        }
      }

      console.error('Mapa mental: o Mermaid recusou o código gerado pela IA.', ultimoErro);
      alvo.innerHTML = '';
      setErro(String(ultimoErro?.message || ultimoErro || 'erro desconhecido').split('\n')[0]);
    };

    renderizar();
    return () => { cancelado = true; };
  }, [chart]);

  if (erro) {
    return (
      <div className="mmd-erro">
        <b className="mmd-erro__titulo">Não foi possível desenhar este mapa mental</b>
        <p className="mmd-erro__texto">
          O diagrama que a IA gerou para este módulo tem um erro de sintaxe. O restante da aula
          não é afetado — gerar o mapa de novo costuma resolver.
        </p>
        <details className="mmd-erro__detalhe">
          <summary>Ver o código gerado</summary>
          <p className="mmd-erro__msg">{erro}</p>
          <pre>{chart}</pre>
        </details>
      </div>
    );
  }

  return <div ref={containerRef} className="mmd" />;
}
