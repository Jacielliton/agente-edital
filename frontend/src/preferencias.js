/* =========================================================================
   Preferencias de apresentacao (tema e tamanho da letra).

   Ficam FORA do React e sao aplicadas antes da primeira renderizacao: se
   esperassem um componente montar, a tela piscaria no tema errado e no
   tamanho errado a cada carregamento — inclusive no login, que nem passa
   pelo AppShell.
   ========================================================================= */

const CHAVE_TEMA = "theme";
const CHAVE_ESCALA = "escala_fonte";

/* A escala mexe no font-size da RAIZ, em porcentagem, e nao em pixel:
   assim ela multiplica o tamanho que a pessoa ja escolheu no navegador em
   vez de substitui-lo. Todos os tokens de texto sao rem, entao o site
   inteiro acompanha. */
export const ESCALAS = [
  { id: "padrao", rotulo: "A", aria: "Tamanho de letra padrão", valor: 100 },
  { id: "maior", rotulo: "A", aria: "Letra maior", valor: 112.5 },
  { id: "maximo", rotulo: "A", aria: "Letra máxima", valor: 125 },
];

const guardar = (chave, valor) => {
  try { localStorage.setItem(chave, valor); } catch (e) { /* modo privado */ }
};
const ler = (chave) => {
  try { return localStorage.getItem(chave); } catch (e) { return null; }
};

export function lerEscala() {
  const salva = ler(CHAVE_ESCALA);
  return ESCALAS.some((e) => e.id === salva) ? salva : "padrao";
}

export function aplicarEscala(id) {
  const escala = ESCALAS.find((e) => e.id === id) || ESCALAS[0];
  document.documentElement.style.fontSize = `${escala.valor}%`;
  guardar(CHAVE_ESCALA, escala.id);
}

export function lerTema() {
  return ler(CHAVE_TEMA) === "dark";
}

export function aplicarTema(escuro) {
  document.documentElement.classList.toggle("dark", escuro);
  guardar(CHAVE_TEMA, escuro ? "dark" : "light");
}

/* Chamado uma vez no main.jsx, antes do createRoot. */
export function aplicarPreferenciasSalvas() {
  aplicarTema(lerTema());
  aplicarEscala(lerEscala());
}
