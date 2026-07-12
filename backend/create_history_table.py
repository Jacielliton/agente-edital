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
            print("Criando tabela de histórico de comissões...")
            
            # 1. Executa a criação da tabela
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS commission_history (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    amount FLOAT NOT NULL,
                    action_type VARCHAR(50) NOT NULL,
                    description VARCHAR(255),
                    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            """))
            
            # 2. Executa a criação do índice separadamente
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_commission_user ON commission_history(user_id)
            """))
            
            print("✅ Tabela 'commission_history' e índice criados com sucesso!")
    except Exception as e:
        print(f"❌ Erro: {e}")
    finally:
        await engine.dispose()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass