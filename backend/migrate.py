import asyncio
import os
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

# Carrega as variáveis do seu .env atual
load_dotenv()

# É vital que a sua VPS tenha o ficheiro .env configurado corretamente!
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:senha123@localhost:5445/agente_edital")

engine = create_async_engine(DATABASE_URL, echo=False)

async def run_migrations():
    print("Iniciando verificação e transferência em lote no banco de dados...")
    
    # 1. Tenta adicionar as colunas isoladamente
    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE users ADD COLUMN can_manage_lessons BOOLEAN DEFAULT FALSE;"))
    except Exception: pass

    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE study_plans ADD COLUMN visibility VARCHAR DEFAULT 'public';"))
    except Exception: pass 

    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE study_plans ADD COLUMN owner_id INTEGER;"))
    except Exception: pass 

    # 2. TRANSFERÊNCIA DE AULAS ÓRFÃS (Mais seguro para Produção/VPS)
    print("🔄 Transferindo aulas antigas (sem dono) para o Admin (ID 1)...")
    try:
        async with engine.begin() as conn:
            # Só altera a visibilidade se ela estiver vazia/nula
            await conn.execute(text("UPDATE study_plans SET visibility = 'public' WHERE visibility IS NULL;"))
            
            # Só transfere para o Admin as aulas que NÃO têm dono ainda
            await conn.execute(text("UPDATE study_plans SET owner_id = 1 WHERE owner_id IS NULL;")) 
            
        print("🚀 Recuperação concluída! Todas as aulas antigas agora pertencem ao Admin.")
    except Exception as e:
        print(f"⚠️ Erro ao atualizar as aulas: {e}")

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(run_migrations())