import React, { useEffect, useState } from "react";
import { Trash2, Eye, RefreshCw, UserCog, User, Shield, ChevronLeft, ChevronRight, Edit } from "lucide-react";
import { Link } from "react-router-dom";

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState("plans"); // 'plans' ou 'users'
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  // --- ESTADOS DE AULAS ---
  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [currentPlanPage, setCurrentPlanPage] = useState(1);
  const [totalPlanPages, setTotalPlanPages] = useState(1);
  const limitPlansPerPage = 10;

  // --- ESTADOS DE EDIÇÃO DE AULA ---
  const [editingPlan, setEditingPlan] = useState(null);
  const [editFormData, setEditFormData] = useState({ title: '', area: '', ano: '', banca: '', concurso: '' });
  const [savingPlan, setSavingPlan] = useState(false);

  // --- ESTADOS DE USUÁRIOS ---
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // --- CARREGAMENTO DE AULAS (Com Paginação) ---
  const fetchPlans = (page = 1) => {
    setLoadingPlans(true);
    fetch(`${API_URL}/plans?page=${page}&limit=${limitPlansPerPage}`)
      .then((res) => res.json())
      .then((data) => {
        setPlans(data.items || []);
        const calcPages = Math.ceil((data.total || 0) / limitPlansPerPage);
        setTotalPlanPages(calcPages > 0 ? calcPages : 1);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoadingPlans(false));
  };

  // --- CARREGAMENTO DE USUÁRIOS ---
  const fetchUsers = () => {
    setLoadingUsers(true);
    fetch(`${API_URL}/users`)
      .then((res) => res.json())
      .then((data) => setUsers(data || []))
      .catch((err) => console.error(err))
      .finally(() => setLoadingUsers(false));
  };

  useEffect(() => {
    fetchPlans(currentPlanPage);
    fetchUsers();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = () => {
    if (activeTab === 'plans') fetchPlans(currentPlanPage);
    if (activeTab === 'users') fetchUsers();
  };

  const goToPlanPage = (pageNumber) => {
    if (pageNumber >= 1 && pageNumber <= totalPlanPages) {
      setCurrentPlanPage(pageNumber);
      fetchPlans(pageNumber);
    }
  };

  // --- AÇÕES DE AULAS ---
  const handleDeletePlan = async (id) => {
    if (!window.confirm("Tem certeza que deseja deletar esta aula?")) return;
    try {
      const res = await fetch(`${API_URL}/plans/${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchPlans(currentPlanPage);
      } else {
        alert("Erro ao deletar aula");
      }
    } catch (e) { console.error(e); }
  };

  // Abre o modal e preenche os dados
  const handleOpenEdit = (plan) => {
    setEditingPlan(plan);
    setEditFormData({
      title: plan.title || '',
      area: plan.area || '',
      ano: plan.ano || '',
      banca: plan.banca || '',
      concurso: plan.concurso || ''
    });
  };

  // Envia as edições para o backend
  const handleSaveEdit = async () => {
    setSavingPlan(true);
    try {
      const res = await fetch(`${API_URL}/plans/${editingPlan.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editFormData)
      });
      if (res.ok) {
        setEditingPlan(null);
        fetchPlans(currentPlanPage); // Recarrega a tabela para mostrar dados novos
      } else {
        alert("Erro ao editar a aula");
      }
    } catch (e) {
      console.error(e);
      alert("Falha na conexão");
    } finally {
      setSavingPlan(false);
    }
  };

  // --- AÇÕES DE USUÁRIOS ---
  const handleDeleteUser = async (id) => {
    if (!window.confirm("Tem certeza que deseja excluir este usuário permanentemente?")) return;
    try {
      const res = await fetch(`${API_URL}/users/${id}`, { method: "DELETE" });
      if (res.ok) {
        setUsers(users.filter((u) => u.id !== id));
      } else {
        const err = await res.json();
        alert(err.detail || "Erro ao deletar usuário");
      }
    } catch (e) { console.error(e); }
  };

  const handleToggleRole = async (user) => {
    const newRole = user.role === "admin" ? "user" : "admin";
    if (!window.confirm(`Deseja alterar o cargo de ${user.email} para "${newRole.toUpperCase()}"?`)) return;

    try {
      const res = await fetch(`${API_URL}/users/${user.id}/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole })
      });

      if (res.ok) {
        setUsers(users.map(u => u.id === user.id ? { ...u, role: newRole } : u));
      } else {
        alert("Erro ao atualizar cargo");
      }
    } catch (e) { console.error(e); }
  };

  return (
    <div className="container">
      <div className="header">
        <h1>Painel Administrativo</h1>
        <p>Gerencie conteúdo e usuários da plataforma.</p>
      </div>

      {/* Navegação de Abas */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem', justifyContent: 'center' }}>
        <button className={`btn ${activeTab === 'plans' ? 'primary' : ''}`} onClick={() => setActiveTab('plans')}>
          Gerenciar Aulas
        </button>
        <button className={`btn ${activeTab === 'users' ? 'primary' : ''}`} onClick={() => setActiveTab('users')}>
          Gerenciar Usuários
        </button>
      </div>

      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem", alignItems: "center" }}>
          <h3>{activeTab === 'plans' ? `Aulas Cadastradas` : `Usuários Cadastrados (${users.length})`}</h3>
          <button className="btn small" onClick={handleRefresh}><RefreshCw size={14}/> Atualizar</button>
        </div>

        {/* TABELA DE AULAS */}
        {activeTab === 'plans' && (
          loadingPlans ? <div className="status">Carregando aulas...</div> : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Título</th>
                      <th>Área</th>
                      <th>Banca / Concurso</th>
                      <th>Ano</th>
                      <th>Data</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plans.map((plan) => (
                      <tr key={plan.id}>
                        <td>#{plan.id}</td>
                        <td style={{ maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={plan.title}>
                          <strong>{plan.title}</strong>
                        </td>
                        <td><span className="badge-area">{plan.area}</span></td>
                        <td>
                          {plan.banca && <span style={{ fontWeight: 600 }}>{plan.banca}</span>}
                          {plan.concurso && <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{plan.concurso}</div>}
                        </td>
                        <td>{plan.ano || '-'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{new Date(plan.created_at).toLocaleDateString()}</td>
                        <td>
                          <div className="actions-cell">
                            <Link to={`/aula/${plan.id}`} className="btn small" title="Ver"><Eye size={16} /></Link>
                            <button className="btn small" onClick={() => handleOpenEdit(plan)} title="Editar" style={{ background: '#f1f5f9', color: '#3b82f6', borderColor: '#cbd5e1' }}><Edit size={16} /></button>
                            <button className="btn small error-btn" onClick={() => handleDeletePlan(plan.id)} title="Deletar"><Trash2 size={16} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {plans.length === 0 && <tr><td colSpan="7" style={{textAlign: 'center', padding: '2rem'}}>Nenhuma aula encontrada.</td></tr>}
                  </tbody>
                </table>
              </div>

              {/* Paginação de Aulas */}
              {totalPlanPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #e2e8f0' }}>
                  <button className="btn small" onClick={() => goToPlanPage(currentPlanPage - 1)} disabled={currentPlanPage === 1}><ChevronLeft size={16} /> Ant</button>
                  <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#475569' }}>Página {currentPlanPage} de {totalPlanPages}</span>
                  <button className="btn small" onClick={() => goToPlanPage(currentPlanPage + 1)} disabled={currentPlanPage === totalPlanPages}>Próx <ChevronRight size={16} /></button>
                </div>
              )}
            </>
          )
        )}

        {/* TABELA DE USUÁRIOS */}
        {activeTab === 'users' && (
          loadingUsers ? <div className="status">Carregando usuários...</div> : (
            <div style={{ overflowX: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Email</th>
                    <th>Cargo</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>#{u.id}</td>
                      <td>{u.email}</td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold', backgroundColor: u.role === 'admin' ? '#dbeafe' : '#f1f5f9', color: u.role === 'admin' ? '#1e40af' : '#475569' }}>
                          {u.role === 'admin' ? <Shield size={12}/> : <User size={12}/>}
                          {u.role.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <div className="actions-cell">
                          <button className="btn small" onClick={() => handleToggleRole(u)} title={u.role === 'admin' ? "Rebaixar para User" : "Promover a Admin"} disabled={u.id === 1}><UserCog size={16} /></button>
                          <button className="btn small error-btn" onClick={() => handleDeleteUser(u.id)} title="Excluir Usuário" disabled={u.id === 1}><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && <tr><td colSpan="4" style={{textAlign: 'center', padding: '2rem'}}>Nenhum usuário encontrado.</td></tr>}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* ======================= */}
      {/* MODAL DE EDIÇÃO DE AULA */}
      {/* ======================= */}
      {editingPlan && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.8)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '30px', width: '100%', maxWidth: '500px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
            <h3 style={{ marginTop: 0, color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '15px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Edit size={22} color="#3b82f6" /> Editar Metadados da Aula
            </h3>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', color: '#334155', marginBottom: '5px' }}>Título</label>
              <input type="text" value={editFormData.title} onChange={e => setEditFormData({...editFormData, title: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
            </div>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', color: '#334155', marginBottom: '5px' }}>Área (Disciplina)</label>
              <input type="text" value={editFormData.area} onChange={e => setEditFormData({...editFormData, area: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
            </div>

            <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontWeight: 'bold', color: '#334155', marginBottom: '5px' }}>Ano</label>
                <input type="text" value={editFormData.ano} onChange={e => setEditFormData({...editFormData, ano: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontWeight: 'bold', color: '#334155', marginBottom: '5px' }}>Banca</label>
                <input type="text" value={editFormData.banca} onChange={e => setEditFormData({...editFormData, banca: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
              </div>
            </div>

            <div style={{ marginBottom: '25px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', color: '#334155', marginBottom: '5px' }}>Concurso</label>
              <input type="text" value={editFormData.concurso} onChange={e => setEditFormData({...editFormData, concurso: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px' }}>
              <button onClick={() => setEditingPlan(null)} disabled={savingPlan} style={{ padding: '10px 20px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#475569', cursor: 'pointer', fontWeight: 'bold' }}>Cancelar</button>
              <button onClick={handleSaveEdit} disabled={savingPlan} style={{ padding: '10px 20px', borderRadius: '6px', border: 'none', background: '#3b82f6', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>{savingPlan ? "⏳ Salvando..." : "Salvar Alterações"}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}