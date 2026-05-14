import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { 
  BookOpen, Calendar, ArrowRight, Search, X, 
  ChevronLeft, ChevronRight, TrendingUp, 
  ChevronDown, ChevronUp, Folder, Target 
} from "lucide-react";

export default function Dashboard() {
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

  // NOVO: Função corrigida para ler exatamente a chave salva pelo AuthContext
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
      const concursoName = plan.concurso?.trim() || "Outros / Sem Concurso Vinculado";
      const areaName = plan.area?.trim() || "Assuntos Gerais";
      if (!groups[concursoName]) groups[concursoName] = {};
      if (!groups[concursoName][areaName]) groups[concursoName][areaName] = [];
      groups[concursoName][areaName].push(plan);
    });
    return groups;
  }, [plans]);

  return (
    <div className="container">
      <header className="header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem", flexWrap: 'wrap', gap: '15px' }}>
        <h1 style={{ margin: 0 }}>Minhas Aulas</h1>
        <Link to="/performance" className="btn" style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', color: '#0f172a', fontWeight: 'bold' }}>
          <TrendingUp size={18} color="#3b82f6" /> Meu Desempenho
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
             <button className="btn" onClick={handleClearFilters} title="Limpar Filtros" style={{ color: '#ef4444', borderColor: '#fca5a5' }}><X size={18} /></button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="status" style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>⏳ Carregando a sua biblioteca...</div>
      ) : plans.length === 0 ? (
        <div className="panel" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <BookOpen size={48} color="#94a3b8" style={{ margin: '0 auto 1rem auto' }} />
          <h3 style={{ margin: '0 0 0.5rem 0' }}>Nenhuma aula encontrada.</h3>
          {(filterAno || filterBanca || filterConcurso) ? (
            <button onClick={handleClearFilters} className="btn primary">Limpar Filtros</button>
          ) : (
            <Link to="/generator" className="btn primary">Criar Nova Aula</Link>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {Object.entries(groupedPlans).map(([concursoName, areas]) => {
            const totalAulasConcurso = Object.values(areas).flat().length;
            const isExpanded = expandedConcurso === concursoName;
            
            return (
              <div key={concursoName} style={{ border: '1px solid #cbd5e1', borderRadius: '12px', background: '#fff', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
                <div onClick={() => setExpandedConcurso(isExpanded ? null : concursoName)} style={{ padding: '20px', background: isExpanded ? '#f1f5f9' : '#fff', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div style={{ background: isExpanded ? '#2563eb' : '#3b82f6', padding: '12px', borderRadius: '10px', color: '#fff', display: 'flex' }}><Folder size={26} /></div>
                    <div>
                      <h2 style={{ margin: 0, color: '#0f172a', fontSize: '1.4rem' }}>{concursoName}</h2>
                      <span style={{ fontSize: '0.95rem', color: '#64748b' }}>{totalAulasConcurso} aula(s) neste concurso</span>
                    </div>
                  </div>
                  <div>{isExpanded ? <ChevronUp size={28} color="#64748b" /> : <ChevronDown size={28} color="#64748b" />}</div>
                </div>

                {isExpanded && (
                  <div style={{ padding: '25px 20px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
                    {Object.entries(areas).map(([areaName, aulasDaArea]) => (
                      <div key={areaName} style={{ marginBottom: '35px' }}>
                        <h3 style={{ margin: '0 0 15px 0', paddingBottom: '10px', color: '#1e293b', borderBottom: '2px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem' }}>
                          <Target size={22} color="#10b981" /> {areaName}
                        </h3>
                        
                        {/* ALTERADO AQUI: De grid para flex-column para listar um abaixo do outro */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {aulasDaArea.map((plan) => (
                            <div key={plan.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px' }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', gap: '10px', marginBottom: '8px', alignItems: 'center' }}>
                                  <span style={{ fontSize: '0.75rem', background: '#f1f5f9', color: '#334155', padding: '2px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontWeight: 'bold' }}>{plan.banca}</span>
                                  {plan.ano && <span style={{ fontSize: '0.75rem', color: '#a16207', background: '#fefce8', padding: '2px 8px', borderRadius: '4px' }}>{plan.ano}</span>}
                                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={12} /> {new Date(plan.created_at).toLocaleDateString()}</span>
                                </div>
                                <h4 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>{plan.title}</h4>
                              </div>
                              <Link to={`/aula/${plan.id}`} className="btn small primary" style={{ whiteSpace: 'nowrap' }}>Acessar <ArrowRight size={14} /></Link>
                            </div>
                          ))}
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
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', marginTop: '2.5rem', padding: '1rem', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <button className="btn" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}><ChevronLeft size={18} /> Anterior</button>
          <div style={{ display: 'flex', gap: '5px' }}>
            {[...Array(totalPages)].map((_, i) => {
              const pageNum = i + 1;
              if (pageNum === 1 || pageNum === totalPages || (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)) {
                return (
                  <button key={pageNum} onClick={() => goToPage(pageNum)} style={{ width: '40px', height: '40px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', border: '1px solid', backgroundColor: currentPage === pageNum ? '#2563eb' : 'white', color: currentPage === pageNum ? 'white' : '#475569', borderColor: currentPage === pageNum ? '#2563eb' : '#cbd5e1' }}>{pageNum}</button>
                );
              } else if (pageNum === currentPage - 2 || pageNum === currentPage + 2) {
                return <span key={pageNum} style={{ alignSelf: 'center', color: '#94a3b8' }}>...</span>;
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