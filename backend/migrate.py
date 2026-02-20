import asyncio
import os
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

# Carrega as variáveis de ambiente (para pegar a URL do banco)
load_dotenv(override=True)
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:senha123@localhost:5445/agente_edital")

async def run_migration():
    print("🔄 Iniciando migração do banco de dados...")
    engine = create_async_engine(DATABASE_URL, echo=False)
    
    async with engine.begin() as conn:
        # Tenta adicionar a coluna api_key
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN api_key VARCHAR;"))
            print("✅ Coluna 'api_key' adicionada com sucesso!")
        except Exception as e:
            print("⚠️ A coluna 'api_key' já existe ou houve um erro menor. Detalhe:", str(e).split('\n')[0])

        # Tenta adicionar a coluna preferred_model
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN preferred_model VARCHAR;"))
            print("✅ Coluna 'preferred_model' adicionada com sucesso!")
        except Exception as e:
            print("⚠️ A coluna 'preferred_model' já existe ou houve um erro menor. Detalhe:", str(e).split('\n')[0])

    await engine.dispose()
    print("🚀 Migração concluída. Você já pode rodar o main.py novamente!")

if __name__ == "__main__":
    asyncio.run(run_migration())