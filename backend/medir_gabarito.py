"""
Mede a distribuicao do gabarito. Nao e teste: e o termometro.

O teste (test_gabarito.py) prova que o CODIGO redistribui. Este script prova
que o SITE redistribui — passa pelo modelo de verdade, pela rota de verdade.

    # o "antes": conta o gabarito das aulas que ja estao salvas no banco
    python backend/medir_gabarito.py aulas --email voce@email.com --senha ***

    # o "depois": gera cadernos novos pela rota e conta
    python backend/medir_gabarito.py api --email voce@email.com --senha *** \\
        --chave sk-or-... --cadernos 8 --questoes 5

Sem --api-url ele fala com http://localhost:8000.

O modo `aulas` nao gasta token nenhum: le o que ja foi gerado. Rode ele
primeiro — e a medida do problema que voce relatou, com os seus dados.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter

try:
    import httpx
except ImportError:
    sys.exit("Falta o httpx:  pip install httpx")

LETRAS = ["A", "B", "C", "D", "E"]

CONTEUDO_DE_TESTE = """
O ato administrativo pode ser extinto por anulacao ou por revogacao.
A anulacao decorre de vicio de legalidade e opera efeitos retroativos (ex tunc),
podendo ser feita pela propria Administracao, no exercicio da autotutela, ou pelo
Poder Judiciario. A revogacao decorre de juizo de conveniencia e oportunidade,
opera efeitos apenas dali em diante (ex nunc) e e privativa da Administracao que
editou o ato: o Judiciario nao revoga ato administrativo alheio, porque nao lhe
cabe avaliar merito. Nao se revoga ato vinculado, ato que ja exauriu seus efeitos
nem ato que gerou direito adquirido.
"""


# ---------------------------------------------------------------- estatistica
def qui_quadrado(contagem: Counter, letras: list[str]) -> tuple[float, int]:
    """Qui-quadrado de aderencia ao uniforme. Devolve (estatistica, graus)."""
    total = sum(contagem[l] for l in letras)
    if total == 0:
        return 0.0, 0
    esperado = total / len(letras)
    x2 = sum((contagem[l] - esperado) ** 2 / esperado for l in letras)
    return x2, len(letras) - 1


# Valor critico a 5% — so para dizer "isso aqui e enviesado" sem trazer scipy.
CRITICO_5PC = {1: 3.84, 2: 5.99, 3: 7.81, 4: 9.49}


def relatorio(titulo: str, contagem: Counter) -> bool:
    letras = [l for l in LETRAS if contagem.get(l)]
    total = sum(contagem.values())
    print(f"\n{titulo}")
    print(f"  {total} questoes de multipla escolha")
    if not total:
        print("  (nada para medir)")
        return True

    largura = 46
    for l in LETRAS:
        n = contagem.get(l, 0)
        if n == 0 and l not in letras:
            continue
        fatia = n / total
        barra = "█" * round(fatia * largura)
        print(f"  {l}  {n:4d}  {fatia:6.1%}  {barra}")

    # o qui-quadrado usa as letras possiveis, nao so as que apareceram
    usadas = LETRAS[: max(4, len(letras))]
    x2, graus = qui_quadrado(contagem, usadas)
    limite = CRITICO_5PC.get(graus)
    print(f"\n  qui-quadrado = {x2:.2f} com {graus} graus de liberdade", end="")
    if limite:
        if x2 > limite:
            print(f"  (acima de {limite} → ENVIESADO)")
            return False
        print(f"  (abaixo de {limite} → distribuicao plana)")
    else:
        print()
    return True


# ------------------------------------------------------------------- coletores
def entrar(base: str, email: str, senha: str) -> str:
    r = httpx.post(f"{base}/auth/login", json={"email": email, "password": senha}, timeout=30)
    r.raise_for_status()
    return r.json()["access_token"]


def contar_questoes(questoes, contagem: Counter) -> None:
    for q in questoes or []:
        if not isinstance(q, dict):
            continue
        alternativas = q.get("alternativas")
        if not isinstance(alternativas, list) or len(alternativas) < 3:
            continue  # Certo/Errado nao entra: nao ha letra para distribuir
        letra = (q.get("resposta_correta") or q.get("gabarito") or "").strip().upper()[:1]
        if letra in LETRAS:
            contagem[letra] += 1


def medir_aulas(base: str, token: str, limite: int) -> Counter:
    """Le as aulas ja salvas. Custo zero de IA — e a foto do 'antes'."""
    cab = {"Authorization": f"Bearer {token}"}
    contagem = Counter()
    with httpx.Client(base_url=base, headers=cab, timeout=60) as c:
        lista = c.get("/plans", params={"page": 1, "limit": limite}).json()
        itens = lista.get("items", lista if isinstance(lista, list) else [])
        print(f"  lendo {len(itens)} aula(s) salva(s)…")
        for item in itens:
            plano = c.get(f"/plans/{item['id']}").json()
            bruto = plano.get("content") or plano.get("plan") or plano
            if isinstance(bruto, str):
                try:
                    bruto = json.loads(bruto)
                except Exception:
                    continue
            for modulo in (bruto.get("modulos") or bruto.get("modules") or []):
                if isinstance(modulo, dict):
                    contar_questoes(modulo.get("quiz"), contagem)
            contar_questoes(bruto.get("quiz"), contagem)
    return contagem


def medir_api(base: str, token: str, chave: str, modelo: str, cadernos: int, questoes: int) -> Counter:
    """Gera cadernos novos pela rota que a aula usa."""
    cab = {"Authorization": f"Bearer {token}"}
    contagem = Counter()
    with httpx.Client(base_url=base, headers=cab, timeout=300) as c:
        for i in range(1, cadernos + 1):
            print(f"  caderno {i}/{cadernos}…", end=" ", flush=True)
            r = c.post("/generate-simulado-topic", json={
                "area": "Direito Administrativo",
                "topico": "Extincao do ato administrativo",
                "conteudo": CONTEUDO_DE_TESTE,
                "model": modelo,
                "api_key": chave,
                "qtd_questoes": questoes,
                "nivel": "Normal",
                "formato": "Múltipla Escolha",
            })
            texto = r.text.strip()
            try:
                dados = json.loads(texto[texto.index("{"): texto.rindex("}") + 1])
            except Exception:
                print("resposta ilegivel, pulando")
                continue
            if "error" in dados:
                print(f"erro: {dados['error']}")
                continue
            antes = sum(contagem.values())
            contar_questoes(dados.get("simulado") or dados.get("questoes"), contagem)
            print(f"{sum(contagem.values()) - antes} questoes")
    return contagem


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("modo", choices=["aulas", "api"])
    p.add_argument("--api-url", default="http://localhost:8000")
    p.add_argument("--email", required=True)
    p.add_argument("--senha", required=True)
    p.add_argument("--chave", help="chave de IA (obrigatoria no modo api)")
    p.add_argument("--modelo", default="google/gemini-2.5-flash-lite")
    p.add_argument("--cadernos", type=int, default=8)
    p.add_argument("--questoes", type=int, default=5)
    p.add_argument("--aulas-limite", type=int, default=30)
    a = p.parse_args()

    base = a.api_url.rstrip("/")
    print(f"Entrando em {base}…")
    token = entrar(base, a.email, a.senha)

    if a.modo == "aulas":
        contagem = medir_aulas(base, token, a.aulas_limite)
        plana = relatorio("GABARITO DAS AULAS JA SALVAS", contagem)
        print("\n  Aulas geradas antes da correcao mantem a distribuicao antiga:")
        print("  regerar o modulo e o que redistribui o gabarito delas.")
    else:
        if not a.chave:
            return p.error("--chave e obrigatoria no modo api")
        contagem = medir_api(base, token, a.chave, a.modelo, a.cadernos, a.questoes)
        plana = relatorio("GABARITO GERADO AGORA PELA ROTA", contagem)

    return 0 if plana else 1


if __name__ == "__main__":
    sys.exit(main())
