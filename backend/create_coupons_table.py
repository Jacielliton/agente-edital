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
            print("Criando tabela de cupons...")
            
            # 1. APAGA A TABELA ANTIGA PRIMEIRO (CUIDADO: Isso apaga os cupons existentes)
            await conn.execute(text("DROP TABLE IF EXISTS coupons CASCADE"))
            
            # 2. Executa a criação da tabela NOVA
            await conn.execute(text("""
                CREATE TABLE coupons (
                    id SERIAL PRIMARY KEY,
                    code VARCHAR(50) UNIQUE NOT NULL,
                    discount_percentage FLOAT NOT NULL,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            """))
            
            print("✅ Tabela 'coupons' e índice criados com sucesso!")
    except Exception as e:
        print(f"❌ Erro: {e}")
    finally:
        await engine.dispose()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass