import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { UserPlus, LogIn, AlertCircle, CheckCircle } from 'lucide-react';

export default function Login() {
  const [isRegistering, setIsRegistering] = useState(false); // Alterna entre Login e Cadastro
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState(''); // Novo campo
  
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  // Limpa mensagens ao trocar de aba
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
        // --- LÓGICA DE CADASTRO ---
        if (password !== confirmPassword) {
          throw new Error("As senhas não coincidem.");
        }

        const res = await fetch('http://localhost:8001/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            email, 
            password,
            role: "user" // Cria sempre como usuário comum por segurança
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.detail || "Erro ao criar conta.");
        }

        setSuccessMsg("Conta criada com sucesso! Faça login agora.");
        setIsRegistering(false); // Volta para a tela de login
        setPassword('');
        setConfirmPassword('');

      } else {
        // --- LÓGICA DE LOGIN ---
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
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '4rem', padding: '0 1rem' }}>
      <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '2rem' }}>
        
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ color: '#1e3a8a', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
            {isRegistering ? <UserPlus size={28} /> : <LogIn size={28} />}
            {isRegistering ? 'Criar Conta' : 'Acessar Sistema'}
          </h2>
          <p className="muted">
            {isRegistering ? 'Preencha os dados para começar' : 'Bem-vindo de volta'}
          </p>
        </div>

        {/* Mensagens de Sucesso ou Erro */}
        {successMsg && (
          <div className="status" style={{ background: '#dcfce7', color: '#166534', borderColor: '#bbf7d0', marginBottom: '1rem' }}>
            <CheckCircle size={18} /> {successMsg}
          </div>
        )}
        
        {error && (
          <div className="error" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={18} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="row">
            <label className="label">Email</label>
            <input 
              className="input" 
              type="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              placeholder="seu@email.com"
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
              placeholder="******"
              required 
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
                placeholder="Repita a senha"
                required 
              />
            </div>
          )}

          <div className="actions" style={{ flexDirection: 'column', gap: '1rem' }}>
            <button 
              className="btn primary" 
              type="submit" 
              style={{ width: '100%', justifyContent: 'center' }}
              disabled={loading}
            >
              {loading ? 'Processando...' : (isRegistering ? 'Cadastrar' : 'Entrar')}
            </button>
            
            <button 
              type="button"
              className="btn"
              onClick={toggleMode}
              style={{ width: '100%', justifyContent: 'center', border: 'none', background: 'transparent', color: '#2563eb' }}
            >
              {isRegistering 
                ? 'Já tem uma conta? Faça Login' 
                : 'Não tem conta? Cadastre-se'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}