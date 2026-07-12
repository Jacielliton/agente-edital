import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { User, Key, Cpu, Clock } from "lucide-react"; // Adicionado ícone Clock

// Função robusta para capturar o token (Mesma do AdminPanel)
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

export default function Profile() {
  const { user } = useAuth();
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  // Estados para alteração de senha
  const [passwords, setPasswords] = useState({ current: "", new: "", confirm: "" });
  const [passStatus, setPassStatus] = useState({ type: "", message: "" });
  const [isChangingPass, setIsChangingPass] = useState(false);

  // Estados para configuração de IA
  const [providerTab, setProviderTab] = useState("openrouter");
  const [tempApiKey, setTempApiKey] = useState("");
  const [userApiKey, setUserApiKey] = useState("");
  const [userModel, setUserModel] = useState("");
  const [isSavingAI, setIsSavingAI] = useState(false);

  // Estados para o histórico de comissões
  const [commissionHistory, setCommissionHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    // Busca as configurações de IA do utilizador ao carregar a página
    const fetchSettings = async () => {
      try {
        const token = getAuthToken();
        if (!token) return;

        const res = await fetch(`${API_URL}/users/me/settings`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        
        if (res.ok) {
          const data = await res.json();
          const key = data.api_key || "";
          setUserApiKey(key);
          setTempApiKey(key);
          setUserModel(data.preferred_model || "arcee-ai/trinity-large-thinking:free");
          
          if (key && !key.startsWith("sk-or-")) {
            setProviderTab("aistudio");
          }
        }
      } catch (err) { 
        console.error("Erro ao buscar configurações:", err); 
      }
    };

    // Busca o histórico de comissões/pagamentos
    const fetchHistory = async () => {
      setLoadingHistory(true);
      try {
        const token = getAuthToken();
        if (!token) return;

        const res = await fetch(`${API_URL}/users/me/commission-history`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        
        if (res.ok) {
          const data = await res.json();
          // Assume-se que o backend devolve um array de registos
          setCommissionHistory(data);
        }
      } catch (err) {
        console.error("Erro ao buscar histórico:", err);
      } finally {
        setLoadingHistory(false);
      }
    };

    fetchSettings();
    fetchHistory();
  }, [API_URL]);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
      return setPassStatus({ type: "error", message: "As novas senhas não coincidem." });
    }
    if (passwords.new.length < 6) {
      return setPassStatus({ type: "error", message: "A nova senha deve ter pelo menos 6 caracteres." });
    }

    setIsChangingPass(true);
    setPassStatus({ type: "", message: "" });

    try {
      const res = await fetch(`${API_URL}/users/me/password`, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${getAuthToken()}` 
        },
        body: JSON.stringify({ current_password: passwords.current, new_password: passwords.new })
      });

      if (res.ok) {
        setPassStatus({ type: "success", message: "Senha atualizada com sucesso!" });
        setPasswords({ current: "", new: "", confirm: "" });
      } else {
        const err = await res.json();
        setPassStatus({ type: "error", message: err.detail || "Erro ao atualizar senha." });
      }
    } catch (e) {
      setPassStatus({ type: "error", message: "Erro de conexão ao servidor." });
    } finally {
      setIsChangingPass(false);
    }
  };

  const handleSaveAIConfig = async () => {
    setIsSavingAI(true);
    try {
      const keyToSave = providerTab === "aistudio" ? tempApiKey.trim() : userApiKey;

      const res = await fetch(`${API_URL}/users/me/settings`, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${getAuthToken()}` 
        },
        body: JSON.stringify({ api_key: keyToSave, preferred_model: userModel })
      });

      if (res.ok) {
        setUserApiKey(keyToSave);
        alert("Configurações de IA guardadas com sucesso!");
      } else {
        alert("Erro ao guardar definições.");
      }
    } catch (e) { 
      alert("Falha na ligação."); 
    }
    setIsSavingAI(false);
  };

  const handleConnectAI = () => {
    const callbackUrl = encodeURIComponent(`${window.location.origin}/callback`);
    window.location.href = `https://openrouter.ai/auth?callback_url=${callbackUrl}`;
  };

  const handleDisconnectAI = async () => {
    if (!window.confirm("Deseja realmente desvincular a sua conta de IA?")) return;
    setIsSavingAI(true);
    try {
      await fetch(`${API_URL}/users/me/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getAuthToken()}` },
        body: JSON.stringify({ api_key: "", preferred_model: userModel })
      });
      setUserApiKey("");
      setTempApiKey("");
    } catch (e) {}
    setIsSavingAI(false);
  };

  if (!user) return null;

  // Lógica de cálculo do Status do Plano
  let planStatus = "Grátis (Sem Plano)";
  let planColor = "var(--text-main)";

  if (user.role === 'admin') {
    planStatus = "Vitalício (Admin)";
    planColor = "var(--primary)";
  } else if (user.plan_expires_at) {
    const expDate = new Date(user.plan_expires_at);
    if (expDate > new Date()) {
      planStatus = `Ativo até ${expDate.toLocaleDateString()}`;
      planColor = "var(--success-text)";
    } else {
      planStatus = `Expirado em ${expDate.toLocaleDateString()}`;
      planColor = "var(--error-text)";
    }
  }

  return (
    <div className="container" style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ color: 'var(--heading-color)', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <User size={32} color="var(--primary)" /> O Meu Perfil
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>Faça a gestão da sua conta, segurança e preferências de Inteligência Artificial.</p>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
        
        {/* BLOCO: PROGRAMA DE AFILIADOS - INSTANTÂNEO & HISTÓRICO */}
        <div style={{ background: 'var(--card-bg)', padding: '25px', borderRadius: '12px', border: '1px solid var(--primary)', boxShadow: 'var(--shadow-sm)' }}>
          <h3 style={{ marginTop: 0, color: 'var(--primary)', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
             Programa de Indicações (Ganhe 20%)
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            Partilhe o seu link. Por cada pessoa que se cadastrar e comprar um plano, você ganha 20% de comissão.
          </p>
          
          <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', flexWrap: 'wrap', marginTop: '15px' }}>
            <div style={{ flex: 1, minWidth: '250px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '5px' }}>Seu Link de Divulgação:</label>
              <input 
                type="text" 
                readOnly 
                value={user?.referral_code ? `${window.location.origin}/login?ref=${user.referral_code}` : 'Carregando link...'}
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px dashed var(--primary)', background: 'var(--bg)', color: 'var(--text-main)', outline: 'none' }}
              />
            </div>
            <button 
              className="btn primary"
              disabled={!user?.referral_code}
              onClick={() => {
                if (user?.referral_code) {
                  navigator.clipboard.writeText(`${window.location.origin}/login?ref=${user.referral_code}`);
                  alert('Link copiado com sucesso!');
                }
              }}
            >
              Copiar Link
            </button>
          </div>

          <div style={{ marginTop: '20px', padding: '15px', background: 'var(--success-bg)', borderRadius: '8px', border: '1px solid var(--success-text)', display: 'inline-block' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>Suas Comissões Acumuladas:</span><br/>
            <strong style={{ fontSize: '1.5rem', color: 'var(--success-text)' }}>
              R$ {user?.commission_balance ? user.commission_balance.toFixed(2).replace('.', ',') : '0,00'}
            </strong>
          </div>

          {/* NOVO: HISTÓRICO DE COMISSÕES */}
          <div style={{ marginTop: '30px' }}>
            <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--heading-color)', borderBottom: '1px solid var(--border)', paddingBottom: '8px', marginBottom: '15px' }}>
              <Clock size={18} color="var(--primary)" /> Histórico de Movimentações
            </h4>
            
            {loadingHistory ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>A carregar histórico...</p>
            ) : commissionHistory.length > 0 ? (
              <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', textAlign: 'left' }}>
                  <thead style={{ background: 'var(--bg)' }}>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '12px', color: 'var(--text-muted)' }}>Data</th>
                      <th style={{ padding: '12px', color: 'var(--text-muted)' }}>Ação</th>
                      <th style={{ padding: '12px', color: 'var(--text-muted)' }}>Valor</th>
                      <th style={{ padding: '12px', color: 'var(--text-muted)' }}>Descrição</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commissionHistory.map((item, idx) => {
                      const isPayment = item.action_type === "pagamento";
                      const amountColor = isPayment ? "var(--error-text)" : "var(--success-text)";
                      const sign = isPayment ? "-" : "+";
                      
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '12px', color: 'var(--text-main)' }}>
                            {new Date(item.created_at || new Date()).toLocaleDateString()}
                          </td>
                          <td style={{ padding: '12px', color: 'var(--text-main)', textTransform: 'capitalize' }}>
                            {item.action_type || 'Comissão'}
                          </td>
                          <td style={{ padding: '12px', color: amountColor, fontWeight: 'bold' }}>
                            {sign} R$ {item.amount ? item.amount.toFixed(2).replace('.', ',') : '0,00'}
                          </td>
                          <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>
                            {item.description || '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Nenhuma movimentação registada até ao momento.</p>
            )}
          </div>
        </div>
        
        {/* BLOCO 1: INFORMAÇÕES DA CONTA */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginTop: '15px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '5px' }}>E-mail Registado</label>
            <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{user.email}</div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '5px' }}>Nível de Acesso</label>
            <div style={{ display: 'inline-block', padding: '4px 10px', background: user.role === 'admin' ? '#1e293b' : 'var(--primary-light)', color: user.role === 'admin' ? '#fff' : 'var(--primary)', borderRadius: '6px', fontWeight: 'bold', fontSize: '0.9rem', textTransform: 'uppercase' }}>
              {user.role}
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '5px' }}>Status da Assinatura</label>
            <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: planColor }}>
              {planStatus}
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '5px' }}>Permissões Extras</label>
            <div style={{ fontSize: '0.95rem', color: 'var(--text-main)' }}>
              {user.can_manage_lessons || user.role === 'admin' ? "✅ Geração e Gestão de Aulas" : "❌ Apenas Leitura (Aluno)"}
            </div>
          </div>
        </div>

        {/* BLOCO 2: INTELIGÊNCIA ARTIFICIAL */}
        <div style={{ background: 'var(--card-bg)', padding: '25px', borderRadius: '12px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--heading-color)', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
            <Cpu size={20} color="var(--primary)" /> Integração de Inteligência Artificial
          </h3>

          <div style={{ display: 'flex', gap: '10px', marginTop: '20px', marginBottom: '20px' }}>
            <button
              onClick={() => {
                setProviderTab("openrouter");
                setUserModel("google/gemini-2.5-flash");
              }}
              className={`btn ${providerTab === "openrouter" ? "primary" : ""}`}
              style={{ flex: 1, padding: '10px', fontSize: '0.9rem' }}
            >
              OpenRouter
            </button>
            <button
              onClick={() => {
                setProviderTab("aistudio");
                setUserModel("gemini-2.5-flash");
              }}
              className={`btn ${providerTab === "aistudio" ? "primary" : ""}`}
              style={{ flex: 1, padding: '10px', fontSize: '0.9rem' }}
            >
              Google AI Studio
            </button>
          </div>
          
          <div style={{ marginTop: '15px' }}>
            {providerTab === "openrouter" && (
              <>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '15px' }}>Conecte a sua conta OpenRouter para aceder a dezenas de modelos de IA. O login é automático e sem fricção.</p>
                {userApiKey && userApiKey.startsWith("sk-or-") ? (
                  <div style={{ padding: '15px', background: 'var(--success-bg)', border: '1px solid var(--success-text)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                      <strong style={{ color: 'var(--success-text)', display: 'block' }}>✅ OpenRouter Vinculado</strong>
                    </div>
                    <button onClick={handleDisconnectAI} disabled={isSavingAI} className="btn small error-btn" style={{ background: 'transparent', border: '1px solid var(--error-text)', color: 'var(--error-text)' }}>
                      {isSavingAI ? "Aguarde..." : "Desvincular"}
                    </button>
                  </div>
                ) : (
                  <div style={{ padding: '15px', background: 'var(--bg)', border: '1px dashed var(--border)', borderRadius: '8px' }}>
                    <button onClick={handleConnectAI} className="btn primary">🔗 Conectar OpenRouter</button>
                  </div>
                )}
              </>
            )}

            {providerTab === "aistudio" && (
              <>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '15px' }}>
                  O Google AI Studio requer a geração manual da chave. Clique no botão abaixo para gerar gratuitamente e cole no campo:
                </p>
                <a 
                  href="https://aistudio.google.com/app/apikey" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="btn" 
                  style={{ width: '100%', marginBottom: '15px', display: 'block', textAlign: 'center', background: '#e2e8f0', color: '#1e293b', textDecoration: 'none', fontWeight: 'bold' }}
                >
                  1️⃣ Obter Chave no AI Studio (Grátis)
                </a>
                
                <label style={{ display: 'block', fontWeight: 'bold', color: 'var(--text-main)', marginBottom: '8px', fontSize: '0.9rem' }}>
                  2️⃣ Cole a Chave Gerada:
                </label>
                <div style={{ display: 'flex', gap: '10px', flexDirection: 'column' }}>
                  <input
                    type="password"
                    value={tempApiKey}
                    onChange={(e) => setTempApiKey(e.target.value)}
                    placeholder="Ex: AIzaSy... ou AQ.Ab8..."
                    style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-main)' }}
                  />
                  {userApiKey && !userApiKey.startsWith("sk-or-") && tempApiKey === userApiKey && (
                    <div style={{ fontSize: '0.85rem', color: 'var(--success-text)', fontWeight: 'bold' }}>
                      ✅ Chave AI Studio salva e ativa no sistema!
                    </div>
                  )}
                </div>
              </>
            )}

            <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
              <label style={{ display: 'block', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '8px', color: 'var(--text-main)' }}>Modelo de IA Preferido</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input 
                  type="text" 
                  value={userModel} 
                  onChange={(e) => setUserModel(e.target.value)} 
                  className="input" 
                  style={{ flex: 1, backgroundColor: 'var(--input-bg)', color: 'var(--text-main)' }} 
                  placeholder="ex: gemini-2.5-flash"
                />
                <button onClick={handleSaveAIConfig} disabled={isSavingAI} className="btn primary">{isSavingAI ? "..." : "Salvar Configurações"}</button>
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px', display: 'block' }}>
                Recomendamos deixar o modelo padrão gerado automaticamente pela aba escolhida.
              </span>
            </div>
          </div>
        </div>

        {/* BLOCO 3: ALTERAR SENHA */}
        <div style={{ background: 'var(--card-bg)', padding: '25px', borderRadius: '12px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--heading-color)', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
            <Key size={20} color="var(--primary)" /> Alterar Palavra-passe
          </h3>
          
          <form onSubmit={handlePasswordChange} style={{ maxWidth: '400px', marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '5px', color: 'var(--text-main)' }}>Senha Atual</label>
              <input type="password" required value={passwords.current} onChange={e => setPasswords({...passwords, current: e.target.value})} className="input" style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '5px', color: 'var(--text-main)' }}>Nova Senha</label>
              <input type="password" required value={passwords.new} onChange={e => setPasswords({...passwords, new: e.target.value})} className="input" style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '5px', color: 'var(--text-main)' }}>Confirmar Nova Senha</label>
              <input type="password" required value={passwords.confirm} onChange={e => setPasswords({...passwords, confirm: e.target.value})} className="input" style={{ width: '100%' }} />
            </div>
            
            {passStatus.message && (
              <div style={{ padding: '10px', borderRadius: '6px', fontSize: '0.9rem', background: passStatus.type === 'error' ? 'var(--error-bg)' : 'var(--success-bg)', color: passStatus.type === 'error' ? 'var(--error-text)' : 'var(--success-text)', border: `1px solid ${passStatus.type === 'error' ? 'var(--error-text)' : 'var(--success-text)'}` }}>
                {passStatus.message}
              </div>
            )}
            
            <button type="submit" disabled={isChangingPass} className="btn primary" style={{ alignSelf: 'flex-start' }}>
              {isChangingPass ? "A atualizar..." : "Atualizar Senha"}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}