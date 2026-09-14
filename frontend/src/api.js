/* =========================================================================
   Uma chamada de API que diz a VERDADE sobre o que deu errado.

   POR QUE ISTO EXISTE
   -------------------
   O login tinha um `try` em volta do fetch e dois desfechos: ou entrava, ou
   jogava "Email ou senha inválidos.". Consequência medida no navegador em
   13/09/2026:

     servidor fora do ar   -> a tela mostrava "Failed to fetch" (erro cru do
                              navegador, em inglês)
     erro 500 no servidor  -> "Email ou senha inválidos." — ou seja, o site
                              acusava o usuário de errar a senha enquanto o
                              problema era o banco de dados
     conta bloqueada       -> "Email ou senha inválidos."
     senha errada          -> "Email ou senha inválidos."  (o único certo)

   Isso não é detalhe de texto: quem tenta entrar e é informado de que a senha
   está errada troca a senha, tenta de novo, e abre chamado dizendo que a conta
   foi invadida. O diagnóstico errado sai caro no suporte.

   Aqui cada situação vira um CÓDIGO na origem, e a tela traduz o código.
   ========================================================================= */

/** Erro de API com um código estável para a interface decidir o que mostrar. */
export class ErroDeApi extends Error {
  constructor(codigo, detalhe = "", status = 0) {
    super(codigo);
    this.name = "ErroDeApi";
    this.codigo = codigo;
    this.detalhe = detalhe; // o texto que o backend mandou, quando mandou
    this.status = status;
  }
}

const MENSAGENS = {
  SEM_CONEXAO:
    "Não consegui falar com o servidor. Verifique a sua conexão — se ela está boa, o site pode estar fora do ar por alguns instantes.",
  ERRO_NO_SERVIDOR:
    "O servidor teve um problema ao processar o pedido. Não é a sua senha. Tente de novo em instantes.",
  MUITAS_TENTATIVAS:
    "Muitas tentativas seguidas. Aguarde alguns minutos antes de tentar de novo.",
  CONTA_BLOQUEADA:
    "Esta conta está desativada. Fale com o suporte para reativá-la.",
  CONTA_EXPIRADA:
    "O seu período de acesso terminou. Renove para voltar a usar a plataforma.",
  CONFLITO_DE_SESSAO:
    "A sua conta foi aberta em outro dispositivo. Por segurança, esta sessão foi encerrada.",
  CREDENCIAIS_INVALIDAS: "E-mail ou senha incorretos.",
  RESPOSTA_ILEGIVEL:
    "O servidor respondeu em um formato que não consegui ler. Tente de novo; se persistir, avise o suporte.",
};

/** Traduz um erro (de qualquer origem) para uma frase em português. */
export function textoDoErro(erro) {
  if (!erro) return "Algo deu errado. Tente de novo.";
  const codigo = erro.codigo || erro.message;
  if (MENSAGENS[codigo]) return MENSAGENS[codigo];
  // Mensagem que o backend escreveu para o usuário (ex.: "Email já cadastrado")
  if (erro.detalhe) return erro.detalhe;
  // Erro cru do navegador não vai para a tela: em inglês, não ajuda ninguém.
  if (/failed to fetch|networkerror|load failed/i.test(erro.message || "")) {
    return MENSAGENS.SEM_CONEXAO;
  }
  // Erro NATIVO do JavaScript (TypeError, SyntaxError...) é defeito de
  // programação, não recado para o usuário. "Unexpected token '<'" na tela
  // não ajuda ninguém e ainda parece que o site foi invadido.
  if (["TypeError", "SyntaxError", "ReferenceError", "RangeError", "EvalError"].includes(erro.name)) {
    console.error("Erro técnico não tratado:", erro);
    return "Algo deu errado por aqui. Tente de novo; se continuar, avise o suporte.";
  }
  // Sobra o que nós mesmos escrevemos com new Error("frase em português").
  return erro.message || "Algo deu errado. Tente de novo.";
}

/** O backend usa o campo `detail` para códigos e para frases. */
function codigoDoCorpo(corpo) {
  const d = corpo && typeof corpo === "object" ? corpo.detail : null;
  return typeof d === "string" ? d : null;
}

/**
 * Faz a chamada e devolve os dados já convertidos.
 * Qualquer falha vira um ErroDeApi com código — nunca um erro cru.
 */
export async function chamarApi(url, opcoes = {}) {
  let resposta;
  try {
    resposta = await fetch(url, opcoes);
  } catch (e) {
    // O fetch só rejeita quando NÃO chegou resposta: rede caída, servidor
    // fora, DNS, CORS. Nada disso tem a ver com a senha do usuário.
    throw new ErroDeApi("SEM_CONEXAO", "", 0);
  }

  // Um 500 costuma devolver HTML, e o .json() estouraria com
  // "Unexpected token '<'" — outro erro cru que ia parar na tela.
  let corpo = null;
  const texto = await resposta.text().catch(() => "");
  if (texto) {
    try {
      corpo = JSON.parse(texto);
    } catch {
      corpo = null;
    }
  }

  if (resposta.ok) {
    if (corpo === null && texto) throw new ErroDeApi("RESPOSTA_ILEGIVEL", "", resposta.status);
    return corpo;
  }

  const detalhe = codigoDoCorpo(corpo);

  // Códigos que o backend manda de propósito para a interface reagir.
  if (detalhe && MENSAGENS[detalhe]) throw new ErroDeApi(detalhe, "", resposta.status);

  if (resposta.status === 429) throw new ErroDeApi("MUITAS_TENTATIVAS", detalhe || "", 429);
  if (resposta.status >= 500) throw new ErroDeApi("ERRO_NO_SERVIDOR", detalhe || "", resposta.status);
  if (resposta.status === 401) throw new ErroDeApi("CREDENCIAIS_INVALIDAS", "", 401);

  // 4xx com mensagem própria do backend ("Email já cadastrado", "Plano
  // inválido"): essa frase foi escrita para o usuário, então ela vai à tela.
  throw new ErroDeApi("ERRO_DA_API", detalhe || "", resposta.status);
}
