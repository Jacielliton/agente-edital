import asyncio
import os
from dotenv import load_dotenv

# 1. Carrega as variáveis do .env PRIMEIRO
load_dotenv(override=True)

# 2. SÓ DEPOIS importa a conexão do banco
from sqlalchemy import text
from database import engine

async def fix_database():
    print("Iniciando atualização do banco de dados...")
    async with engine.begin() as conn:
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN plan_expires_at TIMESTAMP;"))
            print("✅ Coluna 'plan_expires_at' adicionada com sucesso na tabela users!")
        except Exception as e:
            print(f"⚠️ Erro ao atualizar: {e}")

if __name__ == "__main__":
    asyncio.run(fix_database())