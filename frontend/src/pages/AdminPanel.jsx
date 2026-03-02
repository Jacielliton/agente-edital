import React, { useEffect, useState } from "react";
import { Trash2, Eye, RefreshCw, UserCog, User, Shield, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState("plans"); // 'plans' ou 'users'

  // --- ESTADOS DE AULAS ---
  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [currentPlanPage, setCurrentPlanPage] = useState(1);
  const [totalPlanPages, setTotalPlanPages] = useState(1);
  const limitPlansPerPage = 10;

  // --- ESTADOS DE USUÁRIOS ---
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // --- CARREGAMENTO DE AULAS (Com Paginação) ---
  const fetchPlans = (page = 1) => {
    setLoadingPlans(true);
    fetch(`http://localhost:8000/plans?page=${page}&limit=${limitPlansPerPage}`)
      .then((res) => res.json())
      .then((data) => {
        // O backend agora retorna { items: [], total: X }
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
    fetch("http://localhost:8000/users")
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
      const res = await fetch(`http://localhost:8000/plans/${id}`, { method: "DELETE" });
      if (res.ok) {
        // Recarrega a página atual para manter a consistência da paginação
        fetchPlans(currentPlanPage);
      } else {
        alert("Erro ao deletar aula");
      }
    } catch (e) { console.error(e); }
  };

  // --- AÇÕES DE USUÁRIOS ---
  const handleDeleteUser = async (id) => {
    if (!window.confirm("Tem certeza que deseja excluir este usuário permanentemente?")) return;
    try {
      const res = await fetch(`http://localhost:8000/users/${id}`, { method: "DELETE" });
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
      const res = await fetch(`http://localhost:8000/users/${user.id}/role`, {
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
        <button 
          className={`btn ${activeTab === 'plans' ? 'primary' : ''}`}
          onClick={() => setActiveTab('plans')}
        >
          Gerenciar Aulas
        </button>
        <button 
          className={`btn ${activeTab === 'users' ? 'primary' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          Gerenciar Usuários
        </button>
      </div>

      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem", alignItems: "center" }}>
          <h3>
            {activeTab === 'plans' ? `Aulas Cadastradas` : `Usuários Cadastrados (${users.length})`}
          </h3>
          <button className="btn small" onClick={handleRefresh}>
            <RefreshCw size={14}/> Atualizar
          </button>
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
                  <button 
                    className="btn small" 
                    onClick={() => goToPlanPage(currentPlanPage - 1)}
                    disabled={currentPlanPage === 1}
                  >
                    <ChevronLeft size={16} /> Ant
                  </button>
                  <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#475569' }}>
                    Página {currentPlanPage} de {totalPlanPages}
                  </span>
                  <button 
                    className="btn small" 
                    onClick={() => goToPlanPage(currentPlanPage + 1)}
                    disabled={currentPlanPage === totalPlanPages}
                  >
                    Próx <ChevronRight size={16} />
                  </button>
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
                        <span 
                          style={{ 
                            display: 'inline-flex', alignItems: 'center', gap: '5px',
                            padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold',
                            backgroundColor: u.role === 'admin' ? '#dbeafe' : '#f1f5f9',
                            color: u.role === 'admin' ? '#1e40af' : '#475569'
                          }}
                        >
                          {u.role === 'admin' ? <Shield size={12}/> : <User size={12}/>}
                          {u.role.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <div className="actions-cell">
                          <button 
                            className="btn small" 
                            onClick={() => handleToggleRole(u)}
                            title={u.role === 'admin' ? "Rebaixar para User" : "Promover a Admin"}
                            disabled={u.id === 1}
                          >
                            <UserCog size={16} />
                          </button>
                          
                          <button 
                            className="btn small error-btn" 
                            onClick={() => handleDeleteUser(u.id)}
                            title="Excluir Usuário"
                            disabled={u.id === 1}
                          >
                            <Trash2 size={16} />
                          </button>
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
    </div>
  );
}