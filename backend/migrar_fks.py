"""
Cria as chaves estrangeiras que faltam, e a restricao UNIQUE do plan_shares.

    python backend/migrar_fks.py              # ENSAIO: mostra o que faria, nao altera
    python backend/migrar_fks.py --aplicar    # aplica, numa transacao so
    python backend/migrar_fks.py --aplicar --limpar-orfaos   # + resolve os orfaos

O QUE ESTA MIGRACAO FAZ
-----------------------
    study_plans.owner_id      -> users.id          ON DELETE SET NULL
    plan_shares.plan_id       -> study_plans.id    ON DELETE CASCADE
    users.referred_by_id      -> users.id          ON DELETE SET NULL
    ai_token_logs.user_id     -> users.id          ON DELETE CASCADE
    users.deleted_at          coluna nova (exclusao logica)
    plan_shares               UNIQUE (plan_id, user_email)

O QUE ELA NAO FAZ, DE PROPOSITO
-------------------------------
`commission_history.user_id` NAO ganha foreign key. E dinheiro: um CASCADE
apagaria lancamentos junto com a conta, e um SET NULL deixaria lancamento sem
dono. Em vez disso, conta com historico financeiro passa a ser excluida
LOGICAMENTE (users.deleted_at) — o registro contabil continua ligado a um
usuario que ainda existe na tabela. Ver delete_user() no main.py.

`performance_records.user_email` tambem nao: ela liga por e-mail, e criar FK
ali exigiria antes migrar a coluna para user_id.

SEGURANCA
---------
- Sem --aplicar nao escreve nada.
- Tudo numa transacao unica: ou entra inteiro, ou nao entra nada.
- Repetivel: o que ja existe e pulado, nao da erro.
- Recusa a rodar se houver orfao pendente, porque o Postgres rejeitaria a
  constraint no meio do caminho.
"""

from __future__ import annotations

import argparse
import sys

from mapear_banco import carregar_env, urls_possiveis

# (tabela, coluna, tabela pai, coluna pai, acao, por que essa acao)
CHAVES = [
    ("study_plans", "owner_id", "users", "id", "SET NULL",
     "a aula sobrevive ao dono; vira aula sem dono, nao some"),
    ("plan_shares", "plan_id", "study_plans", "id", "CASCADE",
     "compartilhamento de uma aula apagada nao tem sentido sozinho"),
    ("users", "referred_by_id", "users", "id", "SET NULL",
     "o indicado continua existindo; so perde a referencia a quem indicou"),
    ("ai_token_logs", "user_id", "users", "id", "CASCADE",
     "log de consumo de uma conta que sumiu nao serve para nada"),
]

# Como resolver o orfao de cada uma: NULL solta o vinculo, DELETE apaga a linha.
# Coerente com o ON DELETE que a chave vai ter.
COMO_LIMPAR = {
    ("study_plans", "owner_id"): "NULL",
    ("plan_shares", "plan_id"): "DELETE",
    ("users", "referred_by_id"): "NULL",
    ("ai_token_logs", "user_id"): "DELETE",
}


def sql_orfaos(filha, col, pai, col_pai):
    return (f'FROM "{filha}" f WHERE f."{col}" IS NOT NULL AND NOT EXISTS '
            f'(SELECT 1 FROM "{pai}" p WHERE p."{col_pai}" = f."{col}")')


def contar_orfaos(conn, filha, col, pai, col_pai):
    from sqlalchemy import text
    return conn.execute(text(f"SELECT COUNT(*) {sql_orfaos(filha, col, pai, col_pai)}")).scalar()


def constraint_existe(conn, nome):
    from sqlalchemy import text
    return bool(conn.execute(
        text("SELECT 1 FROM pg_constraint WHERE conname = :n"), {"n": nome}
    ).scalar())


def coluna_existe(conn, tabela, coluna):
    from sqlalchemy import text
    return bool(conn.execute(text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name = :t AND column_name = :c"
    ), {"t": tabela, "c": coluna}).scalar())


def executar(conn, aplicar: bool, limpar: bool):
    """Devolve (pode_seguir, quantas_mudancas).

    Contar as mudancas em vez de supor: sem isso a ultima linha dizia
    "✅ Aplicado" mesmo numa segunda execucao em que nada foi tocado — a
    mensagem descrevia a INTENCAO, nao o que aconteceu.
    """
    from sqlalchemy import text
    mudancas = 0

    rotulo = "APLICANDO" if aplicar else "ENSAIO (nada sera alterado)"
    print(f"\n{'=' * 74}\n{rotulo}\n{'=' * 74}")

    # ---- 1. orfaos ------------------------------------------------------
    print("\n1. Orfaos")
    pendentes = []
    for filha, col, pai, col_pai, _, _ in CHAVES:
        n = contar_orfaos(conn, filha, col, pai, col_pai)
        if n == 0:
            print(f"   ✅ {filha}.{col}: nenhum")
            continue
        modo = COMO_LIMPAR[(filha, col)]
        if not limpar:
            print(f"   ❌ {filha}.{col}: {n} orfao(s) — a constraint seria rejeitada")
            pendentes.append(f"{filha}.{col}")
            continue
        if modo == "NULL":
            acao = f'UPDATE "{filha}" SET "{col}" = NULL WHERE "{col}" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "{pai}" p WHERE p."{col_pai}" = "{filha}"."{col}")'
            desc = f"solta o vinculo de {n} linha(s)"
        else:
            acao = (f'DELETE FROM "{filha}" WHERE "{col}" IS NOT NULL AND NOT EXISTS '
                    f'(SELECT 1 FROM "{pai}" p WHERE p."{col_pai}" = "{filha}"."{col}")')
            desc = f"apaga {n} linha(s)"
        print(f"   → {filha}.{col}: {n} orfao(s), {desc}")
        mudancas += 1
        if aplicar:
            conn.execute(text(acao))

    if pendentes:
        print(f"\n   Impedimento: {', '.join(pendentes)}.")
        print("   Rode de novo com --limpar-orfaos, ou resolva a mao antes.")
        return False, mudancas

    # ---- 2. coluna de exclusao logica -----------------------------------
    print("\n2. users.deleted_at (exclusao logica)")
    if coluna_existe(conn, "users", "deleted_at"):
        print("   ✅ ja existe")
    else:
        print("   → ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP")
        mudancas += 1
        if aplicar:
            conn.execute(text('ALTER TABLE "users" ADD COLUMN "deleted_at" TIMESTAMP'))

    # ---- 3. duplicatas antes do UNIQUE ----------------------------------
    print("\n3. plan_shares UNIQUE (plan_id, user_email)")
    dup = conn.execute(text(
        'SELECT COUNT(*) FROM (SELECT plan_id, user_email FROM "plan_shares" '
        'GROUP BY plan_id, user_email HAVING COUNT(*) > 1) x'
    )).scalar()
    if dup:
        print(f"   → {dup} par(es) duplicado(s); mantem o de menor id e apaga o resto")
        mudancas += 1
        if aplicar:
            conn.execute(text(
                'DELETE FROM "plan_shares" a USING "plan_shares" b '
                'WHERE a.id > b.id AND a.plan_id = b.plan_id AND a.user_email = b.user_email'
            ))
    else:
        print("   ✅ sem duplicatas")

    if constraint_existe(conn, "uq_plan_shares_plano_email"):
        print("   ✅ restricao ja existe")
    else:
        print("   → ADD CONSTRAINT uq_plan_shares_plano_email UNIQUE (plan_id, user_email)")
        mudancas += 1
        if aplicar:
            conn.execute(text(
                'ALTER TABLE "plan_shares" ADD CONSTRAINT "uq_plan_shares_plano_email" '
                'UNIQUE ("plan_id", "user_email")'
            ))

    # ---- 4. as quatro chaves --------------------------------------------
    print("\n4. Chaves estrangeiras")
    for filha, col, pai, col_pai, acao, porque in CHAVES:
        nome = f"fk_{filha}_{col}"
        if constraint_existe(conn, nome):
            print(f"   ✅ {nome} ja existe")
            continue
        print(f"   → {filha}.{col} → {pai}.{col_pai}  ON DELETE {acao}")
        print(f"     ({porque})")
        mudancas += 1
        if aplicar:
            conn.execute(text(
                f'ALTER TABLE "{filha}" ADD CONSTRAINT "{nome}" '
                f'FOREIGN KEY ("{col}") REFERENCES "{pai}" ("{col_pai}") ON DELETE {acao}'
            ))

    print("\n5. commission_history.user_id")
    print("   — sem foreign key, de proposito. E dinheiro: conta com historico")
    print("     financeiro passa a ser excluida logicamente (users.deleted_at).")
    print(f"\n{'-' * 74}")
    if not mudancas:
        print("  Nada a alterar: o banco ja esta no estado final.")
    elif aplicar:
        print(f"  {mudancas} alteracao(oes) aplicada(s).")
    else:
        print(f"  {mudancas} alteracao(oes) pendente(s).")
    return True, mudancas


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--aplicar", action="store_true", help="escreve de verdade (sem isto e ensaio)")
    p.add_argument("--limpar-orfaos", action="store_true", dest="limpar",
                   help="resolve os orfaos que impedem as constraints")
    a = p.parse_args()

    url, origem = carregar_env()
    print(f"DATABASE_URL veio de: {origem}")
    print(f"Banco: …@{url.split('@')[-1] if '@' in url else url}")
    if origem.startswith("PADRAO"):
        print("⚠  URL PADRAO do codigo, nao a sua. Pare e confira o backend/.env.")
        return 2
    if a.aplicar:
        print("⚠  MODO APLICAR. Faca backup antes se este for o banco de producao.")

    opcoes = urls_possiveis(url)
    if not opcoes:
        print("\n❌ Nenhum driver de Postgres. Ative o venv do backend.")
        return 2

    ok, mudancas = None, 0
    for tentativa, nome, e_async in opcoes:
        try:
            if e_async:
                import asyncio
                from sqlalchemy.ext.asyncio import create_async_engine

                async def rodar():
                    engine = create_async_engine(tentativa)
                    try:
                        async with engine.begin() as conn:
                            return await conn.run_sync(lambda sc: executar(sc, a.aplicar, a.limpar))
                    finally:
                        await engine.dispose()

                ok, mudancas = asyncio.run(rodar())
            else:
                from sqlalchemy import create_engine
                engine = create_engine(tentativa)
                # engine.begin() = uma transacao so: ou tudo, ou nada.
                with engine.begin() as conn:
                    ok, mudancas = executar(conn, a.aplicar, a.limpar)
            print(f"\n(driver {nome})")
            break
        except Exception as e:
            print(f"   {nome}: {type(e).__name__}: {e}")

    if ok is None:
        print("\n❌ Nenhum driver conseguiu conectar.")
        return 2
    if not ok:
        return 1

    if a.aplicar and mudancas:
        print(f"\n✅ {mudancas} alteracao(oes) aplicada(s). Confira com:")
        print("     python backend/checar_orfaos.py")
        print("     python backend/mapear_banco.py --so-diff")
    elif a.aplicar:
        print("\n✅ Banco ja estava no estado final — nada precisou ser alterado.")
        print("   (esta migracao e repetivel de proposito: rodar de novo nao faz mal)")
    elif mudancas:
        print(f"\nEnsaio concluido — {mudancas} alteracao(oes) PENDENTE(S), nada foi feito.")
        print("Para valer:  python backend/migrar_fks.py --aplicar" +
              (" --limpar-orfaos" if not a.limpar else ""))
    else:
        print("\nEnsaio concluido — nao ha nada a alterar neste banco.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
