import React, { useEffect, useState } from "react";
import { Trash2, RefreshCw, UserCog, User, Shield, Edit, Plus } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function AdminPanel() {
  const { user } = useAuth(); 
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userFormData, setUserFormData] = useState({ email: '', password: '', role: 'user', can_manage_lessons: false });
  const [savingUser, setSavingUser] = useState(false);

  const fetchUsers = () => {
    setLoadingUsers(true);
    fetch(`${API_URL}/users`)
      .then((res) => res.json())
      .then((data) => setUsers(data || []))
      .catch((err) => console.error(err))
      .finally(() => setLoadingUsers(false));
  };

  useEffect(() => {
    if (user?.role === 'admin') fetchUsers();
  }, [user]); 

  const handleOpenUserModal = (userData = null) => {
    setEditingUser(userData);
    if (userData) {
      setUserFormData({ email: userData.email, password: '', role: userData.role, can_manage_lessons: userData.can_manage_lessons || false });
    } else {
      setUserFormData({ email: '', password: '', role: 'user', can_manage_lessons: false });
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setUserModalOpen(false);
        fetchUsers();
      } else {
        const err = await res.json();
        alert(err.detail || "Erro ao salvar usuário.");
      }
    } catch (e) { console.error(e); } finally { setSavingUser(false); }
  };

  const handleDeleteUser = async (id) => {
    if (!window.confirm("Tem certeza que deseja excluir este usuário permanentemente?")) return;
    try {
      const res = await fetch(`${API_URL}/users/${id}`, { method: "DELETE" });
      if (res.ok) setUsers(users.filter((u) => u.id !== id));
      else alert("Erro ao deletar usuário");
    } catch (e) { console.error(e); }
  };

  return (
    <div className="container">
      <div className="header">
        <h1>Painel Administrativo</h1>
        <p>Gerencie os acessos e permissões dos usuários do sistema.</p>
      </div>

      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem", alignItems: "center" }}>
          <h3>Usuários do Sistema ({users.length})</h3>
          <div style={{display: 'flex', gap: '10px'}}>
            <button className="btn primary small" onClick={() => handleOpenUserModal()}><Plus size={14}/> Novo Usuário</button>
            <button className="btn small" onClick={fetchUsers}><RefreshCw size={14}/> Atualizar</button>
          </div>
        </div>

        {loadingUsers ? <div className="status">A carregar utilizadores...</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Email</th>
                  <th>Nível de Acesso</th>
                  <th>Permissões Extras</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>#{u.id}</td>
                    <td><strong>{u.email}</strong></td>
                    <td>{u.role.toUpperCase()}</td>
                    <td>
                      {u.can_manage_lessons ? (
                        <span style={{ color: '#1e40af', backgroundColor: '#dbeafe', padding: '2px 6px', borderRadius: '4px', fontSize: '0.8rem' }}>
                          ✅ Gerenciar Aulas
                        </span>
                      ) : (
                        <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Apenas Leitura</span>
                      )}
                    </td>
                    <td>
                      <div className="actions-cell">
                        <button className="btn small" onClick={() => handleOpenUserModal(u)} disabled={u.id === 1} title="Editar Usuário"><Edit size={16} /></button>
                        <button className="btn small error-btn" onClick={() => handleDeleteUser(u.id)} disabled={u.id === 1} title="Excluir"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {userModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.8)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '30px', width: '100%', maxWidth: '400px' }}>
            <h3 style={{ marginTop: 0, borderBottom: '1px solid #e2e8f0', paddingBottom: '15px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UserCog size={22} color="#3b82f6" /> {editingUser ? "Editar Usuário" : "Novo Usuário"}
            </h3>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '5px' }}>E-mail</label>
              <input type="email" value={userFormData.email} onChange={e => setUserFormData({...userFormData, email: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '5px' }}>Senha {editingUser && <span style={{fontWeight: 'normal', color: '#64748b'}}>(Deixe em branco para não alterar)</span>}</label>
              <input type="password" value={userFormData.password} onChange={e => setUserFormData({...userFormData, password: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '5px' }}>Nível de Acesso</label>
              <select value={userFormData.role} onChange={e => setUserFormData({...userFormData, role: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                <option value="user">Usuário Padrão (Aluno)</option>
                <option value="admin">Administrador Global</option>
              </select>
            </div>

            <div style={{ marginBottom: '25px', background: '#f8fafc', padding: '15px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 'bold', color: '#334155' }}>
                <input type="checkbox" checked={userFormData.can_manage_lessons} onChange={e => setUserFormData({...userFormData, can_manage_lessons: e.target.checked})} style={{ width: '18px', height: '18px' }} />
                Permitir Criação/Gestão de Aulas
              </label>
              <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '5px 0 0 28px' }}>
                Se marcado, o utilizador poderá gerar e gerir aulas.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setUserModalOpen(false)} disabled={savingUser} className="btn small">Cancelar</button>
              <button onClick={handleSaveUser} disabled={savingUser} className="btn primary small">{savingUser ? "A guardar..." : "Guardar"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}