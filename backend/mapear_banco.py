"""
Mapeia a estrutura REAL do banco e compara com a que o codigo declara.

    python backend/mapear_banco.py             # mapa + divergencias
    python backend/mapear_banco.py --so-diff   # so o que esta divergente
    python backend/mapear_banco.py --sql       # gera o ALTER TABLE que falta
    python backend/mapear_banco.py --modelos   # so o lado do codigo (nao conecta)

POR QUE ISTO E NECESSARIO NESTE PROJETO
---------------------------------------
O main.py cria as tabelas com `Base.metadata.create_all`. Essa funcao cria
TABELA que falta, mas NUNCA adiciona COLUNA que falta numa tabela que ja
existe. Entao, num banco que ja tem `users`, acrescentar um campo no modelo
nao muda nada — e o SELECT quebra em producao com "column does not exist".

Foi por isso que nasceram fix_db.py, fix_db2.py, add_ref_columns.py,
update_db_ia.py, update_perf_db.py, update_pg.py e migrate.py: cada um e um
ALTER TABLE escrito a mao depois de um susto. Nao ha Alembic no projeto, e
nao ha registro de qual desses ja rodou em qual ambiente.

Consequencia pratica: o que o codigo declara e o que o banco tem podem estar
diferentes AGORA, e nao da para saber lendo o codigo. So perguntando ao banco.

O lado do CODIGO e lido por AST a partir de models.py (nao importa nada):
roda mesmo sem as dependencias instaladas e sem efeito colateral nenhum.
"""

from __future__ import annotations

import argparse
import ast
import os
import pathlib
import sys
from typing import Dict, List, Optional, Tuple

AQUI = pathlib.Path(__file__).resolve().parent

# Ligacoes que ficam sem FOREIGN KEY por decisao, nao por esquecimento.
# Sem esta lista o script acusaria para sempre algo que foi resolvido de outro
# jeito — e um aviso que nunca some acaba ignorado junto com os de verdade.
SEM_FK_DE_PROPOSITO = {
    ("commission_history", "user_id"):
        "livro contabil: a conta e excluida logicamente (users.deleted_at), "
        "entao este user_id nunca fica orfao",
}

# Tipos SQLAlchemy -> como o Postgres costuma reportar. Serve so para o
# comparativo grosseiro; diferenca de tamanho de VARCHAR nao e apontada.
EQUIVALENTES = {
    "Integer": {"integer", "bigint", "smallint"},
    "String": {"character varying", "varchar", "text"},
    "Text": {"text", "character varying"},
    "Float": {"double precision", "real", "numeric"},
    "Boolean": {"boolean"},
    "DateTime": {"timestamp without time zone", "timestamp with time zone", "timestamp"},
    "JSON": {"json", "jsonb"},
    "Date": {"date"},
}


class Coluna:
    def __init__(self, nome: str, tipo: str, **kw):
        self.nome = nome
        self.tipo = tipo
        self.pk = kw.get("primary_key", False)
        self.indice = kw.get("index", False)
        self.unico = kw.get("unique", False)
        self.nulo = kw.get("nullable", None)
        self.padrao = kw.get("default", None)
        self.fk = kw.get("fk", None)

    def marcas(self) -> str:
        m = []
        if self.pk: m.append("PK")
        if self.fk: m.append(f"FK→{self.fk}")
        if self.unico: m.append("unico")
        if self.indice: m.append("indice")
        if self.nulo is False: m.append("NOT NULL")
        if self.padrao is not None: m.append(f"padrao={self.padrao}")
        return "  ".join(m)


# ---------------------------------------------------------------- lado codigo
def _valor(no: ast.AST):
    try:
        return ast.literal_eval(no)
    except Exception:
        return ast.unparse(no) if hasattr(ast, "unparse") else "?"


def ler_modelos(caminho: pathlib.Path) -> Dict[str, List[Coluna]]:
    """Le as classes SQLAlchemy do arquivo sem importar nada dele."""
    arvore = ast.parse(caminho.read_text(encoding="utf-8"))
    tabelas: Dict[str, List[Coluna]] = {}

    for no in arvore.body:
        if not isinstance(no, ast.ClassDef):
            continue
        if not any(isinstance(b, ast.Name) and b.id == "Base" for b in no.bases):
            continue

        nome_tabela = None
        colunas: List[Coluna] = []
        for corpo in no.body:
            if not isinstance(corpo, ast.Assign) or not corpo.targets:
                continue
            alvo = corpo.targets[0]
            if not isinstance(alvo, ast.Name):
                continue
            if alvo.id == "__tablename__":
                nome_tabela = _valor(corpo.value)
                continue
            chamada = corpo.value
            if not (isinstance(chamada, ast.Call) and getattr(chamada.func, "id", "") == "Column"):
                continue

            tipo, fk = "?", None
            for arg in chamada.args:
                if isinstance(arg, ast.Name):
                    tipo = arg.id
                elif isinstance(arg, ast.Call):
                    f = getattr(arg.func, "id", "")
                    if f == "ForeignKey":
                        fk = _valor(arg.args[0]) if arg.args else "?"
                    else:
                        tipo = f
            kw = {k.arg: _valor(k.value) for k in chamada.keywords if k.arg}
            colunas.append(Coluna(alvo.id, tipo, fk=fk, **kw))

        if nome_tabela:
            tabelas[nome_tabela] = colunas
    return tabelas


# ----------------------------------------------------------------- lado banco
def carregar_env() -> Tuple[str, str]:
    """Devolve (URL, de-onde-veio).

    O python-dotenv nem sempre esta no Python que roda o script (fora do venv,
    por exemplo). Antes isto falhava EM SILENCIO e o script seguia com a URL
    padrao — dizendo "conectando em localhost/agente_edital" mesmo com outro
    banco no .env. Agora o .env e lido na mao quando o dotenv falta, e a
    origem da URL sai impressa.
    """
    if os.getenv("DATABASE_URL"):
        return os.environ["DATABASE_URL"], "variavel de ambiente"

    caminho = pathlib.Path(os.getenv("ENV_FILE_PATH") or (AQUI / ".env"))
    if caminho.is_file():
        # Leitura propria: sem dependencia, e aguenta o .env salvo em UTF-16
        # pelo PowerShell (o requirements.txt deste projeto esta assim).
        bruto = caminho.read_bytes()
        texto = None
        for enc in ("utf-8-sig", "utf-16", "latin-1"):
            try:
                tentativa = bruto.decode(enc)
                if "\x00" not in tentativa:
                    texto = tentativa
                    break
            except Exception:
                continue
        for linha in (texto or "").splitlines():
            linha = linha.strip()
            if not linha or linha.startswith("#") or "=" not in linha:
                continue
            chave, _, valor = linha.partition("=")
            if chave.strip() == "DATABASE_URL":
                return valor.strip().strip('"').strip("'"), str(caminho)

    return "postgresql://postgres:postgres@localhost/agente_edital", "PADRAO (nao achei DATABASE_URL)"


def _driver_disponivel(modulo: str) -> bool:
    import importlib.util
    return importlib.util.find_spec(modulo) is not None


def urls_possiveis(url: str) -> List[Tuple[str, str, bool]]:
    """(url, nome do driver, e_async) na ordem em que vale a pena tentar.

    Este projeto instala asyncpg; o psycopg2 so aparece em alguns ambientes.
    Em vez de exigir um driver especifico, tentamos o que existir.
    """
    if url.startswith("sqlite"):
        return [(url, "sqlite", False)]

    base = url
    for prefixo in ("postgresql+asyncpg://", "postgresql+psycopg2://", "postgresql+psycopg://", "postgres://"):
        if base.startswith(prefixo):
            base = "postgresql://" + base[len(prefixo):]
            break

    opcoes: List[Tuple[str, str, bool]] = []
    if _driver_disponivel("psycopg2"):
        opcoes.append((base, "psycopg2", False))
    if _driver_disponivel("psycopg"):
        opcoes.append((base.replace("postgresql://", "postgresql+psycopg://", 1), "psycopg3", False))
    if _driver_disponivel("pg8000"):
        opcoes.append((base.replace("postgresql://", "postgresql+pg8000://", 1), "pg8000", False))
    if _driver_disponivel("asyncpg"):
        opcoes.append((base.replace("postgresql://", "postgresql+asyncpg://", 1), "asyncpg", True))
    return opcoes


def _coletar(insp, conn) -> Dict[str, Dict]:
    """O trabalho de verdade. Roda igual no caminho sincrono e no assincrono."""
    from sqlalchemy import text
    real: Dict[str, Dict] = {}
    for tabela in insp.get_table_names():
        colunas = {}
        for c in insp.get_columns(tabela):
            colunas[c["name"]] = {
                "tipo": str(c["type"]).lower(),
                "nulo": c.get("nullable"),
                "padrao": c.get("default"),
            }
        try:
            linhas = conn.execute(text(f'SELECT COUNT(*) FROM "{tabela}"')).scalar()
        except Exception:
            linhas = None
        real[tabela] = {
            "colunas": colunas,
            "pk": insp.get_pk_constraint(tabela).get("constrained_columns", []),
            "indices": insp.get_indexes(tabela),
            "fks": insp.get_foreign_keys(tabela),
            "unicos": insp.get_unique_constraints(tabela),
            "linhas": linhas,
        }
    return real


def ler_banco_sincrono(url: str) -> Dict[str, Dict]:
    from sqlalchemy import create_engine, inspect
    engine = create_engine(url)
    with engine.connect() as conn:
        return _coletar(inspect(conn), conn)


def ler_banco_async(url: str) -> Dict[str, Dict]:
    """Caminho pelo asyncpg, que este projeto ja usa em producao."""
    import asyncio
    from sqlalchemy import inspect
    from sqlalchemy.ext.asyncio import create_async_engine

    async def rodar():
        engine = create_async_engine(url)
        try:
            async with engine.connect() as conn:
                return await conn.run_sync(lambda sc: _coletar(inspect(sc), sc))
        finally:
            await engine.dispose()

    return asyncio.run(rodar())


def ler_banco(url: str) -> Tuple[Dict[str, Dict], str]:
    opcoes = urls_possiveis(url)
    if not opcoes:
        raise RuntimeError(
            "nenhum driver de Postgres encontrado (psycopg2, psycopg, pg8000 ou asyncpg).\n"
            "   Este projeto instala o asyncpg — provavelmente voce esta fora do venv."
        )
    erros = []
    for tentativa, nome, e_async in opcoes:
        try:
            dados = (ler_banco_async if e_async else ler_banco_sincrono)(tentativa)
            return dados, nome
        except Exception as e:
            erros.append(f"{nome}: {type(e).__name__}: {e}")
    raise RuntimeError("nenhum driver conseguiu conectar.\n   " + "\n   ".join(erros))


# --------------------------------------------------------------------- saidas
def tipos_batem(tipo_modelo: str, tipo_banco: str) -> bool:
    aceitos = EQUIVALENTES.get(tipo_modelo)
    if not aceitos:
        return True  # tipo que nao sei traduzir: nao acuso
    return any(a in tipo_banco for a in aceitos)


def imprimir_modelos(modelos: Dict[str, List[Coluna]]) -> None:
    print("\n" + "=" * 74)
    print("O QUE O CODIGO DECLARA")
    print("=" * 74)
    for tabela, colunas in modelos.items():
        sem_fk = [c for c in colunas if c.nome.endswith("_id") and not c.fk and not c.pk
                  and (tabela, c.nome) not in SEM_FK_DE_PROPOSITO]
        print(f"\n  {tabela}  ({len(colunas)} colunas)")
        for c in colunas:
            print(f"    {c.nome:22s} {c.tipo:10s} {c.marcas()}")
        for c in colunas:
            motivo = SEM_FK_DE_PROPOSITO.get((tabela, c.nome))
            if motivo:
                print(f"    ○  {c.nome} sem FK de proposito: {motivo}")
        if sem_fk:
            print(f"    ⚠  aponta para outra tabela sem FOREIGN KEY: "
                  f"{', '.join(c.nome for c in sem_fk)}")


def comparar(modelos: Dict[str, List[Coluna]], real: Dict[str, Dict], so_diff: bool) -> List[Tuple[str, str, Coluna]]:
    print("\n" + "=" * 74)
    print("CODIGO  x  BANCO")
    print("=" * 74)
    faltando: List[Tuple[str, str, Coluna]] = []

    for tabela, colunas in modelos.items():
        if tabela not in real:
            print(f"\n  ❌ {tabela}: NAO EXISTE no banco")
            for c in colunas:
                faltando.append((tabela, "tabela", c))
            continue

        do_banco = real[tabela]["colunas"]
        nomes_modelo = {c.nome for c in colunas}
        ausentes = [c for c in colunas if c.nome not in do_banco]
        orfas = [n for n in do_banco if n not in nomes_modelo]
        divergentes = [
            (c, do_banco[c.nome]["tipo"]) for c in colunas
            if c.nome in do_banco and not tipos_batem(c.tipo, do_banco[c.nome]["tipo"])
        ]

        limpo = not (ausentes or orfas or divergentes)
        if limpo and so_diff:
            continue

        linhas = real[tabela]["linhas"]
        print(f"\n  {tabela}  ({linhas if linhas is not None else '?'} linhas)")
        if limpo:
            print("    ✅ codigo e banco batem")
        for c in ausentes:
            print(f"    ❌ FALTA NO BANCO: {c.nome} ({c.tipo}) — SELECT nesta tabela vai quebrar")
            faltando.append((tabela, "coluna", c))
        for n in orfas:
            print(f"    ⚠  so no banco, o codigo nao usa mais: {n}")
        for c, tipo_real in divergentes:
            print(f"    ⚠  tipo diferente: {c.nome} — modelo {c.tipo}, banco {tipo_real}")

        if not real[tabela]["fks"]:
            candidatas = [c.nome for c in colunas if c.nome.endswith("_id") and not c.pk
                          and (tabela, c.nome) not in SEM_FK_DE_PROPOSITO]
            if candidatas:
                print(f"    ⚠  sem NENHUMA foreign key ({', '.join(candidatas)}): "
                      f"apagar o registro pai deixa orfao aqui")

    sobrando = [t for t in real if t not in modelos]
    if sobrando:
        print(f"\n  Tabelas no banco que o codigo nao declara: {', '.join(sorted(sobrando))}")

    # Sem isto, um banco em dia com --so-diff imprimia o cabecalho e MAIS NADA.
    # Silencio nao e resposta: da para confundir com "o script nao rodou".
    sem_fk = sum(
        1 for tab, cols in modelos.items()
        if tab in real and not real[tab]["fks"]
        and any(c.nome.endswith("_id") and not c.pk
                and (tab, c.nome) not in SEM_FK_DE_PROPOSITO for c in cols)
    )
    conferidas = sum(1 for tab in modelos if tab in real)
    print(f"\n  {'-' * 68}")
    if faltando:
        print(f"  ❌ {len(faltando)} coluna(s)/tabela(s) que o codigo declara e o banco NAO tem.")
    else:
        print(f"  ✅ Nenhuma divergencia: as {conferidas} tabelas do codigo existem no banco")
        print("     com todas as colunas declaradas.")
    if sem_fk:
        print(f"  ⚠  {sem_fk} tabela(s) sem foreign key. Nao e divergencia — e como foi")
        print("     desenhado. Ver 'checar_orfaos.py' antes de decidir criar as FKs.")
    # Antes esta linha dizia "producao e outro banco" sempre — inclusive
    # quando o script estava rodando EM producao, o que confunde em vez de
    # avisar. O aviso agora aponta para o banco que foi realmente medido.
    print("\n  Isto vale para o banco medido acima. Cada ambiente (local, VPS,")
    print("  Railway) tem o seu — confira em cada um antes de dar por encerrado.")
    return faltando


def gerar_sql(faltando: List[Tuple[str, str, Coluna]]) -> None:
    if not faltando:
        print("\n-- nada a alterar: o banco tem tudo que o codigo declara")
        return
    print("\n" + "=" * 74)
    print("-- SQL sugerido. LEIA antes de rodar, e faca backup.")
    print("-- IF NOT EXISTS torna o script repetivel sem dar erro.")
    print("=" * 74)
    tipos = {"Integer": "INTEGER", "String": "VARCHAR", "Text": "TEXT", "Float": "DOUBLE PRECISION",
             "Boolean": "BOOLEAN", "DateTime": "TIMESTAMP", "JSON": "JSONB", "Date": "DATE"}
    for tabela, escopo, c in faltando:
        if escopo == "tabela":
            continue
        tipo = tipos.get(c.tipo, "VARCHAR")
        padrao = ""
        if c.padrao is not None and not callable(c.padrao):
            v = c.padrao
            if isinstance(v, bool):
                padrao = f" DEFAULT {'TRUE' if v else 'FALSE'}"
            elif isinstance(v, (int, float)):
                padrao = f" DEFAULT {v}"
            elif isinstance(v, str) and not v.startswith("datetime"):
                padrao = f" DEFAULT '{v}'"
        print(f'ALTER TABLE "{tabela}" ADD COLUMN IF NOT EXISTS "{c.nome}" {tipo}{padrao};')
        if c.indice or c.unico:
            u = "UNIQUE " if c.unico else ""
            print(f'CREATE {u}INDEX IF NOT EXISTS "ix_{tabela}_{c.nome}" ON "{tabela}" ("{c.nome}");')


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--arquivo", default=None,
                   help="onde estao os modelos (padrao: models.py, com main.py de reserva)")
    p.add_argument("--modelos", action="store_true", help="so o lado do codigo, sem conectar")
    p.add_argument("--so-diff", action="store_true", help="omite as tabelas que estao em dia")
    p.add_argument("--sql", action="store_true", help="imprime o ALTER TABLE que falta")
    a = p.parse_args()

    # Os modelos moram em models.py desde 10/09/2026. O main.py fica como
    # reserva para quem rodar isto num checkout mais antigo.
    if a.arquivo:
        candidatos = [pathlib.Path(a.arquivo)]
    else:
        candidatos = [AQUI / "models.py", AQUI / "main.py"]

    modelos, de_onde = {}, None
    for c in candidatos:
        if c.is_file():
            modelos = ler_modelos(c)
            if modelos:
                de_onde = c.name
                break
    if not modelos:
        print(f"Nenhuma classe (Base) encontrada em {', '.join(c.name for c in candidatos)}.")
        print("Aponte o arquivo certo com --arquivo.")
        return 1
    print(f"Modelos lidos de {de_onde}.")

    # O mapa completo so aparece quando ele e o pedido. Com --so-diff ou --sql
    # o que interessa e a divergencia, nao a lista inteira de novo.
    if a.modelos or not (a.so_diff or a.sql):
        imprimir_modelos(modelos)
    if a.modelos:
        return 0

    url, origem = carregar_env()
    escondida = url.split("@")[-1] if "@" in url else url
    print(f"\nDATABASE_URL veio de: {origem}")
    print(f"Conectando em …@{escondida}")
    if origem.startswith("PADRAO"):
        print("⚠  Esta e a URL PADRAO do codigo, nao a sua. Confira o backend/.env")
        print("   ou exporte DATABASE_URL antes de rodar.")
    try:
        real, driver = ler_banco(url)
        print(f"Conectado pelo driver {driver}.")
    except Exception as e:
        print(f"\n❌ Nao consegui ler o banco: {e}")
        print("\n   Quase sempre e o venv. No PowerShell, a partir da raiz do projeto:")
        print("       .\\backend\\venv\\Scripts\\Activate.ps1")
        print("       python backend\\mapear_banco.py --so-diff")
        print("\n   Para ver so o lado do codigo, sem conectar:")
        print("       python backend/mapear_banco.py --modelos")
        return 2

    faltando = comparar(modelos, real, a.so_diff)
    if a.sql:
        gerar_sql(faltando)
    elif faltando:
        print(f"\n  {len(faltando)} coluna(s) declarada(s) e ausente(s) no banco.")
        print("  Rode com --sql para ver o ALTER TABLE correspondente.")
    return 1 if faltando else 0


if __name__ == "__main__":
    sys.exit(main())
