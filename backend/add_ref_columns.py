import asyncio
import os
from dotenv import load_dotenv

# 1. É VITAL CARREGAR O .ENV ANTES DE IMPORTAR O ENGINE
load_dotenv()

from database import engine
from sqlalchemy import text

async def main():
    try:
        print(f"Conectando ao banco de dados: {os.getenv('DATABASE_URL', 'PADRÃO NÃO ENCONTRADO')}...")
        
        async with engine.begin() as conn:
            print("Adicionando novas colunas...")
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR UNIQUE;"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by_id INTEGER;"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS commission_balance FLOAT DEFAULT 0.0;"))
            
            print("Gerando códigos para usuários existentes...")
            await conn.execute(text("UPDATE users SET referral_code = substr(md5(random()::text), 1, 8) WHERE referral_code IS NULL;"))
            
            print("✅ Feito! Colunas adicionadas com sucesso.")
            
    except Exception as e:
        print(f"❌ Erro durante a migração: {e}")
    finally:
        await engine.dispose()

if __name__ == "__main__":
    # Tratamento limpo para o loop assíncrono
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass