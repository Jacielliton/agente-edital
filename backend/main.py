# backend/main.py
import os
import uvicorn
import json
import re
import asyncio
import random
import contextvars
import time
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Optional, AsyncGenerator
from contextlib import asynccontextmanager
import httpx
from fastapi import FastAPI, HTTPException, Depends
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict
from dotenv import load_dotenv
from typing import Literal
import mercadopago
from fastapi import Request
import uuid
from json_repair import repair_json
from passlib.context import CryptContext
from jose import JWTError, jwt
from fastapi.security import OAuth2PasswordBearer

# Imports de Banco de Dados (SQLAlchemy + Asyncpg)
from sqlalchemy import Column, Float, Integer, String, DateTime, JSON, select, desc, func, Boolean, or_
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base

# Cliente OpenAI/OpenRouter
from openai import AsyncOpenAI
current_user_ctx = contextvars.ContextVar('current_user_ctx', default=None)

# ============================================================================
# 1. CONFIGURAÇÃO DE AMBIENTE E BANCO DE DADOS
# ============================================================================

load_dotenv(override=True)
ENV_FILE_PATH = os.getenv("ENV_FILE_PATH", ".env")

# Importação direta do database.py (Evita duplicação e Erro 500)
from database import engine, Base, AsyncSessionLocal, get_db

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
    plan_expires_at = Column(DateTime, nullable=True) # Controle do Mercado Pago
    is_active = Column(Boolean, default=True)
    allowed_concursos = Column(String, nullable=True)
    
    # --- NOVOS CAMPOS PARA INDICAÇÃO (Devem ficar alinhados aqui dentro do User) ---
    referral_code = Column(String, unique=True, index=True, nullable=True) # Código único do usuário
    referred_by_id = Column(Integer, nullable=True)                        # ID de quem o indicou
    commission_balance = Column(Float, default=0.0)
    
    # --- NOVOS CAMPOS IA E ASSINATURA ---
    plan_type = Column(String, default="Simples") # Simples, Plus, Pro
    tokens_used = Column(Integer, default=0)
    token_limit = Column(Integer, default=0)
    token_reset_date = Column(DateTime, nullable=True)
    ai_blocked = Column(Boolean, default=False)

class GlobalAIConfig(Base):
    __tablename__ = "global_ai_config"
    id = Column(Integer, primary_key=True, index=True)
    model = Column(String, default="openai/gpt-4o-mini")
    api_key = Column(String, nullable=True)
    global_prompt = Column(String, nullable=True)
    temperature = Column(Float, default=0.5)
    max_tokens = Column(Integer, default=8192)
    top_p = Column(Float, default=1.0)
    penalties = Column(Float, default=0.0)
    timeout = Column(Integer, default=30)

class AITokenLog(Base):
    __tablename__ = "ai_token_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True)
    plan_type = Column(String)
    tokens_prompt = Column(Integer, default=0)
    tokens_completion = Column(Integer, default=0)
    tokens_total = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

class CommissionHistory(Base):
    __tablename__ = "commission_history"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True)
    amount = Column(Float)
    action_type = Column(String) # 'ganho', 'pagamento' ou 'ajuste'
    description = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
class Coupon(Base):
    __tablename__ = "coupons"
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True)
    discount_percentage = Column(Float)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)     
    
class CommissionActionRequest(BaseModel):
    action: str
    amount: float
    description: Optional[str] = None

class CommissionHistoryResponse(BaseModel):
    id: int
    amount: float
    action_type: str
    description: Optional[str] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

# ============================================================================
# 3. SEGURANÇA (JWT & HASH)
# ============================================================================

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    # Falhar aqui e melhor do que subir assinando tokens com uma chave conhecida:
    # com ela, qualquer pessoa forjaria um JWT de qualquer usuario, admin inclusive.
    raise RuntimeError(
        "SECRET_KEY nao definida. Gere uma com "
        "python -c \"import secrets; print(secrets.token_urlsafe(64))\" "
        "e coloque no .env antes de iniciar a aplicacao."
    )
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
    content: Optional[Dict[str, Any]] = None

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
    model: Optional[str] = "nvidia/nemotron-3-nano-30b-a3b:free"
    api_key: Optional[str] = None
    
class TreinoDiscursivaRequest(BaseModel):
    area: str
    topicos: List[str]
    tipo_prova: str
    cargo: str
    banca: str
    nivel: Optional[str] = "Normal"
    edital_regras_prova: Optional[str] = None
    model: Optional[str] = "nvidia/nemotron-3-nano-30b-a3b:free"
    api_key: Optional[str] = None
    
class ExtractTopicsRequest(BaseModel):
    texto: str
    model: Optional[str] = "nvidia/nemotron-3-nano-30b-a3b:free"
    api_key: Optional[str] = None
        
class EssayCorrectionRequest(BaseModel):
    texto_motivador: str
    comando: str
    aspectos: List[Dict[str, Any]]
    resposta_aluno: str
    model: Optional[str] = "nvidia/nemotron-3-nano-30b-a3b:free"
    api_key: Optional[str] = None

class GenerateEssayRequest(BaseModel):
    area: str
    aula_titulo: str
    lesson_content: dict
    nivel: Optional[str] = "Normal"
    model: Optional[str] = "nvidia/nemotron-3-nano-30b-a3b:free"
    api_key: Optional[str] = None

class ChatMessageRequest(BaseModel):
    area: str
    aula_titulo: str
    mensagem: str
    historico: List[Dict[str, str]] = []
    model: Optional[str] = "nvidia/nemotron-3-nano-30b-a3b:free"
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
    # O papel NAO entra aqui de proposito: o cadastro publico so cria conta comum.
    # Promover alguem a admin e feito pelas rotas administrativas autenticadas.
    email: str
    password: str
    referral_code: Optional[str] = None

# ADICIONADO: Schema para validação e criação do cupom
class CouponCreate(BaseModel):
    code: str
    discount_percentage: float
    
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
    
    # === CONTROLE DE VENCIMENTO DO PLANO ===
    if not user.is_active:
        raise HTTPException(
            status_code=403,
            detail="CONTA_BLOQUEADA"
        )
        
    if user.role != "admin" and user.plan_expires_at:
        if datetime.utcnow() > user.plan_expires_at:
            raise HTTPException(
                status_code=403,
                detail="CONTA_EXPIRADA"
            )
        
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
    api_key: Optional[str] = None
    # Contexto da prova: chega ANTES da geracao para os agentes escreverem no
    # padrao da banca certa, e nao so como rotulo no momento de salvar.
    banca: Optional[str] = None
    concurso: Optional[str] = None
    cargo: Optional[str] = None
    ano: Optional[str] = None
    qtd_questoes: int = 10

class EstruturaRequest(BaseModel):
    """Etapa 1: so o arquiteto. Rapida, devolve a lista de modulos."""
    text: str
    model: Optional[str] = None
    api_key: Optional[str] = None
    banca: Optional[str] = None
    concurso: Optional[str] = None
    cargo: Optional[str] = None
    ano: Optional[str] = None


class ModuloRequest(BaseModel):
    """Etapa 2: gera UM modulo completo. O frontend chama uma vez por modulo."""
    modulo: Dict[str, Any]
    area: str
    instrucoes: Dict[str, Any] = {}
    texto_edital: str = ""
    model: Optional[str] = None
    api_key: Optional[str] = None
    question_format: str = "Múltipla Escolha"
    question_level: Literal["Iniciante", "Normal", "Avançado", "Expert"] = "Normal"
    qtd_questoes: int = 10
    banca: Optional[str] = None
    concurso: Optional[str] = None
    cargo: Optional[str] = None
    ano: Optional[str] = None


class PlanoEstudoRequest(BaseModel):
    """Etapa 3: o estrategista, com as aulas ja prontas."""
    aulas: List[Dict[str, Any]]
    area: str
    model: Optional[str] = None
    api_key: Optional[str] = None


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
    can_manage_lessons: bool 
    plan_expires_at: Optional[datetime] = None
    is_active: bool = True # NOVO
    referral_code: Optional[str] = None     # NOVO
    commission_balance: Optional[float] = 0.0 # NOVO
    plan_type: str = "Simples"
    tokens_used: int = 0
    token_limit: int = 0
    token_reset_date: Optional[datetime] = None
    ai_blocked: bool = False
    allowed_concursos: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

class UserCreateAdmin(BaseModel):
    email: str
    password: str
    role: str = "user"
    can_manage_lessons: bool = False
    is_active: bool = True # NOVO
    allowed_concursos: Optional[str] = None

class UserUpdateAdmin(BaseModel):
    email: Optional[str] = None
    role: Optional[str] = None
    can_manage_lessons: Optional[bool] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None # NOVO
    allowed_concursos: Optional[str] = None
    
class PaginatedPlansResponse(BaseModel):
    items: List[PlanSummaryResponse]
    total: int
    
class SimuladoCespeRequest(BaseModel):
    subject: str = "Língua Portuguesa" # <-- Adicione este campo
    focus: str
    difficulty: str
    amount: int
    generate_text: bool
    formato: Optional[str] = "Certo/Errado"
    model: Optional[str] = "nvidia/nemotron-3-nano-30b-a3b:free"
    api_key: Optional[str] = None

class LessonCespeRequest(BaseModel):
    wrong_questions: List[Dict[str, Any]]
    model: Optional[str] = "nvidia/nemotron-3-nano-30b-a3b:free"
    api_key: Optional[str] = None
    
class TranslateWordRequest(BaseModel):
    word: str
    model: Optional[str] = "nvidia/nemotron-3-nano-30b-a3b:free"
    api_key: Optional[str] = None
    
class ProcessedPayment(Base):
    __tablename__ = "processed_payments"
    payment_id = Column(String, primary_key=True, index=True)
    processed_at = Column(DateTime, default=datetime.utcnow)
    
class UserUpdateRole(BaseModel):
    role: str

class AIConfigSchema(BaseModel):
    model: str
    api_key: str
    global_prompt: Optional[str] = None
    temperature: float
    max_tokens: int
    top_p: float
    penalties: float
    timeout: int

class AIStatsResponse(BaseModel):
    total_plus: int
    total_pro: int
    tokens_today: int
    tokens_month: int
    tokens_total: int
    estimated_cost: float
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

DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "nvidia/nemotron-3-nano-30b-a3b:free")
AVAILABLE_MODELS = [m.strip() for m in os.getenv("AVAILABLE_MODELS", "nvidia/nemotron-3-nano-30b-a3b:free,google/gemini-2.5-flash").split(",") if m.strip()]

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

# ---------------------------------------------------------------- CORS
# allow_origins=["*"] deixava qualquer site chamar esta API com as credenciais
# do visitante. As origens reais vêm do ambiente (CORS_ORIGINS, separadas por
# vírgula); sem a variável, valem os padrões abaixo.
CORS_PADRAO = [
    "https://agente-edital.tecnopriv.top",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
_cors_env = os.getenv("CORS_ORIGINS", "").strip()
CORS_ORIGINS = [o.strip().rstrip("/") for o in _cors_env.split(",") if o.strip()] or CORS_PADRAO
print(f"--- 🔒 CORS liberado para: {', '.join(CORS_ORIGINS)} ---")

# ------------------------------------------------------- Limite de requisições
# Sem isto, /auth/login aceita força bruta e /auth/register aceita criação de
# contas em massa. Implementado sem dependência nova: janela deslizante em
# memória, por IP. Com mais de um worker o limite passa a valer por worker —
# ainda assim corta o abuso automatizado.
RATE_LIMIT_ATIVO = os.getenv("RATE_LIMIT_ATIVO", "1").strip() not in ("0", "false", "False", "")

# rota -> (máximo de chamadas, janela em segundos)
LIMITES_POR_ROTA = {
    "/auth/login": (10, 300),
    "/auth/register": (5, 3600),
    "/auth/openrouter/exchange": (10, 600),
    "/payments/create-preference": (20, 3600),
    "/coupons/validate": (30, 3600),
}

_historico_requisicoes: Dict[str, List[float]] = {}
_ultima_limpeza = 0.0


def _ip_do_cliente(request: Request) -> str:
    # Atrás do nginx, request.client.host é sempre 127.0.0.1.
    encaminhado = request.headers.get("x-forwarded-for", "")
    if encaminhado:
        return encaminhado.split(",")[0].strip()
    return request.client.host if request.client else "desconhecido"


def _limite_da_rota(caminho: str):
    for prefixo, limite in LIMITES_POR_ROTA.items():
        if caminho.startswith(prefixo):
            return prefixo, limite
    return None, None


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    global _ultima_limpeza

    if not RATE_LIMIT_ATIVO or request.method == "OPTIONS":
        return await call_next(request)

    prefixo, limite = _limite_da_rota(request.url.path)
    if not limite:
        return await call_next(request)

    maximo, janela = limite
    agora = time.monotonic()
    chave = f"{_ip_do_cliente(request)}|{prefixo}"

    # Faxina periódica, para o dicionário não crescer sem parar.
    if agora - _ultima_limpeza > 600:
        _ultima_limpeza = agora
        for k in [k for k, v in _historico_requisicoes.items() if not v or agora - v[-1] > 3600]:
            _historico_requisicoes.pop(k, None)

    marcas = [t for t in _historico_requisicoes.get(chave, []) if agora - t < janela]

    if len(marcas) >= maximo:
        espera = int(janela - (agora - marcas[0])) + 1
        _historico_requisicoes[chave] = marcas
        minutos = max(1, espera // 60)
        return JSONResponse(
            status_code=429,
            content={"detail": f"Muitas tentativas. Tente de novo em cerca de {minutos} minuto(s)."},
            headers={"Retry-After": str(espera)},
        )

    marcas.append(agora)
    _historico_requisicoes[chave] = marcas
    return await call_next(request)

@app.middleware("http")
async def context_user_middleware(request: Request, call_next):
    token = request.headers.get("Authorization")
    if token and token.startswith("Bearer "):
        try:
            clean_token = token.replace("Bearer ", "").replace('"', '').replace("'", "")
            payload = jwt.decode(clean_token, SECRET_KEY, algorithms=[ALGORITHM])
            email = payload.get("sub")
            if email:
                async with AsyncSessionLocal() as db:
                    user = (await db.execute(select(User).filter(User.email == email))).scalars().first()
                    if user:
                        current_user_ctx.set(user)
        except Exception:
            pass
    response = await call_next(request)
    return response


# O CORS entra por último de propósito: no Starlette o middleware registrado
# por último é o mais externo, e é isso que garante que até a resposta 429 do
# limitador saia com os cabeçalhos de CORS. Registrado antes, o navegador
# mostraria "erro de CORS" no lugar de "muitas tentativas".
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.post("/auth/register")
async def register(user: UserCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.email == user.email))
    if result.scalars().first(): raise HTTPException(status_code=400, detail="Email já cadastrado")
    
    # 1. Verifica quem indicou (se houver código de indicação)
    referrer_id = None
    if user.referral_code:
        ref_result = await db.execute(select(User).filter(User.referral_code == user.referral_code))
        referrer = ref_result.scalars().first()
        if referrer:
            referrer_id = referrer.id

    # 2. Gera um código único para o NOVO usuário divulgar
    new_referral_code = str(uuid.uuid4().hex)[:8].upper()

    hashed_pw = get_password_hash(user.password)
    
    new_user = User(
        email=user.email, 
        hashed_password=hashed_pw, 
        role="user",  # fixo: nunca vem da requisicao
        plan_expires_at=datetime.utcnow(),
        referral_code=new_referral_code, # Salva o código dele
        referred_by_id=referrer_id,      # Salva quem o indicou
        commission_balance=0.0
    )
    db.add(new_user)
    await db.commit()
    return {"message": "Usuário criado com sucesso"}

@app.post("/auth/login", response_model=Token)
async def login(form_data: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.email == form_data.email))
    user = result.scalars().first()
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Email ou senha incorretos")

    # === CONTROLE DE VENCIMENTO DO PLANO ===
    if user.role != "admin" and user.plan_expires_at:
        if datetime.utcnow() > user.plan_expires_at:
            raise HTTPException(status_code=403, detail="CONTA_EXPIRADA")
    
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
async def set_config(cfg: ConfigRequest, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin": raise HTTPException(status_code=403, detail="Não autorizado")
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
        DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "nvidia/nemotron-3-nano-30b-a3b:free")
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
    query = select(StoredPlan, User.email).outerjoin(User, StoredPlan.owner_id == User.id)
    
    if current_user.role != 'admin':
        if manage_mode:
            query = query.where(StoredPlan.owner_id == current_user.id)
        else:
            has_private_access = select(PlanShare).where(
                PlanShare.plan_id == StoredPlan.id, 
                PlanShare.user_email == current_user.email
            ).exists()

            # --- NOVA LÓGICA DE VISIBILIDADE PARA USUÁRIO PERSONALIZADO ---
            if current_user.role == 'custom':
                allowed_str = current_user.allowed_concursos or ""
                allowed_list = [c.strip().upper() for c in allowed_str.split(",") if c.strip()]
                
                # Usuário "custom" vê apenas suas próprias aulas, aulas compartilhadas diretamente com ele,
                # ou aulas onde o concurso bate exatamente com a lista liberada para ele (ignorando maiúscula/minúscula).
                if allowed_list:
                    query = query.where(
                        or_(
                            StoredPlan.owner_id == current_user.id,
                            has_private_access,
                            func.upper(StoredPlan.concurso).in_(allowed_list)
                        )
                    )
                else:
                    # Se for custom, mas não tiver concursos atribuídos, ele só vê o que for dono ou compartilhado direto
                    query = query.where(
                        or_(
                            StoredPlan.owner_id == current_user.id,
                            has_private_access
                        )
                    )
            else:
                # Lógica Original para usuário Padrão
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
    if req.content is not None: plan.content = req.content # <--- NOVA LINHA ADICIONADA
    
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
def shuffle_question_options(question: Dict[str, Any]) -> Dict[str, Any]:
    """
    Recebe uma questão com chaves de alternativas e por_que_as_outras_estao_erradas,
    embaralha e atualiza o gabarito de forma real por código.
    """
    try:
        # Se for formato Certo/Errado ou não tiver alternativas estruturadas, não mexe
        if "alternativas" not in question or len(question["alternativas"]) <= 2:
            return question

        # 1. Mapeia a letra atual para o índice (A=0, B=1, C=2, D=3)
        gabarito_atual = question.get("gabarito", question.get("resposta_correta", "A")).strip().upper()
        letras_validas = ["A", "B", "C", "D"]
        if gabarito_atual not in letras_validas:
            return question
            
        idx_correto_antigo = letras_validas.index(gabarito_atual)

        # 2. Extrai os textos limpos (removendo o "A) ", "B) ", etc., se houver)
        textos_limpos = []
        for alt in question["alternativas"]:
            texto = re.sub(r"^[A-E]\s*[\)\.\-:]\s*", "", str(alt)).strip()
            textos_limpos.append(texto)

        # Guarda qual é o texto da alternativa correta
        texto_correto = textos_limpos[idx_correto_antigo]

        # 3. Agrupa os comentários das erradas (por_que_as_outras_estao_erradas)
        comentarios_erradas = question.get("por_que_as_outras_estao_erradas", {})
        # Se for uma lista ou formato diferente, tenta extrair os textos limpos dos comentários
        comentarios_limpos = {}
        for l in letras_validas:
            comentarios_limpos[l] = comentarios_erradas.get(l, "")

        # 4. Embaralha os textos das alternativas
        random.shuffle(textos_limpos)

        # 5. Reconstrói o formato "A) texto" e descobre onde a correta parou
        novo_idx_correto = textos_limpos.index(texto_correto)
        nova_letra_correta = letras_validas[novo_idx_correto]

        novas_alternativas = [f"{letras_validas[i]}) {textos_limpos[i]}" for i in range(len(textos_limpos))]
        
        # 6. Redistribui os comentários das erradas de forma coerente com o novo arranjo
        # O comentário da antiga correta (se houver) some ou vira a justificativa do erro na nova posição
        novos_comentarios = {}
        # Mapeia qual texto de alternativa está em qual posição agora para associar o erro
        for i, letra in enumerate(letras_validas):
            if i != novo_idx_correto:
                # Procura qual era a letra antiga desse texto para herdar o comentário de erro correto
                texto_atual = textos_limpos[i]
                # Fallback simples caso não ache correspondência perfeita
                novos_comentarios[letra] = "Alternativa incorreta com base nos fundamentos do tema."

        # Atualiza o objeto da questão
        question["alternativas"] = novas_alternativas
        if "gabarito" in question:
            question["gabarito"] = nova_letra_correta
        if "resposta_correta" in question:
            question["resposta_correta"] = nova_letra_correta
            
        question["por_que_as_outras_estao_erradas"] = novos_comentarios

    except Exception as e:
        print(f"⚠️ Erro ao randomizar questão por código: {e}")
    
    return question

async def stream_json_response(prompt: str, model_name: str, temp: float = 0.25, api_key: Optional[str] = None):
    """Lê o stream e repassa os chunks em tempo real para manter a conexão viva."""
    
    is_shared_ai = False
    current_user = current_user_ctx.get()
    
    async with AsyncSessionLocal() as db_session:
        config = (await db_session.execute(select(GlobalAIConfig).filter(GlobalAIConfig.id == 1))).scalars().first()
        
        # O usuário não passou chave pessoal. Vamos processar regras da IA compartilhada.
        if not api_key or not api_key.strip():
            if current_user:
                if current_user.role != "admin":
                    if current_user.ai_blocked:
                        yield '{"error": "Seu acesso à IA está temporariamente bloqueado pelo administrador."}'
                        return
                    if current_user.plan_type == "Simples":
                        yield '{"error": "O plano Simples não possui acesso à IA. Para utilizar os recursos de inteligência, faça upgrade para o plano Plus ou Pro."}'
                        return
                    if current_user.token_limit > 0 and current_user.tokens_used >= current_user.token_limit:
                        yield '{"error": "O limite de processamento (tokens) do seu plano foi atingido neste ciclo."}'
                        return
            
            is_shared_ai = True
            if config and config.api_key:
                api_key = config.api_key
                model_name = config.model
                temp = config.temperature

    # === CORREÇÃO DE ROTEAMENTO DE API ===
    if api_key and api_key.strip():
        chave_limpa = api_key.strip()
        
        # Roteador Dinâmico
        if chave_limpa.startswith("sk-or-"):
            url_base = "https://openrouter.ai/api/v1"
        else:
            url_base = "https://generativelanguage.googleapis.com/v1beta/openai/"
            
            # --- VACINA ANTI-ERRO 404 ---
            # Remove o prefixo se a requisição estiver indo direto para o Google
            if model_name and model_name.startswith("google/"):
                model_name = model_name.replace("google/", "")
                
        client = AsyncOpenAI(base_url=url_base, api_key=chave_limpa)
    else:
        client = get_openrouter_client()
        if not client: 
            yield '{"error": "OPENROUTER_API_KEY não encontrado."}'
            return

    try:
            stream_opts = {"include_usage": True} if is_shared_ai else None
            
            system_content = (
                "Você é um sistema que responde ÚNICA e EXCLUSIVAMENTE em formato JSON estruturado e válido.\n"
                "REGRAS VITAIS E ABSOLUTAS DE FORMATAÇÃO (RISCO DE QUEBRA DE SISTEMA):\n"
                "1. NUNCA, SOB NENHUMA HIPÓTESE, use aspas duplas (\") DENTRO dos valores de texto do JSON. Se precisar citar algo, destacar palavras ou escrever código, use APENAS aspas simples (') ou a entidade HTML &quot;.\n"
                "2. CÓDIGOS E FÓRMULAS: Ao escrever fórmulas matemáticas (LaTeX) ou códigos, você DEVE usar a barra invertida dupla (\\\\) em vez de simples (ex: \\\\sigma, \\\\mu, \\\\n) para não causar o erro 'Invalid escape'.\n"
                "3. NÃO retorne NENHUM texto fora do JSON (NÃO use blocos markdown como ```json).\n"
                "4. Quebras de linha reais são estritamente proibidas dentro das strings. Use apenas \\n."
            )
            
            if is_shared_ai and config and config.global_prompt:
                system_content += f"\nDIRETRIZES GLOBAIS DO ADMIN:\n{config.global_prompt}"

            kwargs = {
                "model": (model_name or DEFAULT_MODEL),
                "messages": [
                    {"role": "system", "content": system_content},
                    {"role": "user", "content": prompt}
                ],
                "temperature": temp,
                "max_tokens": config.max_tokens if is_shared_ai and config else 8192,
                "top_p": config.top_p if is_shared_ai and config else 1.0,
                "stream": True
            }
            if stream_opts: kwargs["stream_options"] = stream_opts

            response = await client.chat.completions.create(**kwargs)
            
            async for chunk in response:
                # O parâmetro include_usage injeta a estatística enviada/recebida no último chunk vazio
                if is_shared_ai and current_user and hasattr(chunk, 'usage') and chunk.usage:
                    async with AsyncSessionLocal() as db_session:
                        usr = (await db_session.execute(select(User).filter(User.id == current_user.id))).scalars().first()
                        if usr:
                            p_tokens = chunk.usage.prompt_tokens
                            c_tokens = chunk.usage.completion_tokens
                            t_total = chunk.usage.total_tokens
                            usr.tokens_used += t_total
                            db_session.add(AITokenLog(user_id=usr.id, plan_type=usr.plan_type, tokens_prompt=p_tokens, tokens_completion=c_tokens, tokens_total=t_total))
                            await db_session.commit()

                if chunk.choices and len(chunk.choices) > 0 and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
    except Exception as e:
        yield f'{{"error": "{str(e)}"}}'
        
# Cerca markdown que envolve a RESPOSTA INTEIRA (```json { ... } ```).
_CERCA_EXTERNA = re.compile(
    r"^```[A-Za-z0-9_+-]*[ \t]*\r?\n(?P<corpo>.*?)\r?\n?```[ \t]*$",
    re.DOTALL,
)
_SO_CERCA_DE_ABERTURA = re.compile(r"^```[A-Za-z0-9_+-]*[ \t]*$")


def clean_response(text: str) -> str:
    """Remove o <think> e a cerca markdown que embrulha a resposta inteira.

    ATENÇÃO: a versão anterior usava re.MULTILINE aqui, o que fazia o padrão
    casar no início e no fim de TODA linha — e portanto apagava a cerca de cada
    bloco de código dentro da aula. Um ```xml virava a palavra solta "xml" no
    meio do parágrafo, e o código saía como texto corrido na tela do aluno.
    Só a cerca externa pode ser removida.
    """
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()

    casou = _CERCA_EXTERNA.match(text)
    if casou:
        return casou.group("corpo").strip()

    # cerca de abertura sem fechamento (resposta truncada)
    if text.startswith("```"):
        primeira, _, resto = text.partition("\n")
        if _SO_CERCA_DE_ABERTURA.match(primeira.strip()):
            return resto.strip()

    return text

def try_parse_json_loose(text: str) -> Any:
    text = text.strip()
    
    # 1. Nova Vacina Anti-LaTeX corrigida (usa Negative Lookbehind)
    # Só duplica a barra se ela NÃO tiver uma barra antes e NÃO for um escape válido.
    text = re.sub(r'(?<!\\)\\(?!["\\/bfnrtu])', r'\\\\', text)
    
    try: 
        return json.loads(text, strict=False)
    except Exception as e:
        # 2. O Salvador da Pátria: repara aspas duplas, quebras de linha e falhas de estrutura
        repaired = repair_json(text, return_objects=True)
        if repaired:
            return repaired
            
        # Se falhar até no repair, printa o trecho problemático no console para debug
        print(f"⚠️ Falha Crítica no JSON: {str(e)}\nTrecho: {text[:300]}...")
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
    
    # === TRAVA DE SEGURANÇA: FORÇAR MODELO GLOBAL SE O USUÁRIO USAR A IA COMPARTILHADA ===
    async with AsyncSessionLocal() as db_session:
        config = (await db_session.execute(select(GlobalAIConfig).filter(GlobalAIConfig.id == 1))).scalars().first()
        if not api_key or not api_key.strip():
            if config:
                if config.api_key:
                    api_key = config.api_key
                if config.model:
                    model_name = config.model # <--- O modelo do usuário é IGNORADO e sobrescrito pelo do Admin!
                if config.temperature:
                    temp = config.temperature

    # === CORREÇÃO DE ROTEAMENTO DE API ===
    if api_key and api_key.strip():
        chave_limpa = api_key.strip()
        
        # Roteador Dinâmico
        if chave_limpa.startswith("sk-or-"):
            url_base = "https://openrouter.ai/api/v1"
        else:
            url_base = "https://generativelanguage.googleapis.com/v1beta/openai/"
            
            # --- VACINA ANTI-ERRO 404 ---
            if model_name and model_name.startswith("google/"):
                model_name = model_name.replace("google/", "")
                
        client = AsyncOpenAI(base_url=url_base, api_key=chave_limpa)
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
                            "REGRAS VITAIS E ABSOLUTAS DE FORMATAÇÃO (RISCO DE QUEBRA DE SISTEMA):\n"
                            "1. NUNCA, SOB NENHUMA HIPÓTESE, use aspas duplas (\") DENTRO dos valores de texto do JSON. Se precisar citar algo, destacar palavras ou escrever código, use APENAS aspas simples (') ou a entidade HTML &quot;.\n"
                            "2. CÓDIGOS E FÓRMULAS: Ao escrever fórmulas matemáticas (LaTeX) ou códigos, você DEVE usar a barra invertida dupla (\\\\) em vez de simples (ex: \\\\sigma, \\\\mu, \\\\n) para não causar o erro 'Invalid escape'.\n"
                            "3. NÃO retorne NENHUM texto fora do JSON (NÃO use blocos markdown como ```json).\n"
                            "4. Quebras de linha reais são estritamente proibidas dentro das strings. Use apenas \\n."
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
        elif focus == 'condicional': focus_instructions = "Foque em proposições condicionais (se... então), tabela-verdade, condition suficiente e condição necessária."
        elif focus == 'equivalencia': focus_instructions = "Foque em equivalências lógicas (contrapositiva, equivalência da disjunção/condicional)."
        elif focus == 'diagramas': focus_instructions = "Foque in diagramas lógicos (Todo, Algum, Nenhum) e silogismos categóricos."
        elif focus == 'argumentacao': focus_instructions = "Foque na validade de argumentos lógicos, premissas e conclusões."
        elif focus == 'probabilidade': focus_instructions = "Foque em probabilidade de eventos, união, intersecção e probabilidade condicional."
        elif focus == 'combinatoria': focus_instructions = "Foque em análise combinatória (arranjos, permutações e combinações simples)."
        elif focus == 'sequencias': focus_instructions = "Foque em sequências lógicas numéricas, de palavras ou figuras."
        else: focus_instructions = "Mescle tabela-verdade, negações lógicas e equivalências em situações hipotéticas."
    
    # NOVAS DIRETRIZES: Isolamento para Disciplinas de Direito
    elif "Direito" in subject or subject == "Constitucional" or subject == "Penal" or subject == "Administrativo" or subject == "Processual" or subject == "Humanos":
        focus_instructions = f"""
        Foque estritamente na matéria jurídica de {subject}, abordando o tema: {focus}. 
        É OBRIGATÓRIO fundamentar a cobrança com base na literalidade da lei (Lei Seca) e, principalmente, na jurisprudência consolidada ou sumulada do STF e STJ. 
        Crie cenários fáticos cotidianos ou casos práticos de atuação policial/jurídica. 
        PROIBIDO terminantemente usar conceitos gramaticais, interpretação de textos puramente literários ou conectivos lógicos matemáticos.
        """

    # Tratamento original para Português (Mantido Intacto e com Suporte a Instruções Complexas)
    else: 
        if focus.startswith('Foco na vertente:') or focus.startswith('DIRETRIZ OBRIGATÓRIA:'):
            focus_instructions = focus # Recebe as instruções complexas formatadas diretamente do Frontend
        elif focus == 'interpretacao': focus_instructions = "Foque EXCLUSIVAMENTE em interpretação de texto, inferência e compreensão."
        elif focus == 'gramatica': focus_instructions = "Foque em gramática aplicada: concordância, regência, crase, pontuação e pronomes."
        elif focus == 'reescrita': focus_instructions = "Foque EXCLUSIVAMENTE em propostas de reescrita de trechos do texto."
        elif focus == 'semantica': focus_instructions = "Foque em coesão, coerência, substituição de conectivos e semântica."
        elif focus == 'hardcore': focus_instructions = "NÍVEL MÁXIMO DE DIFICULDADE CESPE. Pegadinhas sutis e extrapolação."
        elif focus.startswith('Sintaxe:'): 
            tema_exato = focus.replace('Sintaxe:', '').strip()
            focus_instructions = f"Foque ESPECIFICAMENTE E EXCLUSIVAMENTE nas regras sintáticas e pegadinhas gramaticais sobre: {tema_exato}."
        else: focus_instructions = "Distribua as questões entre interpretação, reescrita e sintaxe."

    text_instruction = 'Crie uma situação hipotética base inédita (Ex: Um servidor público praticou determinado ato...)' if generate_text else 'Sem situação hipotética geral, foque nas assertivas diretas.'

    prompt = f"""
Você é o mais rigoroso Examinador Sênior da banca CESPE/CEBRASPE. Crie um simulado inédito de {subject}.
DIRETRIZES: {amount} questões. Dificuldade: {difficulty}. Foco: {focus_instructions}.
Texto-Base: {text_instruction}

REGRAS CRÍTICAS DE FORMATAÇÃO JSON (EVITAR QUEBRA DE CÓDIGO):
1. JAMAIS use aspas duplas (") DENTRO dos valores de texto. Se precisar citar algo ou transcrever um artigo/lei, use ASPAS SIMPLES (').
2. JAMAIS use quebras de linha reais dentro das strings. O texto deve ser contínuo.
3. Responda ESTRITAMENTE com o JSON, sem formatação markdown (```json).

INSTRUÇÃO DE RESPOSTA JSON OBRIGATÓRIO:
{{
    "textoBase": "Situação fática descrita ou premissas iniciais da questão, ou deixe vazio.",
    "questoes": [ 
        {{ 
            "id": 1, 
            "enunciado": "A assertiva jurídica para julgamento...", 
            "assunto": "Subtópico específico avaliado", 
            "gabarito": "C", 
            "explicacao": "Explique passo a passo a fundamentação com base no artigo da lei ou julgado do STF/STJ que justifica o gabarito (C ou E)." 
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
    2. FORMATO ABCD: Gere exatamente 4 alternativas (A, B, C, D) para cada uma. Nunca crie alternativa E.
    3. DISTRATORES E HOMOGENEIDADE: As alternativas incorretas não podem ser óbvias. Todas as opções devem ter tamanho e estilo semelhantes.
    4. RANDOMIZAÇÃO DO GABARITO: A resposta correta DEVE ser distribuída aleatoriamente entre as letras A, B, C e D. Evite colocar a correta na mesma letra repetidas vezes.
    5. JUSTIFICATIVAS CONCISAS: Justifique tecnicamente o porquê da correta e o erro das demais de forma bem direta. IMPRESCINDÍVEL: LIMITE MÁXIMO de 10 linhas para os comentários.

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
1. Avalie o conteúdo técnico de acordo com o comando. Desconte se for raso.
2. Dê uma nota exata para cada aspecto (nunca maior que o valor_maximo).
3. ATENÇÃO: Avalie a macro e microestrutura devolvendo a análise em DOIS formatos simultâneos para manter a compatibilidade do sistema:
   - Em "erros_gramaticais": Um resumo corrido apontando falhas gerais (ou elogiando a escrita).
   - Em "analise_sintatica": Uma extração estruturada dos trechos exatos (substrings) onde o aluno cometeu erros. Forneça o trecho errado, a sugestão de correção e o motivo. Se não houver erros, retorne uma lista vazia.

RETORNE APENAS ESTE JSON EXATO:
{{
  "nota_final": 8.5,
  "avaliacoes_aspectos": [
    {{
      "aspecto": "Nome exato do Aspecto",
      "nota_atribuida": 3.5,
      "comentario": "Justificativa direta apontando onde o aluno errou ou acertou.",
      "padrao_esperado": "Espelho de Correção: O que o aluno DEVERIA ter escrito."
    }}
  ],
  "erros_gramaticais": "Resumo em texto corrido apontando falhas gerais de gramática e coesão.",
  "analise_sintatica": [
    {{
      "trecho_original": "Trecho exato do texto do aluno com erro",
      "correcao": "Como o trecho deveria ser escrito",
      "motivo": "Explicação do erro (ex: Concordância, Coesão)"
    }}
  ],
  "feedback_geral": "Parecer final da banca examinadora.",
  "dica_estudo": "Dica prática e encorajadora de qual assunto ou lei o candidato precisa revisar."
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

# =========================================================================
# CONTEXTO DA PROVA: como cada banca cobra
# =========================================================================
# O nome da banca sozinho diz pouco ao modelo. O que muda a qualidade da
# questao e a REGRA de elaboracao que cada uma segue.
BANCA_ESTILOS: Dict[str, str] = {
    "CEBRASPE": (
        "Itens de CERTO/ERRADO. O erro costuma estar em uma unica palavra trocada, "
        "em uma generalizacao indevida ('sempre', 'nunca') ou na inversao de um conceito. "
        "Enunciados curtos e densos, sem alternativas longas. Cobra literalidade da lei "
        "e jurisprudencia consolidada."
    ),
    "CESPE": (
        "Itens de CERTO/ERRADO no padrao CEBRASPE. O erro e sutil: uma palavra trocada, "
        "uma generalizacao indevida ou a inversao de um conceito. Cobra literalidade."
    ),
    "FGV": (
        "Multipla escolha com cinco alternativas. Enunciado longo, quase sempre um caso "
        "concreto que o candidato precisa interpretar antes de aplicar a regra. "
        "Distratores plausiveis, construidos sobre erros de raciocinio comuns. "
        "Valoriza atualidade e aplicacao pratica sobre decoreba."
    ),
    "FCC": (
        "Multipla escolha com cinco alternativas. Enunciado objetivo e tecnico, "
        "muito proximo da letra da lei. Alternativas curtas e parecidas entre si; "
        "a diferenca costuma estar em um detalhe de redacao."
    ),
    "VUNESP": (
        "Multipla escolha com cinco alternativas. Enunciado direto, cobranca de "
        "conhecimento aplicado e interpretacao de texto. Distratores moderados."
    ),
    "IBFC": (
        "Multipla escolha objetiva, cobranca conceitual direta, poucas pegadinhas."
    ),
    "INSTITUTO AOCP": (
        "Multipla escolha com enunciado contextualizado e cobranca tecnica de nivel medio."
    ),
}


def estilo_da_banca(banca: Optional[str]) -> str:
    """Devolve a regra de elaboracao da banca, ou uma instrucao neutra."""
    if not banca or not str(banca).strip():
        return ""
    chave = str(banca).strip().upper()
    for nome, estilo in BANCA_ESTILOS.items():
        if nome in chave or chave in nome:
            return estilo
    # Banca fora da lista: o nome ainda ajuda o modelo, so nao ha regra pronta.
    return f"Siga o padrao historico de elaboracao da banca {banca}."


def montar_contexto_prova(req: Any) -> str:
    """Bloco de texto injetado nos prompts do pesquisador, professor e banca."""
    partes = []
    if req.banca and req.banca.strip():
        partes.append(f"- Banca: {req.banca.strip()}")
        estilo = estilo_da_banca(req.banca)
        if estilo:
            partes.append(f"- Como esta banca cobra: {estilo}")
    if req.concurso and req.concurso.strip():
        partes.append(f"- Concurso: {req.concurso.strip()}")
    if req.cargo and req.cargo.strip():
        partes.append(f"- Cargo pretendido: {req.cargo.strip()}")
    if req.ano and req.ano.strip():
        partes.append(f"- Ano do certame: {req.ano.strip()}")

    if not partes:
        return ""
    return "CONTEXTO DA PROVA (obrigatorio respeitar):\n" + "\n".join(partes)


async def agent_instruction_designer(text: str, area: str, model: str, api_key: Optional[str] = None) -> Dict[str, Any]:
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
    return await get_json_response(prompt, model, temp=0.3, api_key=api_key)

async def agent_architect(text: str, model: str, api_key: Optional[str] = None) -> Dict[str, Any]:
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
    return await get_json_response(prompt, model, temp=0.05, api_key=api_key)


async def agent_researcher(
    modulo_obj: Dict[str, Any],
    area: str,
    full_text: str,
    context_instructions: Dict[str, Any],
    model: str,
    contexto_prova: str = "",
    api_key: Optional[str] = None,
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

{contexto_prova}

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
    return await get_json_response(prompt, model, temp=0.25, api_key=api_key)

async def agent_professor(
    modulo_obj: Dict[str, Any], 
    area: str, 
    research_data: Dict[str, Any], 
    context_instructions: Dict[str, Any],
    model: str,
    contexto_prova: str = "",
    nivel_aluno: str = "Normal",
    api_key: Optional[str] = None,
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

{contexto_prova}

NÍVEL DO ALUNO: {nivel_aluno}.
Calibre a profundidade, o vocabulário técnico e a quantidade de exceções ao nível informado:
"Iniciante" pede construção do conceito do zero; "Expert" pede direto as controvérsias,
exceções e o que separa quem acerta de quem erra por pouco.

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
    return await get_json_response(prompt, model, temp=0.4, api_key=api_key)


async def agent_examiner(modulo_obj: Dict[str, Any], area: str, professor_lesson: Dict[str, Any], model: str, question_format: str, question_level: str, contexto_prova: str = "", qtd_questoes: int = 10, api_key: Optional[str] = None) -> Dict[str, Any]:
    print(f"--- 📝 Banca: Criando {qtd_questoes} questões ({question_format} - Nível {question_level})... ---")
    lesson_context = json.dumps(professor_lesson, ensure_ascii=False)

    regras_formato = ""
    if question_format == "Múltipla Escolha":
        regras_formato = """
2. FORMATO ABCD: Crie EXATAMENTE 4 alternativas (A, B, C, D) para cada questão. NUNCA crie uma alternativa E.
3. DIFICULDADE E DISTRATORES: As alternativas incorretas (distratores) NÃO podem ser óbvias ou absurdas. Construa os distratores baseados em erros lógicos comuns, cálculos imprecisos ou confusões teóricas.
4. HOMOGENEIDADE: Todas as alternativas devem ter um tamanho e estilo de escrita semelhantes. A resposta correta não deve ser visivelmente mais longa ou mais detalhada que as outras.
5. RANDOMIZAÇÃO DO GABARITO: A resposta correta (gabarito) DEVE variar aleatoriamente entre A, B, C e D ao longo das questões. NUNCA deixe a resposta correta sempre na mesma letra.
6. JUSTIFICATIVAS CONCISAS: Explique tecnicamente o gabarito e o erro das demais opções de forma super objetiva. O texto da explicação/comentário deve ser rigorosamente LIMITADO a um máximo de 10 linhas.
"""
        json_alternativas = '"alternativas": ["A) ...", "B) ...", "C) ...", "D) ..."],'
    else:
        regras_formato = """
2. O formato deve ser CERTO ou ERRADO. O campo alternativas deve ter exatamente duas opções: ["A) Certo", "B) Errado"].
3. REGRA CRÍTICA CERTO/ERRADO: Formule a afirmação com vocabulário técnico. Se a resposta for "Errado", o erro deve ser extremamente sutil (ex: inverter um conceito, usar "sempre" onde há exceção).
4. Justifique o acerto ou o erro detalhadamente.
"""
        json_alternativas = '"alternativas": ["A) Certo", "B) Errado"],'

    prompt = f"""
Atue como a banca examinadora da prova de {area}.

{contexto_prova}

Escreva as questões no estilo EXATO da banca informada acima. Se nenhuma banca foi
informada, use o padrão de múltipla escolha mais comum em concursos públicos federais.

Nível de Dificuldade das Questões: {question_level} (Iniciante, Normal, Avançado ou Expert). 
Ajuste rigorosamente o aprofundamento técnico, o vocabulário, a presença de pegadinhas e a complexidade da cobrança para refletir EXATAMENTE este nível de dificuldade.

Com base SOMENTE no texto da aula abaixo, crie EXATAMENTE {qtd_questoes} QUESTÕES.

AULA:
{lesson_context}

REGRAS:
1. Crie {qtd_questoes} questões inéditas. Mescle questões diretas de fixação com Estudos de Caso práticos.
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
    return await get_json_response(prompt, model, temp=0.25, api_key=api_key)

async def agent_mindmap(modulo_obj: Dict[str, Any], area: str, lesson_content: Dict[str, Any], model: str, api_key: Optional[str] = None) -> Dict[str, Any]:
    print(f"--- 🧠 Mapa Mental: Gerando código Mermaid... ---")
    lesson_text = json.dumps(lesson_content, ensure_ascii=False)

    prompt = f"""
Gere um fluxograma Mermaid.js (graph TD) resumindo a aula abaixo.
{lesson_text}

REGRA CRÍTICA DE SINTAXE MERMAID:
- SEMPRE envolva o texto de cada nó em aspas duplas. É isso que permite usar
  parênteses, vírgulas, barras e sinais de igual sem quebrar o diagrama.
  CORRETO:  A["Constante k = N / (a + b + c)"] --> B["Aplicar a regra de tres"]
  ERRADO:   A[Constante k = N / (a + b + c)] --> B[Aplicar a regra de tres]
- O mesmo vale para o texto das setas: A -->|"caso (a) seja verdadeiro"| B
- NUNCA use aspas duplas dentro do texto do nó. Se precisar de aspas, use #quot;.
- Use identificadores curtos e sem acento para os nós: A, B, C1, D2.
- Máximo de 12 nós, para o mapa caber na tela.

RETORNE APENAS ESTE JSON EXATO:
{{
  "mapa_mental": {{
    "titulo": "Título do Mapa",
    "codigo_mermaid": "graph TD;\\n  A[\\"Conceito Central\\"] --> B[\\"Sub Topico\\"];"
  }}
}}
"""
    return await get_json_response(prompt, model, temp=0.2, api_key=api_key)


async def agent_strategist(modulos_data: List[Dict[str, Any]], area: str, model: str, api_key: Optional[str] = None) -> Dict[str, Any]:
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
    return await get_json_response(prompt, model, temp=0.35, api_key=api_key)

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

# Teto de modulos por geracao, valido para /analyze e /analyze/estrutura.
MAX_MODULOS_POR_GERACAO = 40


@app.post("/analyze")
async def analyze_syllabus_deep(request: SyllabusRequest, current_user: User = Depends(get_current_user)):
    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="Texto vazio")

    selected_model = request.model
    print(f"🔄 Iniciando pipeline com modelo: {selected_model}")

    try:
        # 1. Extraímos a estrutura usando o Arquiteto
        structure = ensure_dict(await agent_architect(request.text, selected_model, api_key=request.api_key))
        
        # 2. Normalizamos os módulos
        modules = normalize_modules(structure.get("modulos"), fallback_disciplina="Geral")

        # Teto de seguranca: sem isso, um edital grande estoura o tempo do proxy
        # e uma falha no fim joga fora tudo. Para editais assim, o frontend deve
        # usar /analyze/estrutura + /analyze/modulo.
        if len(modules) > MAX_MODULOS_POR_GERACAO:
            modules = modules[:MAX_MODULOS_POR_GERACAO]

        contexto_prova = montar_contexto_prova(request)
        
        # --- ATUALIZAÇÃO AQUI ---
        # 3. Pega todas as disciplinas únicas encontradas (antes do ":") e junta-as.
        disciplinas_encontradas = list(dict.fromkeys([mod.get("disciplina") for mod in modules if mod.get("disciplina")]))
        global_area = " / ".join(disciplinas_encontradas) if disciplinas_encontradas else "Edital Específico"
        # ------------------------
        
        instructions = ensure_dict(await agent_instruction_designer(request.text, global_area, selected_model, api_key=request.api_key))
        
        final_aulas: List[Dict[str, Any]] = []

        for idx, mod in enumerate(modules):
            titulo = mod.get("titulo", f"Módulo {idx+1}")
            
            # 3. ATENÇÃO: Aqui extraímos a matéria ESPECÍFICA deste tópico (ex: "LÍNGUA PORTUGUESA")
            area_do_modulo = mod.get("disciplina", "Assunto Geral") 
            
            print(f"\n➡️ Processando Módulo {idx + 1}: [{area_do_modulo}] {titulo}")

            # 4. Passamos 'area_do_modulo' para TODAS as IAs, para que elas tenham o contexto da disciplina
            research = ensure_dict(await agent_researcher(
                mod, area_do_modulo, request.text, instructions, selected_model,
                contexto_prova=contexto_prova, api_key=request.api_key,
            ))
            await asyncio.sleep(1)

            lesson = ensure_dict(await agent_professor(
                mod, area_do_modulo, research, instructions, selected_model,
                contexto_prova=contexto_prova, nivel_aluno=request.question_level, api_key=request.api_key,
            ))
            lesson = sanitize_lesson(lesson)
            
            # 5. Embutimos a disciplina na aula gerada
            lesson["disciplina"] = area_do_modulo 
            await asyncio.sleep(1)

            # Passando os novos parâmetros recebidos na rota para a IA da banca
            exam = ensure_dict(await agent_examiner(
                mod, area_do_modulo, lesson, selected_model,
                request.question_format, request.question_level,
                contexto_prova=contexto_prova, qtd_questoes=request.qtd_questoes, api_key=request.api_key,
            ))
            await asyncio.sleep(1)

            mindmap_data = ensure_dict(await agent_mindmap(mod, area_do_modulo, lesson, selected_model, api_key=request.api_key))
            await asyncio.sleep(1)

            essay_data = ensure_dict(await agent_essay_generator(mod, area_do_modulo, lesson, selected_model, api_key=request.api_key))
            await asyncio.sleep(1)
            
            # Sanitização final
            # Sanitização final e Randomização Real por Código
            raw_quiz = exam.get("quiz") if isinstance(exam, dict) else []
            quiz_list = sanitize_quiz(raw_quiz)
            # Aplica o rand em cada questão gerada pela IA
            quiz_list = [shuffle_question_options(q) for q in quiz_list]
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
        strategy = ensure_dict(await agent_strategist(final_aulas, global_area, selected_model, api_key=request.api_key))

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



# =========================================================================
# GERACAO POR ETAPAS
# =========================================================================
# A rota /analyze faz o edital inteiro numa requisicao so. Num edital grande
# isso passa de 100 chamadas de IA em serie: o proxy corta antes do fim e uma
# falha no ultimo modulo joga fora todo o trabalho.
# As tres rotas abaixo quebram o mesmo pipeline em pedacos que o frontend
# orquestra, com progresso real e a chance de repetir so o modulo que falhou.

@app.post("/analyze/estrutura")
async def analyze_estrutura(request: EstruturaRequest, current_user: User = Depends(get_current_user)):
    """Etapa 1: le o edital e devolve os modulos, sem gerar conteudo ainda."""
    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="Texto vazio")

    try:
        structure = ensure_dict(await agent_architect(request.text, request.model, api_key=request.api_key))
        modules = normalize_modules(structure.get("modulos"), fallback_disciplina="Geral")

        if not modules:
            raise HTTPException(status_code=422, detail="Nao foi possivel identificar modulos neste texto.")

        truncado = False
        if len(modules) > MAX_MODULOS_POR_GERACAO:
            modules = modules[:MAX_MODULOS_POR_GERACAO]
            truncado = True

        disciplinas = list(dict.fromkeys([m.get("disciplina") for m in modules if m.get("disciplina")]))
        global_area = " / ".join(disciplinas) if disciplinas else "Edital Específico"

        instructions = ensure_dict(
            await agent_instruction_designer(request.text, global_area, request.model, api_key=request.api_key)
        )

        return {
            "area_identificada": global_area,
            "resumo_cargo": structure.get("resumo_objetivo", "Resumo gerado com múltiplas disciplinas."),
            "modulos": modules,
            "instrucoes": instructions,
            "truncado": truncado,
            "limite_modulos": MAX_MODULOS_POR_GERACAO,
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"ERRO NA ETAPA DE ESTRUTURA: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analyze/modulo")
async def analyze_modulo(request: ModuloRequest, current_user: User = Depends(get_current_user)):
    """Etapa 2: gera um modulo completo (pesquisa, aula, questoes, mapa, discursiva)."""
    mod = request.modulo or {}
    area_do_modulo = mod.get("disciplina") or request.area or "Assunto Geral"
    contexto = montar_contexto_prova(request)

    try:
        research = ensure_dict(await agent_researcher(
            mod, area_do_modulo, request.texto_edital, request.instrucoes, request.model,
            contexto_prova=contexto, api_key=request.api_key,
        ))
        await asyncio.sleep(1)

        lesson = sanitize_lesson(ensure_dict(await agent_professor(
            mod, area_do_modulo, research, request.instrucoes, request.model,
            contexto_prova=contexto, nivel_aluno=request.question_level, api_key=request.api_key,
        )))
        lesson["disciplina"] = area_do_modulo
        await asyncio.sleep(1)

        exam = ensure_dict(await agent_examiner(
            mod, area_do_modulo, lesson, request.model,
            request.question_format, request.question_level,
            contexto_prova=contexto, qtd_questoes=request.qtd_questoes, api_key=request.api_key,
        ))
        await asyncio.sleep(1)

        mindmap_data = ensure_dict(await agent_mindmap(
            mod, area_do_modulo, lesson, request.model, api_key=request.api_key,
        ))
        await asyncio.sleep(1)

        essay_data = ensure_dict(await agent_essay_generator(
            mod, area_do_modulo, lesson, request.model, api_key=request.api_key,
        ))

        quiz_list = [shuffle_question_options(q) for q in sanitize_quiz(exam.get("quiz"))]

        return {
            **lesson,
            "quiz": quiz_list,
            "mapa_mental": mindmap_data.get("mapa_mental") if isinstance(mindmap_data, dict) else {},
            "discursiva": essay_data.get("discursiva") if isinstance(essay_data, dict) else {},
            "meta_modulo": mod,
        }
    except HTTPException:
        raise
    except Exception as e:
        titulo = mod.get("titulo", "modulo")
        print(f"ERRO AO GERAR O MODULO '{titulo}': {e}")
        raise HTTPException(status_code=500, detail=f"Falha ao gerar o módulo \"{titulo}\": {e}")


@app.post("/analyze/plano")
async def analyze_plano(request: PlanoEstudoRequest, current_user: User = Depends(get_current_user)):
    """Etapa 3: com as aulas prontas, monta o plano de estudo."""
    try:
        strategy = ensure_dict(await agent_strategist(
            request.aulas, request.area, request.model, api_key=request.api_key,
        ))
        return {"plano_estudo": strategy.get("plano_estudo", "") if isinstance(strategy, dict) else ""}
    except Exception as e:
        # O plano e um extra: se falhar, a aula gerada continua valendo.
        print(f"ERRO NO PLANO DE ESTUDO: {e}")
        return {"plano_estudo": ""}


@app.get("/admin/ai-config")
async def get_ai_config(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin": raise HTTPException(status_code=403, detail="Não autorizado")
    config = (await db.execute(select(GlobalAIConfig).filter(GlobalAIConfig.id == 1))).scalars().first()
    if not config: return {}
    return config

@app.put("/admin/ai-config")
async def update_ai_config(payload: AIConfigSchema, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin": raise HTTPException(status_code=403, detail="Não autorizado")
    config = (await db.execute(select(GlobalAIConfig).filter(GlobalAIConfig.id == 1))).scalars().first()
    if not config:
        config = GlobalAIConfig(id=1)
        db.add(config)
    
    config.model = payload.model
    if payload.api_key: config.api_key = payload.api_key
    config.global_prompt = payload.global_prompt
    config.temperature = payload.temperature
    config.max_tokens = payload.max_tokens
    config.top_p = payload.top_p
    config.penalties = payload.penalties
    config.timeout = payload.timeout
    
    await db.commit()
    return {"message": "Configurações da IA atualizadas!"}

@app.get("/admin/ai-stats", response_model=AIStatsResponse)
async def get_ai_stats(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin": raise HTTPException(status_code=403, detail="Não autorizado")
    
    total_plus = (await db.execute(select(func.count(User.id)).filter(User.plan_type == 'Plus'))).scalar()
    total_pro = (await db.execute(select(func.count(User.id)).filter(User.plan_type == 'Pro'))).scalar()
    
    hoje = datetime.utcnow().date()
    inicio_mes = hoje.replace(day=1)
    
    logs = (await db.execute(select(AITokenLog))).scalars().all()
    tokens_hoje = sum(l.tokens_total for l in logs if l.created_at.date() == hoje)
    tokens_mes = sum(l.tokens_total for l in logs if l.created_at.date() >= inicio_mes)
    tokens_totais = sum(l.tokens_total for l in logs)
    
    # Custo estimado baseado em valor médio da OpenRouter (Aproximadamente $0.00015 por 1k tokens)
    custo_estimado = (tokens_totais / 1000) * 0.00015 
    
    return {
        "total_plus": total_plus or 0,
        "total_pro": total_pro or 0,
        "tokens_today": tokens_hoje,
        "tokens_month": tokens_mes,
        "tokens_total": tokens_totais,
        "estimated_cost": custo_estimado
    }

@app.post("/admin/users/{user_id}/reset-tokens")
async def reset_user_tokens(user_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin": raise HTTPException(status_code=403, detail="Não autorizado")
    target = (await db.execute(select(User).filter(User.id == user_id))).scalars().first()
    if not target: raise HTTPException(status_code=404, detail="Usuário não encontrado")
    target.tokens_used = 0
    target.token_reset_date = datetime.utcnow() + timedelta(days=30)
    await db.commit()
    return {"message": "Tokens zerados com sucesso", "tokens_used": 0}

@app.post("/admin/users/{user_id}/toggle-ai-block")
async def toggle_ai_block(user_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin": raise HTTPException(status_code=403, detail="Não autorizado")
    target = (await db.execute(select(User).filter(User.id == user_id))).scalars().first()
    if not target: raise HTTPException(status_code=404, detail="Usuário não encontrado")
    target.ai_blocked = not target.ai_blocked
    await db.commit()
    return {"message": "Status de bloqueio atualizado", "ai_blocked": target.ai_blocked}

# ADICIONADO: Nova rota para lidar com a criação/validação de cupons
@app.post("/admin/coupons")
async def create_coupon(
    coupon: CouponCreate, 
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    # 1. Validação de segurança para garantir que apenas admins gerenciem
    if current_user.role != "admin": 
        raise HTTPException(status_code=403, detail="Não autorizado")
    
    # 2. Verifica se o código do cupom já existe no banco
    result = await db.execute(select(Coupon).filter(Coupon.code == coupon.code))
    existing_coupon = result.scalars().first()
    if existing_coupon:
        raise HTTPException(status_code=400, detail="Este código de cupom já existe.")
        
    # 3. Salva no banco de dados
    db_coupon = Coupon(
        code=coupon.code,
        discount_percentage=coupon.discount_percentage
    )
    db.add(db_coupon)
    await db.commit()
    await db.refresh(db_coupon)
    
    return {
        "ok": True, 
        "message": f"Cupom {coupon.code} criado com sucesso!", 
        "discount": coupon.discount_percentage
    }
    
@app.get("/admin/coupons")
async def list_coupons(
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """
    Lista todos os cupons cadastrados. Exclusivo para administradores.
    """
    # 1. Validação de segurança
    if current_user.role != "admin": 
        raise HTTPException(status_code=403, detail="Não autorizado")
    
    # 2. Busca os cupons no banco de dados ordenados do mais recente ao mais antigo
    result = await db.execute(select(Coupon).order_by(desc(Coupon.id)))
    coupons = result.scalars().all()
    
    return coupons

@app.delete("/admin/coupons/{coupon_id}")
async def delete_coupon(
    coupon_id: int, 
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin": 
        raise HTTPException(status_code=403, detail="Não autorizado")
    
    result = await db.execute(select(Coupon).filter(Coupon.id == coupon_id))
    coupon_to_delete = result.scalars().first()
    
    if not coupon_to_delete:
        raise HTTPException(status_code=404, detail="Cupom não encontrado")
        
    await db.delete(coupon_to_delete)
    await db.commit()
    
    return {"ok": True, "message": "Cupom deletado com sucesso!"}

@app.get("/coupons/validate/{code}")
async def validate_coupon(
    code: str, 
    db: AsyncSession = Depends(get_db)
):
    """
    Valida um código de cupom enviado pelo frontend.
    Esta rota não exige autenticação de administrador, pois é usada no checkout/login.
    """
    # Busca o cupom no banco de dados (o frontend já envia em maiúsculas)
    result = await db.execute(select(Coupon).filter(Coupon.code == code))
    coupon = result.scalars().first()
    
    # Se não encontrar o cupom, retorna erro 404
    if not coupon:
        raise HTTPException(status_code=404, detail="Cupom inválido ou inexistente.")
        
    # Se encontrar, retorna o valor do desconto no formato que o frontend espera
    return {
        "discount_value": coupon.discount_percentage,
        "discount_type": "percent" # Como seu banco salva 'discount_percentage', definimos como porcentagem
    }
    
@app.get("/users", response_model=List[UserResponse])
async def list_users(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin": raise HTTPException(status_code=403, detail="Não autorizado")
    result = await db.execute(select(User).order_by(User.id))
    return result.scalars().all()

@app.post("/users", response_model=UserResponse)
async def create_user(payload: UserCreateAdmin, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin": raise HTTPException(status_code=403, detail="Não autorizado")
    result = await db.execute(select(User).filter(User.email == payload.email))
    if result.scalars().first(): 
        raise HTTPException(status_code=400, detail="Email já cadastrado")
    
    new_user = User(
        email=payload.email,
        hashed_password=get_password_hash(payload.password),
        role=payload.role,
        can_manage_lessons=payload.can_manage_lessons,
        allowed_concursos=payload.allowed_concursos
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user

@app.put("/users/{user_id}", response_model=UserResponse)
async def update_user_admin(user_id: int, payload: UserUpdateAdmin, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin": raise HTTPException(status_code=403, detail="Não autorizado")
    result = await db.execute(select(User).filter(User.id == user_id))
    user = result.scalars().first()
    if not user: raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    if payload.email is not None: user.email = payload.email
    if payload.role is not None: user.role = payload.role
    if payload.allowed_concursos is not None: user.allowed_concursos = payload.allowed_concursos
    if payload.can_manage_lessons is not None: user.can_manage_lessons = payload.can_manage_lessons
    if payload.is_active is not None: user.is_active = payload.is_active # NOVO
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
async def read_users_me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db) # <-- Adicionamos a sessão do banco aqui
):
    """Retorna os dados do usuário atualmente logado para o Frontend"""
    
    # --- AUTO-CORREÇÃO PARA USUÁRIOS ANTIGOS ---
    # Se o usuário não tiver um código de indicação, cria um agora mesmo
    if not current_user.referral_code:
        current_user.referral_code = str(uuid.uuid4().hex)[:8].upper()
        await db.commit()
        await db.refresh(current_user)
    # ------------------------------------------
        
    return current_user

@app.get("/users/me/settings", response_model=UserSettingsResponse)
async def get_user_settings(current_user: User = Depends(get_current_user)):
    return {
        "api_key": current_user.api_key,
        "preferred_model": current_user.preferred_model
    }

@app.put("/users/me/settings")
async def update_user_settings(
    settings: UserSettingsUpdate, 
    current_user: User = Depends(get_current_user), 
    db: AsyncSession = Depends(get_db)
):
    """
    Recebe a chave de API (Manual do Google ou OAuth do OpenRouter) 
    e salva diretamente no perfil do usuário logado.
    """
    if settings.api_key is not None:
        current_user.api_key = settings.api_key
        
    if settings.preferred_model is not None:
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

# =========================================================================
# NOVA ROTA: HISTÓRICO DE COMISSÕES DO UTILIZADOR LOGADO
# =========================================================================
@app.get("/users/me/commission-history", response_model=List[CommissionHistoryResponse])
async def get_my_commission_history(
    current_user: User = Depends(get_current_user), 
    db: AsyncSession = Depends(get_db)
):
    """Devolve o histórico de movimentações (ganhos e pagamentos) do utilizador atual."""
    result = await db.execute(
        select(CommissionHistory)
        .filter(CommissionHistory.user_id == current_user.id)
        .order_by(desc(CommissionHistory.created_at))
    )
    return result.scalars().all()
    
@app.post("/chat")
async def chat_tutor(req: ChatMessageRequest, current_user: User = Depends(get_current_user)):
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
async def generate_simulado_topic_endpoint(req: SimuladoTopicRequest, current_user: User = Depends(get_current_user)):
    if not req.api_key and not os.getenv("OPENROUTER_API_KEY"): 
        raise HTTPException(status_code=403, detail="Nenhuma chave de API configurada no sistema.")
    
    qtd = req.qtd_questoes or 5
    nivel = req.nivel or "Normal"
    formato = req.formato or "Múltipla Escolha"

    # Define dinamicamente as regras baseadas na escolha
    regras_formato = ""
    if formato == "Múltipla Escolha":
        regras_formato = """
        2. FORMATO ABCD: Crie EXATAMENTE 4 alternativas (A, B, C, D) para cada questão. NUNCA crie uma alternativa E.
        3. DIFICULDADE E DISTRATORES: As alternativas incorretas (distratores) NÃO podem ser óbvias ou absurdas. Construa os distratores baseados em erros lógicos comuns ou confusões teóricas.
        4. HOMOGENEIDADE: Todas as alternativas devem ter um tamanho e estilo de escrita semelhantes. A resposta correta não deve ser visivelmente mais longa que as outras.
        5. RANDOMIZAÇÃO DO GABARITO: Varie aleatoriamente a letra da resposta correta (A, B, C ou D) entre as questões do simulado. Não repita o mesmo gabarito seguidamente.
        6. JUSTIFICATIVAS CONCISAS: Explique tecnicamente por que cada alternativa está certa ou errada de forma direta. O texto dos comentários OBRIGATORIAMENTE deve ser conciso e LIMITADO a no máximo 10 linhas no total por questão.
        """
        json_alternativas = '"alternativas": ["A) ...", "B) ...", "C) ...", "D) ..."],'
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
async def correct_essay(req: EssayCorrectionRequest, current_user: User = Depends(get_current_user)):
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
    1. Avalie o conteúdo técnico de acordo com o comando. SEJA REALISTA com o formato exigido pela questão. Não exija detalhamentos exaustivos de 30 linhas se a prova exigia apenas 10 ou 15.
    2. Dê uma nota exata para cada aspecto (nunca maior que o valor_maximo). 
    3. ATENÇÃO: Avalie a macro e microestrutura devolvendo a análise em DOIS formatos simultâneos para manter a compatibilidade do sistema:
       - Em "erros_gramaticais": Um resumo em texto corrido das falhas gerais.
       - Em "analise_sintatica": Extraia os trechos exatos (substrings) onde o aluno cometeu erros de gramática, ortografia ou coesão. Se o texto estiver impecável, retorne uma lista vazia.

    RETORNE APENAS ESTE JSON EXATO:
    {{
      "nota_final": 8.5,
      "avaliacoes_aspectos": [
        {{
          "aspecto": "Nome exato do Aspecto",
          "nota_atribuida": 3.5,
          "comentario": "Justificativa direta apontando onde o aluno errou ou acertou.",
          "padrao_esperado": "Espelho de Correção: O que o aluno DEVERIA ter escrito."
        }}
      ],
      "erros_gramaticais": "Resumo em texto corrido apontando falhas gerais de gramática e coesão.",
      "analise_sintatica": [
        {{
          "trecho_original": "Trecho exato do texto do aluno com erro",
          "correcao": "Como o trecho deveria ser escrito",
          "motivo": "Explicação técnica do erro (ex: Regência, Crase, Coesão)"
        }}
      ],
      "feedback_geral": "Parecer final da banca examinadora.",
      "dica_estudo": "Dica prática e encorajadora de qual assunto revisar com base nos erros."
    }}
    """
    return StreamingResponse(stream_json_response(prompt, req.model, temp=0.2, api_key=req.api_key), media_type="text/plain")


@app.post("/generate-essay")
async def generate_essay_endpoint(req: GenerateEssayRequest, current_user: User = Depends(get_current_user)):
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
async def generate_treino_discursiva_endpoint(req: TreinoDiscursivaRequest, current_user: User = Depends(get_current_user)):
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

    # REGRAS DINÂMICAS DE FORMATO E TAMANHO (CORRIGIDO)
    pontuacao_regra = 'A soma do campo "valor_maximo" dos aspectos DEVE ser exatos 19.0 pontos.'
    
    if tipo == "Personalizado":
        limite_linhas = "o limite estabelecido no trecho do edital fornecido"
        diretrizes = f"Siga RIGOROSAMENTE as regras, pontuações, estrutura, número de linhas e formato descritos neste trecho do edital fornecido pelo usuário:\n\n{req.edital_regras_prova}\n\nAdapte a situação hipotética e a distribuição de pontos exatamente como o edital exige."
        comando_base = "Redija seu texto em atendimento ao que se pede no edital, respeitando os limites de linhas estabelecidos."
        pontuacao_regra = 'A soma do campo "valor_maximo" dos aspectos DEVE respeitar rigorosamente a pontuação máxima para o conteúdo descrita no trecho do edital.'
    elif "Paráfrase" in tipo:
        limite_linhas = "10 linhas"
        diretrizes = "O texto motivador DEVE ser APENAS um parágrafo técnico, conceitual ou doutrinário (3 a 5 linhas). NÃO faça perguntas no cenário."
        comando_base = f"Reescreva o texto motivador acima com as suas próprias palavras, mantendo a coesão, a correção gramatical e preservando rigorosamente o sentido original. Redija seu texto em até {limite_linhas}."
    elif "Curta" in tipo:
        limite_linhas = "10 linhas"
        diretrizes = "Crie uma pergunta direta e objetiva, sem historinhas longas. Vá direto ao ponto exigindo a definição, diferenciação ou citação de um conceito técnico."
        comando_base = f"Responda à questão de forma direta e objetiva em até {limite_linhas}."
    elif "Expansão" in tipo:
        limite_linhas = "15 linhas"
        diretrizes = "Forneça um conceito base sucinto no texto motivador e peça para o candidato expandir a ideia com exemplos práticos ou fundamentos legais/técnicos."
        comando_base = f"Desenvolva e expanda o conceito apresentado, abordando os aspectos solicitados. Redija seu texto em até {limite_linhas}."
    elif "Reescrita" in tipo:
        limite_linhas = "15 linhas"
        diretrizes = "Forneça um parágrafo com linguagem informal, estrutura confusa ou erros intencionais de coesão, e peça para o candidato reescrever adequando à norma culta."
        comando_base = f"Reescreva o trecho fornecido corrigindo problemas de estrutura e adequando-o à norma padrão da língua portuguesa em até {limite_linhas}."
    elif tipo == "Redação (Atualidades/Temas Gerais)":
        limite_linhas = "30 linhas"
        diretrizes = "Crie um tema de redação dissertativo-argumentativa sobre impactos sociais ou tecnológicos da área."
        comando_base = f"Considerando a situação hipotética, redija um texto dissertativo abordando os seguintes aspectos. Redija seu texto em até {limite_linhas}."
    elif tipo == "Peça Prático-Profissional":
        limite_linhas = "120 linhas"
        diretrizes = "Crie um cenário fático exigindo a elaboração de uma Peça Prático-Profissional (relatório, parecer, auto de prisão, etc)."
        comando_base = f"Considerando a situação hipotética, redija um texto dissertativo abordando os seguintes aspectos. Redija seu texto em até {limite_linhas}."
    else:
        limite_linhas = "30 linhas"
        comando_base = f"Considerando a situação hipotética, redija um texto dissertativo abordando os seguintes aspectos. Redija seu texto em até {limite_linhas}."
        if nivel == "Iniciante":
            diretrizes = "Crie um estudo de caso BÁSICO E SIMPLES, avaliando conhecimentos introdutórios."
        else:
            diretrizes = "Crie um estudo de caso técnico ou situação hipotética exigindo identificação de problemas e fundamentação."

    prompt = f"""
    Atue como EXAMINADOR da banca {banca}.
    Cargo Alvo do Concurso: {cargo}
    NÍVEL DE DIFICULDADE EXIGIDO: {nivel.upper()}

    A área geral de conhecimento do candidato é: {req.area}.
    
    CONTEÚDO PROGRAMÁTICO (EDITAL): 
    {json.dumps(req.topicos, ensure_ascii=False)}

    Sua missão ÚNICA é criar UMA prova do tipo '{tipo}' simulando o padrão da banca {banca} para o cargo de {cargo}, RIGOROSAMENTE ADAPTADA AO NÍVEL DE DIFICULDADE ({nivel}).

    DIRETRIZES OBRIGATÓRIAS:
    1. SELEÇÃO DE TEMA: Como o conteúdo programático acima pode ser extenso, ESCOLHA/SORTEIE apenas 1 ou 2 assuntos conexos desse bloco para serem o foco central da questão. Não tente cobrar tudo de uma vez.
    2. COMPLEXIDADE GERAL: {regras_dificuldade}
    3. ESTILO: {diretrizes} 
    4. TEXTO MOTIVADOR: Crie o cenário fático, situação hipotética ou texto base necessário. 
    5. COMANDO: É OBRIGATÓRIO utilizar EXATAMENTE o comando estipulado no JSON final.
    6. ASPECTOS: Crie os itens numerados adequados à avaliação. ATENÇÃO CRÍTICA: Os aspectos devem ser perfeitamente passíveis de resposta completa DENTRO do limite de {limite_linhas}.
    7. PONTUAÇÃO: {pontuacao_regra}

    RETORNE APENAS ESTE JSON EXATO:
    {{
      "discursiva": {{
        "texto_motivador": "Descrição do cenário, texto base ou trecho para reescrita...",
        "comando": "{comando_base}",
        "aspectos": [
          {{ "aspecto": "1. Primeiro critério de avaliação...", "valor_maximo": 9.0 }},
          {{ "aspecto": "2. Segundo critério de avaliação...", "valor_maximo": 10.0 }}
        ]
      }}
    }}
    """
    return StreamingResponse(stream_json_response(prompt, req.model, temp=0.6, api_key=req.api_key), media_type="text/plain")

@app.post("/extract-topics")
async def extract_topics_endpoint(req: ExtractTopicsRequest, current_user: User = Depends(get_current_user)):
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
async def generate_global_essay_endpoint(req: GlobalEssayRequest, current_user: User = Depends(get_current_user)):
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
                current_user.preferred_model = "nvidia/nemotron-3-nano-30b-a3b:free"
                await db.commit()
                
                return {"ok": True, "message": "IA ativada com sucesso!"}
                
        raise HTTPException(status_code=400, detail="Código inválido ou expirado do OpenRouter.")
    except Exception as e:
        print(f"Erro no OAuth OpenRouter: {e}")
        raise HTTPException(status_code=500, detail="Erro ao comunicar com o OpenRouter.")
    
@app.post("/generate-simulado-cespe")
async def generate_simulado_cespe_endpoint(req: SimuladoCespeRequest, current_user: User = Depends(get_current_user)):
    if not req.api_key and not os.getenv("OPENROUTER_API_KEY"): 
        raise HTTPException(
            status_code=403, 
            detail="Por favor, configure sua chave de API nas configurações."
        )
    
    focus_instructions = ""
    if req.subject == "Raciocínio Lógico":
        if req.focus == 'negacao': focus_instructions = "Foque EXCLUSIVAMENTE em leis de De Morgan e negação de proposições lógicas (e, ou, se...então)."
        elif req.focus == 'condicional': focus_instructions = "Foque em proposições condicionais (se... então), tabela-verdade, condição suficiente e condição necessária."
        elif req.focus == 'equivalencia': focus_instructions = "Foque em equivalências lógicas (contrapositiva, equivalência da disjunção/condicional)."
        elif req.focus == 'diagramas': focus_instructions = "Foque em diagramas lógicos (Todo, Algum, Nenhum) e silogismos categóricos."
        elif req.focus == 'argumentacao': focus_instructions = "Foque na validade de argumentos lógicos, premissas e conclusões, incluindo analogias e inferências."
        elif req.focus == 'primeira_ordem': focus_instructions = "Foque EXCLUSIVAMENTE em lógica de primeira ordem: quantificadores universal e existencial, predicados, variáveis livres e ligadas, e negação de sentenças quantificadas."
        elif req.focus == 'geometria_matricial': focus_instructions = "Foque em raciocínio lógico envolvendo problemas geométricos (áreas, perímetros, figuras) e problemas matriciais (organização de dados em matrizes/tabelas lógicas)."
        elif req.focus == 'probabilidade': focus_instructions = "Foque em probabilidade de eventos, união, intersecção e probabilidade condicional."
        elif req.focus == 'combinatoria': focus_instructions = "Foque em análise combinatória (arranjos, permutações e combinações simples)."
        elif req.focus == 'sequencias': focus_instructions = "Foque em sequências lógicas numéricas, de palavras ou figuras."
        else: focus_instructions = "Gere uma prova mista e equilibrada cobrindo: estruturas lógicas, lógica de argumentação (analogias, inferências, deduções e conclusões), proposições simples e compostas, tabelas-verdade, equivalências lógicas, diagramas lógicos, lógica de primeira ordem (quantificadores) e problemas aritméticos, geométricos e matriciais. Distribua os itens de forma equilibrada entre todos esses tópicos, sem se concentrar em apenas um ou dois."
        
    # NOVAS DIRETRIZES: Isolamento para Disciplinas de Direito no Endpoint
    elif "Direito" in req.subject or req.subject in ["Constitucional", "Penal", "Administrativo", "Processual", "Humanos"]:
        focus_instructions = f"""
        Foque estritamente na disciplina de {req.subject}. O objetivo é avaliar conhecimentos jurídicos sobre o instituto: {req.focus}.
        As questões devem versar sobre doutrina majoritária, texto literal da lei aplicável e a jurisprudência sumulada ou pacificada dos Tribunais Superiores (STF e STJ). 
        PROIBIDO incluir abordagens gramaticais, sintáticas ou de lógica computacional/matemática.
        """

   # NOVAS DIRETRIZES: Isolamento para Língua Inglesa
    elif req.subject == "Língua Inglesa":
        if req.focus == 'compreensao': focus_instructions = "Foque EXCLUSIVAMENTE na compreensão textual, skimming, scanning e inferência de informações."
        elif req.focus == 'vocabulario': focus_instructions = "Foque em itens gramaticais como sinônimos, antônimos, falsos cognatos e tempos verbais aplicados ao contexto."
        elif req.focus == 'coesao': focus_instructions = "Foque em coesão, coerência, referência pronominal e uso de conectivos (linking words)."
        else: focus_instructions = "Distribua as questões entre compreensão textual, vocabulário aplicado e coesão pronominal na língua inglesa."
        
    # NOVAS DIRETRIZES: Isolamento para Programação Java
    elif req.subject == "Java":
        focus_instructions = f"""
        Foque estritamente em desenvolvimento Java para concursos de TI (Analista/Auditor). O objetivo é avaliar conhecimentos técnicos e práticos sobre: {req.focus}.
        Apresente trechos de código (snippets) válidos, avalie a saída do console, analise a estrutura da linguagem ou trate de conceitos de arquitetura e frameworks ligados ao ecossistema Java (POO, Streams, JPA, GoF). 
        PROIBIDO exigir linguagens genéricas ou conhecimentos que não sejam do ecossistema Java. Use markdown para formatar nomes de classes e métodos.
        """

    else: 
        if req.focus.startswith('Foco na vertente:') or req.focus.startswith('DIRETRIZ OBRIGATÓRIA:'):
            focus_instructions = req.focus # Permite que o frontend injete tipologia e tamanho textuais
        elif req.focus == 'interpretacao': focus_instructions = "Foque EXCLUSIVAMENTE em interpretação de texto, inferência e compreensão, incluindo reconhecimento de tipos e gêneros textuais."
        elif req.focus == 'generos': focus_instructions = "Foque EXCLUSIVAMENTE em reconhecimento de tipos e gêneros textuais (narrativo, descritivo, dissertativo-argumentativo, injuntivo, expositivo, e gêneros como notícia, editorial, carta, e-mail, etc.)."
        elif req.focus == 'ortografia': focus_instructions = "Foque EXCLUSIVAMENTE em ortografia oficial: acentuação gráfica, uso de letras, hífen e demais regras ortográficas vigentes."
        elif req.focus == 'gramatica': focus_instructions = "Foque em gramática aplicada: concordância verbal e nominal, regência, crase, pontuação, classes de palavras e pronomes."
        elif req.focus == 'verbos': focus_instructions = "Foque EXCLUSIVAMENTE no emprego de tempos e modos verbais no contexto do texto base."
        elif req.focus == 'pontuacao': focus_instructions = "Foque EXCLUSIVAMENTE no emprego dos sinais de pontuação e na colocação dos pronomes átonos (próclise, mesóclise e ênclise)."
        elif req.focus == 'reescrita': focus_instructions = "Foque EXCLUSIVAMENTE em propostas de reescrita de trechos do texto, incluindo significação e substituição de palavras."
        elif req.focus == 'semantica': focus_instructions = "Foque em coesão, coerência, substituição de conectivos e semântica."
        elif req.focus == 'hardcore': focus_instructions = "NÍVEL MÁXIMO DE DIFICULDADE CESPE. Pegadinhas sutis e extrapolação."
        elif req.focus.startswith('Sintaxe:'): 
            tema_exato = req.focus.replace('Sintaxe:', '').strip()
            focus_instructions = f"Foque ESPECIFICAMENTE E EXCLUSIVAMENTE nas regras sintáticas e pegadinhas gramaticais sobre: {tema_exato}."         
        else: focus_instructions = "Distribua as questões de forma equilibrada entre: interpretação textual, tipos e gêneros textuais, ortografia, coesão, tempos e modos verbais, morfossintaxe (concordância, regência, crase, pontuação, colocação pronominal) e reescrita."

    # Define o contexto do texto-base dinamicamente de acordo com a disciplina
    if req.generate_text:
        if req.subject == "Raciocínio Lógico":
            text_instruction = "Crie uma situação hipotética, conjunto de premissas ou problema lógico para servir de base."
        elif "Direito" in req.subject or req.subject in ["Constitucional", "Penal", "Administrativo", "Processual", "Humanos"]:
            text_instruction = "Crie um caso prático ou situação hipotética jurídica curta para servir de base."
        elif req.subject == "Língua Inglesa":
            text_instruction = "Gere um autêntico texto base EM INGLÊS (ex: trecho de reportagem, artigo ou texto acadêmico curto), rico em vocabulário, para servir de alvo das questões."
        elif req.subject == "Java":
            text_instruction = "Gere um autêntico trecho de código Java (snippet) formatado em Markdown (```java) que contenha uma classe, interface ou lógica funcional, para servir de alvo de análise pelas questões."
        else: # Língua Portuguesa e Sintaxe
            text_instruction = "Gere um texto base primoroso, com tamanho e tipologia adequados às instruções, rico em vocabulário e coesão, para servir de alvo das questões."
    else:
        text_instruction = "Sem texto base ou situação hipotética geral, foque apenas nas assertivas diretas de julgamento."
        
        
    # --- LÓGICA DO FORMATO (MÚLTIPLA ESCOLHA OU CERTO/ERRADO) ---
    if req.formato == "Múltipla Escolha":
        regra_formato = "FORMATO ABCD: Crie EXATAMENTE 4 alternativas (A, B, C, D). NUNCA crie E. DISTRATORES: Não podem ser absurdos. HOMOGENEIDADE: Mesmo tamanho. RANDOMIZAÇÃO: Gabarito aleatório. CONCISÃO: A explicação/comentário deve ser super objetiva, rigorosamente LIMITADA a no máximo 10 linhas."
        json_questao = """{ 
            "id": 1, 
            "enunciado": "A pergunta da questão ou caso jurídico...", 
            "alternativas": ["A) ...", "B) ...", "C) ...", "D) ..."],
            "assunto": "Tema específico da questão", 
            "gabarito": "A", 
            "explicacao": "Explicação objetiva e concisa (máximo de 10 linhas) fundamentando os erros e o acerto." 
        }"""
    else:
        regra_formato = "O formato deve ser CERTO ou ERRADO. O gabarito deve ser 'C' ou 'E' seguindo o padrão CESPE. CONCISÃO: A explicação da resposta deve ser muito objetiva e rigorosamente LIMITADA a no máximo 10 linhas."
        
        # Ajusta o exemplo do JSON para não confundir o modelo com termos jurídicos fora do Direito
        if "Direito" in req.subject or req.subject in ["Constitucional", "Penal", "Administrativo", "Processual", "Humanos"]:
            ex_enunciado = "A assertiva jurídica para julgamento..."
            ex_explicacao = "Explique a resolução de forma concisa (máximo 10 linhas) com base em artigos ou informativos."
        else:
            ex_enunciado = "A assertiva ou proposta de reescrita/análise textual para julgamento..."
            ex_explicacao = "Justificativa gramatical ou semântica concisa e direta (máximo 10 linhas)."

        json_questao = f"""{{ 
            "id": 1, 
            "enunciado": "{ex_enunciado}", 
            "assunto": "Tema específico da questão", 
            "gabarito": "C", 
            "explicacao": "{ex_explicacao}" 
        }}"""

    prompt = f"""
Você é o mais rigoroso Examinador Sênior da banca CESPE/CEBRASPE. Crie um simulado inédito de {req.subject}.
DIRETRIZES: {req.amount} questões. Dificuldade: {req.difficulty}. Foco: {focus_instructions}.
Formato Exigido: {regra_formato}
Texto-Base: {text_instruction}

REGRAS CRÍTICAS DE FORMATAÇÃO JSON:
1. JAMAIS use aspas duplas (") DENTRO dos valores de texto. Use ASPAS SIMPLES (').
2. JAMAIS use quebras de linha reais dentro das strings.
3. Responda ESTRITAMENTE com o JSON.

INSTRUÇÃO DE RESPOSTA JSON OBRIGATÓRIO:
{{
    "textoBase": "Contexto fático-jurídico inicial aplicável às questões ou deixe vazio.",
    "questoes": [ 
        {json_questao}
    ]
}}
"""
    return StreamingResponse(
        stream_json_response(prompt, req.model, temp=0.5, api_key=req.api_key), 
        media_type="text/plain"
    )

@app.post("/generate-lesson-cespe")
async def generate_lesson_cespe_endpoint(req: LessonCespeRequest, current_user: User = Depends(get_current_user)):
    if not req.api_key and not os.getenv("OPENROUTER_API_KEY"): 
        raise HTTPException(status_code=403, detail="Nenhuma chave de API configurada no sistema.")
    
    prompt = f"""
    Você é um professor de cursinho preparatório de excelência, focado na banca CESPE/CEBRASPE. 
    O aluno acabou de fazer um simulado e ERROU as seguintes questões:

    {json.dumps(req.wrong_questions, ensure_ascii=False, indent=2)}

    Sua tarefa: Criar uma AULA DIDÁTICA E MOTIVADORA ensinando os conceitos que o aluno errou.
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
    return StreamingResponse(stream_json_response(prompt, req.model, temp=0.7, api_key=req.api_key), media_type="text/plain")

@app.post("/api/translate")
async def translate_word_endpoint(req: TranslateWordRequest, current_user: User = Depends(get_current_user)):
    if not req.api_key and not os.getenv("OPENROUTER_API_KEY"): 
        raise HTTPException(status_code=403, detail="Nenhuma chave de API configurada.")
    
    prompt = f"Traduza a palavra em inglês '{req.word}' para o português. Responda APENAS com a tradução ou traduções mais comuns, de forma bem curta. Não adicione explicações."
    
    chave_limpa = (req.api_key or os.getenv("OPENROUTER_API_KEY")).strip()
    model_name = req.model or "google/gemini-2.5-flash"
    
    # === Roteador Dinâmico ===
    if chave_limpa.startswith("sk-or-"):
        url_base = "https://openrouter.ai/api/v1"
    else:
        url_base = "https://generativelanguage.googleapis.com/v1beta/openai/"
        # Vacina anti-erro 404 do Google
        if model_name.startswith("google/"):
            model_name = model_name.replace("google/", "")
            
    client = AsyncOpenAI(base_url=url_base, api_key=chave_limpa)
    
    try:
        response = await client.chat.completions.create(
            model=model_name,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=30
        )
        translation = response.choices[0].message.content.strip()
        return {"translation": translation}
    except Exception as e:
        print(f"Erro ao traduzir: {e}")
        raise HTTPException(status_code=500, detail="Erro ao processar a tradução.")
    

# ============================================================================
# ENDPOINTS MERCADO PAGO
# ============================================================================

mp_access_token = os.getenv("MERCADOPAGO_ACCESS_TOKEN", "INSIRA_SEU_ACCESS_TOKEN_AQUI")
sdk = mercadopago.SDK(mp_access_token)

class PaymentRequest(BaseModel):
    email: str
    plano: str
    coupon_code: Optional[str] = None

@app.post("/payments/create-preference")
async def create_preference(
    req: PaymentRequest, 
    db: AsyncSession = Depends(get_db)
):
    planos = {
        "diario_teste": {"price": 1.90, "title": "Plano de Teste Diário (Plus)", "days": 1},
        "mensal_simples": {"price": 49.90, "title": "Plano Mensal Simples", "days": 30},
        "trimestral_simples": {"price": 119.90, "title": "Plano Trimestral Simples", "days": 90},
        "semestral_simples": {"price": 199.90, "title": "Plano Semestral Simples", "days": 180},
        "mensal_plus": {"price": 99.90, "title": "Plano Mensal Plus (IA Compartilhada)", "days": 30},
        "trimestral_plus": {"price": 159.90, "title": "Plano Trimestral Plus (IA Compartilhada)", "days": 90},
        "semestral_plus": {"price": 239.90, "title": "Plano Semestral Plus (IA Compartilhada)", "days": 180},
        "trimestral_pro": {"price": 189.90, "title": "Plano Trimestral Pro (IA Compartilhada)", "days": 90},
        "semestral_pro": {"price": 269.90, "title": "Plano Semestral Pro (IA Compartilhada)", "days": 180}
    }
    
    if req.plano not in planos:
        raise HTTPException(status_code=400, detail="Plano inválido")
    
    plano_sel = planos[req.plano]
    
    # -------------------------------------------------------------
    # 3. LÓGICA DE DESCONTO COM O CUPOM
    # -------------------------------------------------------------
    final_price = plano_sel["price"]
    
    if req.coupon_code:
        # Busca o cupom no banco de dados
        result = await db.execute(select(Coupon).filter(Coupon.code == req.coupon_code.upper()))
        coupon = result.scalars().first()
        
        if not coupon:
            raise HTTPException(status_code=400, detail="Cupom inválido ou inexistente.")
            
        # Calcula o desconto (baseado em porcentagem)
        discount_amount = final_price * (coupon.discount_percentage / 100.0)
        final_price -= discount_amount
        
        # Garante que o valor não seja negativo ou zero (Mercado Pago não aceita valor <= 0)
        final_price = round(max(0.01, final_price), 2)
        
        print(f"🎟️ [DEBUG] Cupom {req.coupon_code} aplicado. Preço caiu de {plano_sel['price']} para {final_price}")

    # -------------------------------------------------------------
    # CORREÇÃO DEFINITIVA DA URL DO FRONTEND 
    # -------------------------------------------------------------
    front_url = os.getenv("FRONTEND_URL")
    
    # Limpa espaços e quebras de linha invisíveis (\n, \r)
    if isinstance(front_url, str):
        front_url = front_url.strip().rstrip("/")
        
    # Se ainda assim estiver vazio, força o padrão
    if not front_url:
        front_url = "https://agente-edital.tecnopriv.top"
        
    print(f"🔗 [DEBUG] URL do Frontend enviada ao Mercado Pago: {front_url}/login")
    # -------------------------------------------------------------

    preference_data = {
        "items": [
            {
                "title": plano_sel["title"] + (f" (CUPOM: {req.coupon_code})" if req.coupon_code else ""),
                "quantity": 1,
                "currency_id": "BRL",
                "unit_price": final_price # Usamos o preço calculado com desconto
            }
        ],
        "payer": {"email": req.email},
        "external_reference": f"{req.email}|{req.plano}",
        "back_urls": {
            "success": f"{front_url}/login",
            "failure": f"{front_url}/planos",
            "pending": f"{front_url}/login"
        },
        "auto_return": "approved"
    }
    
    preference_response = sdk.preference().create(preference_data)
    
    if preference_response.get("status") not in (200, 201):
        error_data = preference_response.get("response", {})
        print(f"❌ Erro no Mercado Pago: {error_data}")
        raise HTTPException(
            status_code=400, 
            detail="O Mercado Pago recusou a transação. Verifique as configurações e garanta que não está a usar a conta de vendedor para pagar."
        )
        
    preference = preference_response.get("response", {})
    
    return {"init_point": preference.get("init_point")}

@app.post("/payments/webhook")
async def mercadopago_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    try:
        data = await request.json()
    except:
        return {"status": "ignored"}
        
    if data.get("action") == "payment.created" or data.get("type") == "payment":
        payment_id = str(data.get("data", {}).get("id"))
        
        if payment_id:
            # 1. VERIFICA SE JÁ PROCESSOU ESSE PAGAMENTO
            existing_payment = await db.execute(select(ProcessedPayment).filter(ProcessedPayment.payment_id == payment_id))
            if existing_payment.scalars().first():
                print(f"⚠️ Pagamento {payment_id} já processado anteriormente. Ignorando duplicata.")
                return {"status": "ok"} 

            payment_info = sdk.payment().get(payment_id)
            payment = payment_info.get("response", {})
            
            if payment.get("status") == "approved":
                external_ref = payment.get("external_reference")
                if external_ref and "|" in external_ref:
                    email, plano = external_ref.split("|")
                    
                    planos_info = {
                        "diario_teste": {"dias": 1, "preco": 1.90, "tipo": "Plus", "limite": 200000},
                        "mensal_simples": {"dias": 30, "preco": 49.90, "tipo": "Simples", "limite": 0},
                        "trimestral_simples": {"dias": 90, "preco": 119.90, "tipo": "Simples", "limite": 0},
                        "semestral_simples": {"dias": 180, "preco": 199.90, "tipo": "Simples", "limite": 0},
                        "mensal_plus": {"dias": 30, "preco": 99.90, "tipo": "Plus", "limite": 3000000},
                        "trimestral_plus": {"dias": 90, "preco": 159.90, "tipo": "Plus", "limite": 3000000},
                        "semestral_plus": {"dias": 180, "preco": 239.90, "tipo": "Plus", "limite": 3000000},
                        "trimestral_pro": {"dias": 90, "preco": 189.90, "tipo": "Pro", "limite": 6000000},
                        "semestral_pro": {"dias": 180, "preco": 269.90, "tipo": "Pro", "limite": 6000000}
                    }
                    info = planos_info.get(plano, {"dias": 30, "preco": 49.90, "tipo": "Simples", "limite": 0})
                    
                    result = await db.execute(select(User).filter(User.email == email))
                    user = result.scalars().first()
                    
                    if user:
                        base_date = datetime.utcnow()
                        if user.plan_expires_at and user.plan_expires_at > base_date:
                            base_date = user.plan_expires_at
                            
                        user.plan_expires_at = base_date + timedelta(days=info["dias"])
                        user.plan_type = info["tipo"]
                        user.token_limit = info["limite"]
                        user.tokens_used = 0 
                        user.token_reset_date = datetime.utcnow() + timedelta(days=30)

                        # --- NOVA LÓGICA: ATUALIZAÇÃO DO MODELO DE IA ---
                        if info["tipo"] in ["Plus", "Pro"]:
                            config_result = await db.execute(select(GlobalAIConfig).limit(1))
                            global_config = config_result.scalars().first()
                            
                            if global_config:
                                user.preferred_model = global_config.model
                        # ------------------------------------------------

                        # LÓGICA DE COMISSÃO (20%)
                        if user.referred_by_id:
                            preco_plano = info["preco"]
                            comissao = preco_plano * 0.20
                            
                            referrer_result = await db.execute(select(User).filter(User.id == user.referred_by_id))
                            referrer = referrer_result.scalars().first()
                            
                            if referrer:
                                referrer.commission_balance += comissao
                                
                                # Registra o histórico da comissão
                                nova_comissao = CommissionHistory(
                                    user_id=referrer.id,
                                    amount=comissao,
                                    action_type="ganho",
                                    description=f"Comissão de 20% pela assinatura do plano {info['tipo']}."
                                )
                                db.add(nova_comissao)

                        # 2. SALVA O PAGAMENTO COMO PROCESSADO
                        novo_pagamento = ProcessedPayment(payment_id=payment_id)
                        db.add(novo_pagamento)
                        
                        await db.commit()

    return {"status": "ok"}


@app.post("/admin/grant-plan/{user_id}")
async def grant_plan(
    user_id: int, 
    plan: str, 
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Não autorizado")

    # Mapeamento dos novos planos
    planos_info = {
        "diario_teste": {"dias": 1, "tipo": "Plus", "limite": 200000},
        "mensal_simples": {"dias": 30, "tipo": "Simples", "limite": 0},
        "trimestral_simples": {"dias": 90, "tipo": "Simples", "limite": 0},
        "semestral_simples": {"dias": 180, "tipo": "Simples", "limite": 0},
        "mensal_plus": {"dias": 30, "tipo": "Plus", "limite": 3000000},
        "trimestral_plus": {"dias": 90, "tipo": "Plus", "limite": 3000000},
        "semestral_plus": {"dias": 180, "tipo": "Plus", "limite": 3000000},
        "trimestral_pro": {"dias": 90, "tipo": "Pro", "limite": 6000000},
        "semestral_pro": {"dias": 180, "tipo": "Pro", "limite": 6000000}
    }
    info = planos_info.get(plan.lower(), {"dias": 30, "tipo": "Simples", "limite": 0})

    result = await db.execute(select(User).filter(User.id == user_id))
    target_user = result.scalars().first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    now = datetime.utcnow()
    base_date = target_user.plan_expires_at if (target_user.plan_expires_at and target_user.plan_expires_at > now) else now
    
    target_user.plan_expires_at = base_date + timedelta(days=info["dias"])
    target_user.plan_type = info["tipo"]
    target_user.token_limit = info["limite"]
    target_user.tokens_used = 0
    target_user.token_reset_date = now + timedelta(days=30)
    
    await db.commit()
    await db.refresh(target_user)
    return {"message": "Plano atualizado", "expires_at": target_user.plan_expires_at}
# NOVA ROTA: Remover plano
@app.post("/admin/revoke-plan/{user_id}")
async def revoke_plan(
    user_id: int, 
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Não autorizado")

    result = await db.execute(select(User).filter(User.id == user_id))
    target_user = result.scalars().first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    # Define a data para um instante no passado (força a expiração imediata)
    target_user.plan_expires_at = datetime.utcnow() - timedelta(minutes=1)
    
    await db.commit()
    await db.refresh(target_user)
    return {"message": "Plano removido com sucesso", "expires_at": target_user.plan_expires_at}

@app.get("/admin/users/{user_id}/commissions", response_model=List[CommissionHistoryResponse])
async def get_user_commissions(user_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Não autorizado")
    
    result = await db.execute(select(CommissionHistory).filter(CommissionHistory.user_id == user_id).order_by(desc(CommissionHistory.created_at)))
    return result.scalars().all()

@app.post("/admin/users/{user_id}/commission-action")
async def handle_commission_action(
    user_id: int, 
    req: CommissionActionRequest,
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Não autorizado")
    
    result = await db.execute(select(User).filter(User.id == user_id))
    target_user = result.scalars().first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    saldo_atual = target_user.commission_balance or 0.0
    
    # LÓGICA DE PAGAMENTO (Abatimento)
    if req.action == "pagamento":
        if req.amount <= 0: raise HTTPException(status_code=400, detail="Valor inválido.")
        if req.amount > saldo_atual: raise HTTPException(status_code=400, detail="Saldo insuficiente para o pagamento.")
        target_user.commission_balance = saldo_atual - req.amount
        desc = req.description or "Pagamento realizado"
        
    # LÓGICA DE AJUSTE (Edição Livre)
    elif req.action == "ajuste":
        if req.amount < 0: raise HTTPException(status_code=400, detail="O saldo não pode ser negativo.")
        target_user.commission_balance = req.amount
        desc = req.description or "Ajuste manual de saldo"
    else:
        raise HTTPException(status_code=400, detail="Ação inválida")
        
    # Salva no Histórico
    hist = CommissionHistory(
        user_id=user_id,
        amount=req.amount,
        action_type=req.action,
        description=desc
    )
    db.add(hist)
    
    await db.commit()
    await db.refresh(target_user)
    
    return {"message": "Ação realizada com sucesso", "new_balance": target_user.commission_balance}
                    
# ============================================================================
# FERRAMENTAS DE TREINO: LEI SECA EM LACUNAS E COMPARADOR DE BANCAS
# ============================================================================

class TextoLegalRequest(BaseModel):
    dispositivo: str
    contexto: Optional[str] = ""
    model: Optional[str] = None
    api_key: Optional[str] = None


class LeiSecaRequest(BaseModel):
    texto: str
    intensidade: Optional[Literal["Leve", "Media", "Pesada"]] = "Media"
    model: Optional[str] = None
    api_key: Optional[str] = None


class ComparadorRequest(BaseModel):
    tema: str
    conteudo: Optional[str] = ""
    bancas: Optional[List[str]] = None
    nivel: Optional[Literal["Iniciante", "Normal", "Avancado", "Expert"]] = "Normal"
    model: Optional[str] = None
    api_key: Optional[str] = None


# Quantas lacunas abrir a cada 100 palavras, por intensidade.
DENSIDADE_LACUNAS = {"Leve": "4 a 6", "Media": "8 a 12", "Pesada": "14 a 20"}

MAX_TEXTO_LEI = 6000
MAX_BANCAS_COMPARADAS = 3


@app.post("/training/texto-legal")
async def training_texto_legal(req: TextoLegalRequest, current_user: User = Depends(get_current_user)):
    """Reconstitui o texto de um dispositivo para o aluno CONFERIR antes de treinar.

    Ressalva que define o desenho desta rota: um modelo de linguagem reproduz
    texto legal de memoria e pode errar uma palavra — justamente o tipo de erro
    que a Lei Seca em Lacunas existe para combater. Por isso o resultado nunca
    vai direto para o exercicio: ele volta para o campo de texto, editavel, com
    o aviso de conferir na fonte oficial. E o prompt manda o modelo declarar
    `confiavel: false` quando nao tiver certeza da literalidade, em vez de
    inventar uma versao plausivel.
    """
    if not req.api_key and not os.getenv("OPENROUTER_API_KEY"):
        raise HTTPException(status_code=403, detail="Nenhuma chave de API configurada.")

    dispositivo = (req.dispositivo or "").strip()
    if len(dispositivo) < 3:
        raise HTTPException(status_code=400, detail="Diga qual dispositivo você quer, ex: art. 37 da CF/88.")

    contexto = (req.contexto or "").strip()[:600]
    recorte = f"\nOBSERVACAO DO ALUNO: {contexto}\n" if contexto else ""

    prompt = f"""
Voce e um assistente juridico. Reproduza o texto do dispositivo pedido.

DISPOSITIVO PEDIDO: {dispositivo}
{recorte}
REGRAS INEGOCIAVEIS:
- Reproduza a LITERALIDADE do texto vigente. Nao resuma, nao explique, nao
  parafraseie, nao modernize a redacao, nao corrija a pontuacao original.
- Mantenha a numeracao original de artigos, paragrafos, incisos e alineas.
- Se o dispositivo foi alterado por emenda, reproduza a redacao EM VIGOR.
- Se voce nao tiver certeza da literalidade — porque o dispositivo e pouco
  conhecido, muito recente, foi alterado, ou porque voce pode estar confundindo
  com norma parecida — responda com "confiavel": false e explique em
  "observacao" o que exatamente esta em duvida. NAO invente uma versao
  plausivel: um texto quase certo e pior que nenhum texto, porque o aluno vai
  decorar a palavra errada.
- Se o pedido nao for um dispositivo normativo, devolva "confiavel": false e
  diga isso em "observacao".
- Limite: no maximo 5 artigos. Se o aluno pedir mais, traga os 5 primeiros e
  avise em "observacao".

RETORNE APENAS ESTE JSON EXATO:
{{
  "titulo": "Identificacao curta, ex: CF/88, art. 37, caput e incisos I a III",
  "fonte": "Norma completa, ex: Constituicao Federal de 1988",
  "texto": "O texto literal, com as quebras de linha entre artigos e incisos.",
  "confiavel": true,
  "observacao": "Vazio quando confiavel. Quando nao, o que esta em duvida."
}}
"""
    return await get_json_response(prompt, req.model or DEFAULT_MODEL, temp=0.0, api_key=req.api_key)


@app.post("/training/lei-seca")
async def training_lei_seca(req: LeiSecaRequest, current_user: User = Depends(get_current_user)):
    """Apaga do texto legal exatamente as palavras que a banca troca.

    A ideia da ferramenta: em Direito, boa parte do erro nao e de conceito, e de
    operador. O candidato sabe o artigo e nao percebe que a assertiva trocou
    "podera" por "devera". Aqui o operador e o objeto do treino, nao a armadilha.
    """
    if not req.api_key and not os.getenv("OPENROUTER_API_KEY"):
        raise HTTPException(status_code=403, detail="Nenhuma chave de API configurada.")

    texto = (req.texto or "").strip()
    if len(texto) < 40:
        raise HTTPException(status_code=400, detail="Cole um trecho maior — pelo menos algumas linhas do texto legal.")
    texto = texto[:MAX_TEXTO_LEI]
    densidade = DENSIDADE_LACUNAS.get(req.intensidade or "Media", DENSIDADE_LACUNAS["Media"])

    prompt = f"""
Atue como um professor de concursos preparando um exercicio de memorizacao de lei seca.

TEXTO OFICIAL (nao altere uma virgula dele):
\"\"\"{texto}\"\"\"

TAREFA: reescreva o texto substituindo por marcadores {{{{1}}}}, {{{{2}}}}, {{{{3}}}}... APENAS as
palavras e expressoes que as bancas de concurso costumam trocar para tornar uma
assertiva errada. Abra {densidade} lacunas a cada 100 palavras.

O QUE VIRA LACUNA (nesta ordem de prioridade):
1. Operadores deonticos: devera, podera, e vedado, e obrigatorio, compete, cabe.
2. Quantificadores e limites: ate, no minimo, no maximo, superior a, inferior a,
   e os proprios numeros e prazos (5 anos, 30 dias, dois tercos).
3. Ressalvas e condicoes: salvo, exceto, desde que, ressalvado, independentemente de.
4. Sujeitos e competencias: quem pratica o ato, quem julga, quem autoriza.
5. Conectivos que mudam o sentido: e / ou, bem como, sem prejuizo de.

O QUE NUNCA VIRA LACUNA: artigos, preposicoes, palavras sem valor normativo, e a
numeracao dos artigos, incisos e alineas.

REGRAS:
- Cada lacuna guarda a palavra ou expressao EXATA que estava no texto, sem parafrase.
- Os distratores devem ser plausiveis e do mesmo tipo da resposta ("podera" contra
  "devera", "ate" contra "no minimo") — nunca absurdos e nunca de outra categoria.
- "por_que_importa" explica em UMA frase o que muda no sentido da norma se a
  palavra for trocada pelo distrator. Nada de repetir a definicao.

RETORNE APENAS ESTE JSON EXATO:
{{
  "titulo": "Identificacao do dispositivo, ex: Art. 37 da CF/88",
  "texto_com_lacunas": "Texto integral com os marcadores {{{{1}}}} no lugar das palavras escolhidas.",
  "lacunas": [
    {{
      "id": 1,
      "resposta": "a palavra ou expressao exata do texto original",
      "distratores": ["alternativa plausivel", "outra alternativa plausivel"],
      "categoria": "operador | limite | ressalva | competencia | conectivo",
      "por_que_importa": "Uma frase sobre o que muda no sentido se trocar."
    }}
  ]
}}
"""
    return await get_json_response(prompt, req.model or DEFAULT_MODEL, temp=0.15, api_key=req.api_key)


@app.post("/training/comparador-bancas")
async def training_comparador_bancas(req: ComparadorRequest, current_user: User = Depends(get_current_user)):
    """Mesmo conteudo, uma questao por banca, lado a lado.

    Responde a duvida de quem presta mais de um concurso: "estudei isso, mas cai
    desse jeito na MINHA prova?". Reaproveita o BANCA_ESTILOS ja existente.
    """
    if not req.api_key and not os.getenv("OPENROUTER_API_KEY"):
        raise HTTPException(status_code=403, detail="Nenhuma chave de API configurada.")

    tema = (req.tema or "").strip()
    if not tema:
        raise HTTPException(status_code=400, detail="Informe o tema a comparar.")

    bancas = [b.strip() for b in (req.bancas or []) if b and b.strip()][:MAX_BANCAS_COMPARADAS]
    if len(bancas) < 2:
        raise HTTPException(status_code=400, detail="Escolha pelo menos duas bancas para comparar.")

    blocos = "\n".join(
        f"- {b}: {estilo_da_banca(b) or 'Siga o padrao historico desta banca.'}" for b in bancas
    )
    conteudo = (req.conteudo or "").strip()[:4000]
    recorte = f"\nRECORTE DO CONTEUDO A COBRAR:\n{conteudo}\n" if conteudo else ""

    prompt = f"""
Atue como elaborador de questoes de concurso publico.

TEMA: {tema}
NIVEL: {req.nivel or 'Normal'}
{recorte}
Escreva UMA questao inedita sobre EXATAMENTE o mesmo ponto do tema para cada banca
abaixo, respeitando a regra de elaboracao de cada uma:

{blocos}

REGRAS:
- O conteudo cobrado tem de ser o MESMO nas questoes. O que muda e a forma de cobrar.
  Sem isso a comparacao nao ensina nada.
- Respeite o formato de cada banca: CEBRASPE e CESPE usam CERTO/ERRADO com duas
  opcoes; as demais usam multipla escolha com quatro ou cinco alternativas.
- "o_que_a_banca_fez" e o coracao da ferramenta: diga, em duas frases, qual manobra
  aquela banca usou nesta questao especifica (onde escondeu o erro, que palavra
  carrega a pegadinha, que tipo de raciocinio ela cobra). Seja concreto, citando a
  palavra ou o trecho — nada de descricao generica do estilo da banca.
- "sintese" fecha com o que o candidato deve mudar no jeito de estudar conforme a
  banca do concurso dele.

RETORNE APENAS ESTE JSON EXATO:
{{
  "tema": "{tema}",
  "questoes": [
    {{
      "banca": "nome da banca",
      "formato": "Certo/Errado ou Multipla Escolha",
      "enunciado": "texto da questao",
      "alternativas": ["A) ...", "B) ..."],
      "gabarito": "A",
      "comentario": "por que o gabarito e esse",
      "o_que_a_banca_fez": "a manobra concreta desta questao"
    }}
  ],
  "sintese": "O que muda no estudo conforme a banca."
}}
"""
    return await get_json_response(prompt, req.model or DEFAULT_MODEL, temp=0.35, api_key=req.api_key)


if __name__ == "__main__":
    # O Railway injeta dinamicamente a variável de ambiente PORT. Se não achar, usa 8000.
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)