import asyncio
import os
import asyncpg
from dotenv import load_dotenv

load_dotenv(override=True)
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:senha123@localhost:5445/agente_edital")
# Ajuste a URL caso o asyncpg exija formato padrão sem o '+asyncpg'
if DATABASE_URL.startswith("postgresql+asyncpg://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")

async def add_column():
    print("Conectando ao banco de dados...")
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        # Adiciona a coluna com valor padrão 1
        await conn.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER DEFAULT 1')
        print("✅ Coluna 'session_version' adicionada com sucesso na tabela users!")
    except Exception as e:
        print(f"⚠️ Erro ao alterar tabela: {e}")
    finally:
        await conn.close()

asyncio.run(add_column())