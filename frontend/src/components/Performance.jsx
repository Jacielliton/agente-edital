import React, { useEffect, useState } from 'react';
import { Target, PenTool, TrendingUp, AlertTriangle, CheckCircle, Award, Trophy, Medal } from 'lucide-react';
import { useAuth } from '../context/AuthContext'; // <-- Importando contexto de usuário

// Função robusta para pegar o token
const getAuthToken = () => {
  const storages = [localStorage, sessionStorage];
  for (const storage of storages) {
    let t = storage.getItem("access_token") || storage.getItem("token") || storage.getItem("professor_ai_token");
    if (t && t.startsWith("eyJ")) return t;
    try {
      const uStr = storage.getItem("user");
      if (uStr && uStr.startsWith("{")) {
        const uObj = JSON.parse(uStr);
        if (uObj.access_token && String(uObj.access_token).startsWith("eyJ")) return uObj.access_token;
        if (uObj.token && String(uObj.token).startsWith("eyJ")) return uObj.token;
      }
    } catch(e) {}
  }
  return null;
};

export default function Performance() {
  const { user } = useAuth(); // Identifica quem está logado
  const [history, setHistory] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]); // Guarda o Ranking Global
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDados = async () => {
      const token = getAuthToken();
      if (!token) {
        setLoading(false);
        return; 
      }

      try {
        const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
        
        // Dispara as duas requisições paralelamente para ser mais rápido
        const [resHist, resLead] = await Promise.all([
          fetch(`${apiUrl}/performance/me`, { headers: { "Authorization": `Bearer ${token}` } }),
          fetch(`${apiUrl}/performance/leaderboard`, { headers: { "Authorization": `Bearer ${token}` } })
        ]);
        
        if (resHist.ok) setHistory(await resHist.json());
        if (resLead.ok) setLeaderboard(await resLead.json());
        
      } catch (err) {
        console.error("Erro ao buscar dados do painel:", err);
      } finally {
        setLoading(false); 
      }
    };
    
    fetchDados();
  }, []);

  // ============================================================
  // CÁLCULOS BÁSICOS & GAMIFICAÇÃO
  // ============================================================
  const simulados = history.filter(h => h.tipo === 'simulado');
  const discursivas = history.filter(h => h.tipo === 'discursiva');
  
  const calcMedia = (lista) => {
    if (lista.length === 0) return 0;
    const soma = lista.reduce((acc, curr) => acc + (curr.nota_obtida / curr.nota_maxima), 0);
    return ((soma / lista.length) * 100).toFixed(1);
  };

  const calcularGamificacaoLocal = () => {
    let totalAcertos = 0;
    let totalQuestoes = 0;
    let simuladosFeitos = simulados.length;

    simulados.forEach(s => {
      totalAcertos += s.nota_obtida;
      totalQuestoes += s.nota_maxima;
    });

    const totalErros = totalQuestoes - totalAcertos;

    // FÓRMULA COM PUNIÇÃO: +50 por simulado | +10 por acerto | -5 por erro
    let xpTotal = (simuladosFeitos * 50) + (totalAcertos * 10) - (totalErros * 5);
    if (xpTotal < 0) xpTotal = 0; // Evita XP negativo no painel
    
    let elo = "Iniciante";
    let corElo = "var(--text-muted)";

    if (xpTotal >= 5000) { elo = "💎 Elite"; corElo = "#8b5cf6"; } 
    else if (xpTotal >= 2000) { elo = "🔷 Diamante"; corElo = "#3b82f6"; } 
    else if (xpTotal >= 1000) { elo = "🏆 Ouro"; corElo = "#eab308"; } 
    else if (xpTotal >= 500) { elo = "🥈 Prata"; corElo = "#94a3b8"; } 
    else if (xpTotal >= 100) { elo = "🥉 Bronze"; corElo = "#b45309"; }

    // Encontrar a Posição Global baseada na rota do backend
    const meuRankData = leaderboard.find(l => l.email_completo === user?.email);
    const posicaoGlobal = meuRankData ? meuRankData.posicao : "-";

    return { xp: xpTotal, elo, corElo, acertos: totalAcertos, erros: totalErros, simuladosFeitos, posicaoGlobal };
  };

  const rankStatus = calcularGamificacaoLocal();

  // ============================================================
  // ALGORITMO DE REVISÃO INTELIGENTE
  // ============================================================
  const getRevisoesSugeridas = () => {
    const temasMap = {};
    history.forEach(item => {
      if (!temasMap[item.tema] || new Date(item.created_at) > new Date(temasMap[item.tema].data)) {
        temasMap[item.tema] = {
          aproveitamento: item.nota_obtida / item.nota_maxima,
          data: item.created_at,
          tipo: item.tipo
        };
      }
    });
    return Object.entries(temasMap)
      .filter(([tema, dados]) => dados.aproveitamento < 0.75)
      .sort((a, b) => a[1].aproveitamento - b[1].aproveitamento);
  };
  const revisoes = getRevisoesSugeridas();

  return (
    <div className="container" style={{ padding: '2rem' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ color: 'var(--heading-color)', margin: 0 }}>Meu Desempenho</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Acompanhe sua evolução, analise falhas e suba no Ranking Global.</p>
      </header>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)', fontSize: '1.2rem' }}>
          ⏳ Calculando XP e processando estatísticas...
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '2rem' }}>
            
            {/* CARD 1: COMPETIÇÃO / RANKING PESSOAL */}
            <div style={{ background: 'var(--card-bg)', padding: '20px', borderRadius: '12px', border: `2px solid ${rankStatus.corElo}`, boxShadow: `0 4px 15px ${rankStatus.corElo}30`, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', right: '-20px', top: '-20px', width: '100px', height: '100px', borderRadius: '50%', background: rankStatus.corElo, opacity: 0.15, filter: 'blur(15px)' }}></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: rankStatus.corElo, marginBottom: '10px' }}>
                <Award size={24} />
                <h3 style={{ margin: 0, color: 'var(--heading-color)' }}>Sua Liga (Ranking)</h3>
              </div>
              <div style={{ fontSize: '2.2rem', fontWeight: 'bold', color: rankStatus.corElo, whiteSpace: 'nowrap' }}>
                {rankStatus.elo}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginTop: '5px' }}>
                <strong>{Math.floor(rankStatus.xp)} XP</strong> • Pos. Global: <strong style={{ color: 'var(--text-main)' }}>#{rankStatus.posicaoGlobal}</strong>
              </div>
            </div>

            {/* CARD 2: SIMULADOS */}
            <div style={{ background: 'var(--card-bg)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--primary)', marginBottom: '10px' }}>
                <Target size={24} />
                <h3 style={{ margin: 0, color: 'var(--heading-color)' }}>Taxa de Acertos</h3>
              </div>
              <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--text-main)' }}>
                {calcMedia(simulados)}%
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{rankStatus.acertos} Acertos / <span style={{ color: 'var(--error-text)' }}>{rankStatus.erros} Erros</span></div>
            </div>

            {/* CARD 3: DISCURSIVAS */}
            <div style={{ background: 'var(--card-bg)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--success-text)', marginBottom: '10px' }}>
                <PenTool size={24} />
                <h3 style={{ margin: 0, color: 'var(--heading-color)' }}>Provas Discursivas</h3>
              </div>
              <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--text-main)' }}>
                {calcMedia(discursivas)}%
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Aproveitamento médio ({discursivas.length} avaliadas)</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px', marginBottom: '2rem' }}>
            
            {/* SEÇÃO DA ESQUERDA: RANKING GLOBAL (LEADERBOARD) */}
            <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', background: 'var(--hover-bg)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Trophy size={20} color="#eab308" />
                <h3 style={{ margin: 0, color: 'var(--heading-color)' }}>Ranking Global (Top 10)</h3>
              </div>
              <div style={{ padding: '0 20px', maxHeight: '400px', overflowY: 'auto' }}>
                {leaderboard.length === 0 ? (
                  <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px 0' }}>Nenhum simulado registrado no sistema ainda.</p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
                    <tbody>
                      {leaderboard.slice(0, 10).map((l) => (
                        <tr key={l.posicao} style={{ borderBottom: '1px solid var(--border)', background: l.email_completo === user?.email ? 'var(--hover-bg)' : 'transparent' }}>
                          <td style={{ padding: '12px 5px', width: '40px', fontWeight: 'bold', color: l.posicao <= 3 ? '#eab308' : 'var(--text-muted)' }}>
                            {l.posicao === 1 ? '🥇' : l.posicao === 2 ? '🥈' : l.posicao === 3 ? '🥉' : `${l.posicao}º`}
                          </td>
                          <td style={{ padding: '12px 5px', color: 'var(--text-main)', fontWeight: l.email_completo === user?.email ? 'bold' : 'normal' }}>
                            {l.nickname} {l.email_completo === user?.email && "(Você)"}
                          </td>
                          <td style={{ padding: '12px 5px', textAlign: 'right' }}>
                            <span style={{ fontSize: '0.8rem', marginRight: '8px', color: 'var(--text-secondary)' }}>{l.elo.split(' ')[0]}</span>
                            <strong style={{ color: 'var(--primary)' }}>{Math.floor(l.xp)} XP</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* SEÇÃO DA DIREITA: REVISÃO ESPAÇADA */}
            <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', background: 'var(--hover-bg)' }}>
                <h3 style={{ margin: 0, color: 'var(--heading-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertTriangle size={20} color="var(--error-text)" /> O Que Revisar Hoje
                </h3>
              </div>
              <div style={{ padding: '20px', flex: 1, overflowY: 'auto', maxHeight: '400px' }}>
                {history.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Faça o seu primeiro simulado para gerar análises automáticas.</div>
                ) : revisoes.length === 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '15px', background: 'var(--success-bg)', color: 'var(--success-text)', borderRadius: '8px', border: '1px solid var(--success-text)' }}>
                    <CheckCircle size={20} />
                    <strong>Parabéns!</strong> Você atingiu a meta de segurança (75%+) em todos os tópicos.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    {revisoes.map(([tema, dados], idx) => {
                      const perc = dados.aproveitamento * 100;
                      const isCritico = perc < 50; 
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
          </div>

          {/* HISTÓRICO ORIGINAL DE SIMULADOS */}
          <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', background: 'var(--hover-bg)' }}>
              <h3 style={{ margin: 0, color: 'var(--heading-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TrendingUp size={20} /> Histórico Completo de Avaliações
              </h3>
            </div>
            
            <div style={{ padding: '0 20px' }}>
              {history.length === 0 ? (
                <p style={{ padding: '30px 0', color: 'var(--text-secondary)', textAlign: 'center' }}>
                  Nenhuma atividade registrada ainda.
                </p>
              ) : (
                history.map((item, idx) => {
                  const dataFormatada = new Date(item.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                  const aproveitamento = item.nota_obtida / item.nota_maxima;
                  
                  return (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 0', borderBottom: idx !== history.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <div>
                        <div style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '1.05rem' }}>{item.tema}</div>
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
                      <div style={{ fontWeight: 'bold', fontSize: '1.1rem', background: aproveitamento >= 0.75 ? 'var(--success-bg)' : 'var(--error-bg)', color: aproveitamento >= 0.75 ? 'var(--success-text)' : 'var(--error-text)', padding: '5px 12px', borderRadius: '20px', border: `1px solid ${aproveitamento >= 0.75 ? 'var(--success-text)' : 'var(--error-text)'}` }}>
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