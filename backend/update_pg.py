import asyncio
import os
from dotenv import load_dotenv

load_dotenv()
from database import engine
from sqlalchemy import text

async def main():
    try:
        print("Conectando ao banco de dados...")
        async with engine.begin() as conn:
            print("Adicionando a coluna 'allowed_concursos' na tabela 'users'...")
            
            # Adiciona a coluna
            await conn.execute(text("ALTER TABLE users ADD COLUMN allowed_concursos VARCHAR;"))
            
            print("✅ Coluna 'allowed_concursos' adicionada com sucesso!")
    except Exception as e:
        # Se a coluna já existir, o PostgreSQL avisa e capturamos aqui
        if "already exists" in str(e).lower() or "duplicate column" in str(e).lower():
            print("✅ A coluna 'allowed_concursos' já existe no banco de dados!")
        else:
            print(f"❌ Erro ao adicionar coluna: {e}")
    finally:
        await engine.dispose()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as e:
        # Ignora erros do loop do Windows ao fechar a conexão assíncrona
        pass