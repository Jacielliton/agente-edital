"""
Tabelas do banco (SQLAlchemy ORM).

Saiu do main.py para que qualquer coisa que precise das tabelas — Alembic,
scripts de manutencao, testes — possa importa-las sem carregar junto o
FastAPI, o cliente da OpenAI, o SDK do Mercado Pago e as 57 rotas.

A estrutura declarada aqui pode divergir da que o banco tem de fato:
`create_all` cria tabela que falta, mas nao adiciona coluna que falta.
Para conferir:  python backend/mapear_banco.py --so-diff
"""

from datetime import datetime

from sqlalchemy import (
    JSON, Boolean, Column, DateTime, Float, ForeignKey, Integer, String,
    UniqueConstraint,
)

from database import Base

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
    # SET NULL: a aula sobrevive ao dono apagado, vira aula sem dono.
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class PlanShare(Base):
    __tablename__ = "plan_shares"
    # Sem este UNIQUE dava para compartilhar a mesma aula duas vezes com a
    # mesma pessoa, criando duas linhas identicas.
    __table_args__ = (UniqueConstraint("plan_id", "user_email", name="uq_plan_shares_plano_email"),)

    id = Column(Integer, primary_key=True, index=True)
    # CASCADE: compartilhamento de uma aula apagada nao faz sentido sozinho.
    plan_id = Column(Integer, ForeignKey("study_plans.id", ondelete="CASCADE"), index=True)
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
    # SET NULL: o indicado continua existindo, so perde a referencia.
    referred_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    commission_balance = Column(Float, default=0.0)
    
    # --- NOVOS CAMPOS IA E ASSINATURA ---
    plan_type = Column(String, default="Simples") # Simples, Plus, Pro
    tokens_used = Column(Integer, default=0)
    token_limit = Column(Integer, default=0)
    token_reset_date = Column(DateTime, nullable=True)
    ai_blocked = Column(Boolean, default=False)

    # EXCLUSAO LOGICA. Conta com historico financeiro (commission_history) nao
    # e apagada de verdade: seria apagar lancamento contabil junto. Ela recebe
    # deleted_at + is_active=False e some do sistema, mas o id continua
    # existindo para o extrato de comissao continuar apontando para alguem.
    deleted_at = Column(DateTime, nullable=True)


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
    # CASCADE: log de consumo de uma conta que sumiu nao serve para nada.
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    plan_type = Column(String)
    tokens_prompt = Column(Integer, default=0)
    tokens_completion = Column(Integer, default=0)
    tokens_total = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class CommissionHistory(Base):
    __tablename__ = "commission_history"
    id = Column(Integer, primary_key=True, index=True)
    # SEM ForeignKey, e de proposito — nao e esquecimento.
    # CASCADE apagaria lancamento contabil junto com a conta; SET NULL deixaria
    # lancamento sem dono. A saida foi a exclusao logica em users.deleted_at:
    # o usuario nunca sai da tabela, entao este user_id nunca fica orfao.
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


class ProcessedPayment(Base):
    __tablename__ = "processed_payments"
    payment_id = Column(String, primary_key=True, index=True)
    processed_at = Column(DateTime, default=datetime.utcnow)
