# backend/main.py
import os
import uvicorn
import json
import re
import asyncio
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Optional, AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict
from dotenv import load_dotenv

from passlib.context import CryptContext
from jose import JWTError, jwt
from fastapi.security import OAuth2PasswordBearer

# Imports de Banco de Dados (SQLAlchemy + Asyncpg)
from sqlalchemy import Column, Integer, String, DateTime, JSON, select, desc
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base

# Cliente OpenAI/OpenRouter
from openai import OpenAI

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

class StoredPlan(Base):
    __tablename__ = "study_plans"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    area = Column(String)
    content = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(String, default="user") # 'admin' ou 'user'
    api_key = Column(String, nullable=True)          # <--- NOVO: Chave da IA
    preferred_model = Column(String, nullable=True)  # <--- NOVO: Modelo Preferido

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
    # Atualizado para o padrão moderno do Python para evitar o DeprecationWarning
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# ============================================================================
# 4. SCHEMAS (PYDANTIC)
# ============================================================================

class EssayCorrectionRequest(BaseModel):
    texto_motivador: str
    comando: str
    aspectos: List[Dict[str, Any]]
    resposta_aluno: str
    model: Optional[str] = "stepfun/step-3.5-flash:free"
    api_key: Optional[str] = None

class GenerateEssayRequest(BaseModel):
    area: str
    aula_titulo: str
    lesson_content: Dict[str, Any]
    model: Optional[str] = "stepfun/step-3.5-flash:free"
    api_key: Optional[str] = None

class ChatMessageRequest(BaseModel):
    area: str
    aula_titulo: str
    mensagem: str
    historico: List[Dict[str, str]] = []
    model: Optional[str] = "stepfun/step-3.5-flash:free"
    api_key: Optional[str] = None
    
class UserLogin(BaseModel):
    email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    email: str

class UserCreate(BaseModel):
    email: str
    password: str
    role: str = "user"
    
# Novos Schemas de Configuração do Usuário
class UserSettingsUpdate(BaseModel):
    api_key: Optional[str] = None
    preferred_model: Optional[str] = None

class UserSettingsResponse(BaseModel):
    api_key: Optional[str] = None
    preferred_model: Optional[str] = None

# Dependência para pegar o usuário logado
async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Credenciais inválidas ou token expirado",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    # CORREÇÃO 2: Limpa possíveis aspas residuais enviadas pelo localStorage do frontend
    clean_token = token.replace('"', '').replace("'", "")
    
    try:
        payload = jwt.decode(clean_token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            print("⚠️ [Auth] Token validado, mas não possui a chave 'sub' (email).")
            raise credentials_exception
    except JWTError as e:
        # LOG IMPORTANTE: Vai mostrar no terminal exatamente por que rejeitou
        print(f"⚠️ [Auth] Falha no Token JWT: {e} | Início do token: {clean_token[:15]}...")
        raise credentials_exception
        
    result = await db.execute(select(User).filter(User.email == email))
    user = result.scalars().first()
    
    if user is None:
        print(f"⚠️ [Auth] O token aponta para o email '{email}', mas este usuário não existe no DB!")
        raise credentials_exception
        
    return user

class ConfigRequest(BaseModel):
    default_model: str | None = None
    token: str | None = None
    available_models: list[str] | None = None

class SyllabusRequest(BaseModel):
    text: str
    model: str | None = None

class SavePlanRequest(BaseModel):
    title: str
    area: str
    content: Dict[str, Any]

class PlanSummaryResponse(BaseModel):
    id: int
    title: str
    area: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

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
        _CLIENT = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=key)
    return _CLIENT

DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "openrouter/aurora-alpha")
AVAILABLE_MODELS = [m.strip() for m in os.getenv("AVAILABLE_MODELS", "").split(",") if m.strip()]

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

        # Criar Usuários Padrão
        async with AsyncSessionLocal() as db:
            # Admin
            result = await db.execute(select(User).filter(User.email == "admin@admin.com"))
            if not result.scalars().first():
                print("👤 Criando usuário ADMIN padrão (admin@admin.com / admin123)")
                admin_user = User(
                    email="admin@admin.com",
                    hashed_password=get_password_hash("admin123"),
                    role="admin"
                )
                db.add(admin_user)
                await db.commit()
            
            # User Comum
            result_user = await db.execute(select(User).filter(User.email == "user@user.com"))
            if not result_user.scalars().first():
                print("👤 Criando usuário USER padrão (user@user.com / user123)")
                normal_user = User(
                    email="user@user.com",
                    hashed_password=get_password_hash("user123"),
                    role="user"
                )
                db.add(normal_user)
                await db.commit()

    except Exception as e:
        print(f"⚠️ Erro ao inicializar DB: {e}")
    
    yield
    await engine.dispose()

# ============================================================================
# 7. APP FASTAPI & ROTAS
# ============================================================================

# !!! AQUI ESTAVA O ERRO: O app deve ser criado ANTES de ser usado !!!
app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- ROTAS DE AUTENTICAÇÃO ---

@app.post("/auth/register")
async def register(user: UserCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.email == user.email))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Email já cadastrado")
    
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
    
    token_data = {"sub": user.email, "role": user.role}
    access_token = create_access_token(token_data)
    
    return {
        "access_token": access_token, 
        "token_type": "bearer", 
        "role": user.role,
        "email": user.email
    }

# ============================================================================
# 5. ENDPOINTS DE CONFIGURAÇÃO E BANCO DE DADOS
# ============================================================================

def update_env_file(path: str, updates: dict) -> None:
    """Atualiza chaves no arquivo .env preservando comentários."""
    try:
        p = path
        lines = []
        if os.path.exists(p):
            with open(p, "r", encoding="utf-8") as f:
                lines = f.read().splitlines()
        
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
        DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "openrouter/aurora-alpha")
        AVAILABLE_MODELS = [m.strip() for m in os.getenv("AVAILABLE_MODELS", "").split(",") if m.strip()]
    return {"ok": True, "updated": list(updates.keys())}

# --- ENDPOINTS DB ---

# --- ROTAS DE PLANOS (DB) ---

@app.post("/plans", status_code=201)
async def save_plan(plan: SavePlanRequest, db: AsyncSession = Depends(get_db)):
    try:
        new_plan = StoredPlan(title=plan.title, area=plan.area, content=plan.content)
        db.add(new_plan)
        await db.commit()
        await db.refresh(new_plan)
        return {"ok": True, "id": new_plan.id}
    except Exception as e:
        await db.rollback()
        print(f"Erro DB: {e}")
        raise HTTPException(status_code=500, detail="Erro ao salvar no banco.")

@app.get("/plans", response_model=List[PlanSummaryResponse])
async def list_plans(db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(select(StoredPlan).order_by(desc(StoredPlan.created_at)))
        return result.scalars().all()
    except Exception as e:
        print(f"Erro DB: {e}")
        return []

@app.get("/plans/{plan_id}")
async def get_plan(plan_id: int, db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(select(StoredPlan).filter(StoredPlan.id == plan_id))
        plan = result.scalars().first()
        if not plan: raise HTTPException(status_code=404, detail="Plano não encontrado")
        return plan.content
    except Exception as e:
        print(f"Erro DB: {e}")
        raise HTTPException(status_code=500, detail="Erro ao buscar dados.")
    
@app.delete("/plans/{plan_id}")
async def delete_plan(plan_id: int, db: AsyncSession = Depends(get_db)):
    """Remove um plano (Ação de Admin)."""
    try:
        result = await db.execute(select(StoredPlan).filter(StoredPlan.id == plan_id))
        plan = result.scalars().first()
        if not plan:
            raise HTTPException(status_code=404, detail="Plano não encontrado")
        
        await db.delete(plan)
        await db.commit()
        return {"ok": True, "message": "Plano deletado com sucesso"}
    except Exception as e:
        await db.rollback()
        print(f"Erro DB: {e}")
        raise HTTPException(status_code=500, detail="Erro ao deletar plano.")

# ============================================================================
# 6. UTILITÁRIOS (TEXT PROCESSING & CLEANING)
# ============================================================================

def clean_response(text: str) -> str:
    """Remove <think> and markdown fences to improve JSON parse."""
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    text = text.replace("```json", "").replace("```", "").strip()
    return text

def try_parse_json_loose(text: str) -> Any:
    """
    Tolerant JSON parsing:
    - try json.loads
    - else extract first {...} or [...] block and parse
    """
    try:
        return json.loads(text)
    except Exception:
        m = re.search(r"\{.*\}", text, flags=re.DOTALL)
        if m:
            return json.loads(m.group(0))
        m = re.search(r"\[.*\]", text, flags=re.DOTALL)
        if m:
            return json.loads(m.group(0))
        raise

def clamp_text(s: str, max_len: int) -> str:
    return (s or "")[:max_len]

def normalize_terms(terms: Any) -> List[str]:
    if not isinstance(terms, list):
        return []
    out: List[str] = []
    for t in terms:
        if isinstance(t, str) and t.strip():
            out.append(t.strip())
    return out

def ensure_list(val: Any) -> List[Any]:
    """Ensure value is a list; otherwise return empty list."""
    return val if isinstance(val, list) else []

def ensure_str(val: Any) -> str:
    return val if isinstance(val, str) else ""

def normalize_modules(mods: Any) -> List[Dict[str, Any]]:
    """
    Normalize modules from architect.
    Accepts:
      - list[str] (legacy)
      - list[dict] (new)
    """
    if not isinstance(mods, list) or not mods:
        return [{
            "titulo": "Análise Geral",
            "tipo": "conceito",
            "ancoras_detectadas": [],
            "subtopicos": [],
            "regra_de_escopo": ""
        }]

    # legacy: list of strings
    if all(isinstance(m, str) for m in mods):
        out = []
        for m in mods:
            if isinstance(m, str) and m.strip():
                out.append({
                    "titulo": m.strip(),
                    "tipo": "conceito",
                    "ancoras_detectadas": [],
                    "subtopicos": [],
                    "regra_de_escopo": ""
                })
        return out or [{
            "titulo": "Análise Geral",
            "tipo": "conceito",
            "ancoras_detectadas": [],
            "subtopicos": [],
            "regra_de_escopo": ""
        }]

    # new: list of objects
    out: List[Dict[str, Any]] = []
    for m in mods:
        if not isinstance(m, dict):
            continue
        titulo = (m.get("titulo") or m.get("nome") or m.get("title") or "").strip()
        if not titulo:
            continue
        out.append({
            "titulo": titulo,
            "tipo": m.get("tipo") or "conceito",
            "ancoras_detectadas": ensure_list(m.get("ancoras_detectadas")),
            "subtopicos": ensure_list(m.get("subtopicos")),
            "regra_de_escopo": ensure_str(m.get("regra_de_escopo")),
        })
    return out or [{
        "titulo": "Análise Geral",
        "tipo": "conceito",
        "ancoras_detectadas": [],
        "subtopicos": [],
        "regra_de_escopo": ""
    }]

def validate_como_funciona(como: str) -> Dict[str, Any]:
    """
    Objective checks for 'aula_teorica.como_funciona' depth.
    Focus on:
      - required section headers
      - anchoring via "Trecho do edital:"
      - causal/decision/validation markers
    """
    como = (como or "").strip()

    required_headers = [
        "1) Visão de mecanismo",
        "2) Componentes/partes envolvidas",
        "3) Fluxo passo a passo (com POR QUÊ de cada passo)",
        "4) Regras/condições e exceções (corner cases)",
        "5) Trade-offs/impactos (performance, custo, risco)",
        "6) Pegadinhas típicas de prova (ligadas ao edital)",
    ]
    missing = [h for h in required_headers if h not in como]

    has_trecho = "Trecho do edital:" in como
    criteria_count = len(re.findall(r"\bCrit[eé]rio\s*:", como, flags=re.IGNORECASE))
    valid_count = len(re.findall(r"\bValida[cç][aã]o\s*:", como, flags=re.IGNORECASE))
    remove_count = len(re.findall(r"\bSe remover\s*:", como, flags=re.IGNORECASE))
    limit_count = len(re.findall(r"\bLimita[cç][aã]o\s*:", como, flags=re.IGNORECASE))
    failure_count = len(re.findall(r"\bFalha comum\s*:", como, flags=re.IGNORECASE))
    scenario_count = len(re.findall(r"\bCen[aá]rio de falha\s*:", como, flags=re.IGNORECASE))
    because_count = len(re.findall(r"\bPorque\s*:", como, flags=re.IGNORECASE))

    ok_len = len(como) >= 1400
    ok_depth = (
        criteria_count >= 5 and valid_count >= 3 and remove_count >= 3 and
        limit_count >= 2 and failure_count >= 3 and (scenario_count >= 2 or because_count >= 2)
    )

    return {
        "ok": (not missing) and has_trecho and ok_len and ok_depth,
        "missing_headers": missing,
        "has_trecho": has_trecho,
        "len": len(como),
        "criteria_count": criteria_count,
        "valid_count": valid_count,
        "remove_count": remove_count,
        "limit_count": limit_count,
        "failure_count": failure_count,
        "scenario_count": scenario_count,
        "because_count": because_count,
    }

def detect_suspect_tools(text: str, allowed_terms: List[str]) -> List[str]:
    """
    Detect common tools/libs that might be invented.
    If not present in allowed_terms (edital + canonical terms), flag them.
    """
    candidates = [
        "pandas", "numpy", "matplotlib", "seaborn", "scikit", "sklearn", "jupyter",
        "rstudio", "ggplot", "power bi", "tableau", "spark", "hadoop",
    ]
    allowed = {t.lower() for t in (allowed_terms or [])}
    lower = (text or "").lower()
    return [c for c in candidates if (c in lower and c.lower() not in allowed)]

def extract_choice_letter(val: Any) -> Optional[str]:
    """
    Normalize 'resposta_correta' to a single letter A-F.
    Handles inputs like 'A', 'A)', 'Alternativa C', 'Letra: D', etc.
    """
    if val is None:
        return None
    s = str(val).strip().upper()
    if not s:
        return None
    m = re.search(r"\b([A-F])\b", s)
    if m:
        return m.group(1)
    # fallback: first char
    ch = s[0]
    return ch if ch in "ABCDEF" else None

def normalize_wrong_reasons(val: Any) -> Dict[str, str]:
    """
    Normalize 'por_que_as_outras_estao_erradas' to a dict letter->reason.
    Accepts:
      - dict with keys like 'B', 'B)', 'B:' etc
      - list of strings like ['B: ...', 'C: ...']
    """
    out: Dict[str, str] = {}

    if isinstance(val, dict):
        for k, v in val.items():
            key = str(k).strip().upper()
            m = re.match(r"^([A-F])", key)
            if not m:
                continue
            letter = m.group(1)
            out[letter] = str(v) if v is not None else ""
        return out

    if isinstance(val, list):
        for item in val:
            s = str(item).strip()
            m = re.match(r"^\s*([A-F])\s*[\)\.\-:]\s*(.*)$", s, flags=re.IGNORECASE)
            if m:
                out[m.group(1).upper()] = m.group(2).strip()
        return out

    return out

def sanitize_lesson(lesson: Dict[str, Any]) -> Dict[str, Any]:
    """Limpa e garante a tipagem da aula, permitindo os novos campos."""
    if not isinstance(lesson, dict):
        return {}

    # Garantir listas
    for key in ["topicos_explicados", "micro_mecanismos", "criterios_de_decisao", 
                "validacoes_e_checkpoints", "confusoes_classicas_de_prova", 
                "erros_comuns", "checklist_de_revisao", "limites_do_escopo", "glosario"]:
        lesson[key] = ensure_list(lesson.get(key))

    # Garantir strings
    for key in ["titulo", "visao_geral", "referencia_bibliografica"]:
        lesson[key] = ensure_str(lesson.get(key))

    # Tratar AULA TEÓRICA e seus subcampos
    aula_teorica = lesson.get("aula_teorica")
    if not isinstance(aula_teorica, dict):
        aula_teorica = {}
        lesson["aula_teorica"] = aula_teorica
    
    # NOVOS CAMPOS ADICIONADOS AQUI:
    # "introducao_contextual" (string)
    # "termos_tecnicos" (lista de objetos)
    
    # Strings simples dentro da aula teórica
    teorica_str_keys = [
        "introducao_contextual", # <--- NOVO
        "definicao_chave", 
        "conceito_simplificado", 
        "conceito_tecnico", 
        "como_funciona", 
        "comparativo", 
        "exemplo_pratico"
    ]
    for k in teorica_str_keys:
        aula_teorica[k] = ensure_str(aula_teorica.get(k))

    # Listas dentro da aula teórica
    teorica_list_keys = [
        "termos_tecnicos" # <--- NOVO
    ]
    for k in teorica_list_keys:
        aula_teorica[k] = ensure_list(aula_teorica.get(k))

    return lesson

def sanitize_quiz(quiz: Any) -> List[Dict[str, Any]]:
    """Normalize quiz list and question fields so frontend never breaks."""
    quiz_list = ensure_list(quiz)
    out: List[Dict[str, Any]] = []
    for q in quiz_list:
        if not isinstance(q, dict):
            continue

        alternativas = q.get("alternativas")
        if not isinstance(alternativas, list):
            alternativas = []
        q["alternativas"] = alternativas

        # normalize correct letter
        q["resposta_correta"] = extract_choice_letter(q.get("resposta_correta")) or ""

        # normalize comments
        if "comentario_da_correta" not in q and "comentario" in q:
            q["comentario_da_correta"] = q.get("comentario")
        if "comentario" not in q and "comentario_da_correta" in q:
            q["comentario"] = q.get("comentario_da_correta")

        # normalize wrong reasons
        q["por_que_as_outras_estao_erradas"] = normalize_wrong_reasons(q.get("por_que_as_outras_estao_erradas"))

        # normalize strings
        for k in ["enunciado", "topico_relacionado", "comentario_da_correta", "comentario"]:
            if k in q:
                q[k] = ensure_str(q.get(k))

        out.append(q)
    return out

async def get_json_response(prompt: str, model_name: str, temp: float = 0.25, api_key: Optional[str] = None) -> Any:
    """Call OpenRouter and return JSON with retries, using user API key if provided."""
    
    # Se o usuário mandou a chave dele, cria um cliente exclusivo para ele
    if api_key and api_key.strip():
        client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key.strip())
    else:
        # Senão, usa o cliente padrão do sistema
        client = get_openrouter_client()
        if not client:
            raise HTTPException(status_code=500, detail="OPENROUTER_API_KEY não encontrado no ambiente (.env).")

    tentativa = 0
    max_tentativas = 5
    last_error: Optional[str] = None

    while tentativa < max_tentativas:
        try:
            print(f"   ...Conectando ao Modelo {model_name} (Tentativa {tentativa+1})...")

            response = await asyncio.to_thread(
                client.chat.completions.create,
                model=(model_name or DEFAULT_MODEL),
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a strict JSON generator. "
                            "Return ONLY valid JSON. No markdown. No commentary. "
                            "If something is missing from the provided context, state that limitation inside the JSON."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=temp,
            )

            raw_content = response.choices[0].message.content or ""
            cleaned_content = clean_response(raw_content)
            return try_parse_json_loose(cleaned_content)

        except Exception as e:
            last_error = str(e)
            print(f"❌ Erro na chamada AI: {last_error}")

            if "429" in last_error or "401" in last_error:
                print("⚠️ Rate Limit ou Chave Inválida detectado. Aguardando...")
                await asyncio.sleep(6 + (tentativa * 4))
            else:
                await asyncio.sleep(2 + (tentativa * 2))

            tentativa += 1

    raise HTTPException(status_code=503, detail=f"O modelo falhou após várias tentativas. Verifique sua Chave de API. Erro: {last_error}")

# ============================================================================
# 7. AGENTS
# ============================================================================
# Adicione api_key: Optional[str] = None na assinatura
async def agent_essay_generator(modulo_obj: Dict[str, Any], area: str, lesson_content: Dict[str, Any], model: str, api_key: Optional[str] = None) -> Dict[str, Any]:
    titulo = modulo_obj.get("titulo", "Módulo")
    print(f"--- ✍️  Discursiva: Criando prova CESPE para '{titulo}'... ---")
    lesson_text = json.dumps(lesson_content, ensure_ascii=False)

    prompt = f"""
Atue como um EXAMINADOR SÊNIOR DA BANCA CESPE/CEBRASPE.
Sua missão é criar UMA questão discursiva (estudo de caso ou redação técnica) focada nos conceitos críticos desta aula.

AULA:
{lesson_text}

DIRETRIZES DA QUESTÃO CESPE:
1. "texto_motivador": Um cenário hipotético, estudo de caso prático ou texto base sobre o tema.
2. "comando": A instrução principal (ex: "Considerando a situação hipotética acima, redija um texto dissertativo abordando necessariamente os tópicos a seguir:").
3. "aspectos": 2 a 3 tópicos específicos que o candidato DEVE abordar. Cada aspecto deve ter seu "valor_maximo" em pontos. A soma total deve ser exatamente 10.0 pontos.

RETORNE APENAS JSON NESTE FORMATO EXATO:
{{
  "discursiva": {{
    "texto_motivador": "...",
    "comando": "...",
    "aspectos": [
      {{ "aspecto": "1. Primeiro conceito a explicar...", "valor_maximo": 4.0 }},
      {{ "aspecto": "2. Segundo conceito...", "valor_maximo": 6.0 }}
    ]
  }}
}}
"""
    # Mude a linha de retorno para enviar a api_key
    return await get_json_response(prompt, model, temp=0.3, api_key=api_key)

async def agent_essay_corrector(req: EssayCorrectionRequest) -> Dict[str, Any]:
    print("--- 📝 Corretor: Avaliando Discursiva do Aluno... ---")
    prompt = f"""
Atue como um EXAMINADOR RIGOROSO DA BANCA CESPE/CEBRASPE.
Sua missão é corrigir a redação de um candidato.

=== DADOS DA QUESTÃO ===
TEXTO MOTIVADOR: {req.texto_motivador}
COMANDO: {req.comando}
ASPECTOS COBRADOS: {json.dumps(req.aspectos, ensure_ascii=False)}

=== RESPOSTA DO CANDIDATO ===
{req.resposta_aluno}

DIRETRIZES DE CORREÇÃO (ESTILO CESPE):
1. Avalie o CONTEÚDO TÉCNICO de cada aspecto. Desconte pontos severamente se a resposta for rasa ou incorreta.
2. Atribua a "nota_atribuida" para cada aspecto (não ultrapassando o valor máximo).
3. Analise a Estrutura Textual, Coesão e Gramática (deduza décimos da nota final se houver falhas graves).

RETORNE APENAS JSON NESTE FORMATO EXATO:
{{
  "nota_final": 8.5,
  "avaliacoes_aspectos": [
    {{
      "aspecto": "Nome do Aspecto",
      "nota_atribuida": 3.5,
      "comentario": "Justificativa direta do porquê o candidato ganhou ou perdeu pontos."
    }}
  ],
  "erros_gramaticais": "Apontamento de erros de português e clareza textual.",
  "feedback_geral": "Parecer final da banca."
}}
"""
    return await get_json_response(prompt, req.model, temp=0.2, api_key=req.api_key)

async def agent_lesson_tutor(req: ChatMessageRequest) -> Dict[str, Any]:
    print(f"--- 💬 Tutor: Respondendo dúvida da área de '{req.area}'... ---")
    
    # Prepara o histórico recente para dar contexto à IA (pega as últimas 4 mensagens)
    hist_text = ""
    if req.historico:
        hist_text = "HISTÓRICO RECENTE DA CONVERSA:\n"
        for msg in req.historico[-4:]:
            role = "Aluno" if msg.get("role") == "user" else "Você (Tutor)"
            hist_text += f"{role}: {msg.get('content')}\n"

    prompt = f"""
Atue como um Professor Tutor altamente didático, encorajador e SUPER ESPECIALISTA na área de: {req.area}.

O aluno está estudando um edital ou curso completo dessa área e pode te fazer perguntas amplas, profundas ou correlacionadas a diversos tópicos (não apenas um assunto isolado). 
Você domina todos os conceitos de {req.area} e deve ajudá-lo de forma completa.

{hist_text}

DÚVIDA ATUAL DO ALUNO:
{req.mensagem}

Responda DIRETAMENTE à dúvida do aluno. 
Use um tom amigável, utilize analogias se necessário e formate o texto de forma fácil de ler. 
NÃO invente informações fora do escopo de conhecimento técnico e científico desta área.

RETORNE APENAS JSON NESTE FORMATO EXATO:
{{
  "resposta": "Sua resposta didática aqui (pode usar formatação markdown como negrito e listas)."
}}
"""
    return await get_json_response(prompt, req.model, temp=0.4, api_key=req.api_key)

async def agent_instruction_designer(text: str, area: str, model: str) -> Dict[str, Any]:
    print(f"--- 🎨 Designer Instrucional: Definindo estratégia para '{area}'... ---")
    
    # O prompt agora ensina a IA a se comportar diferente dependendo da área
    prompt = f"""
Você é um DESIGNER INSTRUCIONAL SÊNIOR focado em ENSINO DE ALTA PERFORMANCE.
Analise o texto e defina a estratégia de ensino.

TEXTO BASE:
{clamp_text(text, 5000)}

ÁREA IDENTIFICADA: {area}

PROBLEMA A RESOLVER:
Os alunos reclamam que o conteúdo é muito técnico e difícil.
Sua missão é garantir que o professor explique o "Bê-á-bá" (conceito simples) ANTES de entrar no aprofundamento técnico.

GERE DIRETRIZES ADAPTADAS À ÁREA:
- Se for DIREITO: Foco em Jurisprudência, Súmulas e Divergência Doutrinária.
- Se for TI/ENGENHARIA: Foco em "Como funciona por baixo do capô", Performance, Segurança e Boas Práticas.
- Se for SAÚDE: Foco em Fisiopatologia, Protocolos Clínicos e Estudos de Caso.
- Se for EXATAS: Foco em Resolução passo a passo e Aplicação no mundo real.

RETORNE APENAS JSON:
{{
  "diretrizes_pesquisador": "Instrução técnica específica para a área (ex: 'Busque documentação oficial e PEPs' para Python, ou 'Busque Súmulas' para Direito).",
  "diretrizes_professor": "Instrução didática (ex: 'Use analogias com carros' ou 'Use metáforas do corpo humano').",
  "formato_exemplo": "Como deve ser o exemplo (ex: 'Snippet de código comentado', 'Caso clínico', 'Narrativa jurídica').",
  "foco_aprofundamento": "O que separa o júnior do sênior nesta área (ex: 'Otimização de memória', 'Teses minoritárias')."
}}
"""
    return await get_json_response(prompt, model, temp=0.3)


# ============================================================================
# AGENTS ATUALIZADOS - ESTRUTURA SEMANAL & APROFUNDAMENTO OBRIGATÓRIO
# ============================================================================

async def agent_architect(text: str, model: str) -> Dict[str, Any]:
    """
    Arquiteto v3: Organiza o conteúdo em 'SEMANAS DE ESTUDO' (Módulos Sequenciais).
    """
    print("--- 🏛️  Arquiteto: Organizando cronograma em Semanas/Módulos... ---")
    prompt = f"""
Você é um COORDENADOR PEDAGÓGICO de Concursos.
Sua missão é pegar o edital abaixo e organizá-lo em uma TRILHA DE APRENDIZAGEM SEQUENCIAL (Semanas).

TEXTO DO EDITAL:
---
{clamp_text(text, 12000)}
---

DIRETRIZES DE ORGANIZAÇÃO (CRUCIAL):
1. Não quebre o conteúdo em micro-tópicos irrelevantes.
2. Agrupe assuntos conexos para formar uma "Semana de Estudo" completa.
   - Exemplo: Junte "Organização Administrativa" + "Administração Direta/Indireta" no Módulo 1.
   - Exemplo: "Licitações" é denso, pode ser um módulo sozinho ou dividido em dois se for muito grande.
3. O título do módulo deve refletir o tema da semana (ex: "Semana 1: Organização do Estado", "Semana 2: Atos Administrativos").

TAREFAS:
1. Identifique a "area_conhecimento".
2. Crie os "modulos". CADA MÓDULO SERÁ UMA AULA/SEMANA NO SISTEMA.
3. Para cada módulo, liste as "ancoras_detectadas" (leis, doutrinas).

RETORNE APENAS JSON:
{{
  "area_conhecimento": "Direito Administrativo (exemplo)",
  "resumo_objetivo": "Resumo do que será conquistado ao final.",
  "modulos": [
    {{
      "titulo": "Semana 1: [Nome do Grande Tema]",
      "tipo": "conceito",
      "ancoras_detectadas": ["Lei X", "Doutrina Y"],
      "subtopicos": [
        {{
          "nome": "Tópico específico (ex: Desconcentração)",
          "origem": "edital",
          "nota": "Foco na diferença entre X e Y"
        }}
      ],
      "regra_de_escopo": "Estudar apenas X e Y, ignorar Z por enquanto."
    }}
  ]
}}
"""
    return await get_json_response(prompt, model, temp=0.2)


async def agent_researcher(
    modulo_obj: Dict[str, Any],
    area: str,
    full_text: str,
    context_instructions: Dict[str, Any],
    model: str
) -> Dict[str, Any]:
    
    titulo = modulo_obj.get("titulo", "Módulo")
    print(f"--- 🔎 Pesquisador v8 (Deep Fix): Aprofundando '{titulo}'... ---")

    modulo_json = json.dumps(modulo_obj, ensure_ascii=False)
    guidelines = context_instructions.get("diretrizes_pesquisador", "Foco técnico profundo.")
    deep_focus = context_instructions.get("foco_aprofundamento", "Nuances e complexidade.")

    prompt = f"""
Você é um PESQUISADOR SÊNIOR ESPECIALISTA EM {area}.
Tarefa: Gerar insumos técnicos de alto nível para a aula de "{titulo}".

DIRETRIZES: {guidelines}
FOCO DO APROFUNDAMENTO: {deep_focus}

MÓDULO ATUAL:
{modulo_json}

⚠️ REGRA CRÍTICA DE SOBREVIVÊNCIA:
O campo "subtemas_aprofundados" É OBRIGATÓRIO e deve conter MÍNIMO 3 ITENS.
Se o tema for básico, aprofunde em: Histórico, Comparação Internacional, Divergências ou Casos de Borda (Corner Cases).
NUNCA retorne lista vazia.

ESTRUTURA DO JSON DE SAÍDA:
{{
  "meta_modulo": {{ ...copie input... }},
  "termos_chave": ["termo1", "termo2"], 
  "mapa_estrutural": [
    {{ "componente_pai": "...", "relacao": "...", "componente_filho": "...", "contexto": "..." }}
  ],
  "correlacoes_entre_partes": [
    {{ "parte_a": "...", "parte_b": "...", "explicacao": "..." }}
  ],
  "subtemas_aprofundados": [
    {{
      "subtema": "Título do Tópico Avançado (ex: Teoria X vs Teoria Y)",
      "natureza": "teorica|pratica|jurisprudencia",
      "conteudo_denso": "Explicação técnica detalhada de no mínimo 4 linhas.",
      "laboratorio_pratico": {{
        "cenario": "Situação problema.",
        "resolucao": "Solução técnica.",
        "resultado_esperado": "Conclusão."
      }},
      "pontos_de_atencao": ["Ponto 1", "Ponto 2"]
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
    print(f"--- 👨‍🏫 Professor v8 (Completo): Ministrando '{titulo}'... ---")

    research_summary = json.dumps(research_data, ensure_ascii=False)
    
    teaching_style = context_instructions.get("diretrizes_professor", "Didático e progressivo.")
    example_format = context_instructions.get("formato_exemplo", "Caso prático.")

    prompt = f"""
Você é um PROFESSOR DE ELITE em {area}.
Sua aula deve ser completa: Introdução, Conceitos, Termos Técnicos e Prática.

ESTILO: {teaching_style}
FORMATO EXEMPLO: {example_format}

MÓDULO: {titulo}
BASE DE PESQUISA: {research_summary}

MISSÃO - GERE O JSON COM ESTES CAMPOS:
1. "aula_teorica":
   - "introducao_contextual": (NOVO) Um parágrafo introdutório situando o aluno no tema da semana.
   - "termos_tecnicos": (NOVO) Lista com 3 a 12 termos técnicos essenciais e suas definições curtas com exemplos.
   - "conceito_simplificado": Analogia do cotidiano.
   - "como_funciona": Explicação estruturada e detalhada do mecanismo.

RETORNE APENAS JSON:
{{
  "titulo": "{titulo}",
  "visao_geral": "Resumo executivo do módulo.",
  "referencia_bibliografica": "Fontes de autoridade em {area}.",
  "topicos_explicados": [
    {{
      "topico": "Nome",
      "explicacao": "Explicação.",
      "exemplo_pratico": "{example_format}",
      "pegadinha_tipica": "Erro comum."
    }}
  ],
  "aula_teorica": {{
    "introducao_contextual": "Texto introdutório explicando o que é este módulo e por que ele é importante.",
    "termos_tecnicos": [
       {{ "termo": "Termo X", "definicao": "Significado..." }}
    ],
    "definicao_chave": "Definição central.",
    "conceito_simplificado": "Analogia didática.",
    "conceito_tecnico": "Definição formal.",
    "como_funciona": "Fluxo lógico do funcionamento.",
    "comparativo": "Comparação X vs Y.",
    "exemplo_pratico": "Caso resolvido: {example_format}"
  }},
  "validacoes_e_checkpoints": [
    {{ "checkpoint": "Verificar X", "como_validar": ["Passo 1", "Passo 2"] }}
  ],
  "criterios_de_decisao": [
     {{ "decisao": "A ou B?", "criterios": ["..."], "risco_de_erro": "..." }}
  ],
  "confusoes_classicas_de_prova": ["..."],
  "erros_comuns": ["..."],
  "checklist_de_revisao": ["..."],
  "limites_do_escopo": ["..."],
  "glosario": [] 
}}
"""
    return await get_json_response(prompt, model, temp=0.35)


async def agent_deepener_como_funciona(modulo_obj: Dict[str, Any], area: str, research_data: Dict[str, Any], lesson: Dict[str, Any], model: str) -> Dict[str, Any]:
    """Rewrite only aula_teorica.como_funciona to maximize depth and correlation between parts."""
    titulo = modulo_obj.get("titulo", "Módulo")
    print(f"--- 🧠 Aprofundador: Reescrevendo 'como_funciona' de '{titulo}'... ---")

    base = {"modulo": modulo_obj, "research_data": research_data, "lesson": lesson}
    base_json = json.dumps(base, ensure_ascii=False)

    prompt = f"""
Você é um revisor técnico especialista em concursos.

Base única (módulo + dossiê + aula atual):
{base_json}

TAREFA:
Reescreva SOMENTE "aula_teorica.como_funciona" para ficar mais aprofundado e conectar as partes.

REGRAS:
- Não invente termos além de "termos_do_edital" e "termos_canonicos".
- Use 3+ evidências literais: Trecho do edital: "..."
- Se existir "mapa_estrutural", explique explicitamente como os componentes se correlacionam.
- Em CADA uma das 6 seções inclua:
  Porque e exemplo: ...
  Limitação e exemplo: ...
  Cenário de falha e exemplo: ...
- No "Fluxo passo a passo", cada passo deve conter:
  O que é + O que acontece + Por quê + Critério + Validação + Se remover
- Incluir 4+ trade-offs e 4+ corner cases e 5+ pegadinhas, Explicação de cada um com exemplos.

Retorne APENAS JSON:
{{ "como_funciona": "texto final" }}
"""
    return await get_json_response(prompt, model, temp=0.2)


async def agent_glossarist(modulo_obj: Dict[str, Any], area: str, lesson_content: Dict[str, Any], model: str) -> Dict[str, Any]:
    titulo = modulo_obj.get("titulo", "Módulo")
    print(f"--- 📖 Glossarista: Traduzindo termos de '{titulo}'... ---")
    lesson_text = json.dumps(lesson_content, ensure_ascii=False)

    prompt = f"""
Analise esta aula (fonte única):
---
{lesson_text}
---

TAREFA:
- Identifique 5 a 10 termos/siglas IMPORTANTES que APAREÇAM literalmente no texto.
- Para cada termo, retorne também um "trecho_origem" (frase curta copiada do texto) onde o termo aparece.
- Não invente termos.

Retorne APENAS JSON:
{{
  "glossario": [
    {{
      "termo": "Termo literal do texto",
      "definicao": "Definição curta e precisa",
      "trecho_origem": "Trecho curto onde o termo aparece"
    }}
  ]
}}
"""
    return await get_json_response(prompt, model, temp=0.2)


async def agent_examiner(modulo_obj: Dict[str, Any], area: str, professor_lesson: Dict[str, Any], model: str) -> Dict[str, Any]:
    titulo = modulo_obj.get("titulo", "Módulo")
    print(f"--- 📝 Banca: Criando questões para '{titulo}'... ---")
    lesson_context = json.dumps(professor_lesson, ensure_ascii=False)

    prompt = f"""
Atue como Banca Examinadora de Concurso.

BASE ESTRITA (aula ministrada):
{lesson_context}

Crie 5 QUESTÕES DIFÍCEIS para validar o conhecimento DESSA aula.
Não cobre assuntos que não foram explicados no texto acima.

Retorne APENAS JSON:
{{
  "quiz": [
    {{
      "enunciado": "Questão técnica complexa.",
      "alternativas": ["A) ...", "B) ...", "C) ...", "D) ..."],
      "resposta_correta": "A",
      "comentario_da_correta": "Justificativa técnica baseada na aula.",
      "por_que_as_outras_estao_erradas": {{
        "B": "por que B está errada",
        "C": "por que C está errada",
        "D": "por que D está errada"
      }},
      "topico_relacionado": "qual topico_explicado isso testa"
    }}
  ]
}}
"""
    return await get_json_response(prompt, model, temp=0.25)

async def agent_mindmap(modulo_obj: Dict[str, Any], area: str, lesson_content: Dict[str, Any], model: str) -> Dict[str, Any]:
    titulo = modulo_obj.get("titulo", "Módulo")
    print(f"--- 🧠 Mapa Mental: Estruturando visualmente '{titulo}'... ---")
    lesson_text = json.dumps(lesson_content, ensure_ascii=False)

    prompt = f"""
Atue como um Especialista em Aprendizagem Visual.
Analise a aula abaixo:
{lesson_text}

Crie um código Mermaid.js (graph TD) que resuma visualmente os conceitos principais desta aula.

⚠️ REGRAS CRÍTICAS DE SINTAXE MERMAID (EVITE ERROS):
1. NUNCA use parênteses (), vírgulas ,, aspas " ou colchetes [] dentro do texto dos nós.
2. Use textos limpos e diretos. (Exemplo ERRADO: A[Gestão (BIA)]. Exemplo CORRETO: A[Gestao BIA]).
3. NÃO use caracteres invisíveis ou "non-breaking spaces" para identação. Use espaços normais da barra de espaço.

Retorne APENAS JSON estrito no formato:
{{
  "mapa_mental": {{
    "titulo": "Título do Mapa (ex: Fluxo CI/CD)",
    "codigo_mermaid": "graph TD;\\n  A[Conceito] --> B[Subconceito Detalhado];"
  }}
}}
"""
    return await get_json_response(prompt, model, temp=0.2)


async def agent_flashcards(modulo_obj: Dict[str, Any], area: str, lesson_content: Dict[str, Any], model: str) -> Dict[str, Any]:
    titulo = modulo_obj.get("titulo", "Módulo")
    print(f"--- 🃏 Flashcards: Extraindo revisão ativa de '{titulo}'... ---")
    lesson_text = json.dumps(lesson_content, ensure_ascii=False)

    prompt = f"""
Atue como um Especialista em Repetição Espaçada (Anki).
Analise a aula abaixo:
{lesson_text}

Crie de 3 a 5 Flashcards focados em "Active Recall" para os pontos mais difíceis, decorebas ou pegadinhas da aula.

Retorne APENAS JSON estrito no formato:
{{
  "flashcards": [
    {{
      "frente": "Pergunta curta e direta (ex: Qual a diferença entre TDD e BDD?)",
      "verso": "Resposta exata e concisa.",
      "dica": "Mnemônico ou dica de memorização (opcional)"
    }}
  ]
}}
"""
    return await get_json_response(prompt, model, temp=0.25)

async def agent_strategist(modulos_data: List[Dict[str, Any]], area: str, model: str) -> Dict[str, Any]:
    print("--- 🎯 Estrategista v2: Criando plano baseado na realidade da aula... ---")
    
    # Extrair o que REALMENTE foi ensinado
    conteudo_real = []
    for m in modulos_data:
        if isinstance(m, dict):
            titulo = m.get("titulo", "Módulo")
            topicos = [t.get("topico") for t in m.get("topicos_explicados", []) if isinstance(t, dict)]
            conteudo_real.append(f"Módulo '{titulo}': cobriu {', '.join(topicos)}.")
    
    conteudo_texto = "\n".join(conteudo_real)

    prompt = f"""
Você é um Mentor de Estudos.
Crie um plano de estudos baseado EXCLUSIVAMENTE no conteúdo que foi gerado abaixo.

CONTEÚDO GERADO NAS AULAS:
{conteudo_texto}

ÁREA: {area}

REGRAS:
1. O plano deve consolidar O QUE FOI DADO.
2. Não invente tópicos que não estão na lista acima.
3. Se organize em Semanas ou Dias, dependendo da densidade.
4. Inclua uma seção de "Prática Recomendada" baseada na natureza da área (ex: se for TI, sugerir codar; se Direito, sugerir casos).

Retorne APENAS JSON:
{{ "plano_estudo": "Texto estruturado do plano (Markdown)." }}
"""
    return await get_json_response(prompt, model, temp=0.35)

    
# ============================================================================
# 8. ROTA PRINCIPAL (/analyze)
# ============================================================================

@app.post("/analyze")
async def analyze_syllabus_deep(request: SyllabusRequest):
    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="Texto vazio")

    selected_model = request.model
    print(f"🔄 Iniciando pipeline com modelo: {selected_model}")

    try:
        # 1) Architect
        structure = await agent_architect(request.text, selected_model)
        area = structure.get("area_conhecimento", "Geral")
        modules = normalize_modules(structure.get("modulos"))
        
        # 2) Instruction Designer (Contexto)
        instructions = await agent_instruction_designer(request.text, area, selected_model)
        
        final_aulas: List[Dict[str, Any]] = []

        # 3) Sequential pipeline (Loop pelos Módulos)
        for idx, mod in enumerate(modules):
            titulo = mod.get("titulo", f"Módulo {idx+1}")
            print(f"\n➡️ Processando Módulo {idx + 1}: {titulo}")

            # 3.1 Pesquisa
            research = await agent_researcher(mod, area, request.text, instructions, selected_model)
            await asyncio.sleep(1)

            # 3.2 Aula do Professor
            lesson = await agent_professor(mod, area, research, instructions, selected_model)
            lesson = sanitize_lesson(lesson)
            await asyncio.sleep(1)
            
            # --- CRÍTICO: VALIDAR E CORRIGIR AULA SE NECESSÁRIO ---
            try:
                # Recupera o texto atual
                como_atual = (lesson.get("aula_teorica") or {}).get("como_funciona", "")
                
                # Validação 1: Estrutura e Profundidade
                report = validate_como_funciona(como_atual)

                # Validação 2: Termos Suspeitos (CORREÇÃO AQUI: Usa 'termos_chave' que existe)
                allowed_terms = normalize_terms(research.get("termos_chave"))
                suspects = detect_suspect_tools(como_atual, allowed_terms)

                if (not report["ok"]) or suspects:
                    print(f"⚠️ 'como_funciona' precisa de revisão. Report: {report['ok']}, Suspeitos: {suspects}")
                    
                    deep = await agent_deepener_como_funciona(mod, area, research, lesson, selected_model)
                    new_como = ensure_str(deep.get("como_funciona"))

                    # CORREÇÃO AQUI: Só sobrescreve se o novo texto for válido e substancial
                    if new_como and len(new_como) > 100:
                        if "aula_teorica" not in lesson or not isinstance(lesson["aula_teorica"], dict):
                            lesson["aula_teorica"] = {}
                        lesson["aula_teorica"]["como_funciona"] = new_como
                        lesson = sanitize_lesson(lesson)
                        print("✅ 'como_funciona' aprofundado com sucesso.")
                    else:
                        print("⚠️ Deepener retornou vazio ou inválido. Mantendo texto original.")
                        
                    await asyncio.sleep(1)
            except Exception as e:
                print(f"Erro no deepener (não crítico): {e}")

            # 3.3 Glossário
            glossary_data = await agent_glossarist(mod, area, lesson, selected_model)
            await asyncio.sleep(1)

            # 3.4 Banca Examinadora (Quiz)
            exam = await agent_examiner(mod, area, lesson, selected_model)
            await asyncio.sleep(1)

            # 3.5 Mapa Mental (NOVO)
            mindmap_data = await agent_mindmap(mod, area, lesson, selected_model)
            await asyncio.sleep(1)

            # 3.6 Flashcards (NOVO)
            flashcards_data = await agent_flashcards(mod, area, lesson, selected_model)
            await asyncio.sleep(1)

            # 3.7 Discursiva (NOVO)
            essay_data = await agent_essay_generator(mod, area, lesson, selected_model)
            await asyncio.sleep(1)
            
            # --- PREPARAÇÃO FINAL DOS DADOS ---

            quiz_list = sanitize_quiz(exam.get("quiz") if isinstance(exam, dict) else [])
            glossary_list = ensure_list(glossary_data.get("glossario")) if isinstance(glossary_data, dict) else []
            flashcards_list = ensure_list(flashcards_data.get("flashcards")) if isinstance(flashcards_data, dict) else []
            mindmap_obj = mindmap_data.get("mapa_mental") if isinstance(mindmap_data, dict) else {}

            raw_subtemas = ensure_list(research.get("subtemas_aprofundados"))
            
            if not raw_subtemas:
                print("⚠️ Researcher retornou subtemas vazios. Aplicando fallback.")
                raw_subtemas = [{
                    "subtema": "Aprofundamento em Análise",
                    "natureza": "teorica",
                    "conteudo_denso": f"Neste módulo de {mod.get('titulo')}, recomenda-se foco total na bibliografia sugerida e na resolução de questões práticas.",
                    "laboratorio_pratico": {
                        "cenario": "Estudo de caso integrador.",
                        "resolucao": "Revisar conceitos fundamentais.",
                        "resultado_esperado": "Consolidação do conhecimento."
                    },
                    "pontos_de_atencao": ["Verificar atualizações recentes na área."]
                }]

            # 3.7 MONTAGEM DO OBJETO FINAL
            full_module = {
                **lesson,
                "glosario": ensure_list(lesson.get("glosario")) + glossary_list,
                "quiz": quiz_list,
                "flashcards": flashcards_list,
                "mapa_mental": mindmap_obj,
                "discursiva": essay_data.get("discursiva") if isinstance(essay_data, dict) else {}, # <--- NOVO
                "subtemas_aprofundados": raw_subtemas,
                "meta_modulo": mod,
                "meta_research": {
                    "ancoras": ensure_list(research.get("termos_chave")), 
                    "mapa_estrutural": ensure_list(research.get("mapa_estrutural")),
                    "correlacoes_entre_partes": ensure_list(research.get("correlacoes_entre_partes")),
                },
            }
            
            final_aulas.append(full_module)
            await asyncio.sleep(1)

        # 4) Estrategista Final (Plano de Estudos)
        strategy = await agent_strategist(final_aulas, area, selected_model)

        return {
            "resumo_cargo": structure.get("resumo_objetivo", ""),
            "area_identificada": area,
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

# --- NOVOS SCHEMAS PARA USUÁRIOS ---
class UserResponse(BaseModel):
    id: int
    email: str
    role: str
    model_config = ConfigDict(from_attributes=True)

class UserUpdateRole(BaseModel):
    role: str

# --- NOVAS ROTAS DE GERENCIAMENTO DE USUÁRIOS ---

@app.get("/users", response_model=List[UserResponse])
async def list_users(db: AsyncSession = Depends(get_db)):
    """Lista todos os usuários cadastrados."""
    try:
        result = await db.execute(select(User).order_by(User.id))
        return result.scalars().all()
    except Exception as e:
        print(f"Erro ao listar usuários: {e}")
        return []

@app.delete("/users/{user_id}")
async def delete_user(user_id: int, db: AsyncSession = Depends(get_db)):
    """Deleta um usuário pelo ID."""
    try:
        result = await db.execute(select(User).filter(User.id == user_id))
        user = result.scalars().first()
        if not user:
            raise HTTPException(status_code=404, detail="Usuário não encontrado")
        
        # Opcional: Impedir que delete o próprio admin principal (id 1) se quiser
        if user.id == 1: 
             raise HTTPException(status_code=400, detail="Não é possível deletar o Admin Mestre.")

        await db.delete(user)
        await db.commit()
        return {"ok": True, "message": "Usuário deletado"}
    except HTTPException as he:
        raise he
    except Exception as e:
        await db.rollback()
        print(f"Erro DB: {e}")
        raise HTTPException(status_code=500, detail="Erro ao deletar usuário")

@app.put("/users/{user_id}/role")
async def update_user_role(user_id: int, payload: UserUpdateRole, db: AsyncSession = Depends(get_db)):
    """Atualiza o cargo (role) do usuário (admin <-> user)."""
    try:
        result = await db.execute(select(User).filter(User.id == user_id))
        user = result.scalars().first()
        if not user:
            raise HTTPException(status_code=404, detail="Usuário não encontrado")
        
        if user.role == payload.role:
             return {"ok": True, "message": "Cargo já é este."}

        user.role = payload.role
        await db.commit()
        return {"ok": True, "message": f"Cargo atualizado para {payload.role}"}
    except Exception as e:
        await db.rollback()
        print(f"Erro DB: {e}")
        raise HTTPException(status_code=500, detail="Erro ao atualizar usuário")

@app.get("/users/me/settings", response_model=UserSettingsResponse)
async def get_user_settings(current_user: User = Depends(get_current_user)):
    """Busca as configurações de IA salvas do usuário logado"""
    return {
        "api_key": current_user.api_key,
        "preferred_model": current_user.preferred_model
    }

@app.put("/users/me/settings")
async def update_user_settings(settings: UserSettingsUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Salva a chave e modelo personalizados do usuário logado"""
    current_user.api_key = settings.api_key
    current_user.preferred_model = settings.preferred_model
    await db.commit()
    return {"ok": True, "message": "Configurações de IA atualizadas no banco de dados."}
    
@app.post("/correct-essay")
async def correct_essay(req: EssayCorrectionRequest):
    try:
        result = await agent_essay_corrector(req)
        return result
    except Exception as e:
        print(f"Erro na correção: {e}")
        # Retorna o erro 500 para acionar o bloco "catch" do frontend
        raise HTTPException(status_code=500, detail="API de correção indisponível.")
    
    
@app.post("/generate-essay")
async def generate_essay_endpoint(req: GenerateEssayRequest):
    try:
        mod_obj = {"titulo": req.aula_titulo}
        # Chama o gerador enviando a chave de API do usuário (se houver)
        result = await agent_essay_generator(mod_obj, req.area, req.lesson_content, req.model, req.api_key)
        return result
    except Exception as e:
        print(f"Erro na geração da discursiva: {e}")
        raise HTTPException(status_code=500, detail="Falha ao gerar nova discursiva.")
    
@app.post("/chat")
async def chat_tutor(req: ChatMessageRequest):
    try:
        result = await agent_lesson_tutor(req)
        return result
    except Exception as e:
        print(f"Erro no chat: {e}")
        raise HTTPException(status_code=500, detail="A IA do Tutor falhou ao processar a resposta.")
    
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)