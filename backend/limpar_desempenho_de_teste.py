"""
Apaga de performance_records as linhas criadas por TESTE, nao por estudo.

    python backend/limpar_desempenho_de_teste.py                  # so mostra
    python backend/limpar_desempenho_de_teste.py --aplicar        # apaga
    python backend/limpar_desempenho_de_teste.py --prefixo __x_   # outro prefixo
    python backend/limpar_desempenho_de_teste.py --email a@b.com  # so de um usuario

POR QUE ISTO EXISTE
-------------------
Em 13/09/2026, verificar o R4 (as ferramentas por materia passando a gravar
desempenho no servidor) exigiu chamar POST /performance de verdade, para provar
que `substituir: false` acumula e que a ausencia do campo continua substituindo.
O teste funcionou e deixou linhas de mentira no historico:

    __teste_r4_acumula__      (2 registros)
    __teste_r4_substitui__    (1 registro)

Nao existe rota HTTP para apagar registro de desempenho — nem deve existir,
porque apagar nota pela API e um pedido que so aparece quando alguem quer
melhorar o proprio ranking. Entao a limpeza e por script, na mao, como as outras
migracoes deste projeto.

OS TRES CUIDADOS QUE ESTE SCRIPT TOMA
-------------------------------------
1. Nao apaga nada sem --aplicar.
2. O `_` e curinga no LIKE do SQL. Um prefixo "__teste_" sem escapar casaria
   com "AAtesteX" e levaria junto estudo de verdade. Aqui ele e escapado.
3. Se o prefixo casar com a tabela inteira, recusa e nao apaga nada — isso nao
   e limpeza de teste, e perder o historico.
"""

from __future__ import annotations

import argparse
import sys
from typing import Optional

from mapear_banco import carregar_env, urls_possiveis

TABELA = "performance_records"
PREFIXO_PADRAO = "__teste_"


def como_like(prefixo: str) -> str:
    r"""Transforma um prefixo literal num padrao LIKE seguro.

    No LIKE do SQL, `_` casa com qualquer caractere e `%` com qualquer trecho.
    Escapando com \, o underline volta a ser underline.
    """
    escapado = prefixo.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return escapado + "%"


def _filtro(prefixo: str, email: Optional[str]):
    onde = "tema LIKE :padrao ESCAPE '\\'"
    params = {"padrao": como_like(prefixo)}
    if email:
        onde += " AND user_email = :email"
        params["email"] = email
    return onde, params


def levantar(conn, onde: str, params: dict):
    from sqlalchemy import text

    return conn.execute(
        text(
            f"SELECT id, user_email, tema, tipo, nota_obtida, nota_maxima, created_at "
            f'FROM "{TABELA}" WHERE {onde} ORDER BY created_at'
        ),
        params,
    ).fetchall()


def contar_tudo(conn) -> int:
    from sqlalchemy import text

    return conn.execute(text(f'SELECT COUNT(*) FROM "{TABELA}"')).scalar() or 0


def trabalho(conn, a) -> tuple[int, str]:
    """Roda dentro de uma transacao ja aberta.

    Devolve (codigo de saida, mensagem final). A mensagem NAO e impressa aqui:
    quem chama so a imprime depois que o commit deu certo. Anunciar "limpeza
    concluida" antes do commit ja seria mentir se o commit falhasse.
    """
    from sqlalchemy import text

    onde, params = _filtro(a.prefixo, a.email)

    print(f"Tabela .......... {TABELA}")
    print(f'Prefixo ......... "{a.prefixo}"   (escapado no LIKE)')
    if a.email:
        print(f"Usuario ......... {a.email}")

    total_geral = contar_tudo(conn)
    linhas = levantar(conn, onde, params)

    print(f"\nRegistros na tabela ......... {total_geral}")
    print(f"Casam com o prefixo ......... {len(linhas)}")

    if not linhas:
        return 0, (
            "\n  ✅ Nada a apagar: nenhum registro de teste encontrado."
            "\n     (Se voce esperava encontrar, confira o --prefixo e o --email.)"
        )

    print("\n  id      quando               tema                                nota")
    print("  " + "-" * 74)
    for L in linhas:
        quando = L.created_at.strftime("%d/%m/%Y %H:%M") if L.created_at else "sem data"
        tema = (L.tema or "")[:34].ljust(34)
        nota = f"{L.nota_obtida:g}/{L.nota_maxima:g}"
        print(f"  {str(L.id).ljust(7)} {quando.ljust(20)} {tema} {nota}")

    # Guarda-corpo: se o prefixo pega tudo, o prefixo esta errado.
    if total_geral and len(linhas) >= total_geral:
        return 2, (
            f"\n  ⛔ O prefixo casa com TODOS os {total_geral} registros da tabela."
            "\n     Isso nao e limpeza de teste, e apagar o historico inteiro."
            "\n     Nada foi feito. Revise o --prefixo."
        )

    if not a.aplicar:
        extra = f" --email {a.email}" if a.email else ""
        pref = f" --prefixo {a.prefixo}" if a.prefixo != PREFIXO_PADRAO else ""
        return 1, (
            f"\n  {len(linhas)} registro(s) seriam apagados. Nada foi alterado (ensaio)."
            "\n     Para apagar de verdade:"
            f"\n       python backend/limpar_desempenho_de_teste.py --aplicar{pref}{extra}"
        )

    apagados = conn.execute(text(f'DELETE FROM "{TABELA}" WHERE {onde}'), params).rowcount or 0
    restantes = levantar(conn, onde, params)

    print(f"\n  Linhas apagadas ............. {apagados}")
    print(f"  Ainda casam com o prefixo ... {len(restantes)}")

    # "Aplicado" com zero alteracoes ja aconteceu neste projeto. Aqui nao passa.
    if apagados == 0:
        return 2, "\n  ⚠️ O comando rodou e nao apagou nada. Nada mudou no banco."
    if restantes:
        return 2, f"\n  ⚠️ Sobraram {len(restantes)} — rode de novo ou confira o filtro."
    return 0, "\n  ✅ Limpeza concluida. O historico voltou a ter so estudo de verdade."


def main() -> int:
    p = argparse.ArgumentParser(
        description="Apaga registros de desempenho criados por teste.",
        epilog="Sem --aplicar, apenas lista. Nada e apagado por acidente.",
    )
    p.add_argument("--aplicar", action="store_true", help="apaga de verdade (sem isto, so lista)")
    p.add_argument("--prefixo", default=PREFIXO_PADRAO,
                   help=f'prefixo do tema a apagar (padrao: "{PREFIXO_PADRAO}")')
    p.add_argument("--email", default=None, help="limita a um usuario")
    a = p.parse_args()

    if not a.prefixo.strip():
        print("⛔ Prefixo vazio apagaria a tabela inteira. Recusado.")
        return 2

    url, origem = carregar_env()
    print(f"Banco ........... {origem}")
    if origem.startswith("PADRAO"):
        print("  ⚠️ ATENCAO: nao achei DATABASE_URL. Usando a URL padrao — provavelmente")
        print("     NAO e o banco que voce quer limpar. Confira o .env antes de --aplicar.")
    # A URL nunca e impressa: ela carrega a senha.

    opcoes = urls_possiveis(url)
    if not opcoes:
        print("❌ Nenhum driver de banco disponivel (asyncpg ou psycopg2).")
        return 2

    from sqlalchemy import create_engine
    from sqlalchemy.ext.asyncio import create_async_engine

    resultado = None
    for tentativa, nome, e_async in opcoes:
        try:
            # engine.begin(): a transacao fecha sozinha ao sair do bloco. Assim o
            # commit acontece ANTES de qualquer mensagem de sucesso.
            if e_async:
                import asyncio

                async def rodar():
                    engine = create_async_engine(tentativa)
                    try:
                        async with engine.begin() as conn:
                            return await conn.run_sync(lambda sc: trabalho(sc, a))
                    finally:
                        await engine.dispose()

                resultado = asyncio.run(rodar())
            else:
                engine = create_engine(tentativa)
                try:
                    with engine.begin() as conn:
                        resultado = trabalho(conn, a)
                finally:
                    engine.dispose()
            print(f"\n(pelo driver {nome})")
            break
        except Exception as e:
            print(f"  {nome}: {type(e).__name__}: {e}")

    if resultado is None:
        print("\n❌ Nenhum driver conseguiu conectar — ou a transacao falhou no commit.")
        print("   Nada foi apagado.")
        return 2

    codigo, mensagem = resultado
    print(mensagem)
    return codigo


if __name__ == "__main__":
    sys.exit(main())
