import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { 
  BookOpen, Calendar, ArrowRight, Search, X, 
  ChevronLeft, ChevronRight, TrendingUp, 
  ChevronDown, ChevronUp, Folder, Target,
  Globe, Lock, Star // <-- NOVOS ÍCONES ADICIONADOS
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function Dashboard() {
  const { user } = useAuth();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  // Estados dos filtros
  const [filterAno, setFilterAno] = useState("");
  const [filterBanca, setFilterBanca] = useState("");
  const [filterConcurso, setFilterConcurso] = useState("");

  // Estados da Paginação e Accordion
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [expandedConcurso, setExpandedConcurso] = useState(null); 
  
  const limitPerPage = 30; 

  // Função para ler exatamente a chave salva pelo AuthContext
  const getAuthToken = () => {
    return localStorage.getItem("professor_ai_token") || "";
  };

  const fetchPlans = (anoBusca = "", bancaBusca = "", concursoBusca = "", page = 1) => {
    setLoading(true);
    
    const params = new URLSearchParams();
    if (anoBusca.trim()) params.append("ano", anoBusca.trim());
    if (bancaBusca.trim()) params.append("banca", bancaBusca.trim());
    if (concursoBusca.trim()) params.append("concurso", concursoBusca.trim());
    
    params.append("page", page);
    params.append("limit", limitPerPage);

    const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
    
    // Captura o token de forma segura
    const token = getAuthToken();

    fetch(`${apiUrl}/plans?${params.toString()}`, {
      headers: {
        "Authorization": token ? `Bearer ${token}` : ""
      }
    })
      .then((res) => {
        if (res.status === 401) throw new Error("Não autorizado. Sessão expirada.");
        if (!res.ok) throw new Error("Erro ao buscar dados");
        return res.json();
      })
      .then((data) => {
        setPlans(data.items || []);
        const calculatedPages = Math.ceil((data.total || 0) / limitPerPage);
        setTotalPages(calculatedPages > 0 ? calculatedPages : 1);
        
        // Garante que todas as pastas fiquem fechadas (ChevronDown) por padrão
        setExpandedConcurso(null);
      })
      .catch((err) => {
        console.error("Erro ao carregar aulas:", err);
        setPlans([]); 
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchPlans(filterAno, filterBanca, filterConcurso, currentPage);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApplyFilters = () => {
    setCurrentPage(1);
    fetchPlans(filterAno, filterBanca, filterConcurso, 1);
  };

  const handleClearFilters = () => {
    setFilterAno("");
    setFilterBanca("");
    setFilterConcurso("");
    setCurrentPage(1);
    fetchPlans("", "", "", 1); 
  };

  const goToPage = (pageNumber) => {
    if (pageNumber >= 1 && pageNumber <= totalPages) {
      setCurrentPage(pageNumber);
      fetchPlans(filterAno, filterBanca, filterConcurso, pageNumber);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const groupedPlans = useMemo(() => {
    const groups = {};
    plans.forEach(plan => {
      // Adicionando o toUpperCase() para padronizar tudo em maiúsculo no momento de agrupar
      const concursoName = plan.concurso?.trim().toUpperCase() || "SEM CONCURSO VINCULADO";
      const areaName = plan.area?.trim().toUpperCase() || "ASSUNTOS GERAIS";
      
      if (!groups[concursoName]) groups[concursoName] = {};
      if (!groups[concursoName][areaName]) groups[concursoName][areaName] = [];
      groups[concursoName][areaName].push(plan);
    });
    return groups;
  }, [plans]);

  return (
    <div className="container">
      {/* NOVO: Estilos CSS para a animação do Skeleton */}      
      <header className="header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem", flexWrap: 'wrap', gap: '15px' }}>
        <h1 style={{ margin: 0 }}>Minhas Aulas</h1>
        <Link to="/performance" className="btn" style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-main)', fontWeight: 'bold' }}>
          <TrendingUp size={18} color="var(--primary)" /> Meu Desempenho
        </Link>        
      </header>

      {/* Barra de Filtros */}
      <div className="panel" style={{ marginBottom: "2rem", padding: "1.25rem" }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="input" placeholder="Ano (ex: 2024)" value={filterAno} onChange={e => setFilterAno(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleApplyFilters()} style={{ flex: 1, minWidth: '120px' }} />
          <input className="input" placeholder="Banca (ex: CESPE)" value={filterBanca} onChange={e => setFilterBanca(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleApplyFilters()} style={{ flex: 1, minWidth: '150px' }} />
          <input className="input" placeholder="Concurso (ex: Polícia Federal)" value={filterConcurso} onChange={e => setFilterConcurso(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleApplyFilters()} style={{ flex: 2, minWidth: '200px' }} />
          <button className="btn primary" onClick={handleApplyFilters} title="Buscar"><Search size={18} /> Filtrar</button>
          {(filterAno || filterBanca || filterConcurso) && (
             <button className="btn" onClick={handleClearFilters} title="Limpar Filtros" style={{ color: 'var(--error-text)', borderColor: 'var(--error-text)' }}><X size={18} /></button>
          )}
        </div>
      </div>

      {loading ? (
        // NOVO: SKELETON LOADING
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--card-bg)', padding: '20px', display: 'flex', alignItems: 'center', gap: '15px' }}>
              <div className="skeleton-box" style={{ width: '50px', height: '50px', borderRadius: '10px' }}></div>
              <div style={{ flex: 1 }}>
                <div className="skeleton-box" style={{ height: '24px', width: '30%', marginBottom: '8px' }}></div>
                <div className="skeleton-box" style={{ height: '16px', width: '20%' }}></div>
              </div>
              <div className="skeleton-box" style={{ width: '30px', height: '30px', borderRadius: '6px' }}></div>
            </div>
          ))}
        </div>
      ) : plans.length === 0 ? (
        // STATE VAZIO
        <div className="panel" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <BookOpen size={48} color="var(--text-muted)" style={{ margin: '0 auto 1rem auto' }} />
          <h3 style={{ margin: '0 0 0.5rem 0' }}>Nenhuma aula encontrada.</h3>
          {(filterAno || filterBanca || filterConcurso) ? (
            <button onClick={handleClearFilters} className="btn primary">Limpar Filtros</button>
          ) : (
            <Link to="/generator" className="btn primary">Criar Nova Aula com IA</Link>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {Object.entries(groupedPlans).map(([concursoName, areas]) => {
            const todasAulas = Object.values(areas).flat();
            const totalAulasConcurso = todasAulas.length;
            const emailCriador = todasAulas[0]?.owner_email || todasAulas[0]?.email || "";
            const nomeUsuario = emailCriador ? emailCriador.split('@')[0] : "";
            const isExpanded = expandedConcurso === concursoName;
            
            return (
              <div key={concursoName} style={{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--card-bg)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
                <div onClick={() => setExpandedConcurso(isExpanded ? null : concursoName)} style={{ padding: '20px', background: isExpanded ? 'var(--hover-bg)' : 'var(--card-bg)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div style={{ background: isExpanded ? 'var(--primary-hover)' : 'var(--primary)', padding: '12px', borderRadius: '10px', color: '#fff', display: 'flex' }}><Folder size={26} /></div>
                    <div>
                      <h2 style={{ margin: 0, color: 'var(--heading-color)', fontSize: '1.4rem' }}>{concursoName}</h2>
                      <span style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', display: 'block' }}>{totalAulasConcurso} aula(s) neste concurso</span>
                      {nomeUsuario && (
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginTop: '4px', fontWeight: '500' }}>
                          👤 Criado por: {nomeUsuario}
                        </span>
                      )}
                    </div>
                  </div>
                  <div>{isExpanded ? <ChevronUp size={28} color="var(--text-secondary)" /> : <ChevronDown size={28} color="var(--text-secondary)" />}</div>
                </div>

                {isExpanded && (
                  <div style={{ padding: '25px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
                    {Object.entries(areas).map(([areaName, aulasDaArea]) => (
                      <div key={areaName} style={{ marginBottom: '35px' }}>
                        <h3 style={{ margin: '0 0 15px 0', paddingBottom: '10px', color: 'var(--heading-color)', borderBottom: '2px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem' }}>
                          <Target size={22} color="var(--success-text)" /> {areaName}
                        </h3>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {aulasDaArea.map((plan) => {
                            // NOVAS VARIÁVEIS DE LÓGICA DE UI
                            const isMinhaAula = user && plan.owner_email === user.email;
                            const isPublic = plan.visibility === 'public';

                            return (
                              <div key={plan.id} style={{ 
                                // DESTAQUE VISUAL SE FOR AULA DO PRÓPRIO UTILIZADOR
                                background: isMinhaAula ? 'linear-gradient(to right, var(--card-bg), var(--hover-bg))' : 'var(--card-bg)', 
                                border: isMinhaAula ? '1px solid var(--primary)' : '1px solid var(--border)', 
                                borderLeft: isMinhaAula ? '4px solid var(--primary)' : '1px solid var(--border)',
                                borderRadius: '10px', padding: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px',
                                boxShadow: isMinhaAula ? '0 2px 8px rgba(37, 99, 235, 0.1)' : 'none'
                              }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ display: 'flex', gap: '10px', marginBottom: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.75rem', background: 'var(--hover-bg)', color: 'var(--text-main)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)', fontWeight: 'bold' }}>{plan.banca}</span>
                                    {plan.ano && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'var(--bg)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)' }}>{plan.ano}</span>}
                                    
                                    {/* BADGE DE VISIBILIDADE */}
                                    <span style={{ fontSize: '0.75rem', color: isPublic ? 'var(--success-text)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                                      {isPublic ? <Globe size={12} /> : <Lock size={12} />} {isPublic ? 'Público' : 'Privado'}
                                    </span>
                                    
                                    {/* BADGE DE DESTAQUE: MINHA AULA */}
                                    {isMinhaAula && (
                                      <span style={{ fontSize: '0.75rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--primary)', fontWeight: 'bold' }}>
                                        <Star size={12} fill="currentColor" /> Criado por mim
                                      </span>
                                    )}
                                    
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={12} /> {new Date(plan.created_at).toLocaleDateString()}</span>
                                  </div>
                                  <h4 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-main)' }}>{plan.title}</h4>
                                </div>
                                <Link to={`/aula/${plan.id}`} className="btn small primary" style={{ whiteSpace: 'nowrap' }}>Acessar <ArrowRight size={14} /></Link>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Paginação */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', marginTop: '2.5rem', padding: '1rem', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)' }}>
          <button className="btn" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}><ChevronLeft size={18} /> Anterior</button>
          <div style={{ display: 'flex', gap: '5px' }}>
            {[...Array(totalPages)].map((_, i) => {
              const pageNum = i + 1;
              if (pageNum === 1 || pageNum === totalPages || (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)) {
                return (
                  <button key={pageNum} onClick={() => goToPage(pageNum)} style={{ width: '40px', height: '40px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', border: '1px solid', backgroundColor: currentPage === pageNum ? 'var(--primary)' : 'var(--card-bg)', color: currentPage === pageNum ? '#fff' : 'var(--text-main)', borderColor: currentPage === pageNum ? 'var(--primary)' : 'var(--border)' }}>{pageNum}</button>
                );
              } else if (pageNum === currentPage - 2 || pageNum === currentPage + 2) {
                return <span key={pageNum} style={{ alignSelf: 'center', color: 'var(--text-muted)' }}>...</span>;
              }
              return null;
            })}
          </div>
          <button className="btn" onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages}>Próxima <ChevronRight size={18} /></button>
        </div>
      )}
    </div>
  );
}