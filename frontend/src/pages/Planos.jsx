import React, { useState, useEffect } from 'react';
import { CreditCard, CheckCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext'; // ADICIONADO: Importação do contexto

export default function Planos() {
  const { user } = useAuth(); // ADICIONADO: Puxa o usuário logado
  
  // O e-mail começa com o e-mail do usuário logado (se houver)
  const [email, setEmail] = useState(user?.email || '');
  const [cupom, setCupom] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  // ADICIONADO: Sincroniza o e-mail caso o contexto carregue milissegundos depois
  useEffect(() => {
    if (user?.email) {
      setEmail(user.email);
    }
  }, [user]);

  const planos = [
    { id: 'diario_teste', nome: 'Teste Diário Plus', preco: '1,90', sub: 'IA Ativada (1 Dia)' }, // Inclusão do plano de R$ 1.90
    { id: 'mensal_simples', nome: 'Mensal Simples', preco: '49,90', sub: 'Acesso Padrão (Sem IA)' },
    { id: 'trimestral_simples', nome: 'Trimestral Simples', preco: '119,90', sub: 'Acesso Padrão (Sem IA)' },
    { id: 'semestral_simples', nome: 'Semestral Simples', preco: '199,90', sub: 'Acesso Padrão (Sem IA)' },
    { id: 'mensal_plus', nome: 'Mensal Plus', preco: '99,90', sub: 'IA Ativada (300k Tokens)', destaque: true },
    { id: 'trimestral_plus', nome: 'Trimestral Plus', preco: '159,90', sub: 'IA Ativada (300k Tokens)' },
    { id: 'semestral_plus', nome: 'Semestral Plus', preco: '239,90', sub: 'IA Ativada (300k Tokens)' },
    { id: 'trimestral_pro', nome: 'Trimestral Pro', preco: '189,90', sub: 'IA Ativada (600k Tokens)' },
    { id: 'semestral_pro', nome: 'Semestral Pro', preco: '269,90', sub: 'IA Ativada (600k Tokens)' }
  ];

  const handleCheckout = async (planoId) => {
    if (!email) {
      setError("Por favor, informe o seu email cadastrado para ativar/renovar a conta.");
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/payments/create-preference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // CORRIGIDO: O backend do Mercado Pago espera 'coupon_code' conforme definido no seu main.py
        body: JSON.stringify({ email, plano: planoId, coupon_code: cupom ? cupom.toUpperCase() : null })
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.detail || "Erro ao gerar cobrança.");

      // Redireciona para o checkout do Mercado Pago
      window.location.href = data.init_point;

    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem 1rem' }}>
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h1 style={{ color: 'var(--heading-color)', fontSize: '2.5rem' }}>Ative ou Renove sua Conta</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>
          Escolha o seu plano abaixo. O pagamento é único e a renovação é feita manualmente quando desejar.
        </p>
      </div>

      <div className="card" style={{ maxWidth: '500px', margin: '0 auto 3rem auto', padding: '2rem' }}>
        
        {/* LÓGICA CONDICIONAL: Exibe como texto fixo se logado, input se deslogado */}
        {user ? (
          <div style={{ marginBottom: '15px' }}>
            <label className="label" style={{ fontWeight: 'bold' }}>Conta conectada</label>
            <div style={{ padding: '10px', background: 'var(--input-bg)', borderRadius: '6px', border: '1px solid var(--border)', color: 'var(--text-main)', opacity: 0.7, cursor: 'not-allowed' }}>
              {user.email}
            </div>
          </div>
        ) : (
          <>
            <label className="label" style={{ fontWeight: 'bold' }}>Qual o e-mail da sua conta?</label>
            <input 
              className="input" 
              type="email" 
              placeholder="seu.email@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ marginBottom: '15px' }}
            />
          </>
        )}
        
        <label className="label" style={{ fontWeight: 'bold' }}>Cupom de Desconto (Opcional)</label>
        <input 
          className="input" 
          type="text" 
          placeholder="Ex: PROMO20"
          value={cupom}
          onChange={(e) => setCupom(e.target.value)}
          style={{ textTransform: 'uppercase' }}
        />

        {error && <p style={{ color: 'var(--error-text)', fontSize: '0.9rem', marginTop: '10px' }}>{error}</p>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '2rem' }}>
        {planos.map(plano => (
          <div key={plano.id} className="card" style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            border: plano.destaque ? '2px solid var(--primary)' : '1px solid var(--border)',
            position: 'relative',
            transform: plano.destaque ? 'scale(1.05)' : 'scale(1)',
            zIndex: plano.destaque ? 10 : 1
          }}>
            {plano.destaque && (
              <span style={{ position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', background: 'var(--primary)', color: '#fff', padding: '2px 10px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                MAIS POPULAR
              </span>
            )}
            <h3 style={{ margin: '0 0 10px 0', textAlign: 'center', color: 'var(--text-main)' }}>{plano.nome}</h3>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <span style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--heading-color)' }}>R$ {plano.preco}</span>
            </div>
            
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px 0', flex: 1, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <CheckCircle size={16} color="var(--primary)" /> {plano.sub}
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <CheckCircle size={16} color="var(--primary)" /> Acesso Ilimitado
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle size={16} color="var(--primary)" /> Desbloqueio Imediato
              </li>
            </ul>

            <button 
              className={`btn ${plano.destaque ? 'primary' : ''}`}
              style={{ width: '100%', justifyContent: 'center' }}
              disabled={loading}
              onClick={() => handleCheckout(plano.id)}
            >
              <CreditCard size={18} /> Contratar
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}