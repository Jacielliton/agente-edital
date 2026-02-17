# backend/main.py
import os
import uvicorn
import json
import re
import asyncio
from datetime import datetime
from typing import List, Dict, Any, Optional, AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict
from dotenv import load_dotenv

# Imports de Banco de Dados (SQLAlchemy + Asyncpg)
from sqlalchemy import Column, Integer, String, DateTime, JSON, select, desc
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base

# Cliente OpenAI/OpenRouter
from openai import OpenAI

# ============================================================================
# 1. CONFIGURAÇÃO DE AMBIENTE E BANCO DE DADOS
# ============================================================================

# Carrega variáveis de ambiente do arquivo .env
load_dotenv(override=True)
ENV_FILE_PATH = os.getenv("ENV_FILE_PATH", ".env")

# String de conexão com o banco (PostgreSQL)
# OBS: Porta padrão ajustada para 5445 para evitar conflitos locais, conforme docker-compose
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:senha123@localhost:5445/agente_edital")

# Configuração do Engine SQLAlchemy (Async)
engine = create_async_engine(DATABASE_URL, echo=False)

# SessionMaker Moderno para conexões assíncronas
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False
)

Base = declarative_base()

# Dependência para injetar a sessão do banco nos endpoints
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session

# --- MODELO DE BANCO DE DADOS (ORM) ---
class StoredPlan(Base):
    __tablename__ = "study_plans"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)  # Ex: "Analista INSS"
    area = Column(String)               # Ex: "TI", "Direito"
    content = Column(JSON)              # O JSON completo gerado
    created_at = Column(DateTime, default=datetime.utcnow)

# ============================================================================
# 2. CLIENTE OPENROUTER / LLM
# ============================================================================

_CLIENT = None
_CLIENT_KEY = None

def get_openrouter_client():
    global _CLIENT, _CLIENT_KEY

    key = os.getenv("OPENROUTER_API_KEY")
    if not key:
        return None

    if _CLIENT is None or _CLIENT_KEY != key:
        _CLIENT_KEY = key
        _CLIENT = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=key,
        )

    return _CLIENT

DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "openrouter/aurora-alpha")
AVAILABLE_MODELS = [m.strip() for m in os.getenv("AVAILABLE_MODELS", "").split(",") if m.strip()]

# ============================================================================
# 3. FASTAPI SETUP & LIFESPAN
# ============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Gerencia o ciclo de vida da aplicação.
    Tenta conectar ao banco na inicialização. Se falhar, avisa mas não derruba o app.
    """
    # --- STARTUP ---
    print("\n🚀 Inicializando Professor AI Backend...")
    print(f"📡 Tentando conectar ao banco de dados...")
    
    try:
        # Tenta criar tabelas para verificar a conexão
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        print("✅ Banco de Dados conectado com sucesso na porta configurada.\n")
    except Exception as e:
        print(f"\n⚠️  AVISO CRÍTICO DE BANCO DE DADOS ⚠️")
        print(f"Não foi possível conectar ao PostgreSQL em: {DATABASE_URL}")
        print(f"Erro detalhado: {e}")
        print(" -> O servidor continuará rodando, mas salvar/carregar histórico irá falhar.")
        print(" -> Verifique se 'docker-compose up -d' foi executado.\n")
    
    yield
    
    # --- SHUTDOWN ---
    print("🛑 Encerrando conexão com o banco de dados...")
    await engine.dispose()

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# 4. SCHEMAS (PYDANTIC)
# ============================================================================

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

@app.post("/plans", status_code=201)
async def save_plan(plan: SavePlanRequest, db: AsyncSession = Depends(get_db)):
    """Salva o JSON gerado no banco de dados Postgres."""
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
    """Lista o histórico de aulas geradas."""
    try:
        result = await db.execute(select(StoredPlan).order_by(desc(StoredPlan.created_at)))
        return result.scalars().all()
    except Exception as e:
        print(f"Erro DB: {e}")
        return []

@app.get("/plans/{plan_id}")
async def get_plan(plan_id: int, db: AsyncSession = Depends(get_db)):
    """Recupera o JSON completo de uma aula específica pelo ID."""
    try:
        result = await db.execute(select(StoredPlan).filter(StoredPlan.id == plan_id))
        plan = result.scalars().first()
        if not plan: raise HTTPException(status_code=404, detail="Plano não encontrado")
        return plan.content
    except Exception as e:
        print(f"Erro DB: {e}")
        raise HTTPException(status_code=500, detail="Erro ao buscar dados.")

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
    """Force expected types in lesson payload to protect frontend."""
    if not isinstance(lesson, dict):
        return {}

    lesson["topicos_explicados"] = ensure_list(lesson.get("topicos_explicados"))
    lesson["micro_mecanismos"] = ensure_list(lesson.get("micro_mecanismos"))
    lesson["criterios_de_decisao"] = ensure_list(lesson.get("criterios_de_decisao"))
    lesson["validacoes_e_checkpoints"] = ensure_list(lesson.get("validacoes_e_checkpoints"))
    lesson["confusoes_classicas_de_prova"] = ensure_list(lesson.get("confusoes_classicas_de_prova"))
    lesson["erros_comuns"] = ensure_list(lesson.get("erros_comuns"))
    lesson["checklist_de_revisao"] = ensure_list(lesson.get("checklist_de_revisao"))
    lesson["limites_do_escopo"] = ensure_list(lesson.get("limites_do_escopo"))

    aula_teorica = lesson.get("aula_teorica")
    if not isinstance(aula_teorica, dict):
        aula_teorica = {}
        lesson["aula_teorica"] = aula_teorica
    # strings expected
    for k in ["definicao_chave", "como_funciona", "comparativo", "exemplo_pratico"]:
        aula_teorica[k] = ensure_str(aula_teorica.get(k))

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

async def get_json_response(prompt: str, model_name: str, temp: float = 0.25) -> Any:
    """Call OpenRouter and return JSON with retries."""
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

            if "429" in last_error:
                print("⚠️ Rate Limit detectado. Aguardando...")
                await asyncio.sleep(6 + (tentativa * 4))
            else:
                await asyncio.sleep(2 + (tentativa * 2))

            tentativa += 1

    if last_error and "429" in last_error:
        raise HTTPException(
            status_code=429,
            detail="Limite de uso do modelo atingido (Rate Limit). Por favor, escolha outro modelo no menu.",
        )
    raise HTTPException(status_code=503, detail=f"O modelo falhou após várias tentativas. Erro: {last_error}")

# ============================================================================
# 7. AGENTS
# ============================================================================

async def agent_architect(text: str, model: str) -> Dict[str, Any]:
    """
    Architect now returns modules as OBJECTS (not only strings),
    with anchor detection and canonical expected subtopics.
    """
    print("--- 🏛️  Arquiteto: Analisando e estruturando o edital... ---")
    prompt = f"""
Você é um analista de edital. Seu trabalho é estruturar o conteúdo para estudo.

TEXTO BASE (assunto/edital):
---
{clamp_text(text, 12000)}
---

TAREFAS:
1) Identificar "area_conhecimento".
2) Criar "modulos" como unidades de estudo.
3) Detectar ÂNCORAS: nomes próprios e referenciais que implicam uma estrutura interna padrão.
   Exemplos de âncoras (genéricas, não só TI):
   - Framework/metodologia (ex.: ITIL v4, COBIT 2019, PMBOK 7, SCRUM, Kanban, DAMA-DMBOK)
   - Norma/padrão (ex.: ISO 27001, ISO 31000, NIST, ABNT NBR)
   - Lei (ex.: Lei nº X/AAAA, Decreto, Constituição)
   - Modelos/arquiteturas reconhecidas (ex.: CRISP-DM, modelos de NLP, etc.)
4) Para cada âncora detectada, gere "subtopicos" com "origem":
   - "edital" (se aparece explicitamente)
   - "canonico" (estrutura padrão do assunto citado e cobrada em prova)
5) Em "regra_de_escopo", indique até onde aprofundar (ex.: estrutura + correlação entre partes).

REGRAS:
- Se o texto só disser “(Nome do framework/lei/norma)”, você DEVE expandir em subtopicos com origem "canonico".
- Não invente bibliografia.

RETORNE APENAS JSON:
{{
  "area_conhecimento": "...",
  "resumo_objetivo": "...",
  "modulos": [
    {{
      "titulo": "...",
      "tipo": "conceito|framework|norma|lei|metodologia|modelo",
      "ancoras_detectadas": ["..."],
      "subtopicos": [
        {{
          "nome": "...",
          "origem": "edital|canonico",
          "nota": "por que isso é necessário para estudar o tópico"
        }}
      ],
      "regra_de_escopo": "..."
    }}
  ]
}}
"""
    return await get_json_response(prompt, model, temp=0.2)


async def agent_researcher(modulo_obj: Dict[str, Any], area: str, full_text: str, model: str) -> Dict[str, Any]:
    """
    Researcher receives module OBJECT (anchors + canonical subtopics) and returns:
    structural map + correlations + canonical terms allowed.
    """
    titulo = modulo_obj.get("titulo", "Módulo")
    print(f"--- 🔎 Pesquisador: Investigando '{titulo}' (âncoras + estrutura)... ---")

    modulo_json = json.dumps(modulo_obj, ensure_ascii=False)

    prompt = f"""
Você é Pesquisador. Sua função é montar um DOSSIÊ profundo para estudo.

MÓDULO (do Arquiteto):
{modulo_json}

TEXTO BASE (assunto/edital):
---
{clamp_text(full_text, 12000)}
---

REGRA-CHAVE:
Se houver "ancoras_detectadas" (lei/norma/framework/metodologia/modelo), você DEVE:
1) fornecer a estrutura interna canônica (mapa_estrutural)
2) explicar como as partes se relacionam (correlacoes_entre_partes)
3) listar perguntas/pegadinhas clássicas de prova sobre a estrutura

CONTROLE DE ALUCINAÇÃO:
- Tudo deve vir marcado com origem: "edital" ou "canonico".
- "canonico" = estrutura padrão amplamente reconhecida do assunto citado (capítulos, pilares, domínios, dimensões etc).
- Se houver variações, declare em "variacoes_conhecidas" (não trate como absoluto).

RETORNE APENAS JSON:
{{
  "termos_do_edital": ["..."],
  "termos_canonicos": ["termos estruturais canônicos de âncoras (permitidos para aula)"],
  "ancoras": ["..."],
  "mapa_estrutural": [
    {{
      "componente": "parte/pilar/camada/dominio",
      "papel": "o que faz",
      "origem": "canonico|edital",
      "conecta_com": ["outro componente", "..."]
    }}
  ],
  "correlacoes_entre_partes": ["Como A influencia B", "Como B depende de C"],
  "subitens_map": [
    {{
      "subitem": "subtópico do módulo (edital ou canônico)",
      "definicao_literal_no_edital": "se existir; senão 'não consta'",
      "mecanismo_interno": ["por que funciona", "o que acontece por trás", "o que quebra"],
      "o_que_cai_em_prova": ["..."],
      "criterios_e_decisoes": ["..."],
      "limites_condicoes": ["..."],
      "comparacoes_tipicas": ["..."],
      "nivel_cobranca": "conceitual|aplicado|pegadinha",
      "pegadinhas": ["..."],
      "evidencias": ["trecho literal 1 (>=12 palavras)", "trecho literal 2 (>=12 palavras)"],
      "origem": "edital|canonico"
    }}
  ],
  "mecanismos_chave": [
    {{
      "conceito": "conceito citado no edital ou canônico do framework",
      "mecanismo_interno": ["..."],
      "limite": "...",
      "evidencia": "trecho do edital ou nota canônica"
    }}
  ],
  "confusoes_classicas_de_prova": ["..."],
  "perguntas_tipicas_de_prova": ["..."],
  "variacoes_conhecidas": ["..."],
  "lacunas_no_texto": ["..."],
  "exemplos_de_mercado_nao_citados_no_edital": ["NÃO-USAR-NA-AULA: ..."]
}}
"""
    return await get_json_response(prompt, model, temp=0.2)


async def agent_professor(modulo_obj: Dict[str, Any], area: str, research_data: Dict[str, Any], model: str) -> Dict[str, Any]:
    """
    Professor receives module OBJECT.
    If there is structural map/correlations, must explain division and relations.
    """
    titulo = modulo_obj.get("titulo", "Módulo")
    print(f"--- 👨‍🏫 Professor: Escrevendo aula profunda de '{titulo}'... ---")

    research_summary = json.dumps(research_data, ensure_ascii=False)
    modulo_json = json.dumps(modulo_obj, ensure_ascii=False)

    prompt = f"""
Atue como um Professor Especialista em {area} para concurso.

MÓDULO (estrutura do Arquiteto):
{modulo_json}

BASE ÚNICA (dossiê do Pesquisador):
{research_summary}

MISSÃO:
Criar uma AULA TÉCNICA e PROFUNDA sobre "{titulo}", cobrindo CADA item de "subitens_map".

REGRAS RÍGIDAS:
1) Não invente conteúdo fora do dossiê.
2) Não use "exemplos_de_mercado_nao_citados_no_edital" na aula.
3) Se existir "lacunas_no_texto", explique a lacuna e NÃO complete com invenção.
4) Profundidade = mecanismo + decisões + validação (não apenas listar etapas).
5) Se existir "mapa_estrutural" ou "correlacoes_entre_partes", VOCÊ DEVE explicar a divisão e como as partes se conectam.

OBRIGATÓRIO EM "como_funciona":
- conter exatamente 6 seções numeradas com estes títulos:
  1) Visão de mecanismo
  2) Componentes/partes envolvidas
  3) Fluxo passo a passo (com POR QUÊ de cada passo)
  4) Regras/condições e exceções (corner cases)
  5) Trade-offs/impactos (performance, custo, risco)
  6) Pegadinhas típicas de prova (ligadas ao edital)
- incluir no mínimo 2 citações literais: Trecho do edital: "..."
- no Fluxo, cada passo deve conter:
  O que acontece: ...
  Por quê: ...
  Critério: ...
  Validação: ...
  Se remover: ...
- incluir ao final 3+ itens "Falha comum:" e 2+ "Cenário de falha:" (curtos e concretos)
- em pelo menos 2 seções incluir "Porque:" para explicitar causalidade

Retorne APENAS JSON:
{{
  "titulo": "{titulo}",
  "visao_geral": "2-4 linhas objetivas",
  "topicos_explicados": [
    {{
      "topico": "subitem fiel",
      "explicacao": "6-14 linhas (mecanismo, critérios, limites, validações)",
      "exemplo_pratico": "exemplo direto e verificável",
      "pegadinha_tipica": "pegadinha ligada ao edital"
    }}
  ],
  "por_que_funciona": [
    "intuição técnica/estatística (ancorada no dossiê)",
    "cadeia causa→efeito (por que a técnica entrega resultado)",
    "limitação estrutural que afeta a confiabilidade"
  ],
  "micro_mecanismos": [
    "Mecanismo 1 (ligado a subitem X): ...",
    "Mecanismo 2 (ligado a subitem Y): ..."
  ],
  "criterios_de_decisao": [
    {{ "decisao": "X vs Y", "criterios": ["..."], "risco_de_erro": "..." }}
  ],
  "aula_teorica": {{
    "definicao_chave": "Definição técnica precisa (1-3 linhas).",
    "como_funciona": "Texto longo com as 6 seções numeradas e detalhadas.",
    "comparativo": "Comparação técnica relevante (2-10 linhas) — apenas se suportado no dossiê.",
    "exemplo_pratico": "**Caso de Uso 1:** ...\\n\\n**Caso de Uso 2:** ..."
  }},
  "validacoes_e_checkpoints": [
    {{ "checkpoint": "Como validar que o passo foi bem feito", "como_validar": ["..."] }}
  ],
  "confusoes_classicas_de_prova": ["..."],
  "erros_comuns": ["..."],
  "checklist_de_revisao": ["..."],
  "ponto_focal_prova": "O que costuma cair em prova sobre ESTE assunto específico.",
  "limites_do_escopo": ["Apenas o que é claramente fora do edital."]
}}
"""
    return await get_json_response(prompt, model, temp=0.25)


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
  Porque: ...
  Limitação: ...
  Cenário de falha: ...
- No "Fluxo passo a passo", cada passo deve conter:
  O que acontece + Por quê + Critério + Validação + Se remover
- Incluir 4+ trade-offs e 4+ corner cases e 5+ pegadinhas.

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


async def agent_strategist(modulos_data: List[Dict[str, Any]], area: str, model: str) -> Dict[str, Any]:
    print("--- 🎯 Estrategista: Consolidando plano final... ---")
    titulos = [m.get("titulo") for m in modulos_data if isinstance(m, dict) and m.get("titulo")]
    prompt = f"""
Crie um plano de estudos objetivo para: {titulos}.
Foco: {area}. Sem inventar bibliografia específica.

Retorne APENAS JSON:
{{ "plano_estudo": "Texto estruturado do plano." }}
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

        final_aulas: List[Dict[str, Any]] = []

        # 2) Sequential pipeline
        for idx, mod in enumerate(modules):
            titulo = mod.get("titulo", f"Módulo {idx+1}")
            print(f"\n➡️ Processando Módulo {idx + 1}: {titulo}")

            research = await agent_researcher(mod, area, request.text, selected_model)
            await asyncio.sleep(1)

            lesson = await agent_professor(mod, area, research, selected_model)
            lesson = sanitize_lesson(lesson)
            await asyncio.sleep(1)

            # 3) Validator + deepener if needed
            try:
                como = (lesson.get("aula_teorica") or {}).get("como_funciona", "")
                report = validate_como_funciona(como)

                allowed_terms = normalize_terms(research.get("termos_do_edital")) + normalize_terms(research.get("termos_canonicos"))
                suspects = detect_suspect_tools(como, allowed_terms)

                if (not report["ok"]) or suspects:
                    print("⚠️ 'como_funciona' superficial ou termos suspeitos.")
                    print(f"   - validação: {report}")
                    if suspects:
                        print(f"   - termos suspeitos: {suspects}")

                    deep = await agent_deepener_como_funciona(mod, area, research, lesson, selected_model)
                    new_como = ensure_str(deep.get("como_funciona"))

                    if "aula_teorica" not in lesson or not isinstance(lesson["aula_teorica"], dict):
                        lesson["aula_teorica"] = {}
                    lesson["aula_teorica"]["como_funciona"] = new_como
                    lesson = sanitize_lesson(lesson)
                    await asyncio.sleep(1)
            except Exception:
                pass

            glossary_data = await agent_glossarist(mod, area, lesson, selected_model)
            await asyncio.sleep(1)

            exam = await agent_examiner(mod, area, lesson, selected_model)
            await asyncio.sleep(1)

            quiz_list = sanitize_quiz(exam.get("quiz") if isinstance(exam, dict) else [])

            full_module = {
                **lesson,
                "glosario": ensure_list(glossary_data.get("glossario")) if isinstance(glossary_data, dict) else [],
                "quiz": quiz_list,
                # useful for frontend/debug
                "meta_modulo": mod,
                "meta_research": {
                    "ancoras": ensure_list(research.get("ancoras")),
                    "mapa_estrutural": ensure_list(research.get("mapa_estrutural")),
                    "correlacoes_entre_partes": ensure_list(research.get("correlacoes_entre_partes")),
                },
            }
            final_aulas.append(full_module)

            await asyncio.sleep(2)

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
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)