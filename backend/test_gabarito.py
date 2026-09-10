"""
Teste da redistribuicao do gabarito. Roda sem FastAPI, sem banco e sem IA:

    python backend/test_gabarito.py

O que ele prova, na ordem em que as coisas quebram na pratica:
  1. a alternativa correta continua sendo a mesma DEPOIS de permutada
  2. cada alternativa errada mantem a SUA justificativa (o bug da versao antiga)
  3. as letras citadas na prosa acompanham a permutacao
  4. um "A" que e artigo em portugues nao vira letra de alternativa
  5. a distribuicao do gabarito fica plana, inclusive em cadernos curtos
  6. Certo/Errado nao e tocado
"""

import random
import sys
from collections import Counter

from gabarito import (
    equilibrar_gabaritos,
    equilibrar_payload,
    letras_alvo,
    mover_correta_para,
    _reescrever_letras,
)

falhas = []


def checar(condicao, descricao, detalhe=""):
    if condicao:
        print(f"  ok   {descricao}")
    else:
        print(f"  FALHA {descricao}{(' — ' + detalhe) if detalhe else ''}")
        falhas.append(descricao)


def questao_exemplo(correta="A"):
    """Questao no formato que /generate-simulado-topic devolve."""
    return {
        "contexto_disciplina": "Direito Administrativo",
        "contexto_topico": "Atos administrativos",
        "enunciado": "Sobre a revogação do ato administrativo, assinale a correta.",
        "alternativas": [
            "A) Cabe à própria Administração, por razões de conveniência.",
            "B) Cabe ao Judiciário, por razões de conveniência.",
            "C) Opera efeitos retroativos à edição do ato.",
            "D) Depende de autorização legislativa prévia.",
        ],
        "resposta_correta": correta,
        "comentario_da_correta": "A revogação é discricionária e cabe a quem editou o ato.",
        "por_que_as_outras_estao_erradas": {
            "B": "O Judiciário não avalia conveniência, apenas legalidade.",
            "C": "A revogação opera ex nunc, não retroage.",
            "D": "Não há exigência de autorização do Legislativo.",
        },
    }


print("\n1. A correta continua correta depois de permutar")
for alvo in ["A", "B", "C", "D"]:
    q = mover_correta_para(questao_exemplo("A"), alvo, random.Random(7))
    letra = q["resposta_correta"]
    texto_correta = next(a for a in q["alternativas"] if a.startswith(letra + ")"))
    checar(
        letra == alvo and "por razões de conveniência" in texto_correta and "Judiciário" not in texto_correta,
        f"gabarito movido para {alvo} aponta para o texto original da correta",
        texto_correta,
    )

print("\n2. Cada errada mantem a sua propria justificativa")
MOTIVOS = {
    "O Judiciário não avalia conveniência, apenas legalidade.": "Cabe ao Judiciário, por razões de conveniência.",
    "A revogação opera ex nunc, não retroage.": "Opera efeitos retroativos à edição do ato.",
    "Não há exigência de autorização do Legislativo.": "Depende de autorização legislativa prévia.",
}
for semente in range(40):
    q = mover_correta_para(questao_exemplo("A"), "C", random.Random(semente))
    textos = {a[0]: a[3:].strip() for a in q["alternativas"]}
    for letra, motivo in q["por_que_as_outras_estao_erradas"].items():
        esperado = MOTIVOS.get(motivo)
        if esperado is None or textos.get(letra) != esperado:
            checar(False, "justificativa colada na alternativa errada",
                   f"semente {semente}: {letra} = {textos.get(letra)!r} / motivo {motivo!r}")
            break
    else:
        continue
    break
else:
    checar(True, "40 permutacoes: cada motivo seguiu o texto da sua alternativa")

print("\n3. Letras citadas na prosa acompanham a permutacao")
mapa = {"A": "C", "B": "A", "C": "D", "D": "B"}
casos = [
    ("A alternativa A está correta.", "A alternativa C está correta."),
    ("Veja a letra B e a opção D.", "Veja a letra A e a opção B."),
    ("O item (C) contradiz o enunciado.", "O item (D) contradiz o enunciado."),
    ("D) erra ao exigir lei prévia.", "B) erra ao exigir lei prévia."),
    ("A alternativa 'B' inverte o conceito.", "A alternativa 'A' inverte o conceito."),
]
for entrada, esperado in casos:
    obtido = _reescrever_letras(entrada, mapa)
    checar(obtido == esperado, f"{entrada!r}", f"virou {obtido!r}, esperava {esperado!r}")

print("\n4. O artigo 'A' do portugues nao e confundido com a letra A")
intocados = [
    "A revogação é ato discricionário.",
    "A Administração pode revogar. A anulação, não.",
    "A CF/88 trata do tema no art. 37.",
    "Errado: a competência é da Administração.",
]
for frase in intocados:
    obtido = _reescrever_letras(frase, mapa)
    checar(obtido == frase, f"{frase!r} fica intacta", f"virou {obtido!r}")

print("\n5. Distribuicao do gabarito")
for n in (5, 10, 20):
    contagem = Counter()
    for rodada in range(400):
        caderno = [questao_exemplo("A") for _ in range(n)]
        for q in equilibrar_gabaritos(caderno, random.Random(rodada)):
            contagem[q["resposta_correta"]] += 1
    total = sum(contagem.values())
    fracoes = {l: contagem[l] / total for l in "ABCD"}
    pior = max(abs(f - 0.25) for f in fracoes.values())
    checar(pior < 0.02, f"caderno de {n}: nenhuma letra se afasta 2 pontos de 25%",
           ", ".join(f"{l} {fracoes[l]:.1%}" for l in "ABCD"))

print("\n   Pior caso de UM caderno de 5 questoes (era o que estourava):")
piores = Counter()
for rodada in range(2000):
    caderno = [questao_exemplo("A") for _ in range(5)]
    equilibrar_gabaritos(caderno, random.Random(rodada))
    piores[max(Counter(q["resposta_correta"] for q in caderno).values())] += 1
checar(piores[4] == 0 and piores[5] == 0,
       "nenhum caderno de 5 questoes concentra 4+ na mesma letra",
       dict(piores))

print("\n6. Certo/Errado nao e tocado")
ce = {
    "enunciado": "O ato pode ser revogado pelo Judiciário por conveniência.",
    "alternativas": ["A) Certo", "B) Errado"],
    "gabarito": "B",
    "explicacao": "O Judiciário só afere legalidade.",
}
antes = dict(ce)
depois = equilibrar_gabaritos([dict(ce)], random.Random(1))[0]
checar(depois == antes, "questao de 2 alternativas passa inalterada", str(depois))

print("\n7. A lista e achada dentro do JSON dos quatro geradores")
for chave in ("simulado", "questoes", "quiz"):
    payload = {chave: [questao_exemplo("A") for _ in range(8)]}
    equilibrar_payload(payload, random.Random(3))
    letras = {q["resposta_correta"] for q in payload[chave]}
    checar(len(letras) >= 3, f"chave {chave!r} equilibrada", str(letras))

print("\n8. A lista de letras-alvo cobre todas as opcoes")
checar(sorted(letras_alvo(4, 4, random.Random(0))) == ["A", "B", "C", "D"],
       "4 questoes com 4 opcoes usam cada letra uma vez")
checar(sorted(letras_alvo(5, 5, random.Random(0))) == ["A", "B", "C", "D", "E"],
       "5 questoes com 5 opcoes usam cada letra uma vez")

print("\n9. Questoes fora do padrao nao quebram nada")
esquisitas = [
    {"alternativas": ["A) x", "B) y", "C) z", "D) w"], "resposta_correta": "Z"},
    {"alternativas": ["x", "y", "z", "w"], "gabarito": "C"},
    {"alternativas": ["B) fora de ordem", "A) primeira", "C) c", "D) d"], "resposta_correta": "A"},
    {"enunciado": "sem alternativas"},
    {"alternativas": [], "gabarito": "A"},
    "nem dicionario e",
]
copia = list(esquisitas)
equilibrar_gabaritos(copia, random.Random(5))
checar(True, "nenhuma excecao com entrada malformada")
fora_de_ordem = copia[2]
correta = next(a for a in fora_de_ordem["alternativas"] if a.startswith(fora_de_ordem["resposta_correta"] + ")"))
checar("primeira" in correta,
       "lista fora de ordem: o gabarito segue o TEXTO, nao a posicao", correta)
sem_prefixo = copia[1]
checar(sem_prefixo["gabarito"] in "ABCD" and len(sem_prefixo["alternativas"]) == 4,
       "alternativas sem prefixo tambem sao tratadas", str(sem_prefixo))

# ===========================================================================
# 10. O caminho do streaming: o que sai da rota /generate-simulado-topic
# ===========================================================================
import json
from gabarito import equilibrar_texto_json

print("\n10. Caminho do streaming (equilibrar_texto_json)")

CADERNO = {"simulado": [questao_exemplo("A") for _ in range(6)]}
bruto = json.dumps(CADERNO, ensure_ascii=False)

saida = equilibrar_texto_json(bruto, json.loads)
dados = json.loads(saida)
letras = [q["resposta_correta"] for q in dados["simulado"]]
checar(len(set(letras)) >= 3, "caderno de 6 sai com pelo menos 3 letras diferentes", str(letras))
checar(len(dados["simulado"]) == 6, "nenhuma questao se perde no caminho")

# erro do stream tem de chegar inteiro
erro = '{"error": "O limite de processamento (tokens) do seu plano foi atingido."}'
checar(equilibrar_texto_json(erro, json.loads) == erro,
       "erro de cota/bloqueio passa reto, sem virar caderno vazio")

# texto quebrado nao pode piorar nada
quebrado = '{"simulado": [{"enunciado": "cortado no meio'
checar(equilibrar_texto_json(quebrado, json.loads) == quebrado,
       "JSON truncado volta cru — o frontend trata como sempre tratou")

# markdown fence: o limpar de producao remove; sem limpar, cai no fallback
cercado = "```json\n" + bruto + "\n```"
import re as _re
def _limpar(x):
    m = _re.match(r"^```[A-Za-z0-9_+-]*[ \t]*\r?\n(?P<c>.*?)\r?\n?```[ \t]*$", x, _re.DOTALL)
    return m.group("c").strip() if m else x
checar(json.loads(equilibrar_texto_json(cercado, json.loads, _limpar))["simulado"],
       "resposta cercada por ```json e tratada")

print("\n11. O frontend consegue ler o que a rota devolve")
# fetchStreamAsJson concatena tudo, faz trim e extrai o primeiro {...}.
# A rota emite um espaco de keep-alive por chunk antes do JSON final.
como_chega = (" " * 40) + equilibrar_texto_json(bruto, json.loads)
limpo = como_chega.strip()
limpo = _re.sub(r"^```json", "", limpo, flags=_re.I)
achado = _re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", limpo)
checar(achado is not None, "o regex de extracao do frontend acha o objeto")
lido = json.loads(achado.group(0))
checar(len(lido["simulado"]) == 6 and all(q["resposta_correta"] in "ABCD" for q in lido["simulado"]),
       "o frontend le as 6 questoes com gabarito valido")

print("\n12. 'por que as outras estao erradas' tambem vem como lista")
q = {
    "alternativas": ["A) certa", "B) erro b", "C) erro c", "D) erro d"],
    "resposta_correta": "A",
    "por_que_as_outras_estao_erradas": [
        "B) porque b confunde os conceitos",
        "C) porque c inverte o efeito",
        "D) porque d inventa exigencia",
    ],
}
r = mover_correta_para(dict(q), "D", random.Random(11))
textos = {a[0]: a[3:].strip() for a in r["alternativas"]}
PARES = {"erro b": "confunde os conceitos", "erro c": "inverte o efeito", "erro d": "inventa exigencia"}
ok = len(r["por_que_as_outras_estao_erradas"]) == 3
for item in r["por_que_as_outras_estao_erradas"]:
    letra, corpo = item[0], item[3:]
    ok = ok and PARES.get(textos.get(letra, "")) in corpo
checar(ok, "cada motivo da lista seguiu a sua alternativa",
       f"{r['alternativas']} / {r['por_que_as_outras_estao_erradas']}")
checar(all(not i.startswith("D)") for i in r["por_que_as_outras_estao_erradas"]),
       "o motivo da nova correta sai da lista de erradas")

print()
if falhas:
    print(f"❌ {len(falhas)} falha(s): " + "; ".join(falhas))
    sys.exit(1)
print("✅ tudo passou")
