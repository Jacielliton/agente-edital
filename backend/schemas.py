"""
Schemas de entrada e saida da API (Pydantic).

O que a API RECEBE e o que ela DEVOLVE. Nao confundir com models.py, que
descreve as tabelas: um schema pode juntar campos de varias tabelas, esconder
campos (hashed_password nunca sai daqui) ou existir sem tabela nenhuma.

Ordem preservada do main.py de proposito: ha schema que referencia outro
definido antes dele.
"""

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict

class SimuladoTopicRequest(BaseModel):
    area: str
    topico: str
    conteudo: str
    model: Optional[str] = None
    api_key: Optional[str] = None
    qtd_questoes: Optional[int] = 5
    nivel: Optional[Literal["Iniciante", "Normal", "Avançado", "Expert"]] = "Normal"
    formato: Optional[str] = "Múltipla Escolha"


class CommissionActionRequest(BaseModel):
    action: str
    amount: float
    description: Optional[str] = None


class CommissionHistoryResponse(BaseModel):
    id: int
    amount: float               # SEMPRE a variacao do saldo (negativa num pagamento)
    action_type: str
    description: Optional[str] = None
    created_at: datetime
    # Lancamentos antigos nao tem estes dois: ficam None, e a tela mostra "—".
    saldo_anterior: Optional[float] = None
    saldo_novo: Optional[float] = None
    model_config = ConfigDict(from_attributes=True)


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
    # None  -> comportamento historico (simulado da aula substitui o anterior)
    # False -> sempre grava um registro novo (ferramentas por materia: cada
    #          sessao e um caderno inedito, e o historico precisa acumular para
    #          a tendencia e o grafico dos ultimos simulados fazerem sentido)
    substituir: Optional[bool] = None


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
    max_uses: int = 0                      # 0 = ilimitado
    expires_at: Optional[datetime] = None  # None = sem validade


class UserSettingsUpdate(BaseModel):
    api_key: Optional[str] = None
    preferred_model: Optional[str] = None


class UserSettingsResponse(BaseModel):
    api_key: Optional[str] = None
    preferred_model: Optional[str] = None
    # Acrescentados em 14/09/2026 para a tela parar de mandar o assinante
    # Plus/Pro configurar uma chave que o plano dele ja cobre.
    plan_type: Optional[str] = None
    # ativa | bloqueada | fora_do_plano | sem_cota | sem_chave_no_sistema
    ia_do_plano: Optional[str] = None
    ia_motivo: Optional[str] = None
    tokens_used: Optional[int] = None
    token_limit: Optional[int] = None
    tokens_restantes: Optional[int] = None


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
    # Preenchido = conta excluida logicamente (tinha historico de comissao).
    # Continua aparecendo na lista do admin, para dar como auditar.
    deleted_at: Optional[datetime] = None
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


class UserUpdateRole(BaseModel):
    role: str


class AIConfigSchema(BaseModel):
    model: str
    # Opcional e com sentido definido: vazio ou ausente = NAO mexer na chave.
    # O painel carrega o formulario sem a chave (a leitura nao a devolve), e
    # sem isto todo salvamento de "temperatura" apagaria a chave junto.
    api_key: Optional[str] = None
    # O unico jeito de remover a chave. Antes nao havia nenhum: o
    # `if payload.api_key:` da rota tratava string vazia como "nao mexer",
    # entao trocar a chave funcionava e tirar a chave era impossivel.
    limpar_api_key: bool = False
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


class PasswordUpdate(BaseModel):
    current_password: str
    new_password: str


class PaymentRequest(BaseModel):
    email: str
    plano: str
    coupon_code: Optional[str] = None


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
