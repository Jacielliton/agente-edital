"""
Acrescenta as colunas que faltam em `coupons` e em `commission_history`.

    python backend/migrar_cupons_e_extrato.py            # ENSAIO: nao altera nada
    python backend/migrar_cupons_e_extrato.py --aplicar  # aplica, numa transacao so

O QUE ESTA MIGRACAO FAZ
-----------------------
    coupons.max_uses               INTEGER     DEFAULT 0    (0 = ilimitado)
    coupons.current_uses           INTEGER     DEFAULT 0
    coupons.expires_at             TIMESTAMP   NULL
    commission_history.saldo_anterior  DOUBLE PRECISION NULL
    commission_history.saldo_novo      DOUBLE PRECISION NULL

POR QUE ELA PRECISA EXISTIR
---------------------------
1. CUPONS. O formulario do painel sempre pediu "limite de usos" e "validade".
   Nenhum dos dois existia no banco, e nenhum schema do projeto usa
   extra="forbid" — entao o Pydantic descartava os dois campos em silencio, a
   rota respondia 201 e a tela dizia "Cupom criado". Todo cupom de campanha
   nascia ilimitado e eterno. A listagem ainda desenhava as colunas "usos" e
   "validade", sempre vazias, exibindo "0 / ilimitado · sem validade · Valido".

2. EXTRATO DE COMISSAO. A coluna `amount` significava duas coisas: valor PAGO
   num pagamento, saldo RESULTANTE num ajuste. Um ajuste que zerava R$ 400
   gravava amount=0, indistinguivel de um ajuste que nao mudou nada. Agora
   `amount` e sempre a variacao, e o antes/depois fica gravado.

   Os lancamentos ANTIGOS ficam com saldo_anterior e saldo_novo nulos — nao da
   para reconstruir o que nao foi registrado, e inventar numero em livro
   contabil e pior do que admitir a lacuna. A tela mostra "—" nesses casos.

E O create_all DO SQLALCHEMY?
-----------------------------
Ele CRIA TABELA, nunca ACRESCENTA COLUNA. Foi exatamente isso que derrubou o
login em producao em 13/09/2026, quando o codigo passou a ler users.deleted_at
e a coluna nao existia no banco de la. Por isso toda coluna nova neste projeto
passa por um script como este.

SEGURANCA
---------
- Sem --aplicar nao escreve nada.
- Tudo numa transacao so: ou entra inteiro, ou nao entra nada.
- Repetivel: coluna que ja existe e pulada, sem erro.
- Conta as instrucoes executadas — "aplicado" com zero mudancas nao passa.
"""

from __future__ import annotations

import argparse
import sys

from mapear_banco import carregar_env, urls_possiveis

# (tabela, coluna, tipo SQL, para que serve)
COLUNAS = [
    ("coupons", "max_uses", "INTEGER DEFAULT 0",
     "limite de usos; 0 = ilimitado"),
    ("coupons", "current_uses", "INTEGER DEFAULT 0",
     "usos ja consumidos; so sobe com pagamento aprovado"),
    ("coupons", "expires_at", "TIMESTAMP NULL",
     "validade; NULL = sem validade"),
    ("commission_history", "saldo_anterior", "DOUBLE PRECISION NULL",
     "saldo antes do lancamento"),
    ("commission_history", "saldo_novo", "DOUBLE PRECISION NULL",
     "saldo depois do lancamento"),
]


def coluna_existe(conn, tabela: str, coluna: str) -> bool:
    from sqlalchemy import text

    return bool(
        conn.execute(
            text(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_name = :t AND column_name = :c"
            ),
            {"t": tabela, "c": coluna},
        ).scalar()
    )


def tabela_existe(conn, tabela: str) -> bool:
    from sqlalchemy import text

    return conn.execute(text("SELECT to_regclass(:t)"), {"t": tabela}).scalar() is not None


def trabalho(conn, aplicar: bool) -> tuple[int, str]:
    from sqlalchemy import text

    faltando, ja_tem, sem_tabela = [], [], []

    for tabela, coluna, tipo, para_que in COLUNAS:
        if not tabela_existe(conn, tabela):
            sem_tabela.append((tabela, coluna))
            continue
        if coluna_existe(conn, tabela, coluna):
            ja_tem.append((tabela, coluna))
        else:
            faltando.append((tabela, coluna, tipo, para_que))

    print("Colunas verificadas ......... %d" % len(COLUNAS))
    print("Ja existem .................. %d" % len(ja_tem))
    print("Faltando .................... %d" % len(faltando))
    if sem_tabela:
        print("Tabela inexistente .......... %d" % len(sem_tabela))

    for t, c in ja_tem:
        print("  · %s.%s ja existe" % (t, c))
    for t, c in sem_tabela:
        print("  ⚠️ %s.%s: a TABELA %s nao existe neste banco" % (t, c, t))

    if not faltando:
        if sem_tabela:
            return 2, ("\n  ⚠️ Nada a acrescentar, mas ha tabela faltando acima."
                       "\n     Rode o backend uma vez para o create_all criar as tabelas.")
        return 0, "\n  ✅ Nada a fazer: todas as colunas ja existem."

    print("\nSeriam acrescentadas:")
    for t, c, tipo, para_que in faltando:
        print("  ALTER TABLE %s ADD COLUMN %s %s" % (t, c, tipo))
        print("      -> %s" % para_que)

    if not aplicar:
        return 1, ("\n  %d coluna(s) seriam criadas. Nada foi alterado (ensaio)."
                   "\n     Para valer:  python backend/migrar_cupons_e_extrato.py --aplicar"
                   % len(faltando))

    executadas = 0
    for t, c, tipo, _ in faltando:
        # IF NOT EXISTS deixa o script repetivel mesmo em corrida.
        conn.execute(text('ALTER TABLE "%s" ADD COLUMN IF NOT EXISTS "%s" %s' % (t, c, tipo)))
        executadas += 1
        print("  + %s.%s" % (t, c))

    # Backfill: cupons antigos ficam explicitamente em 0, e nao em NULL — o
    # codigo trata NULL, mas 0 e o que a coluna quer dizer de verdade.
    conn.execute(text("UPDATE coupons SET max_uses = 0 WHERE max_uses IS NULL"))
    conn.execute(text("UPDATE coupons SET current_uses = 0 WHERE current_uses IS NULL"))
    executadas += 2

    # Conferencia dentro da mesma transacao.
    ainda_faltam = [
        (t, c) for t, c, _, _ in faltando if not coluna_existe(conn, t, c)
    ]
    print("\n  Instrucoes executadas ....... %d" % executadas)
    print("  Colunas ainda faltando ...... %d" % len(ainda_faltam))

    if executadas == 0:
        return 2, "\n  ⚠️ O comando rodou e nao executou nada. Nada mudou no banco."
    if ainda_faltam:
        return 2, "\n  ⚠️ Sobraram: %s" % ", ".join("%s.%s" % x for x in ainda_faltam)
    return 0, ("\n  ✅ Migracao concluida."
               "\n     Reinicie o backend para o SQLAlchemy enxergar as colunas novas.")


def main() -> int:
    p = argparse.ArgumentParser(
        description="Acrescenta colunas de cupom e de extrato de comissao.",
        epilog="Sem --aplicar, apenas mostra o que faria.",
    )
    p.add_argument("--aplicar", action="store_true", help="escreve de verdade")
    a = p.parse_args()

    url, origem = carregar_env()
    print("Banco ........... %s" % origem)
    if origem.startswith("PADRAO"):
        print("  ⚠️ ATENCAO: nao achei DATABASE_URL. Usando a URL padrao — provavelmente")
        print("     NAO e o banco que voce quer migrar. Confira o .env antes de --aplicar.")
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
            # begin(): a transacao fecha sozinha ao sair do bloco, entao o commit
            # acontece ANTES de qualquer mensagem de sucesso.
            if e_async:
                import asyncio

                async def rodar():
                    engine = create_async_engine(tentativa)
                    try:
                        async with engine.begin() as conn:
                            return await conn.run_sync(lambda sc: trabalho(sc, a.aplicar))
                    finally:
                        await engine.dispose()

                resultado = asyncio.run(rodar())
            else:
                engine = create_engine(tentativa)
                try:
                    with engine.begin() as conn:
                        resultado = trabalho(conn, a.aplicar)
                finally:
                    engine.dispose()
            print("\n(pelo driver %s)" % nome)
            break
        except Exception as e:
            print("  %s: %s: %s" % (nome, type(e).__name__, e))

    if resultado is None:
        print("\n❌ Nenhum driver conseguiu conectar — ou a transacao falhou no commit.")
        print("   Nada foi alterado.")
        return 2

    codigo, mensagem = resultado
    print(mensagem)
    return codigo


if __name__ == "__main__":
    sys.exit(main())
