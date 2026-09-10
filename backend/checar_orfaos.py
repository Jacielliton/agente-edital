"""
Procura registros orfaos nas ligacoes que hoje nao tem FOREIGN KEY.

    python backend/checar_orfaos.py          # so conta
    python backend/checar_orfaos.py --sql    # + o SQL para limpar e criar as FKs

POR QUE RODAR ISTO ANTES DE CRIAR AS FKs
----------------------------------------
Nenhuma das cinco ligacoes do projeto tem FOREIGN KEY. Sem ela, o banco aceitou
por anos linhas apontando para ids que ja nao existem. Se voce rodar
`ALTER TABLE ... ADD CONSTRAINT ... REFERENCES ...` com um unico orfao la
dentro, o Postgres RECUSA a migracao inteira:

    ERRO: insert or update on table "study_plans" violates foreign key constraint

E ai a migracao falha no deploy, com o banco no meio do caminho. Entao a ordem
correta e: contar os orfaos -> decidir o que fazer com cada um -> criar a FK.

RODE ISTO CONTRA PRODUCAO, nao contra o banco local. O local tem poucas linhas
e quase certamente esta limpo; producao e que teve gente apagando conta.

Nao altera nada. So le e conta.
"""

from __future__ import annotations

import argparse
import sys

from mapear_banco import carregar_env, ler_banco_async, ler_banco_sincrono, urls_possiveis

# (tabela filha, coluna, tabela pai, coluna do pai, o que significa o orfao)
LIGACOES = [
    ("study_plans", "owner_id", "users", "id",
     "aula cujo dono foi apagado"),
    ("plan_shares", "plan_id", "study_plans", "id",
     "compartilhamento de uma aula que nao existe mais"),
    ("users", "referred_by_id", "users", "id",
     "usuario indicado por uma conta apagada"),
    ("ai_token_logs", "user_id", "users", "id",
     "consumo de token de um usuario apagado"),
]

# Fica FORA da lista acima de proposito: commission_history e livro contabil.
# CASCADE apagaria lancamento junto com a conta, SET NULL deixaria lancamento
# sem dono. A saida foi a exclusao logica (users.deleted_at): o usuario nunca
# sai da tabela. Continua sendo contada aqui porque o numero tem de PARAR de
# crescer depois da migracao — se subir, alguem apagou conta por fora do
# delete_user (SQL na mao, ou codigo novo que esqueceu a regra).
LIGACOES_SEM_FK_DE_PROPOSITO = [
    ("commission_history", "user_id", "users", "id",
     "lancamento de comissao de um usuario que nao existe mais"),
]

# Estas duas ligam por e-mail, nao por id: FK exigiria antes migrar a coluna.
LIGACOES_POR_EMAIL = [
    ("performance_records", "user_email", "users", "email",
     "desempenho de um e-mail que nao esta mais cadastrado"),
    ("plan_shares", "user_email", "users", "email",
     "acesso concedido a um e-mail que nao existe mais"),
]


def contar(conn, filha, col, pai, col_pai):
    """Quantas linhas da filha apontam para um pai que nao existe."""
    from sqlalchemy import text
    sql = text(
        f'SELECT COUNT(*) FROM "{filha}" f '
        f'WHERE f."{col}" IS NOT NULL '
        f'  AND NOT EXISTS (SELECT 1 FROM "{pai}" p WHERE p."{col_pai}" = f."{col}")'
    )
    return conn.execute(sql).scalar()


# Como o Postgres guarda a regra de ON DELETE no catalogo.
_ACAO = {"a": "NO ACTION", "r": "RESTRICT", "c": "CASCADE", "n": "SET NULL", "d": "SET DEFAULT"}


def estado_da_fk(conn, filha, col):
    """A chave existe? Com qual ON DELETE?

    Ler o catalogo em vez de supor: este script ANTES so contava orfaos e, com
    zero, dizia "da para criar a FK" mesmo quando ela ja estava criada. Contar
    orfao nao e o mesmo que verificar a restricao.
    """
    from sqlalchemy import text
    linha = conn.execute(text(
        "SELECT conname, confdeltype FROM pg_constraint "
        "WHERE contype = 'f' AND conrelid = to_regclass(:t) "
        "  AND conkey = (SELECT ARRAY[attnum] FROM pg_attribute "
        "                WHERE attrelid = to_regclass(:t) AND attname = :c)"
    ), {"t": filha, "c": col}).first()
    if not linha:
        return None, None
    return linha[0], _ACAO.get(linha[1], linha[1])


def exemplos(conn, filha, col, pai, col_pai, limite=5):
    from sqlalchemy import text
    sql = text(
        f'SELECT f."{col}" FROM "{filha}" f '
        f'WHERE f."{col}" IS NOT NULL '
        f'  AND NOT EXISTS (SELECT 1 FROM "{pai}" p WHERE p."{col_pai}" = f."{col}") '
        f'LIMIT {limite}'
    )
    return [r[0] for r in conn.execute(sql)]


def analisar(conn):
    achados, ativas, faltam_fk = [], [], []
    print("\n" + "=" * 74)
    print("LIGACOES POR ID  (estado da chave + orfaos)")
    print("=" * 74)
    for filha, col, pai, col_pai, significado in LIGACOES:
        try:
            n = contar(conn, filha, col, pai, col_pai)
        except Exception as e:
            print(f"\n  {filha}.{col} → {pai}.{col_pai}: nao consegui checar ({e})")
            continue
        seta = f"{filha}.{col} → {pai}.{col_pai}"
        try:
            nome_fk, acao = estado_da_fk(conn, filha, col)
        except Exception:
            nome_fk, acao = None, None

        if n == 0:
            print(f"\n  ✅ {seta}")
            if nome_fk:
                print(f"     FK ATIVA ({nome_fk}, ON DELETE {acao}) · 0 orfaos")
                ativas.append(filha)
            else:
                print(f"     sem FK ainda · 0 orfaos — da para criar direto")
                faltam_fk.append(seta)
        else:
            achados.append((filha, col, pai, col_pai, n))
            amostra = exemplos(conn, filha, col, pai, col_pai)
            print(f"\n  ❌ {seta}")
            print(f"     {n} orfao(s): {significado}")
            print(f"     ids apontados que nao existem: {amostra}")
            if nome_fk:
                print(f"     ESTRANHO: a FK {nome_fk} existe e mesmo assim ha orfao.")
                print(f"     Alguem pode te-la criado como NOT VALID.")
            else:
                print(f"     A FK vai FALHAR enquanto estas linhas existirem.")
                faltam_fk.append(seta)

    print("\n" + "=" * 74)
    print("SEM FK DE PROPOSITO  (resolvido por exclusao logica)")
    print("=" * 74)
    for filha, col, pai, col_pai, significado in LIGACOES_SEM_FK_DE_PROPOSITO:
        try:
            n = contar(conn, filha, col, pai, col_pai)
        except Exception as e:
            print(f"\n  {filha}.{col}: nao consegui checar ({e})")
            continue
        print(f"\n  {'✅' if n == 0 else '⚠ '} {filha}.{col} → {pai}.{col_pai}: {n} orfao(s)")
        if n:
            print(f"     {significado}: {exemplos(conn, filha, col, pai, col_pai)}")
            print("     Sao de antes da migracao, OU alguem apagou conta por fora")
            print("     do delete_user. Este numero nao deve crescer.")

    print("\n" + "=" * 74)
    print("LIGACOES POR E-MAIL  (FK exigiria migrar a coluna para id antes)")
    print("=" * 74)
    for filha, col, pai, col_pai, significado in LIGACOES_POR_EMAIL:
        try:
            n = contar(conn, filha, col, pai, col_pai)
        except Exception as e:
            print(f"\n  {filha}.{col}: nao consegui checar ({e})")
            continue
        print(f"\n  {'✅' if n == 0 else '⚠ '} {filha}.{col} → {pai}.{col_pai}: {n} sem correspondencia")
        if n:
            print(f"     {significado}")
            print(f"     exemplos: {exemplos(conn, filha, col, pai, col_pai)}")

    print("\n" + "-" * 74)
    print(f"  {len(ativas)} de {len(LIGACOES)} chaves ativas.")
    return achados, faltam_fk


def imprimir_sql(achados):
    print("\n" + "=" * 74)
    print("-- SQL. LEIA CADA LINHA. Faca backup antes. Rode em transacao.")
    print("=" * 74)
    if achados:
        print("\n-- 1) Os orfaos. ESCOLHA UMA das duas linhas de cada par:")
        for filha, col, pai, col_pai, n in achados:
            print(f"\n--    {filha}: {n} orfao(s)")
            print(f'-- soltar o vinculo (mantem a linha, perde a origem):')
            print(f'UPDATE "{filha}" SET "{col}" = NULL WHERE "{col}" IS NOT NULL AND NOT EXISTS'
                  f' (SELECT 1 FROM "{pai}" p WHERE p."{col_pai}" = "{filha}"."{col}");')
            print(f'-- ou apagar a linha (irreversivel):')
            print(f'-- DELETE FROM "{filha}" WHERE "{col}" IS NOT NULL AND NOT EXISTS'
                  f' (SELECT 1 FROM "{pai}" p WHERE p."{col_pai}" = "{filha}"."{col}");')

    print("\n-- 2) As foreign keys. ON DELETE decide o que acontece com o filho:")
    print("--    SET NULL  = a linha sobrevive sem o vinculo (aula perde o dono)")
    print("--    CASCADE   = a linha vai junto (log de token some com o usuario)")
    regras = {
        ("study_plans", "owner_id"): "SET NULL",
        ("plan_shares", "plan_id"): "CASCADE",
        ("users", "referred_by_id"): "SET NULL",
        ("ai_token_logs", "user_id"): "CASCADE",
    }
    print()
    for filha, col, pai, col_pai, _ in LIGACOES:
        acao = regras[(filha, col)]
        print(f'ALTER TABLE "{filha}" ADD CONSTRAINT "fk_{filha}_{col}"')
        print(f'    FOREIGN KEY ("{col}") REFERENCES "{pai}" ("{col_pai}") ON DELETE {acao};')

    print("\n-- NOTA: commission_history nao entra aqui. Ver migrar_fks.py, que e")
    print("--       o script que aplica tudo isto de forma repetivel e transacional.")
    print("\n-- 3) O UNIQUE que falta em plan_shares (hoje da para compartilhar 2x):")
    print('-- Apaga as duplicatas mantendo a de menor id, depois cria a restricao.')
    print('DELETE FROM "plan_shares" a USING "plan_shares" b')
    print('  WHERE a.id > b.id AND a.plan_id = b.plan_id AND a.user_email = b.user_email;')
    print('ALTER TABLE "plan_shares" ADD CONSTRAINT "uq_plan_shares_plano_email"')
    print('    UNIQUE ("plan_id", "user_email");')
    print("\n-- Depois de rodar, refaca: python backend/mapear_banco.py --so-diff")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--sql", action="store_true", help="imprime o SQL de limpeza e as FKs")
    a = p.parse_args()

    url, origem = carregar_env()
    print(f"DATABASE_URL veio de: {origem}")
    print(f"Lendo …@{url.split('@')[-1] if '@' in url else url}")
    if origem.startswith("PADRAO"):
        print("⚠  URL PADRAO do codigo, nao a sua. Confira o backend/.env.")

    opcoes = urls_possiveis(url)
    if not opcoes:
        print("\n❌ Nenhum driver de Postgres. Ative o venv do backend.")
        return 2

    from sqlalchemy import create_engine, inspect
    from sqlalchemy.ext.asyncio import create_async_engine

    achados, faltam = None, []
    for tentativa, nome, e_async in opcoes:
        try:
            if e_async:
                import asyncio

                async def rodar():
                    engine = create_async_engine(tentativa)
                    try:
                        async with engine.connect() as conn:
                            return await conn.run_sync(analisar)
                    finally:
                        await engine.dispose()

                achados, faltam = asyncio.run(rodar())
            else:
                engine = create_engine(tentativa)
                with engine.connect() as conn:
                    achados, faltam = analisar(conn)
            print(f"\n(lido pelo driver {nome})")
            break
        except Exception as e:
            print(f"  {nome}: {type(e).__name__}: {e}")

    if achados is None:
        print("\n❌ Nenhum driver conseguiu conectar.")
        return 2

    if a.sql:
        imprimir_sql(achados)
    elif achados:
        print(f"\n  {len(achados)} ligacao(oes) com orfao.")
        print("     Ensaio da migracao:  python backend/migrar_fks.py")
        print("     Aplicar limpando:    python backend/migrar_fks.py --aplicar --limpar-orfaos")
    elif faltam:
        print(f"\n  ✅ Sem orfaos, mas {len(faltam)} chave(s) ainda nao existe(m):")
        for f in faltam:
            print(f"       {f}")
        print("     Aplicar:  python backend/migrar_fks.py --aplicar")
    else:
        print("\n  ✅ Nada a fazer: as chaves estao ativas e nao ha orfao nelas.")
    return 1 if achados else 0


if __name__ == "__main__":
    sys.exit(main())
