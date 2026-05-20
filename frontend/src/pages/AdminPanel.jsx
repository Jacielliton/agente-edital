import React, { useEffect, useState } from "react";
import { Trash2, RefreshCw, UserCog, Shield, Edit, Plus, Search } from "lucide-react";
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
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [searchTerm, setSearchTerm] = useState(""); // Novo estado para pesquisa

  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userFormData, setUserFormData] = useState({ email: '', password: '', role: 'user', can_manage_lessons: false });
  const [savingUser, setSavingUser] = useState(false);

  const fetchUsers = () => {
    setLoadingUsers(true);
    fetch(`${API_URL}/users`, {
      headers: { "Authorization": `Bearer ${getAuthToken()}` } // <-- TOKEN INJETADO AQUI
    })
      .then((res) => {
        if (!res.ok) throw new Error("Acesso negado ou token inválido");
        return res.json();
      })
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
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${getAuthToken()}` // <-- TOKEN INJETADO AQUI
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
        headers: { "Authorization": `Bearer ${getAuthToken()}` } // <-- TOKEN INJETADO AQUI
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
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Gerencie os acessos e permissões dos usuários do sistema.</p>
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
                  <th>ID</th>
                  <th>Email</th>
                  <th>Nível de Acesso</th>
                  <th>Permissões Extras</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                      Nenhum utilizador encontrado.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr key={u.id}>
                      <td style={{ color: 'var(--text-secondary)' }}>#{u.id}</td>
                      <td style={{ color: 'var(--text-main)' }}><strong>{u.email}</strong></td>
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
                          <button className="btn small" onClick={() => handleOpenUserModal(u)} disabled={u.id === 1} title="Editar Usuário"><Edit size={16} /></button>
                          <button className="btn small error-btn" onClick={() => handleDeleteUser(u.id)} disabled={u.id === 1} title="Excluir"><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  ))
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
    </div>
  );
}