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
            print("Adicionando novas colunas na tabela 'users'...")
            
            # 1. Coluna do tipo de plano (Simples, Plus, Pro)
            await conn.execute(text("""
                ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_type VARCHAR DEFAULT 'Simples'
            """))
            
            # 2. Coluna para tokens utilizados
            await conn.execute(text("""
                ALTER TABLE users ADD COLUMN IF NOT EXISTS tokens_used INTEGER DEFAULT 0
            """))
            
            # 3. Coluna para o limite de tokens do plano
            await conn.execute(text("""
                ALTER TABLE users ADD COLUMN IF NOT EXISTS token_limit INTEGER DEFAULT 0
            """))
            
            # 4. Coluna para a data de reset dos tokens
            await conn.execute(text("""
                ALTER TABLE users ADD COLUMN IF NOT EXISTS token_reset_date TIMESTAMP WITHOUT TIME ZONE
            """))
            
            # 5. Coluna de bloqueio da IA
            await conn.execute(text("""
                ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_blocked BOOLEAN DEFAULT FALSE
            """))
            
            print("✅ Novas colunas (plan_type, tokens_used, token_limit, token_reset_date, ai_blocked) criadas com sucesso!")
    except Exception as e:
        print(f"❌ Erro: {e}")
    finally:
        await engine.dispose()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass