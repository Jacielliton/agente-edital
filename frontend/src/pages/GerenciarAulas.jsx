import React, { useEffect, useState } from "react";
import { Trash2, Eye, RefreshCw, Edit, BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

export default function GerenciarAulas() {
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  
  // Estados de Paginação
  const [currentPlanPage, setCurrentPlanPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limitPlansPerPage = 10;

  const [editingPlan, setEditingPlan] = useState(null);
  const [editFormData, setEditFormData] = useState({ title: '', area: '', ano: '', banca: '', concurso: '', visibility: 'public' });
  const [savingPlan, setSavingPlan] = useState(false);

  const getAuthToken = () => {
    return localStorage.getItem("professor_ai_token") || "";
  };

  const fetchPlans = (page = 1) => {
    setLoadingPlans(true);
    
    const token = getAuthToken();

    fetch(`${API_URL}/plans?page=${page}&limit=${limitPlansPerPage}&manage_mode=true`, {
      headers: {
        "Authorization": token ? `Bearer ${token}` : ""
      }
    })
      .then((res) => {
        if (!res.ok) throw new Error("Não autorizado");
        return res.json();
      })
      .then((data) => {
        setPlans(data.items || []);
        // Calcula o total de páginas com base no retorno do backend
        const calculatedPages = Math.ceil((data.total || 0) / limitPlansPerPage);
        setTotalPages(calculatedPages > 0 ? calculatedPages : 1);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoadingPlans(false));
  };

  useEffect(() => {
    fetchPlans(currentPlanPage);
  }, [currentPlanPage]);

  // Função de navegação
  const goToPage = (pageNumber) => {
    if (pageNumber >= 1 && pageNumber <= totalPages) {
      setCurrentPlanPage(pageNumber);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleDeletePlan = async (id) => {
    if (!window.confirm("Tem certeza que deseja deletar esta aula?")) return;
    try {
      const res = await fetch(`${API_URL}/plans/${id}`, { method: "DELETE", headers: { "Authorization": `Bearer ${getAuthToken()}` } });
      if (res.ok) fetchPlans(currentPlanPage);
    } catch (e) { console.error(e); }
  };

  const handleOpenEdit = (plan) => {
    setEditingPlan(plan);
    setEditFormData({
      title: plan.title || '', area: plan.area || '', ano: plan.ano || '', banca: plan.banca || '', concurso: plan.concurso || '', visibility: plan.visibility || 'public' 
    });
  };

  const handleSaveEdit = async () => {
    setSavingPlan(true);
    const token = getAuthToken(); 
    try {
      const res = await fetch(`${API_URL}/plans/${editingPlan.id}`, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": token ? `Bearer ${token}` : "" 
        },
        body: JSON.stringify(editFormData)
      });
      if (res.ok) {
        setEditingPlan(null);
        fetchPlans(currentPlanPage);
      } else alert("Erro ao editar a aula");
    } catch (e) { console.error(e); } finally { setSavingPlan(false); }
  };

  return (
    <div className="container">
      <div className="header" style={{ textAlign: "left" }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <BookOpen size={28} color="var(--primary)" /> Gerenciar Aulas
        </h1>
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Edite, altere a visibilidade ou exclua as aulas do banco de dados.</p>
      </div>

      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem", alignItems: "center" }}>
          <h3 style={{ margin: 0, color: 'var(--heading-color)' }}>Aulas Cadastradas</h3>
          <button className="btn small" onClick={() => fetchPlans(currentPlanPage)}>
            <RefreshCw size={14}/> Atualizar Tabela
          </button>
        </div>

        {loadingPlans ? <div className="status">A carregar aulas...</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Título</th>
                  <th>Visibilidade</th>
                  <th>Área</th>
                  <th>Banca / Concurso</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan.id}>
                    <td style={{ color: 'var(--text-secondary)' }}>#{plan.id}</td>
                    <td style={{ maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-main)' }}>
                      <strong>{plan.title}</strong>
                    </td>
                    <td>
                      <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', backgroundColor: plan.visibility === 'private' ? 'var(--error-bg)' : 'var(--success-bg)', color: plan.visibility === 'private' ? 'var(--error-text)' : 'var(--success-text)' }}>
                        {plan.visibility === 'private' ? 'PRIVADO' : 'PÚBLICO'}
                      </span>
                    </td>
                    <td><span className="badge-area">{plan.area}</span></td>
                    <td>
                      {plan.banca && <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{plan.banca}</span>}
                      {plan.concurso && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{plan.concurso}</div>}
                    </td>
                    <td>
                      <div className="actions-cell">
                        <Link to={`/aula/${plan.id}`} className="btn small" title="Ver"><Eye size={16} /></Link>
                        <button className="btn small" onClick={() => handleOpenEdit(plan)} title="Editar"><Edit size={16} /></button>
                        <button className="btn small error-btn" onClick={() => handleDeletePlan(plan.id)} title="Excluir"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paginação */}
      {totalPages > 1 && !loadingPlans && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', marginTop: '1.5rem', padding: '1rem', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)' }}>
          <button className="btn" onClick={() => goToPage(currentPlanPage - 1)} disabled={currentPlanPage === 1}><ChevronLeft size={18} /> Anterior</button>
          <div style={{ display: 'flex', gap: '5px' }}>
            {[...Array(totalPages)].map((_, i) => {
              const pageNum = i + 1;
              if (pageNum === 1 || pageNum === totalPages || (pageNum >= currentPlanPage - 1 && pageNum <= currentPlanPage + 1)) {
                return (
                  <button key={pageNum} onClick={() => goToPage(pageNum)} style={{ width: '40px', height: '40px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', border: '1px solid', backgroundColor: currentPlanPage === pageNum ? 'var(--primary)' : 'var(--card-bg)', color: currentPlanPage === pageNum ? '#fff' : 'var(--text-main)', borderColor: currentPlanPage === pageNum ? 'var(--primary)' : 'var(--border)' }}>{pageNum}</button>
                );
              } else if (pageNum === currentPlanPage - 2 || pageNum === currentPlanPage + 2) {
                return <span key={pageNum} style={{ alignSelf: 'center', color: 'var(--text-muted)' }}>...</span>;
              }
              return null;
            })}
          </div>
          <button className="btn" onClick={() => goToPage(currentPlanPage + 1)} disabled={currentPlanPage === totalPages}>Próxima <ChevronRight size={18} /></button>
        </div>
      )}

      {/* MODAL DE EDIÇÃO */}
      {editingPlan && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.8)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '30px', width: '100%', maxWidth: '500px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
            <h3 style={{ marginTop: 0, borderBottom: '1px solid var(--border)', color: 'var(--heading-color)', paddingBottom: '15px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Edit size={22} color="var(--primary)" /> Editar Aula
            </h3>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '5px', color: 'var(--text-main)' }}>Título da Aula</label>
              <input type="text" value={editFormData.title} onChange={e => setEditFormData({...editFormData, title: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'var(--input-bg)', color: 'var(--text-main)' }} />
            </div>

            <div style={{ marginBottom: '15px', display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '5px', color: 'var(--text-main)' }}>Área</label>
                <input type="text" value={editFormData.area} onChange={e => setEditFormData({...editFormData, area: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'var(--input-bg)', color: 'var(--text-main)' }} />
              </div>
              <div style={{ flex: 1 }}>
                 <label style={{ display: 'block', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '5px', color: 'var(--text-main)' }}>Ano</label>
                 <input type="text" value={editFormData.ano} onChange={e => setEditFormData({...editFormData, ano: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'var(--input-bg)', color: 'var(--text-main)' }} />
              </div>
            </div>

            <div style={{ marginBottom: '15px', display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '5px', color: 'var(--text-main)' }}>Banca</label>
                <input type="text" value={editFormData.banca} onChange={e => setEditFormData({...editFormData, banca: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'var(--input-bg)', color: 'var(--text-main)' }} />
              </div>
              <div style={{ flex: 1 }}>
                 <label style={{ display: 'block', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '5px', color: 'var(--text-main)' }}>Concurso</label>
                 <input type="text" value={editFormData.concurso} onChange={e => setEditFormData({...editFormData, concurso: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'var(--input-bg)', color: 'var(--text-main)' }} />
              </div>
            </div>

            <div style={{ marginBottom: '25px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '5px', color: 'var(--text-main)' }}>Visibilidade</label>
              <select 
                value={editFormData.visibility} 
                onChange={e => setEditFormData({...editFormData, visibility: e.target.value})}
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'var(--input-bg)', color: 'var(--text-main)' }}
              >
                <option value="public">🌍 Público</option>
                <option value="private">🔒 Privado</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setEditingPlan(null)} disabled={savingPlan} className="btn small" style={{ backgroundColor: 'var(--hover-bg)', color: 'var(--text-main)' }}>Cancelar</button>
              <button onClick={handleSaveEdit} disabled={savingPlan} className="btn primary small">{savingPlan ? "A guardar..." : "Guardar Alterações"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}