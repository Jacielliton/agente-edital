/* =========================================================================
   Registro de desempenho das ferramentas por matéria.

   POR QUE ISTO EXISTE
   -------------------
   Levantamento de 13/09/2026: das dez ferramentas, só duas gravavam desempenho
   no servidor — o simulado dentro da aula (`LessonContent`) e o treino
   discursivo. As seis ferramentas por matéria guardavam tudo em `localStorage`,
   em chaves separadas (`cespe_logica_stats`, `cespe_portugues_stats`, …).

   Na prática: o aluno resolvia 200 questões de Português CESPE e a taxa de
   acerto, o ranking e o "ponto fraco" do painel não se mexiam — porque
   `/performance/me` nunca soube que aquilo aconteceu. E tudo sumia ao limpar o
   navegador, sem acompanhar quem estuda no celular e no computador.

   O `localStorage` continua: ele alimenta o painel de estatísticas local de
   cada ferramenta, que é instantâneo. O que muda é que agora o resultado da
   sessão TAMBÉM vai para o servidor.

   O TEMA É A PEÇA IMPORTANTE
   --------------------------
   O painel agrupa o histórico por `tema` para achar o ponto fraco, e só
   considera temas com pelo menos 5 questões (`maxima >= 5`). Então o tema
   precisa ser:

     - estável   — senão cada sessão vira um tema novo e nada acumula;
     - específico — "Português CESPE" inteiro não diz onde treinar;
     - legível   — ele aparece na tela como "seu ponto fraco".

   Daí o formato "Matéria · Foco", montado a partir dos mapas abaixo. Os rótulos
   vêm dos próprios <select> de cada ferramenta, sem as estrelinhas de
   frequência (⭐) que não fazem sentido num painel.

   Estes mapas são, de propósito, a semente da configuração por matéria que vai
   unificar as seis telas num componente só.
   ========================================================================= */

import { getAuthToken } from "./components/AiKeyConfig";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

/** Cada ferramenta: o nome que aparece no painel e os focos que ela oferece. */
export const MATERIAS = {
  cespe: {
    nome: "Português CESPE",
    focos: {
      completo: "Interpretação e Gramática",
      interpretacao: "Compreensão e inferência textual",
      generos: "Tipos e gêneros textuais",
      ortografia: "Ortografia oficial",
      gramatica: "Morfossintaxe, regência e crase",
      verbos: "Tempos e modos verbais",
      pontuacao: "Pontuação e colocação pronominal",
      reescrita: "Reescrita e conectivos",
      semantica: "Relações semânticas e coesão",
      hardcore: "Extrapolação e pegadinhas de linha",
    },
  },
  logica: {
    nome: "Raciocínio Lógico",
    focos: {
      completo: "Completo",
      negacao: "Negação lógica",
      condicional: "Condicional (se… então)",
      equivalencia: "Equivalência lógica",
      diagramas: "Diagramas lógicos",
      argumentacao: "Argumentação lógica",
      primeira_ordem: "Lógica de primeira ordem",
      geometria_matricial: "Problemas geométricos e matriciais",
      probabilidade: "Probabilidade",
      combinatoria: "Análise combinatória",
      sequencias: "Sequências lógicas",
    },
  },
  ingles: {
    nome: "Inglês",
    focos: {
      completo: "Completo",
      compreensao: "Compreensão de textos",
      vocabulario: "Itens gramaticais e vocabulário",
      coesao: "Coesão e referência pronominal",
    },
  },
  java: {
    nome: "Java",
    focos: {
      completo: "Completo",
      sintaxe: "Sintaxe e tipos de dados",
      poo: "Orientação a objetos",
      modificadores: "Modificadores (static/final)",
      colecoes: "Coleções e generics",
      streams: "Streams e lambdas",
      excecoes: "Tratamento de exceções",
      jpa: "JPA e Hibernate",
      gof: "Padrões de projeto GoF",
    },
  },
  // Estas duas não têm seletor de foco: o tópico vem da lista de tópicos que o
  // aluno escolhe (`currentTopic.title`), e chega aqui já como texto.
  sintaxe: { nome: "Sintaxe", focos: {} },
  direito: { nome: "Noções de Direito", focos: {} },
};

/** Os níveis de dificuldade, com o mesmo nome em todas as ferramentas. */
export const NIVEIS = {
  facil: "Fácil",
  medio: "Médio",
  dificil: "Difícil",
  avancado: "Avançado",
  hardcore: "Hardcore",
};

/** "logica" + "negacao" -> "Raciocínio Lógico · Negação lógica". */
export function temaDe(ferramenta, foco) {
  const materia = MATERIAS[ferramenta];
  const nome = materia?.nome || ferramenta;
  const bruto = (foco || "").trim();
  if (!bruto) return `${nome} · Geral`;

  // Foco conhecido (vem de um <select>): usa o rótulo do mapa.
  const rotulo = materia?.focos?.[bruto];
  if (rotulo) return `${nome} · ${rotulo}`;

  // Tópico livre (Sintaxe e Direito): já vem escrito por extenso. Corta o que
  // for longo demais para caber no cartão do painel sem virar um parágrafo.
  const limpo = bruto.replace(/\s+/g, " ");
  return `${nome} · ${limpo.length > 60 ? limpo.slice(0, 57) + "…" : limpo}`;
}

export function nivelDe(chave) {
  return NIVEIS[chave] || (chave ? String(chave) : null);
}

/**
 * Grava o resultado de uma sessão de simulado no servidor.
 *
 * Nunca lança: registrar desempenho não pode derrubar a correção da prova na
 * cara do aluno. Falhou, vai para o console e a vida segue.
 *
 * @returns {Promise<boolean>} true se o servidor confirmou.
 */
export async function registrarSimulado({
  ferramenta,
  foco,
  acertos,
  respondidas,
  nivel = null,
  formato = null,
  banca = null,
}) {
  // Sessão sem nenhuma questão respondida não é desempenho, é desistência.
  if (!respondidas || respondidas < 1) return false;

  const token = getAuthToken();
  if (!token) return false;

  try {
    const res = await fetch(`${API_URL}/performance`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        tipo: "simulado",
        tema: temaDe(ferramenta, foco),
        nota_obtida: Number(acertos) || 0,
        nota_maxima: Number(respondidas),
        nivel: nivelDe(nivel),
        formato: formato || null,
        concurso: banca || null,
        // Cada sessão é um caderno inédito: acumula, não substitui a anterior.
        substituir: false,
      }),
    });
    if (!res.ok) {
      console.error("Desempenho não registrado: o servidor respondeu", res.status);
      return false;
    }
    return true;
  } catch (e) {
    console.error("Desempenho não registrado:", e);
    return false;
  }
}
