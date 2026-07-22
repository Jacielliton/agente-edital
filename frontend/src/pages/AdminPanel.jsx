import React, { useEffect, useState } from "react";
import { Trash2, RefreshCw, UserCog, Shield, Edit, Plus, Search, Ban, CheckCircle, ShieldOff, FileText, DollarSign, Settings2, Ticket } from "lucide-react";
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

  // Estados de Usuários
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

  // Estados de Cupons
  const [coupons, setCoupons] = useState([]);
  const [loadingCoupons, setLoadingCoupons] = useState(false);
  const [couponModalOpen, setCouponModalOpen] = useState(false);
  const [savingCoupon, setSavingCoupon] = useState(false);
  // CORRIGIDO: discount_percent para discount_percentage
  const [couponFormData, setCouponFormData] = useState({ code: '', discount_percentage: 10, max_uses: 100, expires_at: '' });

  // Estados de Comissões
  const [commissionModalOpen, setCommissionModalOpen] = useState(false);
  const [selectedUserForCommission, setSelectedUserForCommission] = useState(null);
  const [commissionTab, setCommissionTab] = useState('history'); // history, pay, edit
  const [commissionHistory, setCommissionHistory] = useState([]);
  const [actionAmount, setActionAmount] = useState("");
  const [actionDesc, setActionDesc] = useState("");
  const [isProcessingComm, setIsProcessingComm] = useState(false);

  // Estados de IA
  const [adminTab, setAdminTab] = useState('users'); // users, ai_config, coupons
  const [aiConfig, setAiConfig] = useState({ model: '', api_key: '', temperature: 0.5, max_tokens: 8192, top_p: 1.0, global_prompt: '' });
  const [aiStats, setAiStats] = useState({ total_plus: 0, total_pro: 0, tokens_today: 0, tokens_month: 0, tokens_total: 0, estimated_cost: 0 });
  const [savingAi, setSavingAi] = useState(false);

  useEffect(() => { 
    if (user?.role === 'admin') {
      fetchUsers();
      fetchAiData();
      fetchCoupons();
    }
  }, [user]);

  // --- FUNÇÕES DE USUÁRIOS ---
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
        setUsers(users.map(u => u.id === selectedUserForCommission.id ? { ...u, commission_balance: data.new_balance } : u));
        setSelectedUserForCommission({...selectedUserForCommission, commission_balance: data.new_balance});
        setActionAmount("");
        setActionDesc("");
        setCommissionTab('history');
        
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

  // --- FUNÇÕES DE IA ---
  const fetchAiData = async () => {
    try {
      const token = getAuthToken();
      const [confRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/admin/ai-config`, { headers: { "Authorization": `Bearer ${token}` } }),
        fetch(`${API_URL}/admin/ai-stats`, { headers: { "Authorization": `Bearer ${token}` } })
      ]);
      if (confRes.ok) { const data = await confRes.json(); if(data.model) setAiConfig(data); }
      if (statsRes.ok) setAiStats(await statsRes.json());
    } catch(e) {}
  };

  const handleSaveAiConfig = async () => {
    setSavingAi(true);
    try {
      const res = await fetch(`${API_URL}/admin/ai-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAuthToken()}` },
        body: JSON.stringify(aiConfig)
      });
      if(res.ok) alert("Configurações da IA salvas com sucesso!");
      else alert("Erro ao salvar a configuração da IA.");
    } catch(e) {}
    setSavingAi(false);
  };

  const handleResetTokens = async (userId) => {
    if(!window.confirm("Deseja zerar os tokens usados por este usuário? Ele terá a cota integral do plano de volta.")) return;
    try {
      const res = await fetch(`${API_URL}/admin/users/${userId}/reset-tokens`, { method: 'POST', headers: { 'Authorization': `Bearer ${getAuthToken()}` } });
      if(res.ok) fetchUsers();
    } catch(e) {}
  };

  const handleToggleAiBlock = async (userId) => {
    try {
      const res = await fetch(`${API_URL}/admin/users/${userId}/toggle-ai-block`, { method: 'POST', headers: { 'Authorization': `Bearer ${getAuthToken()}` } });
      if(res.ok) fetchUsers();
    } catch(e) {}
  };

  // --- FUNÇÕES DE CUPONS ---
  const fetchCoupons = async () => {
    setLoadingCoupons(true);
    try {
      const res = await fetch(`${API_URL}/admin/coupons`, { headers: { "Authorization": `Bearer ${getAuthToken()}` } });
      if (res.ok) setCoupons(await res.json() || []);
    } catch (e) { console.error("Erro ao carregar cupons"); }
    finally { setLoadingCoupons(false); }
  };

  const handleSaveCoupon = async () => {
    if (!couponFormData.code) return alert("O código do cupom é obrigatório.");
    setSavingCoupon(true);
    try {
      const res = await fetch(`${API_URL}/admin/coupons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAuthToken()}` },
        body: JSON.stringify(couponFormData)
      });
      if (res.ok) {
        setCouponModalOpen(false);
        fetchCoupons();
        // CORRIGIDO: discount_percent para discount_percentage
        setCouponFormData({ code: '', discount_percentage: 10, max_uses: 100, expires_at: '' });
      } else {
        const err = await res.json();
        alert(err.detail || "Erro ao criar cupom.");
      }
    } catch (e) { alert("Erro de conexão ao salvar cupom."); }
    finally { setSavingCoupon(false); }
  };

  const handleDeleteCoupon = async (id) => {
    if (!window.confirm("Deseja deletar este cupom permanentemente?")) return;
    try {
      const res = await fetch(`${API_URL}/admin/coupons/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${getAuthToken()}` } });
      if (res.ok) setCoupons(coupons.filter(c => c.id !== id));
    } catch (e) { console.error(e); }
  };

  const filteredUsers = users.filter(u => u.email.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="container">
      <div className="header" style={{ textAlign: "left" }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Shield size={28} color="var(--primary)" /> Painel Administrativo
        </h1>
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Gerencie acessos, uso de IA Compartilhada, comissões e cupons.</p>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button className={`btn ${adminTab === 'users' ? 'primary' : ''}`} onClick={() => setAdminTab('users')}><UserCog size={16}/> Gestão de Usuários</button>
        <button className={`btn ${adminTab === 'ai_config' ? 'primary' : ''}`} onClick={() => setAdminTab('ai_config')}><Settings2 size={16}/> Configuração IA Global</button>
        <button className={`btn ${adminTab === 'coupons' ? 'primary' : ''}`} onClick={() => setAdminTab('coupons')}><Ticket size={16}/> Cupons de Desconto</button>
      </div>

      {/* --- ABA CUPONS --- */}
      {adminTab === 'coupons' && (
        <div className="panel">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem", alignItems: "center" }}>
            <h3 style={{ margin: 0, color: 'var(--heading-color)' }}>Gerenciar Cupons</h3>
            <div style={{display: 'flex', gap: '10px'}}>
              <button className="btn primary small" onClick={() => setCouponModalOpen(true)}><Plus size={14}/> Novo Cupom</button>
              <button className="btn small" onClick={fetchCoupons}><RefreshCw size={14}/> Atualizar</button>
            </div>
          </div>

          {loadingCoupons ? <div className="status">A carregar...</div> : (
            <div style={{ overflowX: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Desconto (%)</th>
                    <th>Usos (Atual / Máx)</th>
                    <th>Validade</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {coupons.length === 0 ? (
                    <tr><td colSpan="6" style={{textAlign: 'center', padding: '20px', color: 'var(--text-muted)'}}>Nenhum cupom cadastrado.</td></tr>
                  ) : coupons.map((c) => {
                    const isExpired = c.expires_at && new Date(c.expires_at) < new Date();
                    const isExhausted = c.max_uses > 0 && c.current_uses >= c.max_uses;
                    const isValid = c.is_active && !isExpired && !isExhausted;

                    return (
                      <tr key={c.id}>
                        <td><strong style={{color: 'var(--primary)', letterSpacing: '1px'}}>{c.code}</strong></td>
                        {/* CORRIGIDO: discount_percent para discount_percentage */}
                        <td>{c.discount_percentage}%</td>
                        <td>{c.current_uses} / {c.max_uses || 'Ilimitado'}</td>
                        <td>{c.expires_at ? new Date(c.expires_at).toLocaleDateString() : 'Sem Validade'}</td>
                        <td>
                          {isValid ? <span style={{color: 'var(--success-text)'}}>Ativo</span> : <span style={{color: 'var(--error-text)'}}>Inválido</span>}
                        </td>
                        <td>
                          <button className="btn small error-btn" onClick={() => handleDeleteCoupon(c.id)} title="Excluir"><Trash2 size={16} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* --- ABA IA CONFIG --- */}
      {adminTab === 'ai_config' && (
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <h3 style={{ margin: 0, color: 'var(--heading-color)', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>Estatísticas de Consumo da IA Compartilhada</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px' }}>
            <div style={{ background: 'var(--bg)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border)' }}><strong style={{color:'var(--text-muted)'}}>Usuários Plus</strong><br/><span style={{fontSize: '1.5rem', color: 'var(--text-main)'}}>{aiStats.total_plus}</span></div>
            <div style={{ background: 'var(--bg)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border)' }}><strong style={{color:'var(--text-muted)'}}>Usuários Pro</strong><br/><span style={{fontSize: '1.5rem', color: 'var(--text-main)'}}>{aiStats.total_pro}</span></div>
            <div style={{ background: 'var(--bg)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border)' }}><strong style={{color:'var(--text-muted)'}}>Tokens Consumidos Hoje</strong><br/><span style={{fontSize: '1.5rem', color: 'var(--success-text)'}}>{aiStats.tokens_today.toLocaleString()}</span></div>
            <div style={{ background: 'var(--bg)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border)' }}><strong style={{color:'var(--text-muted)'}}>Tokens Consumidos no Mês</strong><br/><span style={{fontSize: '1.5rem', color: 'var(--success-text)'}}>{aiStats.tokens_month.toLocaleString()}</span></div>
            <div style={{ background: 'var(--bg)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border)' }}><strong style={{color:'var(--text-muted)'}}>Custo API Estimado</strong><br/><span style={{fontSize: '1.5rem', color: 'var(--error-text)'}}>$ {aiStats.estimated_cost.toFixed(2)}</span></div>
          </div>

          <h3 style={{ margin: '20px 0 0 0', color: 'var(--heading-color)', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>Configuração do OpenRouter</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            <div><label className="label">Modelo de Linguagem</label><input className="input" style={{width: '100%'}} value={aiConfig.model} onChange={e=>setAiConfig({...aiConfig, model: e.target.value})} placeholder="ex: openai/gpt-4o-mini" /></div>
            <div><label className="label">API Key do OpenRouter</label><input type="password" className="input" style={{width: '100%'}} value={aiConfig.api_key} onChange={e=>setAiConfig({...aiConfig, api_key: e.target.value})} placeholder="sk-or-v1-..." /></div>
            <div><label className="label">Temperatura</label><input type="number" step="0.1" className="input" style={{width: '100%'}} value={aiConfig.temperature} onChange={e=>setAiConfig({...aiConfig, temperature: parseFloat(e.target.value)})} /></div>
            <div><label className="label">Max Tokens por Requisição</label><input type="number" className="input" style={{width: '100%'}} value={aiConfig.max_tokens} onChange={e=>setAiConfig({...aiConfig, max_tokens: parseInt(e.target.value)})} /></div>
            <div style={{gridColumn: '1 / -1'}}><label className="label">Prompt Global (Opcional - Regra injetada em todas as chamadas da plataforma)</label><textarea className="textarea" style={{width: '100%', minHeight: '80px'}} value={aiConfig.global_prompt} onChange={e=>setAiConfig({...aiConfig, global_prompt: e.target.value})} /></div>
          </div>
          <button className="btn primary" onClick={handleSaveAiConfig} disabled={savingAi} style={{width: 'fit-content'}}>{savingAi ? 'Salvando...' : 'Salvar Configuração da IA'}</button>
        </div>
      )}

      {/* --- ABA USUÁRIOS --- */}
      {adminTab === 'users' && (
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
                        
                        <div style={{ marginTop: '10px', padding: '8px', background: 'var(--bg)', borderRadius: '6px', fontSize: '0.75rem', border: '1px solid var(--border)' }}>
                          <strong>Plano IA:</strong> {u.plan_type || 'Simples'} <br/>
                          <strong>Tokens Usados:</strong> {(u.tokens_used || 0).toLocaleString()} / {u.token_limit > 0 ? u.token_limit.toLocaleString() : 'Sem Acesso'} <br/>
                          <div style={{ display: 'flex', gap: '5px', marginTop: '6px', flexWrap: 'wrap' }}>
                            <button onClick={() => handleResetTokens(u.id)} disabled={u.role === 'admin'} style={{ background: 'transparent', border: '1px solid var(--primary)', color: 'var(--primary)', borderRadius: '4px', cursor: 'pointer', padding: '3px 6px', fontSize: '0.7rem' }}>Zerar Consumo</button>
                            <button onClick={() => handleToggleAiBlock(u.id)} disabled={u.role === 'admin'} style={{ background: u.ai_blocked ? 'var(--error-bg)' : 'transparent', border: '1px solid var(--error-text)', color: 'var(--error-text)', borderRadius: '4px', cursor: 'pointer', padding: '3px 6px', fontSize: '0.7rem', fontWeight: u.ai_blocked ? 'bold' : 'normal' }}>{u.ai_blocked ? 'Desbloquear IA' : 'Bloquear IA'}</button>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          <span style={{ color: 'var(--success-text)', fontWeight: 'bold' }}>
                            R$ {(u.commission_balance || 0).toFixed(2).replace('.', ',')}
                          </span>
                          <button onClick={() => handleOpenCommissionModal(u)} style={{ background: 'transparent', border: '1px solid var(--text-muted)', color: 'var(--text-main)', borderRadius: '4px', cursor: 'pointer', padding: '2px 5px', fontSize: '0.7rem', alignSelf: 'flex-start' }}>Gerenciar Ganhos</button>
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
      )}

      {/* --- MODAL DA COMISSÃO --- */}
      {commissionModalOpen && selectedUserForCommission && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '20px' }}>
          <div style={{ background: 'var(--card-bg)', padding: '0', borderRadius: '12px', border: '1px solid var(--border)', width: '100%', maxWidth: '600px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--heading-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>Gestão de Comissões</h3>
                <p style={{ margin: '5px 0 0 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{selectedUserForCommission.email}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Saldo Atual Disponível</span><br/>
                <strong style={{ fontSize: '1.5rem', color: 'var(--success-text)' }}>R$ {(selectedUserForCommission.commission_balance || 0).toFixed(2).replace('.', ',')}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
              <button onClick={() => setCommissionTab('history')} style={{ flex: 1, padding: '12px', border: 'none', borderBottom: commissionTab === 'history' ? '3px solid var(--primary)' : '3px solid transparent', background: 'transparent', color: commissionTab === 'history' ? 'var(--primary)' : 'var(--text-main)', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', gap: '5px' }}><FileText size={16}/> Relatório</button>
              <button onClick={() => {setCommissionTab('pay'); setActionAmount((selectedUserForCommission.commission_balance || 0).toFixed(2)); setActionDesc("");}} style={{ flex: 1, padding: '12px', border: 'none', borderBottom: commissionTab === 'pay' ? '3px solid var(--success-text)' : '3px solid transparent', background: 'transparent', color: commissionTab === 'pay' ? 'var(--success-text)' : 'var(--text-main)', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', gap: '5px' }}><DollarSign size={16}/> Pagar</button>
              <button onClick={() => {setCommissionTab('edit'); setActionAmount((selectedUserForCommission.commission_balance || 0).toFixed(2)); setActionDesc("");}} style={{ flex: 1, padding: '12px', border: 'none', borderBottom: commissionTab === 'edit' ? '3px solid var(--text-main)' : '3px solid transparent', background: 'transparent', color: commissionTab === 'edit' ? 'var(--heading-color)' : 'var(--text-muted)', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', gap: '5px' }}><Settings2 size={16}/> Editar Saldo</button>
            </div>

            <div style={{ padding: '20px', overflowY: 'auto', flex: 1, background: 'var(--card-bg)' }}>
              {commissionTab === 'history' && (
                <div>
                  {commissionHistory.length === 0 ? <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>Nenhum registro encontrado.</div> : (
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
                  <div style={{ background: 'var(--success-bg)', padding: '15px', borderRadius: '8px', border: '1px solid var(--success-text)', marginBottom: '20px' }}><p style={{ margin: 0, color: 'var(--text-main)', fontSize: '0.9rem' }}>Use esta opção para registrar que você enviou um PIX ou transferência ao afiliado. O valor será deduzido do saldo total.</p></div>
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-main)', fontWeight: 'bold' }}>Valor do Pagamento (R$)</label>
                    <input type="number" step="0.01" max={selectedUserForCommission.commission_balance || 0} value={actionAmount} onChange={(e) => setActionAmount(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-main)' }} />
                  </div>
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-main)', fontWeight: 'bold' }}>Descrição / Comprovante (Opcional)</label>
                    <input type="text" placeholder="Ex: PIX enviado dia 10/10" value={actionDesc} onChange={(e) => setActionDesc(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-main)' }} />
                  </div>
                  <button onClick={() => submitCommissionAction('pagamento')} disabled={isProcessingComm} className="btn primary" style={{ width: '100%', justifyContent: 'center', background: '#10b981', borderColor: '#10b981' }}>{isProcessingComm ? "Processando..." : "Confirmar e Deduzir Saldo"}</button>
                </div>
              )}
              {commissionTab === 'edit' && (
                <div>
                  <div style={{ background: 'var(--bg)', padding: '15px', borderRadius: '8px', border: '1px dashed var(--border)', marginBottom: '20px' }}><p style={{ margin: 0, color: 'var(--text-main)', fontSize: '0.9rem' }}>⚠️ <strong>Edição Livre:</strong> Defina o valor exato que deve ficar na conta do usuário (útil para corrigir erros no sistema).</p></div>
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-main)', fontWeight: 'bold' }}>Novo Saldo Exato (R$)</label>
                    <input type="number" step="0.01" value={actionAmount} onChange={(e) => setActionAmount(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-main)' }} />
                  </div>
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-main)', fontWeight: 'bold' }}>Motivo do Ajuste</label>
                    <input type="text" placeholder="Ex: Correção de lançamento duplicado" value={actionDesc} onChange={(e) => setActionDesc(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-main)' }} />
                  </div>
                  <button onClick={() => submitCommissionAction('ajuste')} disabled={isProcessingComm} className="btn" style={{ width: '100%', justifyContent: 'center' }}>{isProcessingComm ? "Processando..." : "Forçar Novo Saldo"}</button>
                </div>
              )}
            </div>
            <div style={{ padding: '15px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg)', textAlign: 'right' }}>
              <button onClick={() => setCommissionModalOpen(false)} disabled={isProcessingComm} className="btn small" style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-main)' }}>Fechar Janela</button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL NOVO CUPOM --- */}
      {couponModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.8)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '30px', width: '100%', maxWidth: '400px' }}>
            <h3 style={{ marginTop: 0, borderBottom: '1px solid var(--border)', paddingBottom: '15px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Ticket size={22} color="var(--primary)" /> Novo Cupom
            </h3>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '5px', color: 'var(--text-main)' }}>Código (Ex: PROMO20)</label>
              <input type="text" value={couponFormData.code} onChange={e => setCouponFormData({...couponFormData, code: e.target.value.toUpperCase()})} autoFocus style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'var(--input-bg)', color: 'var(--text-main)', outline: 'none' }} />
            </div>
            <div style={{ marginBottom: '15px', display: 'flex', gap: '15px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '5px', color: 'var(--text-main)' }}>Desconto (%)</label>
                {/* CORRIGIDO: discount_percent para discount_percentage */}
                <input type="number" min="1" max="100" value={couponFormData.discount_percentage} onChange={e => setCouponFormData({...couponFormData, discount_percentage: parseInt(e.target.value)})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'var(--input-bg)', color: 'var(--text-main)', outline: 'none' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '5px', color: 'var(--text-main)' }}>Qtd Usos (0 = Ilimitado)</label>
                <input type="number" min="0" value={couponFormData.max_uses} onChange={e => setCouponFormData({...couponFormData, max_uses: parseInt(e.target.value)})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'var(--input-bg)', color: 'var(--text-main)', outline: 'none' }} />
              </div>
            </div>
            <div style={{ marginBottom: '25px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '5px', color: 'var(--text-main)' }}>Data de Validade (Opcional)</label>
              <input type="date" value={couponFormData.expires_at} onChange={e => setCouponFormData({...couponFormData, expires_at: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'var(--input-bg)', color: 'var(--text-main)', outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setCouponModalOpen(false)} disabled={savingCoupon} className="btn small" style={{ backgroundColor: 'var(--hover-bg)', color: 'var(--text-main)', border: '1px solid var(--border)' }}>Cancelar</button>
              <button onClick={handleSaveCoupon} disabled={savingCoupon} className="btn primary small">{savingCoupon ? "A guardar..." : "Criar Cupom"}</button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL DO USUÁRIO --- */}
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
          <div style={{ background: 'white', padding: '20px', borderRadius: '8px', color: 'black', width: '320px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{color: 'black', marginBottom: '15px'}}>Gerenciar plano de {selectedUser?.email.split('@')[0]}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { id: 'mensal_simples', nome: 'Mensal Simples' },
                { id: 'trimestral_simples', nome: 'Trimestral Simples' },
                { id: 'semestral_simples', nome: 'Semestral Simples' },
                { id: 'mensal_plus', nome: 'Mensal Plus (3M)' },
                { id: 'trimestral_plus', nome: 'Trimestral Plus (3M)' },
                { id: 'semestral_plus', nome: 'Semestral Plus (3M)' },
                { id: 'trimestral_pro', nome: 'Trimestral Pro (6M)' },
                { id: 'semestral_pro', nome: 'Semestral Pro (6M)' }
              ].map(p => (
                <button key={p.id} onClick={() => handleSavePlan(p.id)} style={{padding: '10px', cursor: 'pointer', background: '#0f172a', color: 'white', border: 'none', borderRadius: '4px'}}>{p.nome}</button>
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