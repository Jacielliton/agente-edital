import React, { useEffect, useState } from 'react';
import { Target, PenTool, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';

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
      const token = getAuthToken();
      
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
        setLoading(false); 
      }
    };
    
    fetchPerformance();
  }, []);

  // ============================================================
  // CÁLCULOS BÁSICOS (Médias Globais)
  // ============================================================
  const simulados = history.filter(h => h.tipo === 'simulado');
  const discursivas = history.filter(h => h.tipo === 'discursiva');
  
  const calcMedia = (lista) => {
    if (lista.length === 0) return 0;
    const soma = lista.reduce((acc, curr) => acc + (curr.nota_obtida / curr.nota_maxima), 0);
    return ((soma / lista.length) * 100).toFixed(1);
  };

  // ============================================================
  // ALGORITMO DE REVISÃO INTELIGENTE (Spaced Repetition Logic)
  // ============================================================
  const getRevisoesSugeridas = () => {
    const temasMap = {};
    
    // 1. Encontra a tentativa mais recente de CADA tema
    history.forEach(item => {
      if (!temasMap[item.tema] || new Date(item.created_at) > new Date(temasMap[item.tema].data)) {
        temasMap[item.tema] = {
          aproveitamento: item.nota_obtida / item.nota_maxima,
          data: item.created_at,
          tipo: item.tipo
        };
      }
    });

    // 2. Filtra os temas onde o aluno não atingiu a meta de segurança (ex: 75% de acertos)
    return Object.entries(temasMap)
      .filter(([tema, dados]) => dados.aproveitamento < 0.75)
      .sort((a, b) => a[1].aproveitamento - b[1].aproveitamento); // Ordena: Piores notas primeiro
  };

  const revisoes = getRevisoesSugeridas();

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

          {/* NOVA SEÇÃO: FOCO DE ESTUDO (REVISÕES) */}
          <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)', marginBottom: '2rem' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', background: 'var(--hover-bg)' }}>
              <h3 style={{ margin: 0, color: 'var(--heading-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={20} color="var(--error-text)" /> Plano de Ataque: O que revisar hoje
              </h3>
            </div>
            <div style={{ padding: '20px' }}>
              {history.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Faça o seu primeiro simulado para gerar análises automáticas.</div>
              ) : revisoes.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '15px', background: 'var(--success-bg)', color: 'var(--success-text)', borderRadius: '8px', border: '1px solid var(--success-text)' }}>
                  <CheckCircle size={20} />
                  <strong>Parabéns!</strong> Você atingiu a meta de segurança (75%+) em todos os tópicos recentes estudados. Não há revisões pendentes.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '15px' }}>
                  {revisoes.map(([tema, dados], idx) => {
                    const perc = dados.aproveitamento * 100;
                    const isCritico = perc < 50; // Abaixo de 50% é alerta vermelho, senão alerta laranja
                    const borderColor = isCritico ? 'var(--error-text)' : '#f59e0b';
                    const bgColor = isCritico ? 'var(--error-bg)' : '#fef3c7';
                    const barColor = isCritico ? 'var(--error-text)' : '#d97706';

                    return (
                      <div key={idx} style={{ padding: '15px', borderRadius: '8px', border: `1px solid ${borderColor}`, background: bgColor }}>
                        <div style={{ fontWeight: 'bold', color: '#1f2937', marginBottom: '8px', fontSize: '0.95rem', lineHeight: '1.2' }}>{tema}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.85rem', color: '#4b5563' }}>Nota mais recente:</span>
                          <span style={{ fontWeight: 'bold', color: barColor }}>{perc.toFixed(1)}%</span>
                        </div>
                        <div style={{ width: '100%', backgroundColor: 'rgba(0,0,0,0.1)', height: '6px', borderRadius: '4px', marginTop: '8px' }}>
                          <div style={{ width: `${perc}%`, backgroundColor: barColor, height: '100%', borderRadius: '4px' }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Histórico Recente Original */}
          <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', background: 'var(--hover-bg)' }}>
              <h3 style={{ margin: 0, color: 'var(--heading-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TrendingUp size={20} /> Histórico Completo de Avaliações
              </h3>
            </div>
            
            <div style={{ padding: '0 20px' }}>
              {history.length === 0 ? (
                <p style={{ padding: '30px 0', color: 'var(--text-secondary)', textAlign: 'center' }}>
                  Nenhuma atividade registrada ainda. Complete um simulado ou envie uma discursiva para correção!
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
                        <div style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '1.05rem' }}>{item.tema}</div>
                        
                        {/* NOVAS TAGS DETALHADAS */}
                        {item.tipo === 'simulado' && (
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px', marginBottom: '6px' }}>
                            {item.concurso && <span style={{ fontSize: '0.75rem', background: 'var(--bg)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: '4px', color: 'var(--text-secondary)' }}>🎯 {item.concurso}</span>}
                            {item.nivel && <span style={{ fontSize: '0.75rem', background: 'var(--bg)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: '4px', color: 'var(--text-secondary)' }}>🎓 {item.nivel}</span>}
                            {item.formato && <span style={{ fontSize: '0.75rem', background: 'var(--bg)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: '4px', color: 'var(--text-secondary)' }}>📝 {item.formato}</span>}
                          </div>
                        )}

                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                          {dataFormatada} • {item.tipo}
                        </div>
                      </div>
                      <div style={{ 
                        fontWeight: 'bold', 
                        fontSize: '1.1rem', 
                        background: aproveitamento >= 0.75 ? 'var(--success-bg)' : 'var(--error-bg)',
                        color: aproveitamento >= 0.75 ? 'var(--success-text)' : 'var(--error-text)',
                        padding: '5px 12px',
                        borderRadius: '20px',
                        border: `1px solid ${aproveitamento >= 0.75 ? 'var(--success-text)' : 'var(--error-text)'}`
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