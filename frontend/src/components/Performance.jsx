import React, { useEffect, useState } from 'react';
import { Target, PenTool, TrendingUp, Award } from 'lucide-react';

// Função robusta para pegar o token (igual à usada nas aulas)
const getAuthToken = () => {
  const storages = [localStorage, sessionStorage];
  for (const storage of storages) {
    let t = storage.getItem("access_token") || storage.getItem("token");
    if (t && t.startsWith("eyJ")) return t;
    try {
      const uStr = storage.getItem("user");
      if (uStr && uStr.startsWith("{")) {
        const uObj = JSON.parse(uStr);
        if (uObj.access_token && String(uObj.access_token).startsWith("eyJ")) return uObj.access_token;
        if (uObj.token && String(uObj.token).startsWith("eyJ")) return uObj.token;
      }
    } catch(e) {}
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      const val = storage.getItem(key);
      if (typeof val === "string" && val.startsWith("eyJ")) return val;
      try {
        if (val && val.startsWith("{")) {
          const obj = JSON.parse(val);
          for (let k in obj) {
            if (typeof obj[k] === "string" && obj[k].startsWith("eyJ")) return obj[k];
          }
        }
      } catch(e) {}
    }
  }
  return null;
};

export default function Performance() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPerformance = async () => {
      const token = getAuthToken(); // Usa a nova função
      
      // Se não achar o token, destrava o loading e para
      if (!token) {
        setLoading(false);
        return; 
      }

      try {
        const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
        const res = await fetch(`${apiUrl}/performance/me`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        
        if (res.ok) {
          const data = await res.json();
          setHistory(data);
        }
      } catch (err) {
        console.error("Erro ao buscar histórico", err);
      } finally {
        setLoading(false); // Agora o loading garante que vai sair da tela de carregamento!
      }
    };
    
    fetchPerformance();
  }, []);

  // Cálculos Básicos
  const simulados = history.filter(h => h.tipo === 'simulado');
  const discursivas = history.filter(h => h.tipo === 'discursiva');
  
  const calcMedia = (lista) => {
    if (lista.length === 0) return 0;
    const soma = lista.reduce((acc, curr) => acc + (curr.nota_obtida / curr.nota_maxima), 0);
    return ((soma / lista.length) * 100).toFixed(1);
  };

  return (
    <div className="container" style={{ padding: '2rem' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ color: 'var(--heading-color)', margin: 0 }}>Meu Desempenho</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Acompanhe sua evolução nas métricas de aprovação.</p>
      </header>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)', fontSize: '1.2rem' }}>
          ⏳ Carregando estatísticas...
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '2rem' }}>
            
            {/* Card Simulados */}
            <div style={{ background: 'var(--card-bg)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--primary)', marginBottom: '10px' }}>
                <Target size={24} />
                <h3 style={{ margin: 0, color: 'var(--heading-color)' }}>Simulados (Objetivas)</h3>
              </div>
              <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--text-main)' }}>
                {calcMedia(simulados)}%
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Média de acertos ({simulados.length} realizados)</div>
            </div>

            {/* Card Discursivas */}
            <div style={{ background: 'var(--card-bg)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--success-text)', marginBottom: '10px' }}>
                <PenTool size={24} />
                <h3 style={{ margin: 0, color: 'var(--heading-color)' }}>Provas Discursivas</h3>
              </div>
              <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--text-main)' }}>
                {calcMedia(discursivas)}%
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Aproveitamento médio ({discursivas.length} realizadas)</div>
            </div>
          </div>

          {/* Histórico Recente */}
          <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', background: 'var(--hover-bg)' }}>
              <h3 style={{ margin: 0, color: 'var(--heading-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TrendingUp size={20} /> Histórico Detalhado
              </h3>
            </div>
            
            <div style={{ padding: '0 20px' }}>
              {history.length === 0 ? (
                <p style={{ padding: '30px 0', color: 'var(--text-secondary)', textAlign: 'center' }}>
                  Nenhuma atividade registrada ainda. Complete um simulado ou envie uma discursiva para correção para ver as suas estatísticas aqui!
                </p>
              ) : (
                history.map((item, idx) => {
                  const dataFormatada = new Date(item.created_at).toLocaleDateString('pt-BR', {
                    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                  });
                  const aproveitamento = item.nota_obtida / item.nota_maxima;
                  
                  return (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 0', borderBottom: idx !== history.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <div>
                        <div style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{item.tema}</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                          {dataFormatada} • {item.tipo}
                        </div>
                      </div>
                      <div style={{ 
                        fontWeight: 'bold', 
                        fontSize: '1.1rem', 
                        background: aproveitamento >= 0.7 ? 'var(--success-bg)' : 'var(--error-bg)',
                        color: aproveitamento >= 0.7 ? 'var(--success-text)' : 'var(--error-text)',
                        padding: '5px 12px',
                        borderRadius: '20px',
                        border: `1px solid ${aproveitamento >= 0.7 ? 'var(--success-text)' : 'var(--error-text)'}`
                      }}>
                        {item.nota_obtida} / {item.nota_maxima}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}