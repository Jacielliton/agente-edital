import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

# Pegue a URL do banco do seu .env
DATABASE_URL = os.getenv("DATABASE_URL") 

# O asyncpg precisa do prefixo 'postgresql://' padrão
if DATABASE_URL.startswith("postgresql+asyncpg://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")

async def fix_database():
    try:
        print("🔌 Conectando ao banco de dados...")
        conn = await asyncpg.connect(DATABASE_URL)
        
        print("🛠️ Adicionando coluna is_active...")
        await conn.execute("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT TRUE;")
        
        print("✅ Coluna adicionada com sucesso!")
        await conn.close()
    except Exception as e:
        print(f"❌ Erro: {e}")

if __name__ == "__main__":
    asyncio.run(fix_database())