import React, { useEffect, useState } from "react";
import { Trash2, Eye, RefreshCw, Edit, BookOpen } from "lucide-react";
import { Link } from "react-router-dom";

export default function GerenciarAulas() {
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [currentPlanPage, setCurrentPlanPage] = useState(1);
  const limitPlansPerPage = 10;

  const [editingPlan, setEditingPlan] = useState(null);
  const [editFormData, setEditFormData] = useState({ title: '', area: '', ano: '', banca: '', concurso: '', visibility: 'public' });
  const [savingPlan, setSavingPlan] = useState(false);

  // NOVO: Função para pegar a chave exata do token salva pelo AuthContext
  const getAuthToken = () => {
    return localStorage.getItem("professor_ai_token") || "";
  };

  // NOVO: fetchPlans atualizado para enviar a Autorização
  const fetchPlans = (page = 1) => {
    setLoadingPlans(true);
    
    const token = getAuthToken();

    fetch(`${API_URL}/plans?page=${page}&limit=${limitPlansPerPage}`, {
      headers: {
        "Authorization": token ? `Bearer ${token}` : "" // <-- Envio do token aqui
      }
    })
      .then((res) => {
        if (!res.ok) throw new Error("Não autorizado");
        return res.json();
      })
      .then((data) => setPlans(data.items || []))
      .catch((err) => console.error(err))
      .finally(() => setLoadingPlans(false));
  };

  useEffect(() => {
    fetchPlans(currentPlanPage);
  }, [currentPlanPage]);

  const handleDeletePlan = async (id) => {
    if (!window.confirm("Tem certeza que deseja deletar esta aula?")) return;
    try {
      const res = await fetch(`${API_URL}/plans/${id}`, { method: "DELETE" });
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
    const token = getAuthToken(); // <-- Captura token
    try {
      const res = await fetch(`${API_URL}/plans/${editingPlan.id}`, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": token ? `Bearer ${token}` : "" // <-- Envia no header
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
      <div className="header">
        <h1><BookOpen size={28} style={{ marginRight: '10px', verticalAlign: 'bottom' }}/> Gerenciar Aulas</h1>
        <p>Edite, altere a visibilidade ou exclua as aulas do banco de dados.</p>
      </div>

      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem", alignItems: "center" }}>
          <h3>Aulas Cadastradas</h3>
          <button className="btn small" onClick={() => fetchPlans(currentPlanPage)}><RefreshCw size={14}/> Atualizar Tabela</button>
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
                    <td>#{plan.id}</td>
                    <td style={{ maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><strong>{plan.title}</strong></td>
                    <td>
                      <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', backgroundColor: plan.visibility === 'private' ? '#fef3c7' : '#dcfce7', color: plan.visibility === 'private' ? '#92400e' : '#166534' }}>
                        {plan.visibility === 'private' ? 'PRIVADO' : 'PÚBLICO'}
                      </span>
                    </td>
                    <td><span className="badge-area">{plan.area}</span></td>
                    <td>
                      {plan.banca && <span style={{ fontWeight: 600 }}>{plan.banca}</span>}
                      {plan.concurso && <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{plan.concurso}</div>}
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

      {editingPlan && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.8)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '30px', width: '100%', maxWidth: '500px' }}>
            <h3 style={{ marginTop: 0, borderBottom: '1px solid #e2e8f0', paddingBottom: '15px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Edit size={22} color="#3b82f6" /> Editar Aula
            </h3>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '5px' }}>Título da Aula</label>
              <input type="text" value={editFormData.title} onChange={e => setEditFormData({...editFormData, title: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
            </div>

            <div style={{ marginBottom: '15px', display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '5px' }}>Área</label>
                <input type="text" value={editFormData.area} onChange={e => setEditFormData({...editFormData, area: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
              </div>
              <div style={{ flex: 1 }}>
                 <label style={{ display: 'block', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '5px' }}>Ano</label>
                 <input type="text" value={editFormData.ano} onChange={e => setEditFormData({...editFormData, ano: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
              </div>
            </div>

            <div style={{ marginBottom: '15px', display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '5px' }}>Banca</label>
                <input type="text" value={editFormData.banca} onChange={e => setEditFormData({...editFormData, banca: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
              </div>
              <div style={{ flex: 1 }}>
                 <label style={{ display: 'block', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '5px' }}>Concurso</label>
                 <input type="text" value={editFormData.concurso} onChange={e => setEditFormData({...editFormData, concurso: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
              </div>
            </div>

            <div style={{ marginBottom: '25px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '5px' }}>Visibilidade</label>
              <select 
                value={editFormData.visibility} 
                onChange={e => setEditFormData({...editFormData, visibility: e.target.value})}
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              >
                <option value="public">🌍 Público</option>
                <option value="private">🔒 Privado</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setEditingPlan(null)} disabled={savingPlan} className="btn small">Cancelar</button>
              <button onClick={handleSaveEdit} disabled={savingPlan} className="btn primary small">{savingPlan ? "A guardar..." : "Guardar Alterações"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}