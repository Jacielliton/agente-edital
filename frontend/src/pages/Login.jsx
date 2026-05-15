import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { UserPlus, LogIn, AlertCircle, CheckCircle, Brain, FileText, MessageSquare, Target } from 'lucide-react';

export default function Login() {
  const [isRegistering, setIsRegistering] = useState(false); 
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState(''); 
  
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

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

    try {
      if (isRegistering) {
        if (password !== confirmPassword) {
          throw new Error("As senhas não coincidem.");
        }

        const res = await fetch('http://localhost:8000/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            email, 
            password,
            role: "user" 
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.detail || "Erro ao criar conta.");
        }

        setSuccessMsg("Conta criada com sucesso! Faça login agora.");
        setIsRegistering(false); 
        setPassword('');
        setConfirmPassword('');

      } else {
        const success = await login(email, password);
        if (success) {
          navigate('/');
        } else {
          throw new Error("Email ou senha inválidos.");
        }
      }
    } catch (err) {
      setError(err.message);
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
            
            {error && (
              <div className="error" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--error-bg)', color: 'var(--error-text)', borderColor: 'var(--error-text)' }}>
                <AlertCircle size={18} /> {error}
              </div>
            )}

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
                </div>
              )}

              <div className="actions" style={{ flexDirection: 'column', gap: '1rem', marginTop: '2rem' }}>
                <button 
                  className="btn primary" 
                  type="submit" 
                  style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '1.05rem', boxShadow: '0 4px 12px var(--primary-light)' }}
                  disabled={loading}
                >
                  {loading ? 'A processar...' : (isRegistering ? 'Cadastrar e Começar' : 'Entrar no Painel')}
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
                    : 'Não tem conta? Cadastre-se gratuitamente'}
                </button>
              </div>
            </form>
          </div>
        </div>

      </div>
    </div>
  );
}