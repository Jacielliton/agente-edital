import React, { useEffect, useState } from "react";
import { Trash2, RefreshCw, UserCog, Shield, Edit, Plus, Search, Ban, CheckCircle, ShieldOff } from "lucide-react";
import { useAuth } from "../context/AuthContext";

// Função robusta para capturar o token em qualquer ambiente
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
  return "";
};

export default function AdminPanel() {
  const { user } = useAuth(); 
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  const [users, setUsers] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]); // <-- Novo estado para XP/Ranking
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [searchTerm, setSearchTerm] = useState(""); 

  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userFormData, setUserFormData] = useState({ email: '', password: '', role: 'user', can_manage_lessons: false, is_active: true });
  const [savingUser, setSavingUser] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  const getStatusBadge = (expiresAt) => {
    if (!expiresAt) return <span style={{color: 'gray'}}>Gratuito (Sem Plano)</span>;
    
    const exp = new Date(expiresAt);
    const now = new Date();
    
    if (exp > now) {
      return <span style={{color: 'green', fontWeight: 'bold'}}>Ativo até {exp.toLocaleDateString()}</span>;
    } else {
      return <span style={{color: 'red'}}>Expirado em {exp.toLocaleDateString()}</span>;
    }
  };

  const handleSavePlan = async (planType) => {
    try {
      const res = await fetch(`${API_URL}/admin/grant-plan/${selectedUser.id}?plan=${planType}`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${getAuthToken()}`,
          'Content-Type': 'application/json' 
        }
      });
      
      if (res.ok) {
        // Otimização: Atualize o estado localmente sem esperar o próximo GET
        setUsers(prevUsers => prevUsers.map(u => 
          u.id === selectedUser.id 
            ? { ...u, plan_expires_at: new Date(Date.now() + 30*24*60*60*1000).toISOString() } // Simulação local temporária
            : u
        ));
        
        alert("Plano atribuído com sucesso!");
        setShowModal(false);
        await fetchUsers(); // Busca a confirmação real do banco
      }
    } catch (e) { 
      console.error(e);
      alert("Erro de conexão ao salvar plano.");
    }
  };

  // Função para remover plano
  const handleRevokePlan = async (userId) => {
    if (!window.confirm("Isso removerá imediatamente o acesso pago do usuário. Tem certeza?")) return;
    
    try {
      const res = await fetch(`${API_URL}/admin/revoke-plan/${userId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getAuthToken()}` }
      });
      
      if (res.ok) {
        setUsers(users.map(u => u.id === userId ? { ...u, plan_expires_at: new Date(Date.now() - 60000).toISOString() } : u));
        setShowModal(false);
        alert("Plano removido com sucesso!");
      } else {
        alert("Erro ao remover plano do usuário.");
      }
    } catch (e) { 
      alert("Erro de conexão ao remover plano"); 
    }
  };

  // Função para suspender/reativar usuário
  const handleToggleStatus = async (userObj) => {
    if (userObj.id === 1) return alert("Não é possível suspender o Admin Principal.");
    
    const newStatus = !userObj.is_active;
    const confirmMsg = newStatus 
      ? `Reativar a conta de ${userObj.email}?` 
      : `Suspender o acesso de ${userObj.email}? O usuário não conseguirá entrar no sistema.`;
      
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await fetch(`${API_URL}/users/${userObj.id}`, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${getAuthToken()}` 
        },
        body: JSON.stringify({ is_active: newStatus })
      });

      if (res.ok) {
        setUsers(users.map(u => u.id === userObj.id ? { ...u, is_active: newStatus } : u));
      } else {
        alert("Erro ao alterar status do usuário.");
      }
    } catch (e) { console.error(e); }
  };

  // Modificado para buscar Usuários e Leaderboard simultaneamente
  const fetchUsers = async () => {
    setLoadingUsers(true);
    const token = getAuthToken();

    try {
      // 1. Busca os usuários (Essencial)
      const resUsers = await fetch(`${API_URL}/users`, { 
        headers: { "Authorization": `Bearer ${token}` } 
      });

      if (!resUsers.ok) throw new Error("Acesso negado ou token inválido");
      
      const usersData = await resUsers.json();
      setUsers(usersData || []);

      // 2. Busca o Leaderboard (Opcional - não deve quebrar a página se falhar)
      try {
        const resLead = await fetch(`${API_URL}/performance/leaderboard`, { 
          headers: { "Authorization": `Bearer ${token}` } 
        });
        if (resLead.ok) {
          const leadData = await resLead.json();
          setLeaderboard(leadData || []);
        }
      } catch (leadErr) {
        console.warn("Leaderboard indisponível, mas carregando usuários normalmente.");
      }

    } catch (err) {
      console.error("Erro ao buscar dados do painel admin:", err);
      alert("Erro ao carregar dados dos usuários.");
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'admin') fetchUsers();
  }, [user]); 

  const handleOpenUserModal = (userData = null) => {
    setEditingUser(userData);
    if (userData) {
      setUserFormData({ 
        email: userData.email, 
        password: '', 
        role: userData.role, 
        can_manage_lessons: userData.can_manage_lessons || false,
        is_active: userData.is_active !== undefined ? userData.is_active : true
      });
    } else {
      setUserFormData({ email: '', password: '', role: 'user', can_manage_lessons: false, is_active: true });
    }
    setUserModalOpen(true);
  };

  const handleSaveUser = async () => {
    if (!userFormData.email) return alert("O e-mail é obrigatório.");
    if (!editingUser && !userFormData.password) return alert("A senha é obrigatória para novos usuários.");
    
    setSavingUser(true);
    const method = editingUser ? "PUT" : "POST";
    const endpoint = editingUser ? `${API_URL}/users/${editingUser.id}` : `${API_URL}/users`;

    const payload = { ...userFormData };
    if (editingUser && !payload.password) delete payload.password; 

    try {
      const res = await fetch(endpoint, {
        method,
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${getAuthToken()}` 
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setUserModalOpen(false);
        fetchUsers();
      } else {
        const err = await res.json();
        alert(err.detail || "Erro ao salvar usuário.");
      }
    } catch (e) { 
      console.error(e); 
      alert("Erro de conexão ao salvar usuário.");
    } finally { 
      setSavingUser(false); 
    }
  };

  const handleDeleteUser = async (id) => {
    if (!window.confirm("Tem certeza que deseja excluir este usuário permanentemente?")) return;
    try {
      const res = await fetch(`${API_URL}/users/${id}`, { 
        method: "DELETE",
        headers: { "Authorization": `Bearer ${getAuthToken()}` } 
      });
      if (res.ok) {
        setUsers(users.filter((u) => u.id !== id));
      } else {
        const err = await res.json();
        alert(err.detail || "Erro ao deletar usuário");
      }
    } catch (e) { 
      console.error(e); 
    }
  };


  const handleGrantPlan = (userObj) => {
    setSelectedUser(userObj);
    setShowModal(true);
  };

  // Filtragem dinâmica de usuários baseada na barra de pesquisa
  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="container">
      <div className="header" style={{ textAlign: "left" }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Shield size={28} color="var(--primary)" /> Painel Administrativo
        </h1>
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Gerencie os acessos, permissões e acompanhe o XP dos usuários do sistema.</p>
      </div>

      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem", alignItems: "center", flexWrap: "wrap", gap: "15px" }}>
          <h3 style={{ margin: 0, color: 'var(--heading-color)' }}>Usuários do Sistema ({filteredUsers.length})</h3>
          
          {/* BARRA DE PESQUISA E BOTÕES DE AÇÃO */}
          <div style={{display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center'}}>
            <div style={{ position: 'relative' }}>
              <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
              <input 
                type="text" 
                placeholder="Pesquisar por email..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ padding: '8px 10px 8px 32px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-main)', fontSize: '0.9rem', outline: 'none' }}
              />
            </div>
            <button className="btn primary small" onClick={() => handleOpenUserModal()}><Plus size={14}/> Novo</button>
            <button className="btn small" onClick={fetchUsers}><RefreshCw size={14}/> Atualizar</button>
          </div>
        </div>

        {loadingUsers ? <div className="status">A carregar utilizadores...</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID / Status</th>
                  <th>Email</th>
                  <th>XP / Elo</th> 
                  <th>Status da Assinatura</th>
                  <th>Nível de Acesso</th>
                  <th>Permissões Extras</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                      Nenhum utilizador encontrado.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    // Cruzamento dos dados: busca o usuário no Ranking Global
                    const userStats = leaderboard.find(l => l.email_completo === u.email);
                    const userXP = userStats ? Math.floor(userStats.xp) : 0;
                    const userElo = userStats ? userStats.elo : "Iniciante";

                    // Dentro do seu .map() de usuários:
                    const expireDate = u.plan_expires_at ? new Date(u.plan_expires_at) : null;
                    const now = new Date();

                    let planStatus = "Gratuito (Sem Plano)";
                    let statusColor = "var(--text-muted)";
                    let hasActivePlan = false;

                    if (u.role === 'admin') {
                      planStatus = "Vitalício (Admin)";
                      statusColor = "var(--primary)";
                      hasActivePlan = true;
                    } else if (expireDate && !isNaN(expireDate.getTime())) { // Verifica se é uma data válida
                      if (expireDate > now) {
                        planStatus = `Ativo até ${expireDate.toLocaleDateString()}`;
                        statusColor = "var(--success-text)"; // Verde
                        hasActivePlan = true;
                      } else {
                        planStatus = `Expirou em ${expireDate.toLocaleDateString()}`;
                        statusColor = "var(--error-text)"; // Vermelho
                      }
                    }

                    return (
                      <tr key={u.id} style={{ opacity: u.is_active === false ? 0.6 : 1 }}>
                        <td style={{ color: 'var(--text-secondary)' }}>
                          #{u.id} <br/>
                          {u.is_active !== false ? 
                            <span style={{ fontSize: '0.7rem', color: 'var(--success-text)' }}>● Ativo</span> : 
                            <span style={{ fontSize: '0.7rem', color: 'var(--error-text)' }}>● Suspenso</span>
                          }
                        </td>
                        <td style={{ color: u.is_active === false ? 'var(--error-text)' : 'var(--text-main)', textDecoration: u.is_active === false ? 'line-through' : 'none' }}>
                          <strong>{u.email}</strong>
                        </td>
                        
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <strong style={{ color: 'var(--primary)' }}>{userXP} XP</strong>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{userElo}</span>
                          </div>
                        </td>

                        {/* ---> NOVA CÉLULA NA TABELA <--- */}
                        <td style={{ color: statusColor, fontWeight: 'bold', fontSize: '0.85rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            {planStatus}
                            {/* Botão de Remover Plano na Própria Tabela (se não for admin e tiver plano ativo) */}
                            {u.role !== 'admin' && hasActivePlan && (
                              <button onClick={() => handleRevokePlan(u.id)} title="Revogar Plano" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error-text)', padding: '0 5px' }}>
                                <ShieldOff size={14} />
                              </button>
                            )}
                          </div>
                        </td>

                        <td>
                          {u.role === 'admin' ? (
                             <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', backgroundColor: '#1e293b', color: '#fff' }}>
                               ADMIN GLOBAL
                             </span>
                          ) : (
                             <span style={{ color: 'var(--text-main)', textTransform: 'uppercase', fontSize: '0.85rem', fontWeight: 'bold' }}>
                               {u.role}
                             </span>
                          )}
                        </td>
                        <td>
                          {u.can_manage_lessons ? (
                            <span style={{ color: 'var(--primary)', backgroundColor: 'var(--primary-light)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                              ✅ Gerenciar Aulas
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 'bold' }}>Apenas Leitura</span>
                          )}
                        </td>
                        <td>
                          <div className="actions-cell">
                            <button 
                              className="btn small" 
                              onClick={() => handleToggleStatus(u)} 
                              disabled={u.id === 1} 
                              title={u.is_active === false ? "Reativar Usuário" : "Suspender Usuário"}
                              style={{ background: u.is_active === false ? 'var(--success-bg)' : 'var(--error-bg)', color: u.is_active === false ? 'var(--success-text)' : 'var(--error-text)', borderColor: 'transparent' }}
                            >
                              {u.is_active === false ? <CheckCircle size={16} /> : <Ban size={16} />}
                            </button>

                            <button className="btn small" onClick={() => handleOpenUserModal(u)} disabled={u.id === 1} title="Editar Usuário"><Edit size={16} /></button>
                            <button className="btn small error-btn" onClick={() => handleDeleteUser(u.id)} disabled={u.id === 1} title="Excluir"><Trash2 size={16} /></button>
                            
                            <button 
                              onClick={() => handleGrantPlan(u)} // Passa o objeto usuário inteiro
                              title="Gerenciar Plano"
                              style={{ background: 'var(--success-bg)', border: 'none', padding: '5px', borderRadius: '4px', cursor: 'pointer' }}
                            >
                              <Shield size={16} color="var(--success-text)" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {userModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.8)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div 
            style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '30px', width: '100%', maxWidth: '400px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveUser() }} // Permite salvar com Enter
          >
            <h3 style={{ marginTop: 0, borderBottom: '1px solid var(--border)', color: 'var(--heading-color)', paddingBottom: '15px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UserCog size={22} color="var(--primary)" /> {editingUser ? "Editar Usuário" : "Novo Usuário"}
            </h3>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '5px', color: 'var(--text-main)' }}>E-mail</label>
              <input type="email" value={userFormData.email} onChange={e => setUserFormData({...userFormData, email: e.target.value})} autoFocus style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'var(--input-bg)', color: 'var(--text-main)', outline: 'none' }} />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '5px', color: 'var(--text-main)' }}>Senha {editingUser && <span style={{fontWeight: 'normal', color: 'var(--text-muted)'}}>(Deixe em branco para manter)</span>}</label>
              <input type="password" value={userFormData.password} onChange={e => setUserFormData({...userFormData, password: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'var(--input-bg)', color: 'var(--text-main)', outline: 'none' }} />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '5px', color: 'var(--text-main)' }}>Nível de Acesso</label>
              <select value={userFormData.role} onChange={e => setUserFormData({...userFormData, role: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'var(--input-bg)', color: 'var(--text-main)', outline: 'none' }}>
                <option value="user">Usuário Padrão (Aluno)</option>
                <option value="admin">Administrador Global</option>
              </select>
            </div>

            <div style={{ marginBottom: '25px', background: 'var(--bg)', padding: '15px', borderRadius: '6px', border: '1px solid var(--border)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 'bold', color: 'var(--text-main)' }}>
                <input type="checkbox" checked={userFormData.can_manage_lessons} onChange={e => setUserFormData({...userFormData, can_manage_lessons: e.target.checked})} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                Permitir Criação/Gestão de Aulas
              </label>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '5px 0 0 28px' }}>
                Se marcado, o utilizador poderá gerar e gerir as próprias aulas.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setUserModalOpen(false)} disabled={savingUser} className="btn small" style={{ backgroundColor: 'var(--hover-bg)', color: 'var(--text-main)', border: '1px solid var(--border)' }}>Cancelar</button>
              <button onClick={handleSaveUser} disabled={savingUser} className="btn primary small">{savingUser ? "A guardar..." : "Guardar (Enter)"}</button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: '20px', borderRadius: '8px', color: 'black', width: '300px' }}>
            <h3 style={{color: 'black', marginBottom: '15px'}}>Gerenciar plano de {selectedUser?.email.split('@')[0]}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {['mensal', 'trimestral', 'semestral', 'anual'].map(p => (
                <button key={p} onClick={() => handleSavePlan(p)} style={{padding: '10px', cursor: 'pointer', background: '#0f172a', color: 'white', border: 'none', borderRadius: '4px'}}>{p.toUpperCase()}</button>
              ))}
              <hr style={{margin: '10px 0'}}/>
              <button onClick={() => handleRevokePlan(selectedUser?.id)} style={{ background: '#ef4444', color: 'white', padding: '10px', cursor: 'pointer', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}>Remover Plano Ativo</button>
              <button onClick={() => setShowModal(false)} style={{ background: 'gray', color: 'white', padding: '10px', cursor: 'pointer', border: 'none', borderRadius: '4px' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}