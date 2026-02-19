import React, { useEffect, useState } from "react";
import { Trash2, Eye, RefreshCw, UserCog, User, Shield, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";

export default function AdminPanel() {
  const [plans, setPlans] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("plans"); // 'plans' ou 'users'

  // --- CARREGAMENTO DE DADOS ---
  const fetchData = () => {
    setLoading(true);
    
    // Busca Aulas e Usuários em paralelo
    Promise.all([
      fetch("http://localhost:8000/plans").then(res => res.json()),
      fetch("http://localhost:8000/users").then(res => res.json())
    ])
    .then(([plansData, usersData]) => {
      setPlans(plansData || []);
      setUsers(usersData || []);
    })
    .catch((err) => console.error(err))
    .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- AÇÕES DE AULAS ---
  const handleDeletePlan = async (id) => {
    if (!window.confirm("Tem certeza que deseja deletar esta aula?")) return;
    try {
      const res = await fetch(`http://localhost:8000/plans/${id}`, { method: "DELETE" });
      if (res.ok) setPlans(plans.filter((p) => p.id !== id));
      else alert("Erro ao deletar aula");
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
        // Atualiza a lista localmente
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
            {activeTab === 'plans' ? `Aulas Cadastradas (${plans.length})` : `Usuários Cadastrados (${users.length})`}
          </h3>
          <button className="btn small" onClick={fetchData}><RefreshCw size={14}/> Atualizar</button>
        </div>

        {loading ? (
          <div className="status">Carregando dados...</div>
        ) : (
          <>
            {/* TABELA DE AULAS */}
            {activeTab === 'plans' && (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Título</th>
                    <th>Área</th>
                    <th>Data</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((plan) => (
                    <tr key={plan.id}>
                      <td>#{plan.id}</td>
                      <td><strong>{plan.title}</strong></td>
                      <td><span className="badge-area">{plan.area}</span></td>
                      <td>{new Date(plan.created_at).toLocaleDateString()}</td>
                      <td>
                        <div className="actions-cell">
                          <Link to={`/aula/${plan.id}`} className="btn small" title="Ver"><Eye size={16} /></Link>
                          <button className="btn small error-btn" onClick={() => handleDeletePlan(plan.id)} title="Deletar"><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {plans.length === 0 && <tr><td colSpan="5" style={{textAlign: 'center', padding: '2rem'}}>Nenhuma aula encontrada.</td></tr>}
                </tbody>
              </table>
            )}

            {/* TABELA DE USUÁRIOS */}
            {activeTab === 'users' && (
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
                            disabled={u.id === 1} // Protege o admin mestre (opcional)
                          >
                            <UserCog size={16} />
                          </button>
                          
                          <button 
                            className="btn small error-btn" 
                            onClick={() => handleDeleteUser(u.id)}
                            title="Excluir Usuário"
                            disabled={u.id === 1} // Protege o admin mestre
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
            )}
          </>
        )}
      </div>
    </div>
  );
}