import React, { useState } from 'react';
import { CreditCard, CheckCircle } from 'lucide-react';

export default function Planos() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  const planos = [
    { id: 'mensal', nome: 'Mensal', preco: '49,90', sub: 'Renovação Manual' },
    { id: 'trimestral', nome: 'Trimestral', preco: '119,90', sub: 'Renovação Manual', destaque: true },
    { id: 'semestral', nome: 'Semestral', preco: '199,90', sub: 'Renovação Manual' },
    { id: 'anual', nome: 'Anual', preco: '349,90', sub: 'Renovação Manual' }
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
        body: JSON.stringify({ email, plano: planoId })
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
        <label className="label" style={{ fontWeight: 'bold' }}>Qual o e-mail da sua conta?</label>
        <input 
          className="input" 
          type="email" 
          placeholder="seu.email@exemplo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
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