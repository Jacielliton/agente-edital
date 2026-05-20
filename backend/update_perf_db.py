import asyncio
import os
import asyncpg
from dotenv import load_dotenv

load_dotenv(override=True)
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:senha123@localhost:5445/agente_edital")
if DATABASE_URL.startswith("postgresql+asyncpg://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")

async def update_columns():
    print("Conectando ao banco de dados...")
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        await conn.execute('ALTER TABLE performance_records ADD COLUMN IF NOT EXISTS nivel VARCHAR(100)')
        await conn.execute('ALTER TABLE performance_records ADD COLUMN IF NOT EXISTS formato VARCHAR(100)')
        await conn.execute('ALTER TABLE performance_records ADD COLUMN IF NOT EXISTS concurso VARCHAR(150)')
        print("✅ Colunas 'nivel', 'formato' e 'concurso' adicionadas com sucesso!")
    except Exception as e:
        print(f"⚠️ Erro: {e}")
    finally:
        await conn.close()

asyncio.run(update_columns())