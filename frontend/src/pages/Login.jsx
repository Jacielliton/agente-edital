import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { UserPlus, LogIn, AlertCircle, CheckCircle, Brain, FileText, MessageSquare, Target } from 'lucide-react';
import { useLocation } from 'react-router-dom';

export default function Login() {
  const location = useLocation();
  const [isRegistering, setIsRegistering] = useState(false); 
  const [selectedPlan, setSelectedPlan] = useState('mensal');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState(''); 
  // Captura o código da URL, se existir
  const refCodeUrl = new URLSearchParams(location.search).get('ref');
  const [referralCode, setReferralCode] = useState(refCodeUrl || '');
  
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  
  // O useEffect foi movido para a raiz do componente (fora do handleSubmit)
  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const status = queryParams.get('status');
    
    if (status === 'approved') {
      setSuccessMsg('🎉 Seu pagamento foi aprovado com sucesso! O sistema está processando sua liberação. Tente fazer login em instantes.');
    } else if (status === 'pending') {
      setSuccessMsg('⏳ Seu pagamento está pendente (Aguardando compensação do Boleto/Pix). Assim que compensado, seu acesso será liberado.');
    }
  }, [location]);

  const toggleMode = () => {
    setIsRegistering(!isRegistering);
    setError('');
    setSuccessMsg('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

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
            referral_code: referralCode // <--- Envia o código para a API
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.detail || "Erro ao criar conta.");
        }

        // Em vez de apenas mostrar mensagem, gera a cobrança do plano escolhido
        const payRes = await fetch(`${API_URL}/payments/create-preference`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, plano: selectedPlan })
        });
        
        const payData = await payRes.json();
        if (!payRes.ok) throw new Error(payData.detail || "Conta criada, mas falhou ao gerar cobrança do Mercado Pago.");

        // Redireciona o usuário direto para o checkout do Mercado Pago
        window.location.href = payData.init_point;
        return; // Para a execução da função para não dar conflito

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
      
      {/* Estilos de Animação Inline */}
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
            max-width: 1000px;
            gap: 3rem;
            align-items: center;
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
            max-width: 450px;
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
        `}
      </style>

      <div className="login-wrapper">
        
        {/* LADO ESQUERDO: Informações e Features */}
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
            
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <h2 style={{ color: 'var(--heading-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', margin: '0 0 10px 0' }}>
                {isRegistering ? <UserPlus size={28} color="var(--primary)" /> : <LogIn size={28} color="var(--primary)" />}
                {isRegistering ? 'Criar Nova Conta' : 'Acesso ao Sistema'}
              </h2>
              <p className="muted" style={{ margin: 0 }}>
                {isRegistering ? 'Preencha os dados abaixo para iniciar os seus estudos.' : 'Bem-vindo de volta! Insira as suas credenciais.'}
              </p>
            </div>

            {/* Mensagens de Sucesso ou Erro */}
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
              <div className="row">
                <label className="label">E-mail de Acesso</label>
                <input 
                  className="input" 
                  type="email" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  placeholder="aluno@exemplo.com"
                  required 
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
                  required 
                />
              </div>

              {isRegistering && (
                <div className="row" style={{ animation: 'fadeSlideUp 0.3s ease-out' }}>
                  <label className="label">Confirmar Senha</label>
                  <input 
                    className="input" 
                    type="password" 
                    value={confirmPassword} 
                    onChange={(e) => setConfirmPassword(e.target.value)} 
                    placeholder="Repita a sua senha"
                    required 
                  />
                  
                  <div style={{ marginTop: '1.5rem' }}>
                    <label className="label" style={{ marginBottom: '10px', display: 'block' }}>Escolha o seu Plano (Pagamentos Únicos)</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      
                      <label style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', border: selectedPlan === 'mensal' ? '2px solid var(--primary)' : '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', background: 'var(--input-bg)', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <input type="radio" name="plano" value="mensal" checked={selectedPlan === 'mensal'} onChange={(e) => setSelectedPlan(e.target.value)} style={{ margin: '0 10px 0 0', cursor: 'pointer' }} />
                          <div>
                            <strong style={{ color: 'var(--text-main)', display: 'block' }}>Mensal</strong>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Renovação Manual</span>
                          </div>
                        </div>
                        <strong style={{ color: 'var(--heading-color)', fontSize: '1.1rem' }}>R$ 49,90</strong>
                      </label>

                      <label style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', border: selectedPlan === 'trimestral' ? '2px solid var(--primary)' : '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', background: 'var(--input-bg)', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <input type="radio" name="plano" value="trimestral" checked={selectedPlan === 'trimestral'} onChange={(e) => setSelectedPlan(e.target.value)} style={{ margin: '0 10px 0 0', cursor: 'pointer' }} />
                          <div>
                            <strong style={{ color: 'var(--text-main)', display: 'block' }}>Trimestral</strong>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Renovação Manual</span>
                          </div>
                        </div>
                        <strong style={{ color: 'var(--heading-color)', fontSize: '1.1rem' }}>R$ 119,90</strong>
                      </label>

                      <label style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', border: selectedPlan === 'semestral' ? '2px solid var(--primary)' : '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', background: 'var(--input-bg)', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <input type="radio" name="plano" value="semestral" checked={selectedPlan === 'semestral'} onChange={(e) => setSelectedPlan(e.target.value)} style={{ margin: '0 10px 0 0', cursor: 'pointer' }} />
                          <div>
                            <strong style={{ color: 'var(--text-main)', display: 'block' }}>Semestral</strong>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Renovação Manual</span>
                          </div>
                        </div>
                        <strong style={{ color: 'var(--heading-color)', fontSize: '1.1rem' }}>R$ 199,90</strong>
                      </label>

                      <label style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', border: selectedPlan === 'anual' ? '2px solid var(--primary)' : '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', background: 'var(--input-bg)', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <input type="radio" name="plano" value="anual" checked={selectedPlan === 'anual'} onChange={(e) => setSelectedPlan(e.target.value)} style={{ margin: '0 10px 0 0', cursor: 'pointer' }} />
                          <div>
                            <strong style={{ color: 'var(--text-main)', display: 'block' }}>Anual</strong>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Renovação Manual</span>
                          </div>
                        </div>
                        <strong style={{ color: 'var(--heading-color)', fontSize: '1.1rem' }}>R$ 349,90</strong>
                      </label>
                      
                    </div>
                  </div>
                </div>
              )}

              <div className="actions" style={{ flexDirection: 'column', gap: '1rem', marginTop: '2rem' }}>
                <button 
                  className="btn primary" 
                  type="submit" 
                  style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '1.05rem', boxShadow: '0 4px 12px var(--primary-light)' }}
                  disabled={loading}
                >
                  {loading ? 'A processar...' : (isRegistering ? 'Cadastrar e Ativar Plano' : 'Entrar no Painel')}
                </button>
                
                <div style={{ position: 'relative', width: '100%', textAlign: 'center', margin: '10px 0' }}>
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
                
                {/* NOVO: Botão persistente para ativar conta já existente */}
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