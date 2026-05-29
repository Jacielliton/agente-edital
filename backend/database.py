# backend/database.py
import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base

# Captura a URL injetada pelo Railway (ou usa a local por padrão)
raw_db_url = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost/agente_edital")

# O Railway injeta "postgresql://", mas o SQLAlchemy com asyncpg exige "postgresql+asyncpg://"
if raw_db_url.startswith("postgresql://"):
    DATABASE_URL = raw_db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
else:
    DATABASE_URL = raw_db_url

engine = create_async_engine(DATABASE_URL, echo=False)

# Usando async_sessionmaker (melhor prática para métodos assíncronos)
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False
)

Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session