# backend/main.py
import os
import uvicorn
import json
import re
import asyncio
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Optional, AsyncGenerator
from contextlib import asynccontextmanager
import httpx
from fastapi import FastAPI, HTTPException, Depends
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict
from dotenv import load_dotenv
from typing import Literal

from passlib.context import CryptContext
from jose import JWTError, jwt
from fastapi.security import OAuth2PasswordBearer

# Imports de Banco de Dados (SQLAlchemy + Asyncpg)
from sqlalchemy import Column, Float, Integer, String, DateTime, JSON, select, desc, func, Boolean, or_
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base

import requests

# Cliente OpenAI/OpenRouter
from openai import AsyncOpenAI

# ============================================================================
# 1. CONFIGURAÇÃO DE AMBIENTE E BANCO DE DADOS
# ============================================================================

load_dotenv(override=True)
ENV_FILE_PATH = os.getenv("ENV_FILE_PATH", ".env")

# String de conexão com o banco
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:senha123@localhost:5445/agente_edital")

engine = create_async_engine(DATABASE_URL, echo=False)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False
)

Base = declarative_base()

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session

# ============================================================================
# 2. MODELOS DE BANCO DE DADOS (ORM)
# ============================================================================

class PerformanceRecord(Base):
    __tablename__ = "performance_records"
    id = Column(Integer, primary_key=True, index=True)
    user_email = Column(String, index=True) # Vinculado ao usuário logado
    tipo = Column(String)                   # 'simulado' ou 'discursiva'
    tema = Column(String)                   # Ex: "Direito Penal" ou "Simulado Geral"
    nota_obtida = Column(Float)
    nota_maxima = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)
    nivel = Column(String, nullable=True)
    formato = Column(String, nullable=True)
    concurso = Column(String, nullable=True)
    
class SimuladoTopicRequest(BaseModel):
    area: str
    topico: str
    conteudo: str
    model: Optional[str] = None
    api_key: Optional[str] = None
    qtd_questoes: Optional[int] = 5
    nivel: Optional[Literal["Iniciante", "Normal", "Avançado", "Expert"]] = "Normal"
    formato: Optional[str] = "Múltipla Escolha"
    
class StoredPlan(Base):
    __tablename__ = "study_plans"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    area = Column(String)
    content = Column(JSON)
    ano = Column(String, nullable=True)
    banca = Column(String, nullable=True)
    concurso = Column(String, nullable=True)
    visibility = Column(String, default="public") # Adicionado
    owner_id = Column(Integer, nullable=True)     # Adicionado
    created_at = Column(DateTime, default=datetime.utcnow)
    
class PlanShare(Base):
    __tablename__ = "plan_shares"
    id = Column(Integer, primary_key=True, index=True)
    plan_id = Column(Integer, index=True)
    user_email = Column(String, index=True)

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(String, default="user") 
    api_key = Column(String, nullable=True)          
    preferred_model = Column(String, nullable=True)  
    can_manage_lessons = Column(Boolean, default=False) 
    session_version = Column(Integer, default=1)


# ============================================================================
# 3. SEGURANÇA (JWT & HASH)
# ============================================================================

SECRET_KEY = os.getenv("SECRET_KEY", "uma_chave_super_secreta_e_aleatoria_123")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 1 dia

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# ============================================================================
# 4. SCHEMAS (PYDANTIC)
# ============================================================================
class OpenRouterExchange(BaseModel):
    code: str
    
class UpdatePlanRequest(BaseModel):
    title: Optional[str] = None
    area: Optional[str] = None
    ano: Optional[str] = None
    banca: Optional[str] = None
    concurso: Optional[str] = None
    visibility: Optional[str] = None  

class ShareRequest(BaseModel):
    email: str
    
class PerformanceCreate(BaseModel):
    tipo: str
    tema: str
    nota_obtida: float
    nota_maxima: float
    nivel: Optional[str] = None
    formato: Optional[str] = None
    concurso: Optional[str] = None

class PerformanceResponse(BaseModel):
    id: int
    tipo: str
    tema: str
    nota_obtida: float
    nota_maxima: float
    nivel: Optional[str] = None
    formato: Optional[str] = None
    concurso: Optional[str] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
    
class GlobalEssayRequest(BaseModel):
    area: str
    aulas_titulos: List[str]
    nivel: Optional[str] = "Normal"
    model: Optional[str] = "arcee-ai/trinity-large-thinking:free"
    api_key: Optional[str] = None
    
class TreinoDiscursivaRequest(BaseModel):
    area: str
    topicos: List[str]
    tipo_prova: str
    cargo: str
    banca: str
    nivel: Optional[str] = "Normal" # <--- ADICIONADO
    model: Optional[str] = "arcee-ai/trinity-large-thinking:free"
    api_key: Optional[str] = None
    
class ExtractTopicsRequest(BaseModel):
    texto: str
    model: Optional[str] = "arcee-ai/trinity-large-thinking:free"
    api_key: Optional[str] = None
        
class EssayCorrectionRequest(BaseModel):
    texto_motivador: str
    comando: str
    aspectos: List[Dict[str, Any]]
    resposta_aluno: str
    model: Optional[str] = "arcee-ai/trinity-large-thinking:free"
    api_key: Optional[str] = None

class GenerateEssayRequest(BaseModel):
    area: str
    aula_titulo: str
    lesson_content: dict
    nivel: Optional[str] = "Normal"
    model: Optional[str] = "arcee-ai/trinity-large-thinking:free"
    api_key: Optional[str] = None

class ChatMessageRequest(BaseModel):
    area: str
    aula_titulo: str
    mensagem: str
    historico: List[Dict[str, str]] = []
    model: Optional[str] = "arcee-ai/trinity-large-thinking:free"
    api_key: Optional[str] = None
    
class UserLogin(BaseModel):
    email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    email: str
    can_manage_lessons: bool

class UserCreate(BaseModel):
    email: str
    password: str
    role: str = "user"
    
class UserSettingsUpdate(BaseModel):
    api_key: Optional[str] = None
    preferred_model: Optional[str] = None

class UserSettingsResponse(BaseModel):
    api_key: Optional[str] = None
    preferred_model: Optional[str] = None

async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Credenciais inválidas ou token expirado",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    clean_token = token.replace('"', '').replace("'", "")
    
    try:
        payload = jwt.decode(clean_token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        token_session_version = payload.get("session_version") # <--- LÊ DO TOKEN
        
        if email is None:
            raise credentials_exception
    except JWTError as e:
        print(f"⚠️ [Auth] Falha no Token JWT: {e}")
        raise credentials_exception
        
    result = await db.execute(select(User).filter(User.email == email))
    user = result.scalars().first()
    
    if user is None:
        raise credentials_exception
        
    # === SISTEMA ANTI-COMPARTILHAMENTO: VALIDA A SESSÃO ===
    # Se o token tem uma versão, mas ela é diferente da versão atual no banco,
    # significa que alguém fez login DEPOIS deste token ter sido gerado.
    if token_session_version is not None and user.session_version != token_session_version:
        raise HTTPException(
            status_code=401,
            detail="CONFLITO_DE_SESSAO", # Uma string específica para o Frontend reconhecer
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    return user

class ConfigRequest(BaseModel):
    default_model: str | None = None
    token: str | None = None
    available_models: list[str] | None = None

class SyllabusRequest(BaseModel):
    text: str
    model: str | None = None
    question_format: str = "Múltipla Escolha"
    question_level: Literal["Iniciante", "Normal", "Avançado", "Expert"] = "Normal"

class SavePlanRequest(BaseModel):
    title: str
    area: str
    content: Dict[str, Any]
    ano: str
    banca: str
    concurso: str
    visibility: str = "public" # NOVO

class PlanSummaryResponse(BaseModel):
    id: int
    title: str
    area: str
    ano: Optional[str] = None
    banca: Optional[str] = None
    concurso: Optional[str] = None
    visibility: str            # NOVO
    owner_email: Optional[str] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

# NOVOS SCHEMAS PARA USUÁRIOS (CRUD ADMIN)
class UserResponse(BaseModel):
    id: int
    email: str
    role: str
    can_manage_lessons: bool # Garante que o campo apareça no JSON enviado ao React
    model_config = ConfigDict(from_attributes=True)

class UserCreateAdmin(BaseModel):
    email: str
    password: str
    role: str = "user"
    can_manage_lessons: bool = False

class UserUpdateAdmin(BaseModel):
    email: Optional[str] = None
    role: Optional[str] = None
    can_manage_lessons: Optional[bool] = None
    password: Optional[str] = None
    
class PaginatedPlansResponse(BaseModel):
    items: List[PlanSummaryResponse]
    total: int
    
class SimuladoCespeRequest(BaseModel):
    subject: str = "Língua Portuguesa" # <-- Adicione este campo
    focus: str
    difficulty: str
    amount: int
    generate_text: bool
    model: Optional[str] = "arcee-ai/trinity-large-thinking:free"
    api_key: Optional[str] = None

class LessonCespeRequest(BaseModel):
    wrong_questions: List[Dict[str, Any]]
    model: Optional[str] = "arcee-ai/trinity-large-thinking:free"
    api_key: Optional[str] = None

# ============================================================================
# 5. CLIENTE OPENROUTER
# ============================================================================

_CLIENT = None
_CLIENT_KEY = None

def get_openrouter_client():
    global _CLIENT, _CLIENT_KEY
    key = os.getenv("OPENROUTER_API_KEY")
    if not key: return None
    if _CLIENT is None or _CLIENT_KEY != key:
        _CLIENT_KEY = key
        _CLIENT = AsyncOpenAI(base_url="https://openrouter.ai/api/v1", api_key=key)
    return _CLIENT

DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "arcee-ai/trinity-large-thinking:free")
AVAILABLE_MODELS = [m.strip() for m in os.getenv("AVAILABLE_MODELS", "arcee-ai/trinity-large-thinking:free,google/gemini-2.5-flash").split(",") if m.strip()]

# ============================================================================
# 6. LIFESPAN (CICLO DE VIDA & INICIALIZAÇÃO)
# ============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("\n🚀 Inicializando Professor AI Backend...")
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        print("✅ Banco conectado e tabelas verificadas.")

        async with AsyncSessionLocal() as db:
            result = await db.execute(select(User).filter(User.email == "admin@admin.com"))
            if not result.scalars().first():
                admin_user = User(email="admin@admin.com", hashed_password=get_password_hash("admin123"), role="admin")
                db.add(admin_user)
                await db.commit()
            
            result_user = await db.execute(select(User).filter(User.email == "user@user.com"))
            if not result_user.scalars().first():
                normal_user = User(email="user@user.com", hashed_password=get_password_hash("user123"), role="user")
                db.add(normal_user)
                await db.commit()

    except Exception as e:
        print(f"⚠️ Erro ao inicializar DB: {e}")
    
    yield
    await engine.dispose()

# ============================================================================
# 7. APP FASTAPI & ROTAS
# ============================================================================

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/auth/register")
async def register(user: UserCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.email == user.email))
    if result.scalars().first(): raise HTTPException(status_code=400, detail="Email já cadastrado")
    hashed_pw = get_password_hash(user.password)
    new_user = User(email=user.email, hashed_password=hashed_pw, role=user.role)
    db.add(new_user)
    await db.commit()
    return {"message": "Usuário criado com sucesso"}

@app.post("/auth/login", response_model=Token)
async def login(form_data: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.email == form_data.email))
    user = result.scalars().first()
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Email ou senha incorretos")
    
    # === SISTEMA ANTI-COMPARTILHAMENTO: INCREMENTA A SESSÃO ===
    # Se for nulo (usuários antigos), define como 1. Depois soma 1.
    user.session_version = (user.session_version or 0) + 1
    await db.commit()
    await db.refresh(user)
    
    # Embutimos a permissão e a VERSÃO DA SESSÃO dentro do payload do JWT
    token_data = {
        "sub": user.email, 
        "role": user.role,
        "can_manage_lessons": user.can_manage_lessons,
        "session_version": user.session_version # <--- NOVO: INJETADO NO TOKEN
    }
    access_token = create_access_token(token_data)
    
    return {
        "access_token": access_token, 
        "token_type": "bearer", 
        "role": user.role, 
        "email": user.email,
        "can_manage_lessons": user.can_manage_lessons
    }

def update_env_file(path: str, updates: dict) -> None:
    try:
        p = path
        lines = []
        if os.path.exists(p):
            with open(p, "r", encoding="utf-8") as f: lines = f.read().splitlines()
        kv = {}
        out_lines = []
        for line in lines:
            if not line or line.lstrip().startswith("#") or "=" not in line:
                out_lines.append(line)
                continue
            k, v = line.split("=", 1)
            kv[k.strip()] = v
        for k, v in updates.items():
            if v is not None: kv[k] = v
        final_content = []
        written = set()
        for line in lines:
            if "=" in line and not line.lstrip().startswith("#"):
                k = line.split("=", 1)[0].strip()
                if k in kv:
                    final_content.append(f"{k}={kv[k]}")
                    written.add(k)
                else: final_content.append(line)
            else: final_content.append(line)
        for k, v in kv.items():
            if k not in written: final_content.append(f"{k}={v}")
        with open(p, "w", encoding="utf-8") as f:
            f.write("\n".join(final_content) + "\n")
    except Exception as e:
        print(f"Erro ao salvar .env: {e}")
        raise HTTPException(status_code=500, detail=f"Falha ao atualizar .env: {e}")

@app.get("/config")
async def get_config():
    default_model = os.getenv("DEFAULT_MODEL", DEFAULT_MODEL)
    models = [m.strip() for m in os.getenv("AVAILABLE_MODELS", ",".join(AVAILABLE_MODELS)).split(",") if m.strip()]
    has_token = bool(os.getenv("OPENROUTER_API_KEY"))
    return {"default_model": default_model, "available_models": models, "has_token": has_token}

@app.post("/config")
async def set_config(cfg: ConfigRequest):
    updates = {}
    if cfg.default_model: updates["DEFAULT_MODEL"] = cfg.default_model.strip()
    if cfg.available_models:
        cleaned = [m.strip() for m in cfg.available_models if isinstance(m, str) and m.strip()]
        updates["AVAILABLE_MODELS"] = ",".join(cleaned)
    if cfg.token: updates["OPENROUTER_API_KEY"] = cfg.token.strip()
    if updates:
        update_env_file(ENV_FILE_PATH, updates)
        load_dotenv(override=True)
        global DEFAULT_MODEL, AVAILABLE_MODELS
        DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "arcee-ai/trinity-large-thinking:free")
        AVAILABLE_MODELS = [m.strip() for m in os.getenv("AVAILABLE_MODELS", "").split(",") if m.strip()]
    return {"ok": True, "updated": list(updates.keys())}

@app.post("/plans", status_code=201)
async def save_plan(plan: SavePlanRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        titulo_seguro = plan.title[:150] + "..." if len(plan.title) > 150 else plan.title
        
        new_plan = StoredPlan(
            title=titulo_seguro, 
            area=plan.area, 
            content=plan.content,
            ano=plan.ano,
            banca=plan.banca,
            concurso=plan.concurso,
            visibility=plan.visibility,
            owner_id=current_user.id # Vincula ao usuário atual
        )
        db.add(new_plan)
        await db.commit()
        await db.refresh(new_plan)
        return {"ok": True, "id": new_plan.id}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao salvar no banco: {str(e)}")

@app.get("/plans", response_model=PaginatedPlansResponse)
async def list_plans(
    ano: Optional[str] = None, 
    banca: Optional[str] = None, 
    concurso: Optional[str] = None, 
    search: Optional[str] = None, # <--- 1. NOVO PARÂMETRO ADICIONADO AQUI
    page: int = 1,
    limit: int = 30,
    manage_mode: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Lógica de JOIN para pegar o email do dono (sem duplicatas, logo, sem necessidade de .distinct)
    query = select(StoredPlan, User.email).outerjoin(User, StoredPlan.owner_id == User.id)
    
    if current_user.role != 'admin':
        if manage_mode:
            query = query.where(StoredPlan.owner_id == current_user.id)
        else:
            # Subquery eficiente: verifica se existe registro de permissão privada sem multiplicar linhas
            has_private_access = select(PlanShare).where(
                PlanShare.plan_id == StoredPlan.id, 
                PlanShare.user_email == current_user.email
            ).exists()

            query = query.where(
                or_(
                    StoredPlan.owner_id == current_user.id,
                    StoredPlan.visibility == 'public',
                    has_private_access
                )
            )
    
    # <--- 2. LÓGICA DO FILTRO DE BUSCA ADICIONADA AQUI --->
    if search and search.strip():
        search_term = f"%{search.strip()}%"
        query = query.where(
            or_(
                StoredPlan.title.ilike(search_term),
                StoredPlan.concurso.ilike(search_term),
                StoredPlan.banca.ilike(search_term),
                StoredPlan.area.ilike(search_term)
            )
        )
    # <--------------------------------------------------->

    if ano and ano.strip():
        query = query.where(StoredPlan.ano.ilike(f"%{ano.strip()}%"))
    if banca and banca.strip():
        query = query.where(StoredPlan.banca.ilike(f"%{banca.strip()}%"))
    if concurso and concurso.strip():
        query = query.where(StoredPlan.concurso.ilike(f"%{concurso.strip()}%"))
        
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    skip = (page - 1) * limit
    query = query.order_by(desc(StoredPlan.created_at)).offset(skip).limit(limit)
    
    result = await db.execute(query)
    rows = result.all()
    
    # Monta a resposta embutindo o owner_email no objeto do plano
    items = []
    for plan, email in rows:
        plan_dict = {c.name: getattr(plan, c.name) for c in plan.__table__.columns}
        plan_dict["owner_email"] = email
        items.append(plan_dict)
    
    return {"items": items, "total": total}

@app.get("/plans/{plan_id}")
async def get_plan(plan_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(StoredPlan).filter(StoredPlan.id == plan_id))
    plan = result.scalars().first()
    
    if not plan: 
        raise HTTPException(status_code=404, detail="Plano não encontrado")
        
    # VALIDAÇÃO DE SEGURANÇA E VISIBILIDADE
    if plan.visibility == 'private' and current_user.role != 'admin' and plan.owner_id != current_user.id:
        # Verifica se o email do usuário logado está na lista de compartilhamento (PlanShare)
        share_result = await db.execute(select(PlanShare).filter(PlanShare.plan_id == plan_id, PlanShare.user_email == current_user.email))
        if not share_result.scalars().first():
            raise HTTPException(status_code=403, detail="Você não tem permissão para acessar esta aula privada.")
            
    return plan.content

@app.put("/plans/{plan_id}")
async def update_plan(plan_id: int, req: UpdatePlanRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(StoredPlan).filter(StoredPlan.id == plan_id))
    plan = result.scalars().first()
    
    if not plan: 
        raise HTTPException(status_code=404, detail="Plano não encontrado")
    
    # CADEADO DE SEGURANÇA: Apenas o dono ou o admin podem editar
    if current_user.role != 'admin' and plan.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Sem permissão para alterar esta aula.")
    
    if req.title is not None: plan.title = req.title
    if req.area is not None: plan.area = req.area
    if req.ano is not None: plan.ano = req.ano
    if req.banca is not None: plan.banca = req.banca
    if req.concurso is not None: plan.concurso = req.concurso
    if req.visibility is not None: plan.visibility = req.visibility
    
    await db.commit()
    return {"ok": True, "message": "Aula atualizada com sucesso"}
    
@app.delete("/plans/{plan_id}")
async def delete_plan(plan_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(StoredPlan).filter(StoredPlan.id == plan_id))
    plan = result.scalars().first()
    
    if not plan: raise HTTPException(status_code=404, detail="Plano não encontrado")
    
    # CADEADO DE SEGURANÇA: Apenas o dono ou o admin podem deletar
    if current_user.role != 'admin' and plan.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Sem permissão para deletar esta aula.")
        
    await db.delete(plan)
    await db.commit()
    return {"ok": True, "message": "Plano deletado com sucesso"}
@app.get("/plans/{plan_id}/shares")
async def get_plan_shares(plan_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Confirma permissão (Apenas Dono ou Admin)
    result = await db.execute(select(StoredPlan).filter(StoredPlan.id == plan_id))
    plan = result.scalars().first()
    if not plan or (current_user.role != 'admin' and plan.owner_id != current_user.id):
        raise HTTPException(status_code=403, detail="Acesso negado.")
    
    shares_result = await db.execute(select(PlanShare).filter(PlanShare.plan_id == plan_id))
    emails = [share.user_email for share in shares_result.scalars().all()]
    return {"emails": emails}

@app.post("/plans/{plan_id}/shares")
async def add_plan_share(plan_id: int, req: ShareRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(StoredPlan).filter(StoredPlan.id == plan_id))
    plan = result.scalars().first()
    if not plan or (current_user.role != 'admin' and plan.owner_id != current_user.id):
        raise HTTPException(status_code=403, detail="Acesso negado.")

    # Evita duplicação
    existing = await db.execute(select(PlanShare).filter(PlanShare.plan_id == plan_id, PlanShare.user_email == req.email))
    if existing.scalars().first():
        return {"ok": True, "message": "Email já autorizado."}

    new_share = PlanShare(plan_id=plan_id, user_email=req.email)
    db.add(new_share)
    await db.commit()
    return {"ok": True, "message": "Acesso concedido."}

@app.delete("/plans/{plan_id}/shares/{email}")
async def remove_plan_share(plan_id: int, email: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(StoredPlan).filter(StoredPlan.id == plan_id))
    plan = result.scalars().first()
    if not plan or (current_user.role != 'admin' and plan.owner_id != current_user.id):
        raise HTTPException(status_code=403, detail="Acesso negado.")

    share_result = await db.execute(select(PlanShare).filter(PlanShare.plan_id == plan_id, PlanShare.user_email == email))
    share = share_result.scalars().first()
    if share:
        await db.delete(share)
        await db.commit()
        
    return {"ok": True, "message": "Acesso revogado."}
# ============================================================================
# 6. UTILITÁRIOS (TEXT PROCESSING & CLEANING)
# ============================================================================
async def stream_json_response(prompt: str, model_name: str, temp: float = 0.25, api_key: Optional[str] = None):
    """Lê o stream do OpenRouter e repassa os chunks em tempo real para manter a conexão viva."""
    if api_key and api_key.strip():
        client = AsyncOpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key.strip())
    else:
        client = get_openrouter_client()
        if not client: 
            yield '{"error": "OPENROUTER_API_KEY não encontrado."}'
            return

    try:
        response = await client.chat.completions.create(
            model=(model_name or DEFAULT_MODEL),
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Você é um sistema que responde ÚNICA e EXCLUSIVAMENTE em formato JSON estruturado e válido.\n"
                        "REGRAS VITAIS:\n"
                        "1. NÃO use formatação markdown como ```json antes ou depois.\n"
                        "2. NÃO retorne NENHUM texto fora do JSON.\n"
                        "3. ATENÇÃO CRÍTICA: Escape corretamente TODAS as aspas duplas internas com \\\" e quebras de linha com \\n.\n"
                        "4. Certifique-se de fechar corretamente todas as chaves e colchetes no final."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=temp,
            max_tokens=8192,
            stream=True  # <-- A MÁGICA ACONTECE AQUI
        )
        async for chunk in response:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
    except Exception as e:
        yield f'{{"error": "{str(e)}"}}'
        
def clean_response(text: str) -> str:
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    # Remove blocos markdown de JSON
    text = re.sub(r"```json\s*", "", text)
    text = re.sub(r"```\s*", "", text)
    return text.strip()

def try_parse_json_loose(text: str) -> Any:
    text = text.strip()
    try: 
        return json.loads(text, strict=False)
    except Exception:
        text_no_trailing = re.sub(r',\s*([\]}])', r'\1', text)
        try:
            return json.loads(text_no_trailing, strict=False)
        except Exception:
            m = re.search(r"\{.*\}|\[.*\]", text_no_trailing, flags=re.DOTALL)
            if m:
                try: 
                    return json.loads(m.group(0), strict=False)
                except Exception:
                    pass
            raise

def clamp_text(s: str, max_len: int) -> str: return (s or "")[:max_len]

# NOVO: Vacina anti-erros de lista
def ensure_dict(val: Any) -> Dict[str, Any]:
    if isinstance(val, dict):
        return val
    if isinstance(val, list) and len(val) > 0 and isinstance(val[0], dict):
        return val[0]
    return {}

def normalize_terms(terms: Any) -> List[str]:
    if not isinstance(terms, list): return []
    out: List[str] = []
    for t in terms:
        if isinstance(t, str) and t.strip(): out.append(t.strip())
    return out

def ensure_list(val: Any) -> List[Any]: return val if isinstance(val, list) else []

def ensure_str(val: Any) -> str: return val if isinstance(val, str) else ""

def normalize_modules(mods: Any, fallback_disciplina: str = "Conhecimentos Gerais") -> List[Dict[str, Any]]:
    if not isinstance(mods, list) or not mods: 
        return [{"disciplina": fallback_disciplina, "titulo": "Análise Geral", "tipo": "conceito", "ancoras_detectadas": [], "regra_de_escopo": ""}]
    
    def flatten(module_list, parent_disciplina=fallback_disciplina):
        res = []
        for m in module_list:
            if isinstance(m, str):
                if m.strip(): 
                    res.append({"disciplina": parent_disciplina, "titulo": m.strip(), "tipo": "conceito", "ancoras_detectadas": [], "regra_de_escopo": ""})
                continue
            if not isinstance(m, dict): 
                continue
            
            titulo = (m.get("titulo") or m.get("nome") or m.get("title") or "").strip()
            if not titulo: 
                continue
            
            current_disciplina = m.get("disciplina") or parent_disciplina
            subtopicos = ensure_list(m.get("subtopicos", []))
            
            res.append({
                "disciplina": current_disciplina,
                "titulo": titulo,
                "tipo": m.get("tipo") or "conceito",
                "ancoras_detectadas": ensure_list(m.get("ancoras_detectadas")),
                "regra_de_escopo": ensure_str(m.get("regra_de_escopo")),
            })
            
            if subtopicos:
                res.extend(flatten(subtopicos, current_disciplina))
        return res

    out = flatten(mods)
    return out or [{"disciplina": fallback_disciplina, "titulo": "Análise Geral", "tipo": "conceito", "ancoras_detectadas": [], "regra_de_escopo": ""}]

def validate_como_funciona(como: str) -> Dict[str, Any]:
    como = (como or "").strip()
    required_keywords = ["Visão", "Componentes", "Fluxo", "Regras", "Trade-offs", "Pegadinhas"]
    missing = [kw for kw in required_keywords if not re.search(kw, como, flags=re.IGNORECASE)]
    has_trecho = bool(re.search(r"Trecho do edital:|Trecho da lei:|Trecho do edital/lei:", como, flags=re.IGNORECASE))
    ok_len = len(como) >= 1000
    ok = (len(missing) <= 1) and has_trecho and ok_len
    return {"ok": ok, "missing_headers": missing, "has_trecho": has_trecho, "len": len(como)}

def detect_suspect_tools(text: str, allowed_terms: List[str]) -> List[str]:
    candidates = ["pandas", "numpy", "matplotlib", "seaborn", "scikit", "sklearn", "jupyter", "rstudio", "ggplot", "power bi", "tableau", "spark", "hadoop"]
    allowed = {t.lower() for t in (allowed_terms or [])}
    lower = (text or "").lower()
    return [c for c in candidates if (c in lower and c.lower() not in allowed)]

def extract_choice_letter(val: Any) -> Optional[str]:
    if val is None: return None
    s = str(val).strip().upper()
    if not s: return None
    m = re.search(r"\b([A-F])\b", s)
    if m: return m.group(1)
    ch = s[0]
    return ch if ch in "ABCDEF" else None

def normalize_wrong_reasons(val: Any) -> Dict[str, str]:
    out: Dict[str, str] = {}
    if isinstance(val, dict):
        for k, v in val.items():
            key = str(k).strip().upper()
            m = re.match(r"^([A-F])", key)
            if not m: continue
            out[m.group(1)] = str(v) if v is not None else ""
        return out
    if isinstance(val, list):
        for item in val:
            s = str(item).strip()
            m = re.match(r"^\s*([A-F])\s*[\)\.\-:]\s*(.*)$", s, flags=re.IGNORECASE)
            if m: out[m.group(1).upper()] = m.group(2).strip()
    return out

def sanitize_lesson(lesson: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(lesson, dict): return {}
    
    # Sanitiza as novas chaves de texto
    for key in ["titulo", "visao_geral", "aula_teorica_aprofundada", "analogias_contexto", "aplicacao_pratica_exemplos", "referencia_bibliografica"]:
        lesson[key] = ensure_str(lesson.get(key))
        
    # Sanitiza as novas chaves de lista
    for key in ["resumo_termos_chave"]:
        lesson[key] = ensure_list(lesson.get(key))
        
    return lesson

def sanitize_quiz(quiz: Any) -> List[Dict[str, Any]]:
    quiz_list = ensure_list(quiz)
    out: List[Dict[str, Any]] = []
    for q in quiz_list:
        if not isinstance(q, dict): continue
        q["alternativas"] = ensure_list(q.get("alternativas"))
        q["resposta_correta"] = extract_choice_letter(q.get("resposta_correta")) or ""
        if "comentario_da_correta" not in q and "comentario" in q: q["comentario_da_correta"] = q.get("comentario")
        if "comentario" not in q and "comentario_da_correta" in q: q["comentario"] = q.get("comentario_da_correta")
        q["por_que_as_outras_estao_erradas"] = normalize_wrong_reasons(q.get("por_que_as_outras_estao_erradas"))
        for k in ["enunciado", "topico_relacionado", "comentario_da_correta", "comentario"]:
            if k in q: q[k] = ensure_str(q.get(k))
        out.append(q)
    return out

async def get_json_response(prompt: str, model_name: str, temp: float = 0.25, api_key: Optional[str] = None) -> Any:
    if api_key and api_key.strip():
        client = AsyncOpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key.strip())
    else:
        client = get_openrouter_client()
        if not client: raise HTTPException(status_code=500, detail="OPENROUTER_API_KEY não encontrado no ambiente (.env).")

    tentativa = 0
    max_tentativas = 5
    last_error: Optional[str] = None

    while tentativa < max_tentativas:
        try:
            print(f"   ...Conectando ao Modelo {model_name} (Tentativa {tentativa+1})...")            
            response = await client.chat.completions.create(
                model=(model_name or DEFAULT_MODEL),
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Você é um sistema que responde ÚNICA e EXCLUSIVAMENTE em formato JSON estruturado e válido.\n"
                            "REGRAS VITAIS:\n"
                            "1. NÃO use formatação markdown como ```json antes ou depois.\n"
                            "2. NÃO retorne NENHUM texto fora do JSON.\n"
                            "3. ATENÇÃO CRÍTICA: Escape corretamente TODAS as aspas duplas internas com \\\" e quebras de linha com \\n.\n"
                            "4. Certifique-se de fechar corretamente todas as chaves e colchetes no final."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=temp,
                max_tokens=8192
            )
            raw_content = response.choices[0].message.content or ""
            cleaned_content = clean_response(raw_content)
            return try_parse_json_loose(cleaned_content)
        except Exception as e:
            last_error = str(e)
            print(f"❌ Erro na chamada AI: {last_error}")
            if "429" in last_error or "401" in last_error:
                await asyncio.sleep(3 + (tentativa * 2))
            else:
                await asyncio.sleep(1 + (tentativa * 1))
            tentativa += 1

    raise HTTPException(status_code=503, detail=f"O modelo falhou após várias tentativas. Erro: {last_error}")

# ============================================================================
# 7. AGENTS (OTIMIZADOS PARA GEMINI FLASH-LITE)
# ============================================================================
async def agent_cespe_exam_generator(subject: str, focus: str, difficulty: str, amount: int, generate_text: bool, model: str, api_key: Optional[str] = None) -> Dict[str, Any]:
    print(f"--- 📝 Gerando Simulado CESPE IA ({subject} | Foco: {focus}) ---")
    
    focus_instructions = ""
    
    # Tratamento para Raciocínio Lógico
    if subject == "Raciocínio Lógico":
        if focus == 'negacao': focus_instructions = "Foque EXCLUSIVAMENTE em leis de De Morgan e negação de proposições lógicas (e, ou, se...então)."
        elif focus == 'condicional': focus_instructions = "Foque em proposições condicionais (se... então), tabela-verdade, condição suficiente e condição necessária."
        elif focus == 'equivalencia': focus_instructions = "Foque em equivalências lógicas (contrapositiva, equivalência da disjunção/condicional)."
        elif focus == 'diagramas': focus_instructions = "Foque em diagramas lógicos (Todo, Algum, Nenhum) e silogismos categóricos."
        elif focus == 'argumentacao': focus_instructions = "Foque na validade de argumentos lógicos, premissas e conclusões."
        elif focus == 'probabilidade': focus_instructions = "Foque em probabilidade de eventos, união, intersecção e probabilidade condicional."
        elif focus == 'combinatoria': focus_instructions = "Foque em análise combinatória (arranjos, permutações e combinações simples)."
        elif focus == 'sequencias': focus_instructions = "Foque em sequências lógicas numéricas, de palavras ou figuras."
        else: focus_instructions = "Mescle tabela-verdade, negações lógicas e equivalências em situações hipotéticas."
    
    # Tratamento original para Português
    else: 
        if focus == 'interpretacao': focus_instructions = "Foque EXCLUSIVAMENTE em interpretação de texto, inferência e compreensão."
        elif focus == 'gramatica': focus_instructions = "Foque em gramática aplicada: concordância, regência, crase, pontuação e pronomes."
        elif focus == 'reescrita': focus_instructions = "Foque EXCLUSIVAMENTE em propostas de reescrita de trechos do texto."
        elif focus == 'semantica': focus_instructions = "Foque em coesão, coerência, substituição de conectivos e semântica."
        elif focus == 'hardcore': focus_instructions = "NÍVEL MÁXIMO DE DIFICULDADE CESPE. Pegadinhas sutis e extrapolação."
        else: focus_instructions = "Distribua as questões entre interpretação, reescrita e sintaxe."

    text_instruction = 'Crie uma situação hipotética base inédita (Ex: Considere as proposições P e Q...)' if generate_text else 'Sem situação hipotética geral, foque nas assertivas diretas.'

    prompt = f"""
Você é o mais rigoroso Examinador Sênior da banca CESPE/CEBRASPE. Crie um simulado inédito de {subject}.
DIRETRIZES: {amount} questões. Dificuldade: {difficulty}. Foco: {focus_instructions}.
Texto-Base: {text_instruction}

REGRAS CRÍTICAS DE FORMATAÇÃO JSON (EVITAR QUEBRA DE CÓDIGO):
1. JAMAIS use aspas duplas (") DENTRO dos valores de texto. Se precisar citar algo, use ASPAS SIMPLES (').
2. JAMAIS use quebras de linha reais dentro das strings. O texto deve ser contínuo.
3. Responda ESTRITAMENTE com o JSON, sem formatação markdown (```json).

INSTRUÇÃO DE RESPOSTA JSON OBRIGATÓRIO:
{{
    "textoBase": "Situação hipotética ou premissas lógicas iniciais ou deixe vazio.",
    "questoes": [ 
        {{ 
            "id": 1, 
            "enunciado": "A assertiva lógica para julgamento...", 
            "assunto": "Tema da questão (ex: Equivalência, Negação)", 
            "gabarito": "C", 
            "explicacao": "Explique passo a passo a resolução lógica do gabarito (C ou E)." 
        }} 
    ]
}}
"""
    return await get_json_response(prompt, model, temp=0.5, api_key=api_key)

async def agent_cespe_lesson_generator(wrong_questions: List[Dict[str, Any]], model: str, api_key: Optional[str] = None) -> Dict[str, Any]:
    print("--- 👨‍🏫 Gerando Aula de Revisão CESPE baseada nos erros do aluno ---")
    
    prompt = f"""
Você é um professor de cursinho preparatório de excelência, focado na banca CESPE/CEBRASPE. 
O aluno acabou de fazer um simulado de Português e ERROU as seguintes questões:

{json.dumps(wrong_questions, ensure_ascii=False, indent=2)}

Sua tarefa: Criar uma AULA DIDÁTICA E MOTIVADORA ensinando os conceitos gramaticais ou interpretativos que o aluno errou.
- Não apenas repita a explicação da questão, vá além: ensine a "regra do jogo" da CESPE.
- Mostre o padrão de pegadinha que a banca usou nessas questões.
- Dê dicas mnemônicas ou macetes se aplicável.
- Formate a aula usando Markdown (use **negrito** para destacar regras importantes, e tópicos para organizar).
- Seja encorajador no início e no fim.

Responda ESTRITAMENTE num JSON com o seguinte formato:
{{
    "lesson_markdown": "Sua aula completa e formatada em markdown aqui."
}}
"""
    return await get_json_response(prompt, model, temp=0.7, api_key=api_key)


async def agent_global_essay_generator(area: str, aulas_titulos: List[str], model: str, api_key: Optional[str] = None) -> Dict[str, Any]:
    print(f"--- ✍️  Discursiva Geral: Criando prova CESPE/CEBRASPE integradora... ---")

    prompt = f"""
Atue como EXAMINADOR SÊNIOR da banca CEBRASPE/CESPE.
A área geral de conhecimento do candidato é: {area}.

Lista de tópicos estudados nesta disciplina:
{json.dumps(aulas_titulos, ensure_ascii=False)}

Sua missão ÚNICA é criar UMA questão discursiva integradora de alto nível, simulando exatamente o padrão real de prova da banca CEBRASPE.

DIRETRIZES DE CRIAÇÃO:
1. SELEÇÃO: Escolha aleatoriamente EXATAMENTE 2 (dois) temas distintos da lista acima para compor a narrativa. Adapte-se à área de conhecimento informada (não limite à informática, a menos que os temas sejam de TI).
2. TEXTO MOTIVADOR: Crie um cenário hipotético, rico em detalhes (ex: "Em março de 2023, uma situação ocorreu...").
3. COMANDO: Use estritamente o padrão da banca: "Considerando a situação narrada, redija um texto dissertativo em atendimento ao que se pede a seguir."
4. ASPECTOS (TÓPICOS): Crie de 2 a 3 itens numerados que o candidato deve responder obrigatoriamente (Ex: "1. Explique...", "2. Mencione...", "3. Descreva...").
5. PONTUAÇÃO: A soma do campo "valor_maximo" de todos os aspectos DEVE ser exatos 19.0 pontos (o 1.0 ponto restante é da apresentação textual, fechando a nota de 20.0).

RETORNE APENAS ESTE JSON EXATO:
{{
  "discursiva": {{
    "texto_motivador": "Descrição detalhada do cenário narrado...",
    "comando": "Considerando a situação narrada, redija um texto dissertativo em atendimento ao que se pede a seguir.",
    "aspectos": [
      {{ "aspecto": "1. Explique o conceito X...", "valor_maximo": 6.0 }},
      {{ "aspecto": "2. Mencione o papel de Y...", "valor_maximo": 8.0 }},
      {{ "aspecto": "3. Descreva o processo Z...", "valor_maximo": 5.0 }}
    ]
  }}
}}
"""
    return await get_json_response(prompt, model, temp=0.6, api_key=api_key)

async def agent_essay_generator(modulo_obj: Dict[str, Any], area: str, lesson_content: Dict[str, Any], model: str, api_key: Optional[str] = None) -> Dict[str, Any]:
    titulo = modulo_obj.get("titulo", "Módulo")
    print(f"--- ✍️  Discursiva: Criando prova CESPE para '{titulo}'... ---")
    lesson_text = json.dumps(lesson_content, ensure_ascii=False)

    prompt = f"""
Atue como EXAMINADOR SÊNIOR da banca CESPE/CEBRASPE na área de {area}.
Sua missão ÚNICA é criar uma questão discursiva focada na aula abaixo.

AULA:
{lesson_text}

DIRETRIZES DE CRIAÇÃO:
- DIREITO: Crie "Estudo de Caso" (crime, conflito contratual, etc).
- TI/EXATAS: Crie cenário de incidente em produção ou falha de arquitetura.
- OUTROS: Situação problema prática da profissão.
- Aspectos: 2 a 3 tópicos obrigatórios para o candidato responder. A soma do "valor_maximo" DEVE ser 10.0.

RETORNE APENAS ESTE JSON EXATO (SEM NENHUM TEXTO ADICIONAL):
{{
  "discursiva": {{
    "texto_motivador": "Descrição detalhada do cenário hipotético.",
    "comando": "Considerando a situação hipotética, redija um texto abordando:",
    "aspectos": [
      {{ "aspecto": "1. Primeiro ponto...", "valor_maximo": 4.0 }},
      {{ "aspecto": "2. Segundo ponto...", "valor_maximo": 6.0 }}
    ]
  }}
}}
"""
    return await get_json_response(prompt, model, temp=0.3, api_key=api_key)

async def agent_simulado_topic(area: str, topico: str, conteudo: str, model: str, api_key: Optional[str] = None) -> Dict[str, Any]:
    print(f"--- 📝 Gerando Simulado IA para: {topico} ---")
    prompt = f"""
    Atue como Banca Examinadora de Alto Nível ({area}).
    Sua missão é criar um SIMULADO de fixação. Com base estritamente no conteúdo abaixo, crie EXATAMENTE 5 QUESTÕES inéditas de múltipla escolha focadas no tópico "{topico}".

    CONTEÚDO BASE PARA AS QUESTÕES:
    {conteudo[:8000]}

    REGRAS:
    1. Crie exatamente 5 questões desafiadoras.
    2. Gere exatamente 4 alternativas (A, B, C, D) para cada uma.
    3. Justifique tecnicamente o porquê da correta e o erro das demais.

    RETORNE APENAS ESTE JSON EXATO:
    {{
      "simulado": [
        {{
          "contexto_disciplina": "{area}",
          "contexto_topico": "{topico}",
          "enunciado": "A situação-problema...",
          "alternativas": ["A) ...", "B) ...", "C) ...", "D) ..."],
          "resposta_correta": "C",
          "comentario_da_correta": "Explicação técnica...",
          "por_que_as_outras_estao_erradas": {{
            "A": "Erro da A",
            "B": "Erro da B",
            "D": "Erro da D"
          }}
        }}
      ]
    }}
    """
    return await get_json_response(prompt, model, api_key=api_key, temp=0.3)

async def agent_essay_corrector(req: EssayCorrectionRequest) -> Dict[str, Any]:
    print("--- 📝 Corretor: Avaliando Discursiva do Aluno... ---")
    prompt = f"""
Atue como CORRETOR RIGOROSO CESPE/CEBRASPE.

DADOS DA QUESTÃO:
Motivador: {req.texto_motivador}
Comando: {req.comando}
Aspectos: {json.dumps(req.aspectos, ensure_ascii=False)}

RESPOSTA DO CANDIDATO:
{req.resposta_aluno}

DIRETRIZES:
1. Avalie o conteúdo técnico. Desconte se for raso.
2. Dê uma nota exata para cada aspecto (nunca maior que o valor_maximo).
3. Avalie gramática e coesão separadamente.

RETORNE APENAS ESTE JSON EXATO:
{{
  "nota_final": 8.5,
  "avaliacoes_aspectos": [
    {{
      "aspecto": "Nome exato do Aspecto",
      "nota_atribuida": 3.5,
      "comentario": "Justificativa direta apontando onde o aluno errou ou acertou.",
      "padrao_esperado": "Espelho de Correção: Escreva um parágrafo altamente didático mostrando exatamente o que o aluno DEVERIA ter escrito para tirar a nota máxima neste tópico."
    }}
  ],
  "erros_gramaticais": "Apontamento de erros gramaticais e SUGESTÃO DE REESCRITA para melhorar a coesão.",
  "feedback_geral": "Parecer final da banca examinadora.",
  "dica_estudo": "Dica prática e encorajadora de qual assunto ou lei o candidato precisa revisar com base nos erros que cometeu nesta redação."
}}
"""
    return await get_json_response(prompt, req.model, temp=0.2, api_key=req.api_key)

async def agent_lesson_tutor(req: ChatMessageRequest) -> Dict[str, Any]:
    print(f"--- 💬 Tutor: Respondendo dúvida da área de '{req.area}'... ---")
    
    hist_text = ""
    if req.historico:
        hist_text = "HISTÓRICO RECENTE:\n"
        for msg in req.historico[-4:]:
            role = "Aluno" if msg.get("role") == "user" else "Tutor"
            hist_text += f"{role}: {msg.get('content')}\n"

    prompt = f"""
Atue como Professor Tutor Especialista em {req.area}.
Responda de forma DIRETIVA, CLARA e AMIGÁVEL.

{hist_text}

DÚVIDA DO ALUNO:
{req.mensagem}

RETORNE APENAS ESTE JSON EXATO:
{{
  "resposta": "Sua explicação detalhada aqui, usando formatação markdown (negrito, listas) para facilitar a leitura."
}}
"""
    return await get_json_response(prompt, req.model, temp=0.4, api_key=req.api_key)

async def agent_instruction_designer(text: str, area: str, model: str) -> Dict[str, Any]:
    print(f"--- 🎨 Designer Instrucional: Definindo estratégia para '{area}'... ---")
    
    prompt = f"""
Atue como DESIGNER INSTRUCIONAL SÊNIOR.
Analise o texto e defina regras didáticas claras.

TEXTO BASE:
{clamp_text(text, 5000)}

ÁREA: {area}

RETORNE APENAS ESTE JSON EXATO:
{{
  "diretrizes_pesquisador": "Regra técnica curta (ex: 'Foque em Súmulas STF' ou 'Foque em arquitetura de software').",
  "diretrizes_professor": "Regra didática curta (ex: 'Use analogias do cotidiano').",
  "formato_exemplo": "Como dar exemplos (ex: 'Caso clínico detalhado', 'Snippet de código comentado').",
  "foco_aprofundamento": "Tema avançado (ex: 'Jurisprudência divergente' ou 'Otimização de memória')."
}}
"""
    return await get_json_response(prompt, model, temp=0.3)

async def agent_architect(text: str, model: str) -> Dict[str, Any]:
    print("--- 🏛️ Arquiteto: Lendo edital e extraindo disciplinas dinamicamente... ---")

    prompt = f"""
Atue como ESPECIALISTA SÊNIOR em Análise Estrutural e Lexical de Editais de Concurso.

Sua missão é transformar o texto bruto em uma lista de módulos DIDÁTICOS, GRANULARES e 100% FIÉIS ao edital.

==================================================================
🚨 REGRA MÁXIMA: FIDELIDADE TOTAL AO TEXTO
==================================================================

PROIBIDO ABSOLUTO:
- Reescrever títulos
- Usar sinônimos
- Resumir conteúdo
- Inventar subtemas
- Expandir conteúdo

REGRA CRÍTICA:
O campo "titulo" DEVE ser um trecho literal do edital (substring real).

Se não estiver no texto, NÃO EXISTE.

==================================================================
🧠 IDENTIFICAÇÃO DE DISCIPLINA
==================================================================

- Detecte blocos principais (geralmente em CAIXA ALTA)
- Use como "disciplina"
- Todos os tópicos abaixo herdam essa disciplina

Se não encontrar:
→ use "GERAL"

==================================================================
✂️ FATIAMENTO CONTROLADO (EVITAR ERROS)
==================================================================

Use delimitadores:
- ";" (PRIORIDADE ALTA)
- "," (USAR COM CUIDADO)

🚨 NÃO QUEBRAR quando:
- estiver entre parênteses
- for unidade semântica única
- houver "e" conectando conceitos dependentes

EXEMPLOS (NÃO QUEBRAR):
- "SLAs e catálogo de serviços"
- "crimes contra a pessoa e o patrimônio"
- "pronomes (pessoais, possessivos e demonstrativos)"

EXEMPLOS (QUEBRAR):
- itens separados por ";"
- listas independentes

REGRA DE OURO:
Se houver dúvida → NÃO dividir

==================================================================
🧠 MICRODIVISÃO (OPCIONAL E CONTROLADA)
==================================================================

Pode dividir SOMENTE SE:
1. Cada parte fizer sentido isoladamente
2. Não alterar nenhuma palavra
3. Não perder contexto

Ex:
"Regência verbal e nominal" → permitido dividir

==================================================================
📊 CLASSIFICAÇÃO PADRONIZADA (OBRIGATÓRIA)
==================================================================

TIPO (escolha apenas 1):
- "fundamento"
- "conceito"
- "aplicacao"
- "ferramenta/tecnica"
- "legislacao/norma"

PESO (escolha apenas 1):
- "alto"
- "medio"
- "baixo"

REGRAS:
- Frameworks, leis, normas → alto
- Conceitos técnicos → medio
- Introduções → baixo

==================================================================
🔍 RASTREABILIDADE (OBRIGATÓRIO)
==================================================================

"origem_no_edital" deve conter o trecho literal exato.

==================================================================
🧱 REGRA DE ESCOPO
==================================================================

Crie uma frase curta (máx 10 palavras):
- objetiva
- técnica
- sem explicação longa

Ex:
"Focar na literalidade da norma"
"Focar na aplicação prática"

==================================================================
🛟 FAILSAFE (OBRIGATÓRIO)
==================================================================

Se não conseguir extrair:
→ retorne 1 módulo genérico com:
- disciplina = "GERAL"
- titulo = "Análise geral do conteúdo"

==================================================================
🚨 FORMATO DE SAÍDA
==================================================================

- JSON válido
- Sem markdown
- Sem texto extra
- Estrutura 100% plana
- Todos os campos obrigatórios

==================================================================
📥 TEXTO:
==================================================================
{clamp_text(text, 15000)}

==================================================================
📤 SAÍDA:
==================================================================

{{
  "resumo_objetivo": "Resumo em uma linha.",
  "modulos": [
    {{
      "disciplina": "NOME DA DISCIPLINA",
      "titulo": "TRECHO LITERAL DO EDITAL",
      "tipo": "conceito",
      "peso": "medio",
      "origem_no_edital": "TRECHO EXATO",
      "regra_de_escopo": "Foco direto"
    }}
  ]
}}
"""
    return await get_json_response(prompt, model, temp=0.05)


async def agent_researcher(
    modulo_obj: Dict[str, Any],
    area: str,
    full_text: str,
    context_instructions: Dict[str, Any],
    model: str
) -> Dict[str, Any]:
    
    titulo = modulo_obj.get("titulo", "Módulo")
    tipo = modulo_obj.get("tipo", "conceito")
    peso = modulo_obj.get("peso", "medio")
    escopo = modulo_obj.get("regra_de_escopo", "Aprofundar tecnicamente.")
    origem = modulo_obj.get("origem_no_edital", titulo)
    
    print(f"--- 🔎 Pesquisador: Aprofundando '{titulo}' (Tipo: {tipo} | Peso: {peso})... ---")

    modulo_json = json.dumps(modulo_obj, ensure_ascii=False)
    guidelines = context_instructions.get("diretrizes_pesquisador", "Foco técnico rigoroso.")
    deep_focus = context_instructions.get("foco_aprofundamento", "Nuances do tema.")

    prompt = f"""
Atue como PESQUISADOR TÉCNICO SÊNIOR em {area}.
Gere o mapa estrutural detalhado para a aula "{titulo}".

DADOS DO EDITAL PARA ESTE TÓPICO:
- Origem literal no edital: "{origem}"
- Natureza do Tópico (Tipo): {tipo}
- Relevância (Peso): {peso}
- Regra de Escopo: {escopo}

DIRETRIZES GERAIS: {guidelines}
FOCO: {deep_focus}

REGRAS CRÍTICAS DE PROFUNDIDADE E DOMÍNIO:
1. Respeite a "Regra de Escopo" e a "Natureza do Tópico". 
   - Se for "lei/norma", pesquise artigos, incisos, jurisprudência e literalidade.
   - Se for "ferramenta/tecnica", pesquise comandos, arquitetura e trade-offs.
   - Se for "conceito/fundamento", pesquise autores, classificações e teorias.
2. GERE no mínimo 3 itens longos e exaustivos em "subtemas_aprofundados".
3. Não cite um termo técnico sem explicá-lo. 

RETORNE APENAS ESTE JSON EXATO:
{{
  "meta_modulo": {modulo_json},
  "termos_chave": ["termo1", "termo2"], 
  "mapa_estrutural": [
    {{ "componente_pai": "Pai", "relacao": "divide-se em", "componente_filho": "Filho", "contexto": "Info detalhada." }}
  ],
  "correlacoes_entre_partes": [
    {{ "parte_a": "A", "parte_b": "B", "explicacao": "Explicação técnica e profunda de como interagem na prática." }}
  ],
  "subtemas_aprofundados": [
    {{
      "subtema": "Nome Técnico (NÃO USAR HISTÓRIA)",
      "natureza": "teorica|pratica|jurisprudencia",
      "conteudo_denso": "Explicação EXAUSTIVA. OBRIGATÓRIO usar 3 marcações internas em negrito no texto para forçar a profundidade: **Fundamento Teórico:** [explicar a base], **Mecanismo na Prática:** [como funciona], e **Limitações/Exceções:** [onde falha ou exceções].",
      "laboratorio_pratico": {{
        "cenario": "Problema prático, questão clássica ou caso concreto.",
        "resolucao": "Solução passo a passo.",
        "resultado_esperado": "Resultado final."
      }},
      "pontos_de_atencao": ["Pegadinha clássica de prova 1", "Exceção técnica 2"]
    }}
  ]
}}
"""
    return await get_json_response(prompt, model, temp=0.25)

async def agent_professor(
    modulo_obj: Dict[str, Any], 
    area: str, 
    research_data: Dict[str, Any], 
    context_instructions: Dict[str, Any],
    model: str
) -> Dict[str, Any]:

    titulo = modulo_obj.get("titulo", "Módulo")
    tipo = modulo_obj.get("tipo", "conceito")
    peso = modulo_obj.get("peso", "medio")
    
    print(f"--- 👨‍🏫 Professor: Ministrando '{titulo}'... ---")

    research_summary = json.dumps(research_data, ensure_ascii=False)

    prompt = f"""
Atue como um PROFESSOR DE ELITE, reconhecido por sua didática impecável em {area}.
Sua missão é dar uma aula exaustiva sobre: "{titulo}".

CONTEXTO ESTRATÉGICO DO EDITAL:
- Tipo de Conteúdo: {tipo}
- Peso para a prova: {peso} (Se for "alto", aprofunde rigorosamente em pegadinhas de bancas).

PESQUISA BASE: {research_summary}

Gere o conteúdo da aula seguindo ESTA ESTRUTURA RIGOROSA:
1. Aula teórica aprofundada (Use formatação Markdown, subtítulos, negritos). Adapte o tom para o TIPO de conteúdo (ex: mais hermenêutico para leis, mais pragmático para ferramentas).
2. Resumo de Termos Chave.
3. Analogias e Contexto (Crie uma metáfora brilhante do cotidiano para ancorar o conhecimento. *Nota: se o tipo for "lei/norma", use como analogia um "caso do mundo real" famoso ou prático ao invés de metáforas abstratas*).
4. Aplicação Prática / Estudo de Caso.

RETORNE APENAS ESTE JSON EXATO:
{{
  "titulo": "{titulo}",
  "visao_geral": "Resumo de 2 linhas sobre a importância deste tópico para a prova.",
  "aula_teorica_aprofundada": "Texto completo, exaustivo e didático sobre o tema. Use subtítulos em Markdown (###).",
  "resumo_termos_chave": [
     {{ "termo": "Nome do Termo", "definicao": "Definição técnica." }}
  ],
  "analogias_contexto": "Apresente uma analogia criativa ou caso real para visualização do conceito.",
  "aplicacao_pratica_exemplos": "Exemplos detalhados de aplicação ou resolução de um caso prático típico de provas."
}}
"""
    return await get_json_response(prompt, model, temp=0.4)


async def agent_examiner(modulo_obj: Dict[str, Any], area: str, professor_lesson: Dict[str, Any], model: str, question_format: str, question_level: str) -> Dict[str, Any]:
    print(f"--- 📝 Banca: Criando 10 questões ({question_format} - Nível {question_level})... ---")
    lesson_context = json.dumps(professor_lesson, ensure_ascii=False)

    regras_formato = ""
    if question_format == "Múltipla Escolha":
        regras_formato = """
2. Crie EXATAMENTE 5 alternativas (A, B, C, D, E) para cada questão.
3. REGRA CRÍTICA DE MÚLTIPLA ESCOLHA: As alternativas incorretas (distratores) NÃO PODEM ser obviamente absurdas. Crie pegadinhas semânticas, misture conceitos reais de forma incorreta ou use exceções à regra. O candidato deve precisar de alto domínio para não cair na pegadinha.
4. Justifique tecnicamente por que cada alternativa incorreta está errada.
"""
        json_alternativas = '"alternativas": ["A) ...", "B) ...", "C) ...", "D) ...", "E) ..."],'
    else:
        regras_formato = """
2. O formato deve ser CERTO ou ERRADO. O campo alternativas deve ter exatamente duas opções: ["A) Certo", "B) Errado"].
3. REGRA CRÍTICA CERTO/ERRADO: Formule a afirmação com vocabulário técnico. Se a resposta for "Errado", o erro deve ser extremamente sutil (ex: inverter um conceito, usar "sempre" onde há exceção).
4. Justifique o acerto ou o erro detalhadamente.
"""
        json_alternativas = '"alternativas": ["A) Certo", "B) Errado"],'

    prompt = f"""
Atue como Banca Examinadora ({area}).
Nível de Dificuldade das Questões: {question_level} (Iniciante, Normal, Avançado ou Expert). 
Ajuste rigorosamente o aprofundamento técnico, o vocabulário, a presença de pegadinhas e a complexidade da cobrança para refletir EXATAMENTE este nível de dificuldade.

Com base SOMENTE no texto da aula abaixo, crie EXATAMENTE 10 QUESTÕES.

AULA:
{lesson_context}

REGRAS:
1. Crie 10 questões inéditas. Mescle questões diretas de fixação com Estudos de Caso práticos.
{regras_formato}

RETORNE APENAS ESTE JSON EXATO:
{{
  "quiz": [
    {{
      "enunciado": "A situação-problema ou pergunta direta aqui...",
      {json_alternativas}
      "resposta_correta": "A",
      "comentario_da_correta": "Explicação técnica da resposta.",
      "por_que_as_outras_estao_erradas": {{
        "Letra Incorreta": "Por que está errada..."
      }},
      "topico_relacionado": "Nome do tópico avaliado"
    }}
  ]
}}
"""
    return await get_json_response(prompt, model, temp=0.25)

async def agent_mindmap(modulo_obj: Dict[str, Any], area: str, lesson_content: Dict[str, Any], model: str) -> Dict[str, Any]:
    print(f"--- 🧠 Mapa Mental: Gerando código Mermaid... ---")
    lesson_text = json.dumps(lesson_content, ensure_ascii=False)

    prompt = f"""
Gere um fluxograma Mermaid.js (graph TD) resumindo a aula abaixo.
{lesson_text}

REGRA CRÍTICA DE SINTAXE MERMAID:
- NUNCA use parênteses (), colchetes [], chaves {{}}, aspas "" ou vírgulas ,, dentro do texto dos nós.
- Use apenas letras, números e espaços simples dentro dos colchetes dos nós.
- Exemplo CORRETO: A[Conceito Principal] --> B[Sub Topico];

RETORNE APENAS ESTE JSON EXATO:
{{
  "mapa_mental": {{
    "titulo": "Título do Mapa",
    "codigo_mermaid": "graph TD;\\n  A[Conceito Central] --> B[Sub Topico];"
  }}
}}
"""
    return await get_json_response(prompt, model, temp=0.2)


async def agent_strategist(modulos_data: List[Dict[str, Any]], area: str, model: str) -> Dict[str, Any]:
    print("--- 🎯 Estrategista: Criando plano de revisão com base nos pesos... ---")
    
    conteudo_real = []
    for m in modulos_data:
        if isinstance(m, dict):
            meta = m.get("meta_modulo", {})
            titulo = meta.get("titulo") or m.get("titulo", "Módulo")
            tipo = meta.get("tipo", "conceito")
            peso = meta.get("peso", "medio")
            
            termos = [t.get("termo") for t in m.get("resumo_termos_chave", []) if isinstance(t, dict)]
            termos_str = ', '.join(termos[:3]) if termos else 'conceitos chave'
            
            conteudo_real.append(f"- [Peso: {peso.upper()} | Tipo: {tipo}] Módulo '{titulo}': cobriu {termos_str}.")
    
    conteudo_texto = "\n".join(conteudo_real)

    prompt = f"""
Atue como Mentor de Alta Performance e Estratégia de Estudos para Concursos.
Crie um Plano de Estudos ESTRATÉGICO e implacável em Markdown baseado na lista de aulas geradas abaixo. 
Você deve usar a classificação de PESO (ALTO, MEDIO, BAIXO) para definir a prioridade do candidato.

INVENTÁRIO DE AULAS GERADAS:
{conteudo_texto}

REGRAS CRÍTICAS:
1. **Curva ABC:** Destaque explicitamente as aulas de PESO ALTO. Diga ao aluno que elas formam o "Núcleo Duro" da prova.
2. **Plano de Ataque:** Para cada disciplina ou grande bloco, forneça:
   - **Onde focar:** Os assuntos de maior retorno (Peso Alto e Médio).
   - **O que ler por cima:** Assuntos de Peso Baixo ou puramente conceituais.
   - **Métrica de Validação:** Como o aluno sabe que está pronto para a prova (ex: "Acertar 85% das questões de múltipla escolha sobre o tópico X").

RETORNE APENAS ESTE JSON EXATO:
{{
  "plano_estudo": "Texto denso, motivador e altamente estratégico em Markdown detalhando o plano de ataque baseado na prioridade e nos pesos."
}}
"""
    return await get_json_response(prompt, model, temp=0.35)

# ============================================================================
# 8. ROTA PRINCIPAL (/analyze) E ROTAS DO USUÁRIO OMITIDAS PARA BREVIDADE
# ============================================================================
@app.post("/performance", status_code=201)
async def save_performance(
    record: PerformanceCreate, 
    current_user: User = Depends(get_current_user), 
    db: AsyncSession = Depends(get_db)
):
    # Lógica de Substituição (UPSERT)
    if record.tipo == 'simulado':
        existing_query = select(PerformanceRecord).filter(
            PerformanceRecord.user_email == current_user.email,
            PerformanceRecord.tipo == record.tipo,
            PerformanceRecord.tema == record.tema,
            PerformanceRecord.concurso == record.concurso,
            PerformanceRecord.nivel == record.nivel,
            PerformanceRecord.formato == record.formato
        )
        result = await db.execute(existing_query)
        existing_record = result.scalars().first()

        if existing_record:
            # Se for EXATAMENTE o mesmo simulado, apenas atualiza a nota e a data
            existing_record.nota_obtida = record.nota_obtida
            existing_record.nota_maxima = record.nota_maxima
            existing_record.created_at = datetime.utcnow()
            await db.commit()
            return {"ok": True, "message": "Desempenho atualizado!"}

    # Se for Discursiva ou for um Simulado diferente (com parâmetros diferentes), cria um novo
    new_record = PerformanceRecord(
        user_email=current_user.email,
        tipo=record.tipo,
        tema=record.tema,
        nota_obtida=record.nota_obtida,
        nota_maxima=record.nota_maxima,
        nivel=record.nivel,
        formato=record.formato,
        concurso=record.concurso
    )
    db.add(new_record)
    await db.commit()
    return {"ok": True, "message": "Desempenho salvo!"}

@app.get("/performance/me", response_model=List[PerformanceResponse])
async def get_my_performance(
    current_user: User = Depends(get_current_user), 
    db: AsyncSession = Depends(get_db)
):
    # Busca o histórico ordenado do mais recente para o mais antigo
    result = await db.execute(
        select(PerformanceRecord)
        .filter(PerformanceRecord.user_email == current_user.email)
        .order_by(desc(PerformanceRecord.created_at))
    )
    return result.scalars().all()

# =========================================================================
# NOVA ROTA: LEADERBOARD GLOBAL (RANKING)
# =========================================================================
@app.get("/performance/leaderboard")
async def get_leaderboard(db: AsyncSession = Depends(get_db)):
    # Busca todos os registros de simulados do banco
    result = await db.execute(select(PerformanceRecord).filter(PerformanceRecord.tipo == 'simulado'))
    records = result.scalars().all()
    
    user_stats = {}
    for r in records:
        email = r.user_email
        if email not in user_stats:
            user_stats[email] = {'simulados': 0, 'acertos': 0, 'questoes': 0}
        user_stats[email]['simulados'] += 1
        user_stats[email]['acertos'] += r.nota_obtida
        user_stats[email]['questoes'] += r.nota_maxima
        
    leaderboard = []
    for email, stats in user_stats.items():
        acertos = stats['acertos']
        erros = stats['questoes'] - acertos
        
        # NOVA FÓRMULA DE XP COM PUNIÇÃO DE ERROS: 
        # +50 por simulado concluído | +10 por questão correta | -5 por questão errada
        xp = (stats['simulados'] * 50) + (acertos * 10) - (erros * 5)
        xp = max(0, xp) # Impede que o XP fique negativo
        
        if xp >= 5000: elo = "💎 Elite"
        elif xp >= 2000: elo = "🔷 Diamante"
        elif xp >= 1000: elo = "🏆 Ouro"
        elif xp >= 500: elo = "🥈 Prata"
        elif xp >= 100: elo = "🥉 Bronze"
        else: elo = "Iniciante"
        
        leaderboard.append({
            "email_completo": email, # Usado no frontend para achar a posição do usuário atual
            "nickname": email.split('@')[0], # Oculta o domínio para manter a privacidade na tabela pública
            "xp": xp,
            "elo": elo,
            "simulados_feitos": stats['simulados']
        })
        
    # Ordena do maior XP para o menor
    leaderboard.sort(key=lambda x: x['xp'], reverse=True)
    
    # Adiciona a posição oficial
    for i, entry in enumerate(leaderboard):
        entry['posicao'] = i + 1
        
    return leaderboard

@app.post("/analyze")
async def analyze_syllabus_deep(request: SyllabusRequest):
    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="Texto vazio")

    selected_model = request.model
    print(f"🔄 Iniciando pipeline com modelo: {selected_model}")

    try:
        # 1. Extraímos a estrutura usando o Arquiteto
        structure = ensure_dict(await agent_architect(request.text, selected_model))
        
        # 2. Normalizamos os módulos
        modules = normalize_modules(structure.get("modulos"), fallback_disciplina="Geral")
        
        # --- ATUALIZAÇÃO AQUI ---
        # 3. Pega todas as disciplinas únicas encontradas (antes do ":") e junta-as.
        disciplinas_encontradas = list(dict.fromkeys([mod.get("disciplina") for mod in modules if mod.get("disciplina")]))
        global_area = " / ".join(disciplinas_encontradas) if disciplinas_encontradas else "Edital Específico"
        # ------------------------
        
        instructions = ensure_dict(await agent_instruction_designer(request.text, global_area, selected_model))
        
        final_aulas: List[Dict[str, Any]] = []

        for idx, mod in enumerate(modules):
            titulo = mod.get("titulo", f"Módulo {idx+1}")
            
            # 3. ATENÇÃO: Aqui extraímos a matéria ESPECÍFICA deste tópico (ex: "LÍNGUA PORTUGUESA")
            area_do_modulo = mod.get("disciplina", "Assunto Geral") 
            
            print(f"\n➡️ Processando Módulo {idx + 1}: [{area_do_modulo}] {titulo}")

            # 4. Passamos 'area_do_modulo' para TODAS as IAs, para que elas tenham o contexto da disciplina
            research = ensure_dict(await agent_researcher(mod, area_do_modulo, request.text, instructions, selected_model))
            await asyncio.sleep(1)

            lesson = ensure_dict(await agent_professor(mod, area_do_modulo, research, instructions, selected_model))
            lesson = sanitize_lesson(lesson)
            
            # 5. Embutimos a disciplina na aula gerada
            lesson["disciplina"] = area_do_modulo 
            await asyncio.sleep(1)

            # Passando os novos parâmetros recebidos na rota para a IA da banca
            exam = ensure_dict(await agent_examiner(mod, area_do_modulo, lesson, selected_model, request.question_format, request.question_level))
            await asyncio.sleep(1)

            mindmap_data = ensure_dict(await agent_mindmap(mod, area_do_modulo, lesson, selected_model))
            await asyncio.sleep(1)

            essay_data = ensure_dict(await agent_essay_generator(mod, area_do_modulo, lesson, selected_model))
            await asyncio.sleep(1)
            
            # Sanitização final
            quiz_list = sanitize_quiz(exam.get("quiz") if isinstance(exam, dict) else [])
            mindmap_obj = mindmap_data.get("mapa_mental") if isinstance(mindmap_data, dict) else {}

            # Montagem do módulo final limpo
            full_module = {
                **lesson,
                "quiz": quiz_list,
                "mapa_mental": mindmap_obj,
                "discursiva": essay_data.get("discursiva") if isinstance(essay_data, dict) else {}, 
                "meta_modulo": mod,
            }
            
            final_aulas.append(full_module)
            await asyncio.sleep(1)

        # Atualizamos o estrategista para ler a área global
        strategy = ensure_dict(await agent_strategist(final_aulas, global_area, selected_model))

        return {
            "resumo_cargo": structure.get("resumo_objetivo", "Resumo gerado com múltiplas disciplinas."),
            "area_identificada": global_area,
            "aulas": final_aulas,
            "plano_estudo": (strategy.get("plano_estudo", "") if isinstance(strategy, dict) else ""),
        }

    except HTTPException as http_ex:
        raise http_ex
    except Exception as e:
        print(f"ERRO GERAL NO SERVIDOR: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

class UserResponse(BaseModel):
    id: int
    email: str
    role: str
    can_manage_lessons: bool
    model_config = ConfigDict(from_attributes=True)

class UserUpdateRole(BaseModel):
    role: str

@app.get("/users", response_model=List[UserResponse])
async def list_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).order_by(User.id))
    return result.scalars().all()

@app.post("/users", response_model=UserResponse)
async def create_user(payload: UserCreateAdmin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.email == payload.email))
    if result.scalars().first(): 
        raise HTTPException(status_code=400, detail="Email já cadastrado")
    
    new_user = User(
        email=payload.email,
        hashed_password=get_password_hash(payload.password),
        role=payload.role,
        can_manage_lessons=payload.can_manage_lessons
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user

@app.put("/users/{user_id}", response_model=UserResponse)
async def update_user_admin(user_id: int, payload: UserUpdateAdmin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.id == user_id))
    user = result.scalars().first()
    if not user: raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    if payload.email is not None: user.email = payload.email
    if payload.role is not None: user.role = payload.role
    if payload.can_manage_lessons is not None: user.can_manage_lessons = payload.can_manage_lessons
    if payload.password is not None and payload.password.strip():
        user.hashed_password = get_password_hash(payload.password)
        
    await db.commit()
    await db.refresh(user)
    return user

@app.delete("/users/{user_id}")
async def delete_user(user_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.id == user_id))
    user = result.scalars().first()
    if not user: raise HTTPException(status_code=404, detail="Usuário não encontrado")
    if user.id == 1: raise HTTPException(status_code=400, detail="Não é possível deletar o Admin Mestre.")
    
    await db.delete(user)
    await db.commit()
    return {"ok": True, "message": "Usuário deletado"}

@app.get("/users/me", response_model=UserResponse)
async def read_users_me(current_user: User = Depends(get_current_user)):
    """Retorna os dados do usuário atualmente logado para o Frontend"""
    return current_user

@app.get("/users/me/settings", response_model=UserSettingsResponse)
async def get_user_settings(current_user: User = Depends(get_current_user)):
    return {
        "api_key": current_user.api_key,
        "preferred_model": current_user.preferred_model
    }

@app.put("/users/me/settings")
async def update_user_settings(settings: UserSettingsUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    current_user.api_key = settings.api_key
    current_user.preferred_model = settings.preferred_model
    await db.commit()
    return {"ok": True, "message": "Configurações de IA atualizadas no banco de dados."}

class PasswordUpdate(BaseModel):
    current_password: str
    new_password: str

@app.put("/users/me/password")
async def update_my_password(payload: PasswordUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # 1. Verifica se a senha atual confere
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="A senha atual está incorreta.")
    
    # 2. Atualiza para a nova
    current_user.hashed_password = get_password_hash(payload.new_password)
    await db.commit()
    return {"ok": True, "message": "Palavra-passe atualizada com sucesso."}
    
@app.post("/chat")
async def chat_tutor(req: ChatMessageRequest):
    if not req.api_key and not os.getenv("OPENROUTER_API_KEY"): 
        raise HTTPException(status_code=403, detail="Nenhuma chave de API configurada no sistema.")
    
    hist_text = ""
    if req.historico:
        hist_text = "HISTÓRICO RECENTE:\n"
        for msg in req.historico[-4:]:
            role = "Aluno" if msg.get("role") == "user" else "Tutor"
            hist_text += f"{role}: {msg.get('content')}\n"

    prompt = f"""
    Atue como Professor Tutor Especialista em {req.area}.
    Responda de forma DIRETIVA, CLARA e AMIGÁVEL.

    {hist_text}

    DÚVIDA DO ALUNO:
    {req.mensagem}

    RETORNE APENAS ESTE JSON EXATO:
    {{
      "resposta": "Sua explicação detalhada aqui, usando formatação markdown (negrito, listas) para facilitar a leitura."
    }}
    """
    return StreamingResponse(stream_json_response(prompt, req.model, temp=0.4, api_key=req.api_key), media_type="text/plain")


@app.post("/generate-simulado-topic")
async def generate_simulado_topic_endpoint(req: SimuladoTopicRequest):
    if not req.api_key and not os.getenv("OPENROUTER_API_KEY"): 
        raise HTTPException(status_code=403, detail="Nenhuma chave de API configurada no sistema.")
    
    qtd = req.qtd_questoes or 5
    nivel = req.nivel or "Normal"
    formato = req.formato or "Múltipla Escolha"

    # Define dinamicamente as regras baseadas na escolha
    regras_formato = ""
    if formato == "Múltipla Escolha":
        regras_formato = """
        2. Crie EXATAMENTE 5 alternativas (A, B, C, D, E) para cada questão.
        3. REGRA CRÍTICA DE MÚLTIPLA ESCOLHA: As alternativas incorretas (distratores) NÃO PODEM ser obviamente absurdas. Crie pegadinhas semânticas ou use exceções à regra.
        4. Justifique tecnicamente por que cada alternativa está certa ou errada.
        """
        json_alternativas = '"alternativas": ["A) ...", "B) ...", "C) ...", "D) ...", "E) ..."],'
    else:
        regras_formato = """
        2. O formato deve ser CERTO ou ERRADO. O campo alternativas deve ter exatamente duas opções: ["A) Certo", "B) Errado"].
        3. REGRA CRÍTICA CERTO/ERRADO: Formule a afirmação com vocabulário técnico. Se a resposta for "Errado", o erro deve ser extremamente sutil (ex: inverter um conceito).
        4. Justifique o acerto ou o erro detalhadamente.
        """
        json_alternativas = '"alternativas": ["A) Certo", "B) Errado"],'
    
    prompt = f"""
    Atue como Banca Examinadora ({req.area}).
    Nível de Dificuldade das Questões: {nivel} (Iniciante, Normal, Avançado ou Expert). 
    Ajuste rigorosamente o aprofundamento técnico, o vocabulário, a presença de pegadinhas e a complexidade da cobrança para refletir EXATAMENTE este nível de dificuldade.

    Sua missão é criar um SIMULADO de fixação. Com base estritamente no conteúdo abaixo, crie EXATAMENTE {qtd} QUESTÕES inéditas focadas no tópico "{req.topico}".

    CONTEÚDO BASE PARA AS QUESTÕES:
    {req.conteudo[:8000]}

    REGRAS:
    1. Crie exatamente {qtd} questões desafiadoras.
    {regras_formato}

    RETORNE APENAS ESTE JSON EXATO:
    {{
      "simulado": [
        {{
          "contexto_disciplina": "{req.area}",
          "contexto_topico": "{req.topico}",
          "enunciado": "A situação-problema...",
          {json_alternativas}
          "resposta_correta": "A",
          "comentario_da_correta": "Explicação técnica...",
          "por_que_as_outras_estao_erradas": {{
            "B": "Erro da B",
            "C": "Erro da C"
          }}
        }}
      ]
    }}
    """
    return StreamingResponse(stream_json_response(prompt, req.model, temp=0.3, api_key=req.api_key), media_type="text/plain")


@app.post("/correct-essay")
async def correct_essay(req: EssayCorrectionRequest):
    if not req.api_key and not os.getenv("OPENROUTER_API_KEY"): 
        raise HTTPException(status_code=403, detail="Nenhuma chave de API configurada no sistema.")
    
    prompt = f"""
    Atue como CORRETOR RIGOROSO CESPE/CEBRASPE.

    DADOS DA QUESTÃO:
    Motivador: {req.texto_motivador}
    Comando: {req.comando}
    Aspectos: {json.dumps(req.aspectos, ensure_ascii=False)}

    RESPOSTA DO CANDIDATO:
    {req.resposta_aluno}

    DIRETRIZES:
    1. Avalie o conteúdo técnico. Desconte se for raso, MAS SEJA REALISTA: o candidato possui um limite físico estrito de 30 linhas (cerca de 240 a 300 palavras para TODA a prova). Não exija detalhamentos doutrinários exaustivos que jamais caberiam nesse espaço.
    2. Dê uma nota exata para cada aspecto (nunca maior que o valor_maximo).
    3. Avalie gramática e coesão separadamente. No campo 'padrao_esperado', o seu espelho de correção também DEVE ser conciso, cabendo perfeitamente na proporção da resposta exigida (máximo 80-100 palavras por aspecto).

    RETORNE APENAS ESTE JSON EXATO:
    {{
      "nota_final": 8.5,
      "avaliacoes_aspectos": [
        {{
          "aspecto": "Nome exato do Aspecto",
          "nota_atribuida": 3.5,
          "comentario": "Justificativa direta apontando onde o aluno errou ou acertou.",
          "padrao_esperado": "Espelho de Correção: Escreva um parágrafo altamente didático mostrando exatamente o que o aluno DEVERIA ter escrito para tirar a nota máxima neste tópico."
        }}
      ],
      "erros_gramaticais": "Apontamento de erros gramaticais e SUGESTÃO DE REESCRITA para melhorar a coesão.",
      "feedback_geral": "Parecer final da banca examinadora.",
      "dica_estudo": "Dica prática e encorajadora de qual assunto ou lei o candidato precisa revisar com base nos erros que cometeu nesta redação."
    }}
    """
    return StreamingResponse(stream_json_response(prompt, req.model, temp=0.2, api_key=req.api_key), media_type="text/plain")


@app.post("/generate-essay")
async def generate_essay_endpoint(req: GenerateEssayRequest):
    if not req.api_key and not os.getenv("OPENROUTER_API_KEY"): 
        raise HTTPException(status_code=403, detail="Nenhuma chave de API configurada no sistema.")
    
    nivel = req.nivel or "Normal"
    lesson_text = json.dumps(req.lesson_content, ensure_ascii=False)
    
    prompt = f"""
    Atue como EXAMINADOR da banca CESPE/CEBRASPE na área de {req.area}.
    NÍVEL DE DIFICULDADE: {nivel}.
    Sua missão é criar uma questão discursiva focada na aula abaixo.

    AULA: {lesson_text}

    DIRETRIZES DE CRIAÇÃO:
    1. COMANDO: É OBRIGATÓRIO INCLUIR A INSTRUÇÃO: "Redija seu texto em até 30 linhas".
    2. COMPLEXIDADE: O cenário deve ser proporcional ao nível {nivel}. Respostas devem ser possíveis de elaborar em até 30 linhas (cerca de 250-300 palavras).
    3. ASPECTOS: Crie 2 a 3 tópicos obrigatórios. Calibre as perguntas para que possam ser respondidas detalhadamente dentro do limite de 30 linhas.
    4. PONTUAÇÃO: A soma do campo "valor_maximo" deve ser exatos 10.0.

    RETORNE APENAS ESTE JSON EXATO:
    {{
      "discursiva": {{
        "texto_motivador": "Descrição detalhada do cenário.",
        "comando": "Considerando a situação hipotética, redija um texto abordando os pontos abaixo. Redija seu texto em até 30 linhas.",
        "aspectos": [
          {{ "aspecto": "1. ...", "valor_maximo": 4.0 }},
          {{ "aspecto": "2. ...", "valor_maximo": 6.0 }}
        ]
      }}
    }}
    """
    return StreamingResponse(stream_json_response(prompt, req.model, temp=0.3, api_key=req.api_key), media_type="text/plain")

@app.post("/generate-treino-discursiva")
async def generate_treino_discursiva_endpoint(req: TreinoDiscursivaRequest):
    if not req.api_key and not os.getenv("OPENROUTER_API_KEY"): 
        raise HTTPException(status_code=403, detail="Nenhuma chave de API configurada no sistema.")
    
    tipo = req.tipo_prova
    banca = req.banca
    cargo = req.cargo
    nivel = req.nivel or "Normal"

    # REGRAS DINÂMICAS DE COMPLEXIDADE (TRAVA PARA A IA)
    regras_dificuldade = ""
    if nivel == "Iniciante":
        regras_dificuldade = "Cenário curto, direto e BÁSICO (máximo 4 linhas). Exija APENAS a identificação de conceitos primários. PROIBIDO exigir jurisprudência profunda, artigos específicos de leis esparsas ou múltiplas infrações simultâneas. O objetivo é facilitar a vida do aluno iniciante."
    elif nivel == "Normal":
        regras_dificuldade = "Cenário de complexidade média. O caso deve envolver 1 ou 2 problemas centrais diretos. Foque na lei seca e na doutrina predominante."
    elif nivel == "Avançado":
        regras_dificuldade = "Cenário complexo. Exija conhecimento de jurisprudência (STF/STJ), conflito aparente de normas e múltiplas tipificações ou problemas procedimentais."
    elif nivel == "Expert":
        regras_dificuldade = "Cenário caótico, longo e extremamente desafiador (nível Delegado/Juiz/Auditor). Exija teses defensivas, visão crítica, jurisprudência minoritária/recentes e cruzamento de múltiplas áreas do direito."

    if tipo == "Redação (Atualidades/Temas Gerais)":
        diretrizes = "Crie um tema de redação dissertativo-argumentativa."
    elif tipo == "Peça Prático-Profissional":
        diretrizes = "Crie um cenário fático exigindo a elaboração de uma Peça Prático-Profissional."
    else:
        if nivel == "Iniciante":
            diretrizes = "Crie um estudo de caso BÁSICO E SIMPLES, avaliando conhecimentos introdutórios."
        else:
            diretrizes = "Crie um estudo de caso técnico ou situação hipotética exigindo identificação de problemas e aplicação da teoria."

    prompt = f"""
    Atue como EXAMINADOR da banca {banca}.
    Cargo Alvo do Concurso: {cargo}
    NÍVEL DE DIFICULDADE EXIGIDO: {nivel.upper()}

    A área geral de conhecimento do candidato é: {req.area}.
    Tópicos específicos exigidos pelo edital: {json.dumps(req.topicos, ensure_ascii=False)}

    Sua missão ÚNICA é criar UMA {tipo} simulando o padrão da banca {banca} para o cargo de {cargo}, RIGOROSAMENTE ADAPTADA AO NÍVEL DE DIFICULDADE ({nivel}).

    DIRETRIZES OBRIGATÓRIAS (ATENÇÃO AO NÍVEL):
    1. COMPLEXIDADE GERAL: {regras_dificuldade}
    2. ESTILO: {diretrizes} Use os tópicos base como contexto.
    3. TEXTO MOTIVADOR: Crie o cenário. Se o nível for 'Iniciante', o texto DEVE ser curtíssimo e sem pegadinhas.
    4. COMANDO: Use o vocabulário da banca. É OBRIGATÓRIO INCLUIR A INSTRUÇÃO: "Redija seu texto em até 30 linhas".
    5. ASPECTOS: Crie de 2 a 3 itens numerados. ATENÇÃO CRÍTICA: Os aspectos devem ser passíveis de resposta completa dentro do limite físico de 30 linhas manuscritas (cerca de 240 a 300 palavras totais). Não exija o impossível. Se for 'Iniciante', faça perguntas muito diretas.
    6. PONTUAÇÃO: A soma do campo "valor_maximo" dos aspectos DEVE ser exatos 19.0 pontos.

    RETORNE APENAS ESTE JSON EXATO:
    {{
      "discursiva": {{
        "texto_motivador": "Descrição do cenário...",
        "comando": "Considerando a situação, redija um texto...",
        "aspectos": [
          {{ "aspecto": "1. Pergunta ou tópico...", "valor_maximo": 9.0 }},
          {{ "aspecto": "2. Pergunta ou tópico...", "valor_maximo": 10.0 }}
        ]
      }}
    }}
    """
    return StreamingResponse(stream_json_response(prompt, req.model, temp=0.6, api_key=req.api_key), media_type="text/plain")

@app.post("/extract-topics")
async def extract_topics_endpoint(req: ExtractTopicsRequest):
    if not req.api_key and not os.getenv("OPENROUTER_API_KEY"): 
        raise HTTPException(status_code=403, detail="Nenhuma chave de API configurada no sistema.")
    
    prompt = f"""
    Atue como um Especialista Sênior em Análise de Editais de Concurso. 
    Leia o trecho bruto do edital/conteúdo programático abaixo e extraia a disciplina principal (área de conhecimento) e os tópicos específicos descritos.
    
    TEXTO DO EDITAL:
    {req.texto[:5000]}
    
    RETORNE APENAS ESTE JSON EXATO:
    {{
      "area": "Nome da Disciplina Principal (ex: Direito Penal, Arquitetura de Software)",
      "topicos": "Lista de todos os tópicos encontrados, rigorosamente separados por vírgula (ex: Crimes contra a vida, Dolo e culpa, Tipicidade)"
    }}
    """
    return StreamingResponse(stream_json_response(prompt, req.model, temp=0.1, api_key=req.api_key), media_type="text/plain")

@app.post("/generate-global-essay")
async def generate_global_essay_endpoint(req: GlobalEssayRequest):
    if not req.api_key and not os.getenv("OPENROUTER_API_KEY"): 
        raise HTTPException(status_code=403, detail="Nenhuma chave de API configurada no sistema.")
    
    nivel = req.nivel or "Normal"
    prompt = f"""
    Atue como EXAMINADOR SÊNIOR da banca CEBRASPE/CESPE.
    NÍVEL DE DIFICULDADE: {nivel}.
    Área do candidato: {req.area}.

    Tópicos para integrar: {json.dumps(req.aulas_titulos, ensure_ascii=False)}

    DIRETRIZES DE CRIAÇÃO:
    1. SELEÇÃO: Escolha 2 temas distintos da lista acima.
    2. COMANDO: É OBRIGATÓRIO INCLUIR A INSTRUÇÃO: "Redija seu texto em até 30 linhas".
    3. CALIBRAGEM: O cenário e os aspectos devem ser desenhados para que o candidato consiga responder tudo com qualidade em até 30 linhas (limite de 300 palavras). Não peça respostas que exijam textos de 500+ palavras.
    4. PONTUAÇÃO: A soma do campo "valor_maximo" deve ser exatos 19.0.

    RETORNE APENAS ESTE JSON EXATO:
    {{
      "discursiva": {{
        "texto_motivador": "Descrição do cenário hipotético.",
        "comando": "Considerando a situação narrada, redija um texto dissertativo em atendimento ao que se pede a seguir. Redija seu texto em até 30 linhas.",
        "aspectos": [
          {{ "aspecto": "1. ...", "valor_maximo": 9.0 }},
          {{ "aspecto": "2. ...", "valor_maximo": 10.0 }}
        ]
      }}
    }}
    """
    return StreamingResponse(stream_json_response(prompt, req.model, temp=0.6, api_key=req.api_key), media_type="text/plain")
    
@app.post("/auth/openrouter/exchange")
async def exchange_openrouter_key(payload: OpenRouterExchange, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Troca o código OAuth do OpenRouter por uma chave de API para o aluno"""
    try:
        # Usa o httpx assíncrono de forma nativa (Sem to_thread)
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/auth/keys",
                json={"code": payload.code},
                timeout=15.0 # Timeout de segurança
            )
        
        if response.status_code == 200:
            data = response.json()
            nova_api_key = data.get("key")
            
            if nova_api_key:
                # Salva a chave gerada diretamente no perfil do aluno
                current_user.api_key = nova_api_key
                # Define um modelo gratuito por padrão para ele começar a usar
                current_user.preferred_model = "arcee-ai/trinity-large-thinking:free"
                await db.commit()
                
                return {"ok": True, "message": "IA ativada com sucesso!"}
                
        raise HTTPException(status_code=400, detail="Código inválido ou expirado do OpenRouter.")
    except Exception as e:
        print(f"Erro no OAuth OpenRouter: {e}")
        raise HTTPException(status_code=500, detail="Erro ao comunicar com o OpenRouter.")
    
@app.post("/generate-simulado-cespe")
async def generate_simulado_cespe_endpoint(req: SimuladoCespeRequest):
    if not req.api_key and not os.getenv("OPENROUTER_API_KEY"): 
        raise HTTPException(status_code=403, detail="Nenhuma chave de API configurada no sistema.")
    
    try:
        result = await agent_cespe_exam_generator(
            subject=req.subject, # <-- Repassando o assunto para a IA
            focus=req.focus,
            difficulty=req.difficulty,
            amount=req.amount,
            generate_text=req.generate_text,
            model=req.model,
            api_key=req.api_key
        )
        return result
    except Exception as e:
        print(f"Erro ao gerar simulado CESPE: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/generate-lesson-cespe")
async def generate_lesson_cespe_endpoint(req: LessonCespeRequest):
    if not req.api_key and not os.getenv("OPENROUTER_API_KEY"): 
        raise HTTPException(status_code=403, detail="Nenhuma chave de API configurada no sistema.")
    
    try:
        result = await agent_cespe_lesson_generator(
            wrong_questions=req.wrong_questions,
            model=req.model,
            api_key=req.api_key
        )
        return result
    except Exception as e:
        print(f"Erro ao gerar aula CESPE: {e}")
        raise HTTPException(status_code=500, detail=str(e))
                
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)