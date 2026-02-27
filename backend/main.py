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
    api_key = Column(String, nullable=True)          # Chave da IA
    preferred_model = Column(String, nullable=True)  # Modelo Preferido

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

class EssayCorrectionRequest(BaseModel):
    texto_motivador: str
    comando: str
    aspectos: List[Dict[str, Any]]
    resposta_aluno: str
    model: Optional[str] = "google/gemini-2.5-flash-lite"
    api_key: Optional[str] = None

class GenerateEssayRequest(BaseModel):
    area: str
    aula_titulo: str
    lesson_content: Dict[str, Any]
    model: Optional[str] = "google/gemini-2.5-flash-lite"
    api_key: Optional[str] = None

class ChatMessageRequest(BaseModel):
    area: str
    aula_titulo: str
    mensagem: str
    historico: List[Dict[str, str]] = []
    model: Optional[str] = "google/gemini-2.5-flash-lite"
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
        if email is None:
            raise credentials_exception
    except JWTError as e:
        print(f"⚠️ [Auth] Falha no Token JWT: {e} | Início do token: {clean_token[:15]}...")
        raise credentials_exception
        
    result = await db.execute(select(User).filter(User.email == email))
    user = result.scalars().first()
    
    if user is None:
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

DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "google/gemini-2.5-flash-lite")
AVAILABLE_MODELS = [m.strip() for m in os.getenv("AVAILABLE_MODELS", "google/gemini-2.5-flash-lite,google/gemini-2.5-flash").split(",") if m.strip()]

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
    token_data = {"sub": user.email, "role": user.role}
    access_token = create_access_token(token_data)
    return {"access_token": access_token, "token_type": "bearer", "role": user.role, "email": user.email}

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
        DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "google/gemini-2.5-flash-lite")
        AVAILABLE_MODELS = [m.strip() for m in os.getenv("AVAILABLE_MODELS", "").split(",") if m.strip()]
    return {"ok": True, "updated": list(updates.keys())}

@app.post("/plans", status_code=201)
async def save_plan(plan: SavePlanRequest, db: AsyncSession = Depends(get_db)):
    try:
        # CORREÇÃO: Limita o título a 150 caracteres para não quebrar o banco de dados
        titulo_seguro = plan.title[:150] + "..." if len(plan.title) > 150 else plan.title
        
        new_plan = StoredPlan(title=titulo_seguro, area=plan.area, content=plan.content)
        db.add(new_plan)
        await db.commit()
        await db.refresh(new_plan)
        return {"ok": True, "id": new_plan.id}
    except Exception as e:
        await db.rollback()
        print(f"❌ Erro ao salvar plano no banco: {e}") # Isso vai mostrar o erro exato no log
        raise HTTPException(status_code=500, detail=f"Erro ao salvar no banco: {str(e)}")

@app.get("/plans", response_model=List[PlanSummaryResponse])
async def list_plans(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(StoredPlan).order_by(desc(StoredPlan.created_at)))
    return result.scalars().all()

@app.get("/plans/{plan_id}")
async def get_plan(plan_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(StoredPlan).filter(StoredPlan.id == plan_id))
    plan = result.scalars().first()
    if not plan: raise HTTPException(status_code=404, detail="Plano não encontrado")
    return plan.content
    
@app.delete("/plans/{plan_id}")
async def delete_plan(plan_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(StoredPlan).filter(StoredPlan.id == plan_id))
    plan = result.scalars().first()
    if not plan: raise HTTPException(status_code=404, detail="Plano não encontrado")
    await db.delete(plan)
    await db.commit()
    return {"ok": True, "message": "Plano deletado com sucesso"}

# ============================================================================
# 6. UTILITÁRIOS (TEXT PROCESSING & CLEANING)
# ============================================================================

def clean_response(text: str) -> str:
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    text = text.replace("```json", "").replace("```", "").strip()
    return text

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
        client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key.strip())
    else:
        client = get_openrouter_client()
        if not client: raise HTTPException(status_code=500, detail="OPENROUTER_API_KEY não encontrado no ambiente (.env).")

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
                await asyncio.sleep(6 + (tentativa * 4))
            else:
                await asyncio.sleep(2 + (tentativa * 2))
            tentativa += 1

    raise HTTPException(status_code=503, detail=f"O modelo falhou após várias tentativas. Erro: {last_error}")

# ============================================================================
# 7. AGENTS (OTIMIZADOS PARA GEMINI FLASH-LITE)
# ============================================================================

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
      "comentario": "Justificativa direta do ponto."
    }}
  ],
  "erros_gramaticais": "Apontamento de erros de português.",
  "feedback_geral": "Parecer final da banca."
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
Atue como Especialista em Análise de Editais de Concurso.
Sua missão é ler o texto bruto do edital fornecido e transformá-lo em uma lista de módulos TOTALMENTE PLANA em formato JSON.

REGRA DE EXTRAÇÃO DAS MATÉRIAS (CRÍTICA):
No texto, o nome da disciplina/área de conhecimento aparece imediatamente ANTES de um sinal de dois-pontos (":").
Exemplos do padrão:
- "LÍNGUA PORTUGUESA: 1 Compreensão..." -> A disciplina é "LÍNGUA PORTUGUESA".
- "NOÇÕES DE DIREITO CONSTITUCIONAL : 1 Aplicabilidade..." -> A disciplina é "NOÇÕES DE DIREITO CONSTITUCIONAL".
- "ENGENHARIA DE DADOS: 1 Dado..." -> A disciplina é "ENGENHARIA DE DADOS".

Você deve capturar esse texto antes dos dois-pontos e usá-lo OBRIGATORIAMENTE no campo "disciplina" para TODOS os tópicos numéricos que vierem a seguir, até que uma nova disciplina com ":" apareça no texto. Ignore palavras genéricas de agrupamento como "ESPECÍFICO:" se elas não tiverem tópicos numéricos atrelados, ou use-as como parte do contexto.

REGRAS DE FORMATAÇÃO DOS TÓPICOS (CRÍTICAS):
1. CADA NÚMERO individual do edital (ex: 1, 1.1, 1.2, 2, 2.1) deve ser um objeto SEPARADO na lista "modulos".
2. NUNCA aninhe tópicos (não crie listas dentro de listas). A lista de módulos deve ser 100% plana.
3. Mantenha o número junto com o texto no campo "titulo" (ex: "4.1 Emprego de tempos e modos verbais").

TEXTO DO EDITAL PARA ANÁLISE:
{clamp_text(text, 15000)}

RETORNE APENAS ESTE JSON EXATO (Siga rigorosamente esta estrutura):
{{
  "resumo_objetivo": "Resumo em uma linha sobre a abrangência deste edital.",
  "modulos": [
    {{
      "disciplina": "LÍNGUA PORTUGUESA",
      "titulo": "4 Domínio dos mecanismos de coesão textual",
      "tipo": "capitulo",
      "regra_de_escopo": "Focar na introdução deste tópico."
    }},
    {{
      "disciplina": "LÍNGUA PORTUGUESA",
      "titulo": "4.1 Emprego de elementos de referenciação, substituição...",
      "tipo": "subcapitulo",
      "regra_de_escopo": "Focar estritamente neste item."
    }},
    {{
      "disciplina": "NOÇÕES DE DIREITO CONSTITUCIONAL",
      "titulo": "1 Aplicabilidade das normas constitucionais",
      "tipo": "capitulo",
      "regra_de_escopo": "Focar na introdução deste tópico."
    }},
    {{
      "disciplina": "NOÇÕES DE DIREITO CONSTITUCIONAL",
      "titulo": "1.1 Normas de eficácia plena, contida e limitada",
      "tipo": "subcapitulo",
      "regra_de_escopo": "Focar estritamente neste item."
    }}
  ]
}}
"""
    return await get_json_response(prompt, model, temp=0.1)


async def agent_researcher(
    modulo_obj: Dict[str, Any],
    area: str,
    full_text: str,
    context_instructions: Dict[str, Any],
    model: str
) -> Dict[str, Any]:
    
    titulo = modulo_obj.get("titulo", "Módulo")
    print(f"--- 🔎 Pesquisador: Aprofundando '{titulo}'... ---")

    modulo_json = json.dumps(modulo_obj, ensure_ascii=False)
    guidelines = context_instructions.get("diretrizes_pesquisador", "Foco técnico rigoroso.")
    deep_focus = context_instructions.get("foco_aprofundamento", "Nuances do tema.")

    prompt = f"""
Atue como PESQUISADOR TÉCNICO SÊNIOR em {area}.
Gere o mapa estrutural detalhado para a aula "{titulo}".

DIRETRIZES: {guidelines}
FOCO: {deep_focus}
MÓDULO: {modulo_json}

REGRAS CRÍTICAS DE PROFUNDIDADE E DOMÍNIO:
1. GERE no mínimo 3 itens longos e exaustivos em "subtemas_aprofundados".
2. Não cite um termo técnico sem explicá-lo brevemente. Se citar conceitos (ex: "Poder Discricionário", "Programação Orientada a Objetos", "Equação de 2º Grau", "Revolução Industrial"), garanta que a explicação do mecanismo esteja presente.
3. Adapte ao domínio ({area}):
   - TI/Exatas/Lógica: Use fórmulas, trechos de código, arquitetura, teoremas.
   - Direito/Humanas: Use leis, jurisprudência, doutrina, correntes.
   - Biológicas/Saúde: Fisiopatologia, vias metabólicas, protocolos.
   - Linguagens: Regras gramaticais, sintaxe, escolas literárias.

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
      "conteudo_denso": "Explicação EXAUSTIVA. OBRIGATÓRIO usar 3 marcações internas em negrito no texto para forçar a profundidade: **Fundamento Teórico:** [explicar a base], **Mecanismo na Prática:** [como funciona a engrenagem], e **Limitações/Restrições:** [onde falha ou exceções].",
      "laboratorio_pratico": {{
        "cenario": "Problema prático ou caso concreto difícil.",
        "resolucao": "Solução passo a passo, detalhando o porquê.",
        "resultado_esperado": "O resultado final comprovado."
      }},
      "pontos_de_atencao": ["Exceção técnica 1", "Risco de implementação/interpretação 2"]
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
    print(f"--- 👨‍🏫 Professor: Ministrando '{titulo}'... ---")

    research_summary = json.dumps(research_data, ensure_ascii=False)

    prompt = f"""
Atue como um PROFESSOR DE ELITE, reconhecido por sua didática impecável e capacidade de simplificar temas complexos em {area}.
Aprofunde exaustivamente o tema exato: "{titulo}".

PESQUISA BASE: {research_summary}

Gere o conteúdo da aula seguindo ESTA ESTRUTURA RIGOROSA:
1. Aula teórica aprofundada (Use formatação Markdown para facilitar a leitura).
2. Resumo de Termos Chave.
3. Analogias e Contexto (INSTRUÇÃO ESPECIAL: Crie uma analogia BRILHANTE, memorável e altamente didática. Relacione o conceito complexo a algo palpável do cotidiano - como física, arquitetura, trânsito, biologia, tecnologia ou sociedade. A metáfora deve fazer o aluno ter um momento 'Ahá! Entendi perfeitamente!').
4. Aplicação Prática / Exemplos e Estudo de Caso.

RETORNE APENAS ESTE JSON EXATO:
{{
  "titulo": "{titulo}",
  "visao_geral": "Resumo de 2 linhas sobre a importância deste tópico.",
  "aula_teorica_aprofundada": "Texto completo, exaustivo e didático sobre o tema. Use subtítulos em Markdown (###).",
  "resumo_termos_chave": [
     {{ "termo": "Nome do Termo", "definicao": "Definição técnica e direta." }}
  ],
  "analogias_contexto": "Apresente uma analogia criativa, visual e memorável que traduza a complexidade do assunto para o mundo real, seguida de um breve contexto prático ou histórico. Faça o aluno visualizar o conceito de forma clara.",
  "aplicacao_pratica_exemplos": "Exemplos detalhados de como isso é aplicado na prática profissional ou estudos de caso clássicos."
}}
"""
    # Aumentamos levemente a temperatura (0.4) para permitir que a IA seja mais criativa e menos robótica nas analogias
    return await get_json_response(prompt, model, temp=0.4)


async def agent_examiner(modulo_obj: Dict[str, Any], area: str, professor_lesson: Dict[str, Any], model: str) -> Dict[str, Any]:
    print(f"--- 📝 Banca: Criando 10 questões objetivas... ---")
    lesson_context = json.dumps(professor_lesson, ensure_ascii=False)

    prompt = f"""
Atue como Banca Examinadora de Alto Nível ({area}).
Com base SOMENTE no texto abaixo, crie EXATAMENTE 10 QUESTÕES de múltipla escolha.

AULA:
{lesson_context}

REGRAS:
1. Crie 10 questões. Mescle questões diretas de fixação com Estudos de Caso práticos.
2. Gere exatamente 4 alternativas (A, B, C, D) para cada uma.
3. Justifique tecnicamente cada erro.

RETORNE APENAS ESTE JSON EXATO:
{{
  "quiz": [
    {{
      "enunciado": "A situação-problema ou pergunta direta aqui...",
      "alternativas": ["A) ...", "B) ...", "C) ...", "D) ..."],
      "resposta_correta": "C",
      "comentario_da_correta": "Explicação técnica do porquê C está certa.",
      "por_que_as_outras_estao_erradas": {{
        "A": "Erro da A",
        "B": "Erro da B",
        "D": "Erro da D"
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
    print("--- 🎯 Estrategista: Criando plano de revisão... ---")
    
    conteudo_real = []
    for m in modulos_data:
        if isinstance(m, dict):
            titulo = m.get("titulo", "Módulo")
            # Atualizado para ler os termos chave gerados pelo novo prompt do professor
            termos = [t.get("termo") for t in m.get("resumo_termos_chave", []) if isinstance(t, dict)]
            conteudo_real.append(f"Módulo '{titulo}': cobriu {', '.join(termos) if termos else 'conceitos aprofundados'}.")
    
    conteudo_texto = "\n".join(conteudo_real)

    prompt = f"""
Atue como Mentor de Alta Performance para Concursos/Certificações.
Crie um Plano de Estudos ESTRATÉGICO em Markdown baseado SOMENTE nestes módulos:
{conteudo_texto}

REGRAS CRÍTICAS:
Para cada módulo, não apenas cite o que estudar, mas inclua OBRIGATORIAMENTE:
1. **Foco de Ouro:** Onde o aluno deve gastar 80% do tempo.
2. **Armadilha (O que NÃO focar):** O que é perfumaria e toma tempo à toa.
3. **Métrica de Validação:** Como o aluno sabe que aprendeu (ex: 'Conseguir configurar X sem ler o manual', 'Acertar 80% das questões de Súmulas').

RETORNE APENAS ESTE JSON EXATO:
{{
  "plano_estudo": "Texto denso e estratégico em Markdown detalhando o plano de ataque para cada módulo."
}}
"""
    return await get_json_response(prompt, model, temp=0.35)

# ============================================================================
# 8. ROTA PRINCIPAL (/analyze) E ROTAS DO USUÁRIO OMITIDAS PARA BREVIDADE
# ============================================================================

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

            exam = ensure_dict(await agent_examiner(mod, area_do_modulo, lesson, selected_model))
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
    model_config = ConfigDict(from_attributes=True)

class UserUpdateRole(BaseModel):
    role: str

@app.get("/users", response_model=List[UserResponse])
async def list_users(db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(select(User).order_by(User.id))
        return result.scalars().all()
    except Exception as e:
        print(f"Erro ao listar usuários: {e}")
        return []

@app.delete("/users/{user_id}")
async def delete_user(user_id: int, db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(select(User).filter(User.id == user_id))
        user = result.scalars().first()
        if not user:
            raise HTTPException(status_code=404, detail="Usuário não encontrado")
        if user.id == 1: 
             raise HTTPException(status_code=400, detail="Não é possível deletar o Admin Mestre.")
        await db.delete(user)
        await db.commit()
        return {"ok": True, "message": "Usuário deletado"}
    except HTTPException as he:
        raise he
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Erro ao deletar usuário")

@app.put("/users/{user_id}/role")
async def update_user_role(user_id: int, payload: UserUpdateRole, db: AsyncSession = Depends(get_db)):
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
        raise HTTPException(status_code=500, detail="Erro ao atualizar usuário")

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
    
@app.post("/correct-essay")
async def correct_essay(req: EssayCorrectionRequest):
    try:
        result = ensure_dict(await agent_essay_corrector(req))
        return result
    except Exception as e:
        print(f"Erro na correção: {e}")
        raise HTTPException(status_code=500, detail="API de correção indisponível.")
    
@app.post("/generate-essay")
async def generate_essay_endpoint(req: GenerateEssayRequest):
    try:
        mod_obj = {"titulo": req.aula_titulo}
        result = ensure_dict(await agent_essay_generator(mod_obj, req.area, req.lesson_content, req.model, req.api_key))
        return result
    except Exception as e:
        print(f"Erro na geração da discursiva: {e}")
        raise HTTPException(status_code=500, detail="Falha ao gerar nova discursiva.")
    
@app.post("/chat")
async def chat_tutor(req: ChatMessageRequest):
    try:
        result = ensure_dict(await agent_lesson_tutor(req))
        return result
    except Exception as e:
        print(f"Erro no chat: {e}")
        raise HTTPException(status_code=500, detail="A IA do Tutor falhou ao processar a resposta.")
    
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)