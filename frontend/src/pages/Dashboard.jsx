import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Calendar, ArrowRight, Search, X, ChevronLeft, ChevronRight, TrendingUp } from "lucide-react";

export default function Dashboard() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  // Estados dos filtros
  const [filterAno, setFilterAno] = useState("");
  const [filterBanca, setFilterBanca] = useState("");
  const [filterConcurso, setFilterConcurso] = useState("");

  // Estados da Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limitPerPage = 9; // Quantidade por página (mesmo do backend)

  const fetchPlans = (anoBusca = "", bancaBusca = "", concursoBusca = "", page = 1) => {
    setLoading(true);
    
    const params = new URLSearchParams();
    if (anoBusca.trim()) params.append("ano", anoBusca.trim());
    if (bancaBusca.trim()) params.append("banca", bancaBusca.trim());
    if (concursoBusca.trim()) params.append("concurso", concursoBusca.trim());
    
    params.append("page", page);
    params.append("limit", limitPerPage);

    fetch(`http://localhost:8000/plans?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        // Agora o backend retorna um objeto { items: [...], total: X }
        setPlans(data.items || []);
        
        // Calcula o total de páginas (ex: 20 aulas / 9 = 2.22 -> 3 páginas)
        const calculatedPages = Math.ceil((data.total || 0) / limitPerPage);
        setTotalPages(calculatedPages > 0 ? calculatedPages : 1);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchPlans(filterAno, filterBanca, filterConcurso, currentPage);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Ao buscar, sempre volta para a página 1
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

  // Funções de navegação da página
  const goToPage = (pageNumber) => {
    if (pageNumber >= 1 && pageNumber <= totalPages) {
      setCurrentPage(pageNumber);
      fetchPlans(filterAno, filterBanca, filterConcurso, pageNumber);
      // Rola a tela suavemente para o topo do grid
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="container">
      <header className="header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <h1 style={{ margin: 0 }}>Minhas Aulas</h1>
        <Link to="/performance" className="btn" style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', color: '#0f172a', fontWeight: 'bold' }}>
          <TrendingUp size={18} color="#3b82f6" /> Meu Desempenho
        </Link>
      </header>

      {/* Barra de Filtros */}
      <div className="panel" style={{ marginBottom: "2rem", padding: "1.25rem" }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input 
            className="input" 
            placeholder="Ano (ex: 2024)" 
            value={filterAno} 
            onChange={e => setFilterAno(e.target.value)} 
            onKeyDown={e => e.key === 'Enter' && handleApplyFilters()}
            style={{ flex: 1, minWidth: '120px' }} 
          />
          <input 
            className="input" 
            placeholder="Banca (ex: CESPE)" 
            value={filterBanca} 
            onChange={e => setFilterBanca(e.target.value)} 
            onKeyDown={e => e.key === 'Enter' && handleApplyFilters()}
            style={{ flex: 1, minWidth: '150px' }} 
          />
          <input 
            className="input" 
            placeholder="Concurso (ex: Polícia Federal)" 
            value={filterConcurso} 
            onChange={e => setFilterConcurso(e.target.value)} 
            onKeyDown={e => e.key === 'Enter' && handleApplyFilters()}
            style={{ flex: 2, minWidth: '200px' }} 
          />
          <button className="btn primary" onClick={handleApplyFilters} title="Buscar">
            <Search size={18} /> Filtrar
          </button>
          {(filterAno || filterBanca || filterConcurso) && (
             <button className="btn" onClick={handleClearFilters} title="Limpar Filtros" style={{ color: '#ef4444', borderColor: '#fca5a5' }}>
               <X size={18} />
             </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="status">Carregando biblioteca...</div>
      ) : plans.length === 0 ? (
        <div className="panel" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <BookOpen size={48} color="#94a3b8" style={{ margin: '0 auto 1rem auto' }} />
          <h3 style={{ margin: '0 0 0.5rem 0' }}>Nenhuma aula encontrada.</h3>
          <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>
            Não encontramos resultados para a sua busca na página atual.
          </p>
          {/* Se tem filtro aplicado mas deu zero resultados, dá opção de limpar */}
          {(filterAno || filterBanca || filterConcurso) ? (
            <button onClick={handleClearFilters} className="btn primary">Limpar Filtros</button>
          ) : (
            <Link to="/generator" className="btn primary">Criar Nova Aula</Link>
          )}
        </div>
      ) : (
        <>
          <div className="grid-dashboard">
            {plans.map((plan) => (
              <div key={plan.id} className="card-dashboard">
                <div className="card-dash-header" style={{ marginBottom: '0.5rem' }}>
                  <span className="badge-area">{plan.area}</span>
                  <span className="date-meta">
                    <Calendar size={14} /> {new Date(plan.created_at).toLocaleDateString()}
                  </span>
                </div>
                
                <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1rem', fontWeight: 500 }}>
                  {plan.banca && <span>{plan.banca}</span>}
                  {plan.concurso && <span> {plan.banca ? '•' : ''} {plan.concurso}</span>}
                  {plan.ano && <span> {plan.concurso || plan.banca ? '•' : ''} {plan.ano}</span>}
                </div>

                <h3 className="card-dash-title" style={{ marginTop: 0 }}>{plan.title}</h3>
                <div className="card-dash-footer">
                  <Link to={`/aula/${plan.id}`} className="btn small primary" style={{ width: '100%', justifyContent: 'center' }}>
                    Acessar Conteúdo <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {/* ======================= */}
          {/* CONTROLES DE PAGINAÇÃO  */}
          {/* ======================= */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', marginTop: '2.5rem', padding: '1rem', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              
              <button 
                className="btn" 
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                style={{ padding: '8px 12px' }}
              >
                <ChevronLeft size={18} /> Anterior
              </button>

              <div style={{ display: 'flex', gap: '5px' }}>
                {[...Array(totalPages)].map((_, i) => {
                  const pageNum = i + 1;
                  // Lógica simples para não estourar botões se tiver 50 páginas
                  if (pageNum === 1 || pageNum === totalPages || (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)) {
                    return (
                      <button 
                        key={pageNum}
                        onClick={() => goToPage(pageNum)}
                        style={{
                          width: '40px', height: '40px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', border: '1px solid',
                          backgroundColor: currentPage === pageNum ? '#2563eb' : 'white',
                          color: currentPage === pageNum ? 'white' : '#475569',
                          borderColor: currentPage === pageNum ? '#2563eb' : '#cbd5e1',
                          transition: 'all 0.2s'
                        }}
                      >
                        {pageNum}
                      </button>
                    );
                  } else if (pageNum === currentPage - 2 || pageNum === currentPage + 2) {
                    return <span key={pageNum} style={{ alignSelf: 'center', color: '#94a3b8' }}>...</span>;
                  }
                  return null;
                })}
              </div>

              <button 
                className="btn" 
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                style={{ padding: '8px 12px' }}
              >
                Próxima <ChevronRight size={18} />
              </button>
              
            </div>
          )}
        </>
      )}
    </div>
  );
}