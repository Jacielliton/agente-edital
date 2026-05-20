import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { User, Key, Settings, ShieldCheck, Cpu } from "lucide-react";

export default function Profile() {
  const { user } = useAuth();
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  // Estados para alteração de senha
  const [passwords, setPasswords] = useState({ current: "", new: "", confirm: "" });
  const [passStatus, setPassStatus] = useState({ type: "", message: "" });
  const [isChangingPass, setIsChangingPass] = useState(false);

  // Estados para configuração de IA
  const [userApiKey, setUserApiKey] = useState("");
  const [userModel, setUserModel] = useState("");
  const [isSavingAI, setIsSavingAI] = useState(false);

  const getAuthToken = () => localStorage.getItem("professor_ai_token");

  useEffect(() => {
    // Busca as configurações de IA do utilizador ao carregar a página
    const fetchSettings = async () => {
      try {
        const res = await fetch(`${API_URL}/users/me/settings`, {
          headers: { "Authorization": `Bearer ${getAuthToken()}` }
        });
        if (res.ok) {
          const data = await res.json();
          setUserApiKey(data.api_key || "");
          setUserModel(data.preferred_model || "arcee-ai/trinity-large-thinking:free");
        }
      } catch (err) { console.error(err); }
    };
    fetchSettings();
  }, []);

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
      const res = await fetch(`${API_URL}/users/me/settings`, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${getAuthToken()}` 
        },
        body: JSON.stringify({ api_key: userApiKey, preferred_model: userModel })
      });

      if (res.ok) {
        alert("Configurações de IA guardadas com sucesso!");
      } else {
        alert("Erro ao guardar definições.");
      }
    } catch (e) { alert("Falha na ligação."); }
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
    } catch (e) {}
    setIsSavingAI(false);
  };

  if (!user) return null;

  return (
    <div className="container" style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ color: 'var(--heading-color)', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <User size={32} color="var(--primary)" /> O Meu Perfil
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>Faça a gestão da sua conta, segurança e preferências de Inteligência Artificial.</p>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
        
        {/* BLOCO 1: INFORMAÇÕES DA CONTA */}
        <div style={{ background: 'var(--card-bg)', padding: '25px', borderRadius: '12px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--heading-color)', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
            <ShieldCheck size={20} color="var(--primary)" /> Detalhes da Conta
          </h3>
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
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '5px' }}>Permissões Extras</label>
              <div style={{ fontSize: '0.95rem', color: 'var(--text-main)' }}>
                {user.can_manage_lessons || user.role === 'admin' ? "✅ Geração e Gestão de Aulas" : "❌ Apenas Leitura (Aluno)"}
              </div>
            </div>
          </div>
        </div>

        {/* BLOCO 2: INTELIGÊNCIA ARTIFICIAL */}
        <div style={{ background: 'var(--card-bg)', padding: '25px', borderRadius: '12px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--heading-color)', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
            <Cpu size={20} color="var(--primary)" /> Integração de IA (OpenRouter)
          </h3>
          
          <div style={{ marginTop: '15px' }}>
            {userApiKey ? (
              <div style={{ padding: '15px', background: 'var(--success-bg)', border: '1px solid var(--success-text)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <strong style={{ color: 'var(--success-text)', display: 'block' }}>✅ Conta de IA Vinculada</strong>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Pode usar o Gerador de Simulados, Redações e Tutor de forma ilimitada.</span>
                </div>
                <button onClick={handleDisconnectAI} disabled={isSavingAI} className="btn small error-btn" style={{ background: 'transparent', border: '1px solid var(--error-text)', color: 'var(--error-text)' }}>
                  {isSavingAI ? "Aguarde..." : "Desvincular Conta"}
                </button>
              </div>
            ) : (
              <div style={{ padding: '15px', background: 'var(--bg)', border: '1px dashed var(--border)', borderRadius: '8px' }}>
                <p style={{ margin: '0 0 15px 0', color: 'var(--text-secondary)' }}>A sua conta ainda não está conectada a nenhum motor de Inteligência Artificial. Conecte gratuitamente para desbloquear simulados inéditos e correção de redações.</p>
                <button onClick={handleConnectAI} className="btn primary">🔗 Conectar IA Gratuitamente</button>
              </div>
            )}

            <div style={{ marginTop: '20px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '8px', color: 'var(--text-main)' }}>Modelo de IA Preferido</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input 
                  type="text" 
                  value={userModel} 
                  onChange={(e) => setUserModel(e.target.value)} 
                  className="input" 
                  style={{ flex: 1, backgroundColor: 'var(--input-bg)', color: 'var(--text-main)' }} 
                  placeholder="ex: arcee-ai/trinity-large-thinking:free"
                />
                <button onClick={handleSaveAIConfig} disabled={isSavingAI} className="btn primary">{isSavingAI ? "..." : "Salvar Modelo"}</button>
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px', display: 'block' }}>Recomendamos deixar o modelo padrão gratuito, mas se souber o que está a fazer, pode colocar qualquer ID do OpenRouter.</span>
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