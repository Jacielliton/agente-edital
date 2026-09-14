/* =========================================================================
   Como ler um lançamento do extrato de comissão.

   POR QUE ISTO EXISTE
   -------------------
   Em 13/09/2026 a coluna `amount` do extrato mudou de significado. Antes ela
   queria dizer duas coisas diferentes:

       pagamento  ->  o valor PAGO      (positivo)
       ajuste     ->  o saldo RESULTANTE (positivo)
       ganho      ->  o valor da comissão (positivo)

   Um extrato com duas unidades na mesma coluna não fecha conta nenhuma, e um
   ajuste que zerava R$ 400 gravava amount=0 — igual a um ajuste que não mudou
   nada. Agora `amount` é SEMPRE a variação do saldo, negativa quando cai, e o
   lançamento guarda `saldo_anterior` e `saldo_novo`.

   O PROBLEMA QUE ISTO RESOLVE
   ---------------------------
   As duas telas que mostram o extrato — a do assinante (Profile) e a do
   administrador (AdminPanel) — escreviam o sinal na mão:

       {saida ? "−" : "+"} {brl(item.amount)}

   Com `amount` já negativo, um pagamento passaria a aparecer como
   "− -R$ 50,00". E os lançamentos ANTIGOS, que continuam no banco no formato
   velho, precisam continuar sendo lidos do jeito velho — senão um pagamento
   de ontem viraria uma entrada de dinheiro na tela.

   Daí esta função: ela olha `saldo_novo` para saber em que formato o
   lançamento foi gravado, e devolve algo que a tela só precisa desenhar.
   ========================================================================= */

/**
 * @returns {{
 *   tipo: "entrada" | "saida" | "saldo-definido",
 *   valor: number,        // sempre positivo; o sinal vem do `tipo`
 *   saldoNovo: number|null,
 *   completo: boolean     // false = lançamento antigo, sem antes/depois
 * }}
 */
export function lerLancamento(item) {
  const bruto = Number(item?.amount) || 0;
  const temSaldo = item?.saldo_novo !== null && item?.saldo_novo !== undefined;

  // Formato novo: o próprio número diz se entrou ou saiu.
  if (temSaldo) {
    return {
      tipo: bruto < 0 ? "saida" : "entrada",
      valor: Math.abs(bruto),
      saldoNovo: Number(item.saldo_novo),
      completo: true,
    };
  }

  // Formato antigo, ainda no banco.
  if (item?.action_type === "pagamento") {
    return { tipo: "saida", valor: Math.abs(bruto), saldoNovo: null, completo: false };
  }
  if (item?.action_type === "ajuste") {
    // Aqui `amount` era o saldo resultante, não uma movimentação. Mostrar
    // "+R$ 400,00" seria inventar uma entrada que nunca existiu.
    return { tipo: "saldo-definido", valor: Math.abs(bruto), saldoNovo: null, completo: false };
  }
  return { tipo: "entrada", valor: Math.abs(bruto), saldoNovo: null, completo: false };
}

/** O sinal que vai na frente do valor. "saldo-definido" não tem sinal. */
export function sinalDe(tipo) {
  if (tipo === "saida") return "−";
  if (tipo === "entrada") return "+";
  return "";
}

/** Texto do `title`, para quem quiser conferir a conta passando o mouse. */
export function detalheDoLancamento(item, brl) {
  const l = lerLancamento(item);
  if (l.completo) {
    return `Saldo: ${brl(item.saldo_anterior)} → ${brl(item.saldo_novo)}`;
  }
  if (l.tipo === "saldo-definido") {
    return `Lançamento antigo: o saldo foi definido para ${brl(l.valor)}. O antes não foi registrado.`;
  }
  return "Lançamento antigo: o saldo resultante não foi registrado.";
}
