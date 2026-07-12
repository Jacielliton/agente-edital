import React, { useEffect, useState } from "react";
import { Trash2, RefreshCw, UserCog, Shield, Edit, Plus, Search, Ban, CheckCircle, ShieldOff, FileText, DollarSign, Settings2 } from "lucide-react";
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
  const [leaderboard, setLeaderboard] = useState([]); 
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [searchTerm, setSearchTerm] = useState(""); 

  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userFormData, setUserFormData] = useState({ email: '', password: '', role: 'user', can_manage_lessons: false, is_active: true });
  const [savingUser, setSavingUser] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  // Estados do Novo Sistema de Comissões
  const [commissionModalOpen, setCommissionModalOpen] = useState(false);
  const [selectedUserForCommission, setSelectedUserForCommission] = useState(null);
  const [commissionTab, setCommissionTab] = useState('history'); // history, pay, edit
  const [commissionHistory, setCommissionHistory] = useState([]);
  const [actionAmount, setActionAmount] = useState("");
  const [actionDesc, setActionDesc] = useState("");
  const [isProcessingComm, setIsProcessingComm] = useState(false);

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
        setUsers(prevUsers => prevUsers.map(u => 
          u.id === selectedUser.id ? { ...u, plan_expires_at: new Date(Date.now() + 30*24*60*60*1000).toISOString() } : u
        ));
        alert("Plano atribuído com sucesso!");
        setShowModal(false);
        await fetchUsers(); 
      }
    } catch (e) { alert("Erro de conexão ao salvar plano."); }
  };

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
      }
    } catch (e) { alert("Erro de conexão ao remover plano"); }
  };

  // --- FUNÇÕES DA COMISSÃO ---
  const handleOpenCommissionModal = async (userObj) => {
    setSelectedUserForCommission(userObj);
    setActionAmount("");
    setActionDesc("");
    setCommissionTab('history');
    setCommissionModalOpen(true);
    
    // Busca o histórico de comissões
    try {
      const res = await fetch(`${API_URL}/admin/users/${userObj.id}/commissions`, {
        headers: { 'Authorization': `Bearer ${getAuthToken()}` }
      });
      if (res.ok) setCommissionHistory(await res.json());
    } catch (e) { console.error("Erro ao carregar histórico"); }
  };

  const submitCommissionAction = async (actionType) => {
    const amount = parseFloat(actionAmount.toString().replace(',', '.'));
    if (isNaN(amount) || amount < 0) return alert("Digite um valor válido.");
    
    if (actionType === 'pagamento' && amount > (selectedUserForCommission.commission_balance || 0)) {
      return alert("Não pode pagar um valor maior do que o saldo atual.");
    }

    setIsProcessingComm(true);
    try {
      const res = await fetch(`${API_URL}/admin/users/${selectedUserForCommission.id}/commission-action`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${getAuthToken()}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ action: actionType, amount, description: actionDesc })
      });
      
      if (res.ok) {
        const data = await res.json();
        // Atualiza a tabela principal
        setUsers(users.map(u => u.id === selectedUserForCommission.id ? { ...u, commission_balance: data.new_balance } : u));
        // Atualiza o usuário focado no modal
        setSelectedUserForCommission({...selectedUserForCommission, commission_balance: data.new_balance});
        
        // Limpa campos e volta para o histórico
        setActionAmount("");
        setActionDesc("");
        setCommissionTab('history');
        
        // Recarrega o histórico
        const histRes = await fetch(`${API_URL}/admin/users/${selectedUserForCommission.id}/commissions`, {
          headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        if (histRes.ok) setCommissionHistory(await histRes.json());
        
        alert("Ação realizada com sucesso!");
      } else {
        const err = await res.json();
        alert(err.detail || "Erro ao processar ação.");
      }
    } catch (e) {
      alert("Erro de conexão ao processar comissão.");
    } finally {
      setIsProcessingComm(false);
    }
  };

  const handleToggleStatus = async (userObj) => {
    if (userObj.id === 1) return alert("Não é possível suspender o Admin Principal.");
    const newStatus = !userObj.is_active;
    if (!window.confirm(newStatus ? `Reativar a conta de ${userObj.email}?` : `Suspender o acesso de ${userObj.email}?`)) return;

    try {
      const res = await fetch(`${API_URL}/users/${userObj.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getAuthToken()}` },
        body: JSON.stringify({ is_active: newStatus })
      });
      if (res.ok) setUsers(users.map(u => u.id === userObj.id ? { ...u, is_active: newStatus } : u));
    } catch (e) { console.error(e); }
  };

  const fetchUsers = async () => {
    setLoadingUsers(true);
    const token = getAuthToken();
    try {
      const resUsers = await fetch(`${API_URL}/users`, { headers: { "Authorization": `Bearer ${token}` } });
      if (resUsers.ok) setUsers(await resUsers.json() || []);

      try {
        const resLead = await fetch(`${API_URL}/performance/leaderboard`, { headers: { "Authorization": `Bearer ${token}` } });
        if (resLead.ok) setLeaderboard(await resLead.json() || []);
      } catch (leadErr) {}
    } catch (err) { alert("Erro ao carregar dados dos usuários."); } 
    finally { setLoadingUsers(false); }
  };

  useEffect(() => { if (user?.role === 'admin') fetchUsers(); }, [user]); 

  const handleOpenUserModal = (userData = null) => {
    setEditingUser(userData);
    if (userData) {
      setUserFormData({ email: userData.email, password: '', role: userData.role, can_manage_lessons: userData.can_manage_lessons || false, is_active: userData.is_active !== undefined ? userData.is_active : true });
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
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getAuthToken()}` },
        body: JSON.stringify(payload)
      });
      if (res.ok) { setUserModalOpen(false); fetchUsers(); } 
      else { const err = await res.json(); alert(err.detail || "Erro ao salvar usuário."); }
    } catch (e) { alert("Erro de conexão ao salvar usuário."); } 
    finally { setSavingUser(false); }
  };

  const handleDeleteUser = async (id) => {
    if (!window.confirm("Tem certeza que deseja excluir este usuário permanentemente?")) return;
    try {
      const res = await fetch(`${API_URL}/users/${id}`, { method: "DELETE", headers: { "Authorization": `Bearer ${getAuthToken()}` } });
      if (res.ok) setUsers(users.filter((u) => u.id !== id));
    } catch (e) { console.error(e); }
  };

  const filteredUsers = users.filter(u => u.email.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="container">
      <div className="header" style={{ textAlign: "left" }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Shield size={28} color="var(--primary)" /> Painel Administrativo
        </h1>
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Gerencie acessos, permissões e comissões dos utilizadores.</p>
      </div>

      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem", alignItems: "center", flexWrap: "wrap", gap: "15px" }}>
          <h3 style={{ margin: 0, color: 'var(--heading-color)' }}>Usuários ({filteredUsers.length})</h3>
          <div style={{display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center'}}>
            <div style={{ position: 'relative' }}>
              <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
              <input type="text" placeholder="Pesquisar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ padding: '8px 10px 8px 32px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-main)', fontSize: '0.9rem', outline: 'none' }} />
            </div>
            <button className="btn primary small" onClick={() => handleOpenUserModal()}><Plus size={14}/> Novo</button>
            <button className="btn small" onClick={fetchUsers}><RefreshCw size={14}/> Atualizar</button>
          </div>
        </div>

        {loadingUsers ? <div className="status">A carregar...</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID / Status</th>
                  <th>Email</th>
                  <th>Comissões</th>
                  <th>Status da Assinatura</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const expireDate = u.plan_expires_at ? new Date(u.plan_expires_at) : null;
                  const now = new Date();
                  let planStatus = "Gratuito (Sem Plano)";
                  let statusColor = "var(--text-muted)";
                  let hasActivePlan = false;

                  if (u.role === 'admin') {
                    planStatus = "Vitalício (Admin)"; statusColor = "var(--primary)"; hasActivePlan = true;
                  } else if (expireDate && !isNaN(expireDate.getTime())) {
                    if (expireDate > now) { planStatus = `Ativo até ${expireDate.toLocaleDateString()}`; statusColor = "var(--success-text)"; hasActivePlan = true; } 
                    else { planStatus = `Expirou em ${expireDate.toLocaleDateString()}`; statusColor = "var(--error-text)"; }
                  }

                  return (
                    <tr key={u.id} style={{ opacity: u.is_active === false ? 0.6 : 1 }}>
                      <td style={{ color: 'var(--text-secondary)' }}>
                        #{u.id} <br/>
                        {u.is_active !== false ? <span style={{ fontSize: '0.7rem', color: 'var(--success-text)' }}>● Ativo</span> : <span style={{ fontSize: '0.7rem', color: 'var(--error-text)' }}>● Suspenso</span>}
                      </td>
                      <td style={{ color: u.is_active === false ? 'var(--error-text)' : 'var(--text-main)', textDecoration: u.is_active === false ? 'line-through' : 'none' }}>
                        <strong>{u.email}</strong><br/>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.role.toUpperCase()}</span>
                      </td>

                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          <span style={{ color: 'var(--success-text)', fontWeight: 'bold' }}>
                            R$ {(u.commission_balance || 0).toFixed(2).replace('.', ',')}
                          </span>
                          <button 
                            onClick={() => handleOpenCommissionModal(u)}
                            style={{ background: 'transparent', border: '1px solid var(--text-muted)', color: 'var(--text-main)', borderRadius: '4px', cursor: 'pointer', padding: '2px 5px', fontSize: '0.7rem', alignSelf: 'flex-start' }}
                          >
                            Gerenciar Ganhos
                          </button>
                        </div>
                      </td>

                      <td style={{ color: statusColor, fontWeight: 'bold', fontSize: '0.85rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          {planStatus}
                          {u.role !== 'admin' && hasActivePlan && (
                            <button onClick={() => handleRevokePlan(u.id)} title="Revogar Plano" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error-text)', padding: '0 5px' }}><ShieldOff size={14} /></button>
                          )}
                        </div>
                      </td>

                      <td>
                        <div className="actions-cell">
                          <button className="btn small" onClick={() => handleToggleStatus(u)} disabled={u.id === 1} title={u.is_active === false ? "Reativar" : "Suspender"} style={{ background: u.is_active === false ? 'var(--success-bg)' : 'var(--error-bg)', color: u.is_active === false ? 'var(--success-text)' : 'var(--error-text)', borderColor: 'transparent' }}>
                            {u.is_active === false ? <CheckCircle size={16} /> : <Ban size={16} />}
                          </button>
                          <button className="btn small" onClick={() => handleOpenUserModal(u)} disabled={u.id === 1} title="Editar"><Edit size={16} /></button>
                          <button className="btn small error-btn" onClick={() => handleDeleteUser(u.id)} disabled={u.id === 1} title="Excluir"><Trash2 size={16} /></button>
                          <button onClick={() => {setSelectedUser(u); setShowModal(true);}} title="Gerenciar Plano" style={{ background: 'var(--success-bg)', border: 'none', padding: '5px', borderRadius: '4px', cursor: 'pointer' }}>
                            <Shield size={16} color="var(--success-text)" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- MODAL DA COMISSÃO COMPLETO --- */}
      {commissionModalOpen && selectedUserForCommission && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '20px' }}>
          <div style={{ background: 'var(--card-bg)', padding: '0', borderRadius: '12px', border: '1px solid var(--border)', width: '100%', maxWidth: '600px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
            
            {/* Header */}
            <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--heading-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Gestão de Comissões
                </h3>
                <p style={{ margin: '5px 0 0 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{selectedUserForCommission.email}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Saldo Atual Disponível</span><br/>
                <strong style={{ fontSize: '1.5rem', color: 'var(--success-text)' }}>R$ {(selectedUserForCommission.commission_balance || 0).toFixed(2).replace('.', ',')}</strong>
              </div>
            </div>

            {/* Abas */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
              <button onClick={() => setCommissionTab('history')} style={{ flex: 1, padding: '12px', border: 'none', borderBottom: commissionTab === 'history' ? '3px solid var(--primary)' : '3px solid transparent', background: 'transparent', color: commissionTab === 'history' ? 'var(--primary)' : 'var(--text-main)', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', gap: '5px' }}>
                <FileText size={16}/> Relatório
              </button>
              <button onClick={() => {setCommissionTab('pay'); setActionAmount(selectedUserForCommission.commission_balance ? selectedUserForCommission.commission_balance.toFixed(2) : ""); setActionDesc("");}} style={{ flex: 1, padding: '12px', border: 'none', borderBottom: commissionTab === 'pay' ? '3px solid var(--success-text)' : '3px solid transparent', background: 'transparent', color: commissionTab === 'pay' ? 'var(--success-text)' : 'var(--text-main)', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', gap: '5px' }}>
                <DollarSign size={16}/> Pagar
              </button>
              <button onClick={() => {setCommissionTab('edit'); setActionAmount(selectedUserForCommission.commission_balance ? selectedUserForCommission.commission_balance.toFixed(2) : ""); setActionDesc("");}} style={{ flex: 1, padding: '12px', border: 'none', borderBottom: commissionTab === 'edit' ? '3px solid var(--text-main)' : '3px solid transparent', background: 'transparent', color: commissionTab === 'edit' ? 'var(--heading-color)' : 'var(--text-muted)', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', gap: '5px' }}>
                <Settings2 size={16}/> Editar Saldo
              </button>
            </div>

            {/* Conteúdo Dinâmico */}
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1, background: 'var(--card-bg)' }}>
              
              {commissionTab === 'history' && (
                <div>
                  {commissionHistory.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>Nenhum registro encontrado.</div>
                  ) : (
                    <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          <th style={{ textAlign: 'left', padding: '8px', color: 'var(--text-muted)' }}>Data</th>
                          <th style={{ textAlign: 'left', padding: '8px', color: 'var(--text-muted)' }}>Tipo</th>
                          <th style={{ textAlign: 'left', padding: '8px', color: 'var(--text-muted)' }}>Descrição</th>
                          <th style={{ textAlign: 'right', padding: '8px', color: 'var(--text-muted)' }}>Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {commissionHistory.map((item) => (
                          <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '8px', color: 'var(--text-main)' }}>{new Date(item.created_at).toLocaleDateString()}</td>
                            <td style={{ padding: '8px' }}>
                              {item.action_type === 'ganho' && <span style={{ color: 'var(--success-text)', background: 'var(--success-bg)', padding: '2px 6px', borderRadius: '4px' }}>Entrada</span>}
                              {item.action_type === 'pagamento' && <span style={{ color: 'var(--error-text)', background: 'var(--error-bg)', padding: '2px 6px', borderRadius: '4px' }}>Pagamento</span>}
                              {item.action_type === 'ajuste' && <span style={{ color: '#3b82f6', background: '#eff6ff', padding: '2px 6px', borderRadius: '4px' }}>Ajuste</span>}
                            </td>
                            <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>{item.description}</td>
                            <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', color: item.action_type === 'pagamento' ? 'var(--error-text)' : 'var(--text-main)' }}>
                              {item.action_type === 'pagamento' ? '-' : ''} R$ {item.amount.toFixed(2).replace('.', ',')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {commissionTab === 'pay' && (
                <div>
                  <div style={{ background: 'var(--success-bg)', padding: '15px', borderRadius: '8px', border: '1px solid var(--success-text)', marginBottom: '20px' }}>
                    <p style={{ margin: 0, color: 'var(--text-main)', fontSize: '0.9rem' }}>Use esta opção para registrar que você enviou um PIX ou transferência ao afiliado. O valor será deduzido do saldo total.</p>
                  </div>
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-main)', fontWeight: 'bold' }}>Valor do Pagamento (R$)</label>
                    <input type="number" step="0.01" max={selectedUserForCommission.commission_balance || 0} value={actionAmount} onChange={(e) => setActionAmount(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-main)' }} />
                  </div>
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-main)', fontWeight: 'bold' }}>Descrição / Comprovante (Opcional)</label>
                    <input type="text" placeholder="Ex: PIX enviado dia 10/10" value={actionDesc} onChange={(e) => setActionDesc(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-main)' }} />
                  </div>
                  <button onClick={() => submitCommissionAction('pagamento')} disabled={isProcessingComm} className="btn primary" style={{ width: '100%', justifyContent: 'center', background: '#10b981', borderColor: '#10b981' }}>
                    {isProcessingComm ? "Processando..." : "Confirmar e Deduzir Saldo"}
                  </button>
                </div>
              )}

              {commissionTab === 'edit' && (
                <div>
                  <div style={{ background: 'var(--bg)', padding: '15px', borderRadius: '8px', border: '1px dashed var(--border)', marginBottom: '20px' }}>
                    <p style={{ margin: 0, color: 'var(--text-main)', fontSize: '0.9rem' }}>⚠️ <strong>Edição Livre:</strong> Defina o valor exato que deve ficar na conta do usuário (útil para corrigir erros no sistema).</p>
                  </div>
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-main)', fontWeight: 'bold' }}>Novo Saldo Exato (R$)</label>
                    <input type="number" step="0.01" value={actionAmount} onChange={(e) => setActionAmount(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-main)' }} />
                  </div>
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-main)', fontWeight: 'bold' }}>Motivo do Ajuste</label>
                    <input type="text" placeholder="Ex: Correção de lançamento duplicado" value={actionDesc} onChange={(e) => setActionDesc(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-main)' }} />
                  </div>
                  <button onClick={() => submitCommissionAction('ajuste')} disabled={isProcessingComm} className="btn" style={{ width: '100%', justifyContent: 'center' }}>
                    {isProcessingComm ? "Processando..." : "Forçar Novo Saldo"}
                  </button>
                </div>
              )}
            </div>

            <div style={{ padding: '15px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg)', textAlign: 'right' }}>
              <button onClick={() => setCommissionModalOpen(false)} disabled={isProcessingComm} className="btn small" style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-main)' }}>Fechar Janela</button>
            </div>
          </div>
        </div>
      )}

      {/* Outros Modais (Gerenciar Plano, Novo Usuário, etc) continuam inalterados... */}
      {userModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.8)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '30px', width: '100%', maxWidth: '400px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
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