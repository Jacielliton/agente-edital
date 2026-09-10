"""
Distribuicao do gabarito das questoes de multipla escolha.

POR QUE ESTE ARQUIVO EXISTE
---------------------------
Os prompts pediam ao modelo "varie aleatoriamente a letra da resposta correta"
e, logo abaixo, mostravam um exemplo de JSON com "resposta_correta": "A".
Modelo de linguagem nao tem gerador aleatorio: ele copia a forma do exemplo.
Resultado medido em producao: quase todo gabarito caia em A.

A instrucao no prompt nao resolve isso — so o codigo resolve. Aqui a questao
chega pronta do modelo e as alternativas sao PERMUTADAS por codigo, com o
gabarito recalculado a partir do texto, nunca da letra.

Fica fora do main.py de proposito: assim da para testar a logica inteira sem
subir FastAPI nem banco (ver test_gabarito.py).
"""

from __future__ import annotations

import random
import re
from typing import Any, Dict, List, Optional

LETRAS = ["A", "B", "C", "D", "E"]

# "A) texto", "b - texto", "C. texto" — o prefixo que o modelo escreve junto
# do texto da alternativa e que precisa ser refeito depois da permutacao.
_PREFIXO = re.compile(r"^\s*([A-Ea-e])\s*[\)\.\-:]\s*")

# Onde uma letra de alternativa pode aparecer DENTRO de um texto de explicacao.
# So casa quando a letra esta ancorada:
#   1. depois de "alternativa/letra/opcao/item/assertiva", com ou sem aspas
#   2. entre parenteses ou colchetes — (A), [B]
#   3. imediatamente antes de um ")" — "A) esta errada porque..."
# Um "A" solto NUNCA casa: em portugues ele e quase sempre o artigo
# ("A alternativa correta e a C"), e trocar isso corromperia a frase.
_ANCORA = (
    r"(?:[Aa]lternativas?|[Ll]etras?|[Oo]pç(?:ão|ões)|[Oo]pc(?:ao|oes)"
    r"|[Ii]te(?:m|ns)|[Aa]ssertivas?|[Aa]firmativas?)"
)
_ASPA_ABRE = r"['\"“‘]"
_ASPA_FECHA = r"['\"”’]"

_CITA_LETRA = re.compile(
    # 1. alternativa 'B'  /  letra "C"
    rf"(?P<pre1>{_ANCORA}\s+{_ASPA_ABRE})(?P<l1>[A-E])(?P<pos1>{_ASPA_FECHA})"
    # 2. alternativa B  /  opção D  /  item C
    rf"|(?P<pre2>{_ANCORA}\s+)(?P<l2>[A-E])\b"
    # 3. (A)  /  [B]
    rf"|(?P<pre3>[\(\[])(?P<l3>[A-E])(?P<pos3>[\)\]])"
    # 4. "D) erra ao exigir..."
    rf"|\b(?P<l4>[A-E])(?=\))"
)


def _letra_da_alternativa(texto: str, posicao: int) -> str:
    """A letra que a propria alternativa declara; a posicao e so o fallback.

    Se o modelo devolver a lista fora de ordem (['B) ...', 'A) ...']), confiar
    na posicao faria o gabarito apontar para o texto errado.
    """
    casou = _PREFIXO.match(str(texto))
    if casou:
        return casou.group(1).upper()
    return LETRAS[posicao] if posicao < len(LETRAS) else "?"


def _sem_prefixo(texto: str) -> str:
    return _PREFIXO.sub("", str(texto)).strip()


def _reescrever_letras(texto: Any, mapa: Dict[str, str]) -> Any:
    """Troca as letras citadas na prosa segundo o mapa antiga -> nova."""
    if not isinstance(texto, str) or not texto:
        return texto

    def troca(m: re.Match) -> str:
        for n in ("1", "2", "3", "4"):
            letra = m.group(f"l{n}")
            if letra is None:
                continue
            antes = m.groupdict().get(f"pre{n}") or ""
            depois = m.groupdict().get(f"pos{n}") or ""
            return f"{antes}{mapa.get(letra, letra)}{depois}"
        return m.group(0)

    return _CITA_LETRA.sub(troca, texto)


def letras_alvo(n_questoes: int, n_opcoes: int, rng: Optional[random.Random] = None) -> List[str]:
    """A sequencia de letras que o caderno inteiro vai usar.

    Sorteio independente por questao nao serve: em 5 questoes com 4 opcoes,
    a chance de alguma letra aparecer 3 ou mais vezes passa de 1 em 4. Aqui as
    letras saem de blocos completos embaralhados, entao cada uma aparece o
    mesmo numero de vezes (+-1) e nenhuma domina o caderno.
    """
    rng = rng or random
    letras = LETRAS[:n_opcoes]
    if not letras:
        return []
    sequencia: List[str] = []
    while len(sequencia) < n_questoes:
        bloco = letras[:]
        rng.shuffle(bloco)
        sequencia.extend(bloco)
    return sequencia[:n_questoes]


def _campo_do_gabarito(questao: Dict[str, Any]) -> Optional[str]:
    for campo in ("resposta_correta", "gabarito"):
        valor = questao.get(campo)
        if isinstance(valor, str) and valor.strip():
            return valor.strip().upper()[:1]
    return None


def mover_correta_para(
    questao: Dict[str, Any],
    letra_alvo: str,
    rng: Optional[random.Random] = None,
) -> Dict[str, Any]:
    """Permuta as alternativas ate a correta cair em `letra_alvo`.

    Leva junto tudo que estava amarrado a letra antiga: a justificativa de
    CADA alternativa errada e as letras citadas no meio das explicacoes.
    """
    rng = rng or random
    try:
        alternativas = questao.get("alternativas")
        if not isinstance(alternativas, list) or not (3 <= len(alternativas) <= 5):
            # 2 alternativas e Certo/Errado: permutar inverteria o sentido.
            return questao

        gabarito = _campo_do_gabarito(questao)
        if gabarito not in LETRAS:
            return questao

        letras_atuais = [_letra_da_alternativa(a, i) for i, a in enumerate(alternativas)]
        if gabarito not in letras_atuais:
            return questao
        idx_correta = letras_atuais.index(gabarito)

        n = len(alternativas)
        letras_novas = LETRAS[:n]
        if letra_alvo not in letras_novas:
            return questao
        idx_alvo = letras_novas.index(letra_alvo)

        # Nova ordem: as erradas embaralhadas, com a correta encaixada no alvo.
        outros = [i for i in range(n) if i != idx_correta]
        rng.shuffle(outros)
        nova_ordem = outros[:idx_alvo] + [idx_correta] + outros[idx_alvo:]

        textos = [_sem_prefixo(a) for a in alternativas]
        mapa = {letras_atuais[antigo]: letras_novas[novo] for novo, antigo in enumerate(nova_ordem)}

        questao["alternativas"] = [
            f"{letras_novas[novo]}) {textos[antigo]}" for novo, antigo in enumerate(nova_ordem)
        ]

        # O motivo de cada alternativa errada segue o TEXTO dela, nao a letra.
        # A versao anterior desta funcao apagava todos e escrevia uma frase
        # generica no lugar — o aluno perdia o "por que a B esta errada".
        erradas = questao.get("por_que_as_outras_estao_erradas")
        if isinstance(erradas, dict):
            questao["por_que_as_outras_estao_erradas"] = {
                mapa[antiga]: _reescrever_letras(motivo, mapa)
                for antiga, motivo in erradas.items()
                if antiga in mapa and mapa[antiga] != letra_alvo
            }
        elif isinstance(erradas, list):
            # O modelo as vezes manda ["B) motivo", "C) motivo"] em vez do
            # dicionario. O QuizCard aceita as duas formas, entao aqui tambem.
            nova_lista = []
            for item in erradas:
                casou = _PREFIXO.match(str(item))
                if not casou:
                    nova_lista.append(_reescrever_letras(item, mapa))
                    continue
                antiga = casou.group(1).upper()
                nova = mapa.get(antiga)
                if nova is None or nova == letra_alvo:
                    continue
                corpo = _reescrever_letras(_sem_prefixo(item), mapa)
                nova_lista.append(f"{nova}) {corpo}")
            questao["por_que_as_outras_estao_erradas"] = nova_lista

        for campo in ("comentario_da_correta", "explicacao", "comentario",
                      "justificativa", "o_que_a_banca_fez"):
            if campo in questao:
                questao[campo] = _reescrever_letras(questao[campo], mapa)

        if "resposta_correta" in questao:
            questao["resposta_correta"] = letra_alvo
        if "gabarito" in questao:
            questao["gabarito"] = letra_alvo

    except Exception as e:  # nunca derrubar a geracao por causa da permutacao
        print(f"⚠️  Nao consegui reposicionar o gabarito desta questao: {e}")

    return questao


def equilibrar_gabaritos(
    questoes: Any,
    rng: Optional[random.Random] = None,
) -> Any:
    """Redistribui o gabarito de uma lista de questoes.

    Questoes com quantidades diferentes de alternativas sao equilibradas em
    grupos separados: misturar 4 e 5 opcoes na mesma cota deixaria o E de fora.
    """
    if not isinstance(questoes, list):
        return questoes

    rng = rng or random
    por_tamanho: Dict[int, List[int]] = {}
    for i, q in enumerate(questoes):
        if not isinstance(q, dict):
            continue
        alternativas = q.get("alternativas")
        if isinstance(alternativas, list) and 3 <= len(alternativas) <= 5:
            por_tamanho.setdefault(len(alternativas), []).append(i)

    for n_opcoes, indices in por_tamanho.items():
        alvos = letras_alvo(len(indices), n_opcoes, rng)
        for indice, alvo in zip(indices, alvos):
            questoes[indice] = mover_correta_para(questoes[indice], alvo, rng)

    return questoes


# Chaves onde uma lista de questoes costuma vir dentro do JSON do modelo.
_CHAVES_DE_LISTA = ("simulado", "questoes", "quiz", "questions")


def equilibrar_payload(dados: Any, rng: Optional[random.Random] = None) -> Any:
    """Acha a lista de questoes dentro do JSON devolvido e a equilibra.

    Aceita tanto a lista pura quanto o objeto que a embrulha, porque os quatro
    geradores da plataforma usam nomes diferentes para a mesma coisa.
    """
    if isinstance(dados, list):
        return equilibrar_gabaritos(dados, rng)
    if isinstance(dados, dict):
        for chave in _CHAVES_DE_LISTA:
            if isinstance(dados.get(chave), list):
                dados[chave] = equilibrar_gabaritos(dados[chave], rng)
    return dados


def equilibrar_texto_json(bruto: str, parse, limpar=None) -> str:
    """Recebe o texto que o modelo devolveu e entrega o JSON ja equilibrado.

    Fica separado do main.py de proposito: e a unica parte do caminho de
    streaming que tem logica, e assim ela roda no teste sem FastAPI. O parser
    entra como parametro porque o de producao (try_parse_json_loose) depende
    do json_repair, que o teste nao precisa carregar.

    REGRA DE OURO: qualquer falha devolve o texto cru, que e exatamente o que
    estas rotas devolviam antes. O pior caso e o comportamento de hoje.
    """
    try:
        dados = parse(limpar(bruto) if limpar else bruto)
        # Erro produzido pelo proprio stream (cota, bloqueio, chave invalida):
        # nao e um caderno de questoes, tem que chegar inteiro no frontend.
        if isinstance(dados, dict) and "error" in dados:
            return bruto
        import json as _json
        return _json.dumps(equilibrar_payload(dados), ensure_ascii=False)
    except Exception as e:
        print(f"⚠️  Nao consegui reequilibrar o gabarito; devolvendo o JSON cru: {e}")
        return bruto
