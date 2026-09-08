import React from "react";
import { Link } from "react-router-dom";
import {
  PenTool, Brain, Calculator, FileText, Scale, Type, Coffee,
  Gavel, GitCompare, Layers, ArrowRight,
} from "lucide-react";
import { PageHeader, Badge } from "../components/ui";
import "./Ferramentas.css";

/* A lista é declarativa de propósito: antes, cada cartão era um <Link> com o
   mesmo bloco de estilo inline copiado, e acrescentar uma ferramenta significava
   duplicar trinta linhas. */
const GRUPOS = [
  {
    titulo: "Treino por matéria",
    descricao: "Simuladores que geram questões inéditas no padrão da sua banca.",
    itens: [
      { to: "/gabarite-cespe", icone: Brain, nome: "Português CESPE",
        texto: "Questões inéditas no padrão CEBRASPE, com texto-base e análise item a item." },
      { to: "/gabarite-logica", icone: Calculator, nome: "Raciocínio Lógico",
        texto: "Tabelas-verdade, negações e equivalências, com resolução passo a passo." },
      { to: "/gabarite-sintaxe", icone: FileText, nome: "Sintaxe",
        texto: "Teoria gramatical e simulados de múltipla escolha com as pegadinhas da banca." },
      { to: "/gabarite-direito", icone: Scale, nome: "Noções de Direito",
        texto: "Casos de Constitucional, Penal, Processual Penal e Administrativo, na lei seca e no entendimento dos tribunais." },
      { to: "/gabarite-ingles", icone: Type, nome: "Inglês",
        texto: "Compreensão textual, vocabulário e coesão pronominal, com tradução por clique." },
      { to: "/gabarite-java", icone: Coffee, nome: "Java",
        texto: "POO, Streams, Coleções e JPA com trechos de código e cenários de editais de TI." },
    ],
  },
  {
    titulo: "Memorizar e revisar",
    descricao: "Para o que precisa ficar na ponta da língua até o dia da prova.",
    novo: true,
    itens: [
      { to: "/lei-seca", icone: Gavel, nome: "Lei Seca em Lacunas",
        texto: "A IA apaga do artigo exatamente as palavras que a banca troca — deverá, até, salvo, no mínimo — e você escreve de volta." },
      { to: "/baralho", icone: Layers, nome: "Baralho do Edital",
        texto: "Os termos-chave das suas aulas viram cartas. O que você erra volta antes do que acerta." },
    ],
  },
  {
    titulo: "Entender a prova",
    descricao: "Como a sua banca cobra, e como escrever o que ela espera.",
    itens: [
      { to: "/comparador-bancas", icone: GitCompare, nome: "Comparador de Bancas", novo: true,
        texto: "O mesmo ponto do mesmo tema, do jeito de duas ou três bancas, lado a lado — com a manobra que cada uma usou." },
      { to: "/treino", icone: PenTool, nome: "Simulador de Discursivas",
        texto: "Cenários inéditos por banca e cargo, com correção que aponta onde a sua resposta perderia pontos." },
    ],
  },
];

export default function Ferramentas() {
  return (
    <div className="fer">
      <PageHeader
        eyebrow="Ferramentas"
        title="Central de ferramentas"
        description="Dez ferramentas de IA em volta de um edital só. Nenhuma delas devolve questão de banco: tudo é gerado a partir do que o seu concurso cobra."
      />

      {GRUPOS.map((grupo) => (
        <section key={grupo.titulo} className="fer__grupo">
          <header className="fer__grupo-topo">
            <h2>
              {grupo.titulo}
              {grupo.novo && <Badge tone="accent">novo</Badge>}
            </h2>
            <p>{grupo.descricao}</p>
          </header>

          <div className="fer__grade">
            {grupo.itens.map(({ to, icone: Icone, nome, texto, novo }) => (
              <Link key={to} to={to} className="fer__card">
                <span className="fer__card-icone"><Icone size={22} /></span>
                <h3>
                  {nome}
                  {novo && <Badge tone="accent">novo</Badge>}
                </h3>
                <p>{texto}</p>
                <span className="fer__card-ir">Abrir <ArrowRight size={14} /></span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
