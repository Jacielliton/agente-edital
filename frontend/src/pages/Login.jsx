import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { UserPlus, LogIn, AlertCircle, CheckCircle, Brain, FileText, MessageSquare, Sparkles, Zap, Ticket, ArrowRight, ArrowLeft } from 'lucide-react';

// 1. Dicionário de preços base para cálculo dinâmico
const PLAN_PRICES = {
  diario_teste: 1.90,
  mensal_simples: 49.90,
  trimestral_simples: 119.90,
  semestral_simples: 199.90,
  mensal_plus: 99.90,
  trimestral_plus: 159.90,
  semestral_plus: 239.90,
  trimestral_pro: 189.90,
  semestral_pro: 269.90,
};

export default function Login() {
  const location = useLocation();
  const [isRegistering, setIsRegistering] = useState(false); 
  const [registrationStep, setRegistrationStep] = useState(1); // Nova variável para controle de etapas
  const [selectedPlan, setSelectedPlan] = useState('mensal_simples');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState(''); 
  
  const refCodeUrl = new URLSearchParams(location.search).get('ref');
  const [referralCode, setReferralCode] = useState(refCodeUrl || '');
  
  const [couponCode, setCouponCode] = useState('');
  
  // 2. Novos estados para gerenciar o desconto na interface
  const [discount, setDiscount] = useState(0); 
  const [discountType, setDiscountType] = useState('fixed'); 
  const [couponMessage, setCouponMessage] = useState({ text: '', type: '' });
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const status = queryParams.get('status');
    
    if (status === 'approved') {
      setSuccessMsg('🎉 Seu pagamento foi aprovado com sucesso! O sistema está a processar a sua liberação. Tente fazer login em instantes.');
    } else if (status === 'pending') {
      setSuccessMsg('⏳ Seu pagamento está pendente (Aguardando compensação). Assim que compensado, seu acesso será liberado.');
    }
  }, [location]);

  const toggleMode = () => {
    setIsRegistering(!isRegistering);
    setRegistrationStep(1); // Reseta a etapa ao alternar modo
    setError('');
    setSuccessMsg('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setCouponCode('');
    setDiscount(0);
    setCouponMessage({ text: '', type: '' });
  };

  const handleNextStep = () => {
    // Validações antes de passar para a etapa do plano
    if (!email || !password || !confirmPassword) {
      setError("Por favor, preencha todos os campos antes de continuar.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    setError('');
    setRegistrationStep(2);
  };

  // 3. Função para validar o cupom no backend
  const handleApplyCoupon = async () => {
    if (!couponCode) {
      setCouponMessage({ text: 'Digite um código de cupom.', type: 'error' });
      return;
    }
    
    setIsApplyingCoupon(true);
    setCouponMessage({ text: '', type: '' });
    
    try {
      const res = await fetch(`${API_URL}/coupons/validate/${couponCode}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || 'Cupom inválido ou expirado.');
      }

      setDiscount(data.discount_value);
      setDiscountType(data.discount_type || 'fixed');
      setCouponMessage({ text: 'Cupom aplicado com sucesso!', type: 'success' });
      
    } catch (err) {
      setDiscount(0);
      setCouponMessage({ text: err.message, type: 'error' });
    } finally {
      setIsApplyingCoupon(false);
    }
  };

  // 4. Função auxiliar para renderizar o preço com ou sem desconto
  const renderPrice = (planKey, defaultColor) => {
    const basePrice = PLAN_PRICES[planKey];
    let finalPrice = basePrice;
    
    if (discount > 0) {
      if (discountType === 'percent') {
        finalPrice = basePrice - (basePrice * (discount / 100));
      } else {
        finalPrice = Math.max(0, basePrice - discount);
      }
    }

    const hasDiscount = discount > 0 && finalPrice < basePrice;

    return (
      <div style={{ textAlign: 'right', minWidth: '80px' }}>
        {hasDiscount && (
          <span style={{ textDecoration: 'line-through', color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>
            R$ {basePrice.toFixed(2).replace('.', ',')}
          </span>
        )}
        <strong style={{ color: hasDiscount ? '#10b981' : defaultColor, fontSize: '0.95rem' }}>
          R$ {finalPrice.toFixed(2).replace('.', ',')}
        </strong>
      </div>
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    try {
      if (isRegistering) {
        if (password !== confirmPassword) {
          throw new Error("As senhas não coincidem.");
        }

        const res = await fetch(`${API_URL}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            email, 
            password,
            role: "user",
            referral_code: referralCode
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.detail || "Erro ao criar conta.");
        }

        const payRes = await fetch(`${API_URL}/payments/create-preference`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            email, 
            plano: selectedPlan,
            coupon_code: discount > 0 ? couponCode : null 
          })
        });
        
        const payData = await payRes.json();
        if (!payRes.ok) throw new Error(payData.detail || "Conta criada, mas falhou ao gerar cobrança.");

        window.location.href = payData.init_point;
        return;

      } else {
        await login(email, password);
        navigate('/');
      }
    } catch (err) {
      if (err.message === "CONTA_EXPIRADA") {
        setError("CONTA_EXPIRADA");
      } else {
        setError(err.message || "Erro ao fazer login.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh', padding: '2rem 1rem' }}>
      
      <style>
        {`
          @keyframes fadeSlideUp {
            0% { opacity: 0; transform: translateY(30px); }
            100% { opacity: 1; transform: translateY(0); }
          }
          @keyframes fadeSlideRight {
            0% { opacity: 0; transform: translateX(-30px); }
            100% { opacity: 1; transform: translateX(0); }
          }
          @keyframes floatIcon {
            0% { transform: translateY(0px); }
            50% { transform: translateY(-5px); }
            100% { transform: translateY(0px); }
          }
          .login-wrapper {
            display: flex;
            width: 100%;
            max-width: 1050px;
            gap: 3rem;
            align-items: flex-start;
            justify-content: space-between;
            flex-wrap: wrap;
          }
          .login-info {
            flex: 1;
            min-width: 300px;
            animation: fadeSlideRight 0.8s ease-out;
          }
          .login-form-container {
            flex: 1;
            min-width: 320px;
            max-width: 480px;
            animation: fadeSlideUp 0.8s ease-out 0.2s backwards;
          }
          .feature-item {
            display: flex;
            align-items: flex-start;
            gap: 15px;
            margin-bottom: 1.5rem;
            padding: 15px;
            border-radius: 12px;
            background: var(--card-bg);
            border: 1px solid var(--border);
            box-shadow: var(--shadow-sm);
            transition: transform 0.3s ease;
          }
          .feature-item:hover {
            transform: translateY(-3px);
            border-color: var(--primary);
          }
          .feature-icon {
            background: var(--primary-light);
            color: var(--primary);
            padding: 10px;
            border-radius: 10px;
            animation: floatIcon 4s ease-in-out infinite;
          }
          .plan-group-title {
            font-size: 0.8rem;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--text-muted);
            margin: 12px 0 6px 0;
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .plan-option-card {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 12px;
            border-radius: 8px;
            cursor: pointer;
            background: var(--input-bg);
            transition: all 0.2s ease;
          }
        `}
      </style>

      <div className="login-wrapper">
        
        {/* LADO ESQUERDO: Informações e Recursos */}
        <div className="login-info">
          <h1 style={{ color: 'var(--heading-color)', fontSize: '2.5rem', marginBottom: '1rem', lineHeight: '1.2' }}>
            Domine o seu edital com Inteligência Artificial.
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', marginBottom: '2rem' }}>
            Transforme qualquer edital num plano de estudos completo, com aulas aprofundadas, simulados e correções automáticas padrão CEBRASPE.
          </p>

          <div className="feature-item">
            <div className="feature-icon"><FileText size={24} /></div>
            <div>
              <h3 style={{ margin: '0 0 5px 0', color: 'var(--text-main)' }}>Aulas e Simulados Inéditos</h3>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Geração de teoria, analogias e baterias de questões voltadas para o seu concurso.</p>
            </div>
          </div>

          <div className="feature-item" style={{ animationDelay: '0.2s' }}>
            <div className="feature-icon"><MessageSquare size={24} /></div>
            <div>
              <h3 style={{ margin: '0 0 5px 0', color: 'var(--text-main)' }}>Tutor IA e Correção de Discursivas</h3>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Um professor particular 24h e um corretor implacável para avaliar as suas redações.</p>
            </div>
          </div>

          <div className="feature-item" style={{ animationDelay: '0.4s' }}>
            <div className="feature-icon"><Brain size={24} /></div>
            <div>
              <h3 style={{ margin: '0 0 5px 0', color: 'var(--text-main)' }}>Mapas Mentais Dinâmicos</h3>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Geração automática de estruturas Mermaid para visualização rápida da matéria.</p>
            </div>
          </div>
        </div>

        {/* LADO DIREITO: Formulário de Login/Cadastro */}
        <div className="login-form-container">
          <div className="card" style={{ padding: '2.5rem 2rem', background: 'var(--card-bg)', borderColor: 'var(--border)' }}>
            
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ color: 'var(--heading-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', margin: '0 0 10px 0' }}>
                {isRegistering ? <UserPlus size={28} color="var(--primary)" /> : <LogIn size={28} color="var(--primary)" />}
                {isRegistering 
                  ? (registrationStep === 1 ? 'Criar Nova Conta (1/2)' : 'Escolha o Plano (2/2)') 
                  : 'Acesso ao Sistema'}
              </h2>
              <p className="muted" style={{ margin: 0 }}>
                {isRegistering 
                  ? (registrationStep === 1 ? 'Preencha os dados abaixo para iniciar.' : 'Selecione a sua assinatura para concluir.')
                  : 'Bem-vindo de volta! Insira as suas credenciais.'}
              </p>
            </div>

            {successMsg && (
              <div className="status" style={{ background: 'var(--success-bg)', color: 'var(--success-text)', borderColor: 'var(--success-text)', marginBottom: '1.5rem' }}>
                <CheckCircle size={18} /> {successMsg}
              </div>
            )}
            
            {error && error === "CONTA_EXPIRADA" ? (
              <div className="error" style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', background: 'rgba(255, 193, 7, 0.1)', color: '#d39e00', borderColor: '#ffeeba', padding: '15px', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertCircle size={18} /> 
                  <strong>Conta Inativa ou Expirada!</strong>
                </div>
                <p style={{ margin: 0, fontSize: '0.9rem', textAlign: 'center' }}>O seu período de acesso terminou.</p>
                <button onClick={() => navigate('/planos')} className="btn primary" style={{ marginTop: '10px', padding: '8px 16px', background: '#28a745', borderColor: '#28a745', color: '#fff' }}>
                  Ativar Conta (Renovar)
                </button>
              </div>
            ) : error ? (
              <div className="error" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--error-bg)', color: 'var(--error-text)', borderColor: 'var(--error-text)' }}>
                <AlertCircle size={18} /> {error}
              </div>
            ) : null}

            <form onSubmit={handleSubmit}>
              
              {/* === ETAPA 1: LOGIN OU DADOS DA CONTA === */}
              {(!isRegistering || (isRegistering && registrationStep === 1)) && (
                <div style={{ animation: 'fadeSlideRight 0.3s ease-out' }}>
                  <div className="row">
                    <label className="label">E-mail de Acesso</label>
                    <input 
                      className="input" 
                      type="email" 
                      value={email} 
                      onChange={(e) => setEmail(e.target.value)} 
                      placeholder="aluno@exemplo.com"
                      required={!isRegistering || registrationStep === 1}
                    />
                  </div>

                  <div className="row">
                    <label className="label">Senha</label>
                    <input 
                      className="input" 
                      type="password" 
                      value={password} 
                      onChange={(e) => setPassword(e.target.value)} 
                      placeholder="••••••••"
                      required={!isRegistering || registrationStep === 1}
                    />
                  </div>

                  {isRegistering && (
                    <div className="row">
                      <label className="label">Confirmar Senha</label>
                      <input 
                        className="input" 
                        type="password" 
                        value={confirmPassword} 
                        onChange={(e) => setConfirmPassword(e.target.value)} 
                        placeholder="Repita a sua senha"
                        required={registrationStep === 1}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* === ETAPA 2: ESCOLHER PLANO E CUPOM === */}
              {isRegistering && registrationStep === 2 && (
                <div style={{ animation: 'fadeSlideUp 0.3s ease-out' }}>
                  <div style={{ marginBottom: '1.5rem' }}>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '250px', overflowY: 'auto', paddingRight: '4px' }}>
                      
                      {/* CATEGORIA 1: PLANO SIMPLES */}
                      <span className="plan-group-title">Plano Simples (Usa Chave Pessoal)</span>
                      <label className="plan-option-card" style={{ border: selectedPlan === 'diario_teste' ? '2px solid #0284c7' : '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <input type="radio" name="plano" value="diario_teste" checked={selectedPlan === 'diario_teste'} onChange={(e) => setSelectedPlan(e.target.value)} style={{ margin: '0 8px 0 0', cursor: 'pointer' }} />
                          <div>
                            <strong style={{ color: 'var(--text-main)', fontSize: '0.9rem', display: 'block' }}>Teste Diário Plus</strong>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>1 Dia de acesso</span>
                          </div>
                        </div>
                        {renderPrice('diario_teste', '#0284c7')}
                      </label>
                      
                      <label className="plan-option-card" style={{ border: selectedPlan === 'mensal_simples' ? '2px solid var(--primary)' : '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <input type="radio" name="plano" value="mensal_simples" checked={selectedPlan === 'mensal_simples'} onChange={(e) => setSelectedPlan(e.target.value)} style={{ margin: '0 8px 0 0', cursor: 'pointer' }} />
                          <div>
                            <strong style={{ color: 'var(--text-main)', fontSize: '0.9rem', display: 'block' }}>Simples Mensal</strong>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>30 Dias de acesso</span>
                          </div>
                        </div>
                        {renderPrice('mensal_simples', 'var(--heading-color)')}
                      </label>

                      <label className="plan-option-card" style={{ border: selectedPlan === 'trimestral_simples' ? '2px solid var(--primary)' : '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <input type="radio" name="plano" value="trimestral_simples" checked={selectedPlan === 'trimestral_simples'} onChange={(e) => setSelectedPlan(e.target.value)} style={{ margin: '0 8px 0 0', cursor: 'pointer' }} />
                          <div>
                            <strong style={{ color: 'var(--text-main)', fontSize: '0.9rem', display: 'block' }}>Simples Trimestral</strong>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>90 Dias de acesso</span>
                          </div>
                        </div>
                        {renderPrice('trimestral_simples', 'var(--heading-color)')}
                      </label>

                      <label className="plan-option-card" style={{ border: selectedPlan === 'semestral_simples' ? '2px solid var(--primary)' : '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <input type="radio" name="plano" value="semestral_simples" checked={selectedPlan === 'semestral_simples'} onChange={(e) => setSelectedPlan(e.target.value)} style={{ margin: '0 8px 0 0', cursor: 'pointer' }} />
                          <div>
                            <strong style={{ color: 'var(--text-main)', fontSize: '0.9rem', display: 'block' }}>Simples Semestral</strong>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>180 Dias de acesso</span>
                          </div>
                        </div>
                        {renderPrice('semestral_simples', 'var(--heading-color)')}
                      </label>

                      {/* CATEGORIA 2: PLANO PLUS */}
                      <span className="plan-group-title" style={{ color: '#0284c7' }}>
                        <Sparkles size={14} /> Plano Plus (IA Global - 3M Tokens/mês)
                      </span>

                      <label className="plan-option-card" style={{ border: selectedPlan === 'mensal_plus' ? '2px solid #0284c7' : '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <input type="radio" name="plano" value="mensal_plus" checked={selectedPlan === 'mensal_plus'} onChange={(e) => setSelectedPlan(e.target.value)} style={{ margin: '0 8px 0 0', cursor: 'pointer' }} />
                          <div>
                            <strong style={{ color: 'var(--text-main)', fontSize: '0.9rem', display: 'block' }}>Plus Mensal</strong>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>30 Dias de acesso</span>
                          </div>
                        </div>
                        {renderPrice('mensal_plus', '#0284c7')}
                      </label>

                      <label className="plan-option-card" style={{ border: selectedPlan === 'trimestral_plus' ? '2px solid #0284c7' : '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <input type="radio" name="plano" value="trimestral_plus" checked={selectedPlan === 'trimestral_plus'} onChange={(e) => setSelectedPlan(e.target.value)} style={{ margin: '0 8px 0 0', cursor: 'pointer' }} />
                          <div>
                            <strong style={{ color: 'var(--text-main)', fontSize: '0.9rem', display: 'block' }}>Plus Trimestral</strong>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>90 Dias de acesso</span>
                          </div>
                        </div>
                        {renderPrice('trimestral_plus', '#0284c7')}
                      </label>

                      <label className="plan-option-card" style={{ border: selectedPlan === 'semestral_plus' ? '2px solid #0284c7' : '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <input type="radio" name="plano" value="semestral_plus" checked={selectedPlan === 'semestral_plus'} onChange={(e) => setSelectedPlan(e.target.value)} style={{ margin: '0 8px 0 0', cursor: 'pointer' }} />
                          <div>
                            <strong style={{ color: 'var(--text-main)', fontSize: '0.9rem', display: 'block' }}>Plus Semestral</strong>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>180 Dias de acesso</span>
                          </div>
                        </div>
                        {renderPrice('semestral_plus', '#0284c7')}
                      </label>

                      {/* CATEGORIA 3: PLANO PRO */}
                      <span className="plan-group-title" style={{ color: '#7c3aed' }}>
                        <Zap size={14} /> Plano Pro (IA Global - 6M Tokens/mês)
                      </span>

                      <label className="plan-option-card" style={{ border: selectedPlan === 'trimestral_pro' ? '2px solid #7c3aed' : '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <input type="radio" name="plano" value="trimestral_pro" checked={selectedPlan === 'trimestral_pro'} onChange={(e) => setSelectedPlan(e.target.value)} style={{ margin: '0 8px 0 0', cursor: 'pointer' }} />
                          <div>
                            <strong style={{ color: 'var(--text-main)', fontSize: '0.9rem', display: 'block' }}>Pro Trimestral</strong>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>90 Dias de acesso</span>
                          </div>
                        </div>
                        {renderPrice('trimestral_pro', '#7c3aed')}
                      </label>

                      <label className="plan-option-card" style={{ border: selectedPlan === 'semestral_pro' ? '2px solid #7c3aed' : '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <input type="radio" name="plano" value="semestral_pro" checked={selectedPlan === 'semestral_pro'} onChange={(e) => setSelectedPlan(e.target.value)} style={{ margin: '0 8px 0 0', cursor: 'pointer' }} />
                          <div>
                            <strong style={{ color: 'var(--text-main)', fontSize: '0.9rem', display: 'block' }}>Pro Semestral</strong>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>180 Dias de acesso</span>
                          </div>
                        </div>
                        {renderPrice('semestral_pro', '#7c3aed')}
                      </label>

                    </div>
                  </div>

                  {/* CAMPO DE CUPOM COM BOTÃO DE APLICAR */}
                  <div style={{ padding: '12px', borderRadius: '8px', border: '1px dashed var(--border)', background: 'var(--bg)' }}>
                    <label className="label" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-main)', fontWeight: 'bold' }}>
                      <Ticket size={16} /> Cupom de Desconto (Opcional)
                    </label>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                      <input 
                        className="input" 
                        type="text" 
                        value={couponCode} 
                        onChange={(e) => {
                          setCouponCode(e.target.value.toUpperCase());
                          if (discount > 0) {
                            setDiscount(0); 
                            setCouponMessage({ text: '', type: '' });
                          }
                        }} 
                        placeholder="Ex: APROVADO20"
                        style={{ flex: 1, textTransform: 'uppercase' }}
                      />
                      <button 
                        type="button" 
                        onClick={handleApplyCoupon}
                        disabled={!couponCode || isApplyingCoupon}
                        style={{
                          padding: '0 16px',
                          background: 'var(--primary)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: (!couponCode || isApplyingCoupon) ? 'not-allowed' : 'pointer',
                          fontWeight: 'bold',
                          opacity: (!couponCode || isApplyingCoupon) ? 0.7 : 1
                        }}
                      >
                        {isApplyingCoupon ? 'Aguarde...' : 'Aplicar'}
                      </button>
                    </div>
                    {couponMessage.text && (
                      <span style={{ display: 'block', marginTop: '8px', fontSize: '0.85rem', color: couponMessage.type === 'success' ? '#10b981' : '#ef4444' }}>
                        {couponMessage.text}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* === BOTÕES DE AÇÃO PRINCIPAIS === */}
              <div className="actions" style={{ flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
                
                {isRegistering && registrationStep === 1 ? (
                  <button 
                    className="btn primary" 
                    type="button" 
                    onClick={handleNextStep}
                    style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '1.05rem', boxShadow: '0 4px 12px var(--primary-light)' }}
                  >
                    Continuar <ArrowRight size={18} />
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                    {isRegistering && registrationStep === 2 && (
                      <button 
                        className="btn" 
                        type="button" 
                        onClick={() => setRegistrationStep(1)}
                        style={{ flex: '1', justifyContent: 'center', padding: '12px', background: 'var(--bg)', color: 'var(--text-main)', border: '1px solid var(--border)' }}
                      >
                        <ArrowLeft size={18} /> Voltar
                      </button>
                    )}
                    <button 
                      className="btn primary" 
                      type="submit" 
                      style={{ flex: isRegistering && registrationStep === 2 ? '2' : '1', width: '100%', justifyContent: 'center', padding: '12px', fontSize: '1.05rem', boxShadow: '0 4px 12px var(--primary-light)' }}
                      disabled={loading}
                    >
                      {loading ? 'A processar...' : (isRegistering ? 'Finalizar Cadastro' : 'Entrar no Painel')}
                    </button>
                  </div>
                )}
                
                <div style={{ position: 'relative', width: '100%', textAlign: 'center', margin: '5px 0' }}>
                  <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '0' }} />
                  <span style={{ position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', background: 'var(--card-bg)', padding: '0 10px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>OU</span>
                </div>

                <button 
                  type="button"
                  className="btn"
                  onClick={toggleMode}
                  style={{ width: '100%', justifyContent: 'center', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)' }}
                >
                  {isRegistering 
                    ? 'Já tem uma conta? Fazer Login' 
                    : 'Não tem conta? Cadastre-se agora'}
                </button>
                
                {!isRegistering && (
                  <button 
                    type="button"
                    className="btn"
                    onClick={() => navigate('/planos')}
                    style={{ width: '100%', justifyContent: 'center', border: '1px solid var(--primary)', background: 'transparent', color: 'var(--primary)', marginTop: '-5px' }}
                  >
                    Ativar ou Renovar Conta
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>

      </div>
    </div>
  );
}