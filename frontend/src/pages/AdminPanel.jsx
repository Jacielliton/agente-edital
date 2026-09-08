import React, { useEffect, useMemo, useState } from "react";
import {
  Trash2, RefreshCw, UserCog, Shield, Pencil, Plus, Search, Ban, CheckCircle2,
  ShieldOff, FileText, DollarSign, Settings2, Ticket, Users,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  Button, Badge, Input, ProgressBar, StatCard, EmptyState, Skeleton, PageHeader,
  Modal, ConfirmDialog, Notice,
} from "../components/ui";
import "./AdminPanel.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

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
    } catch (e) { /* storage indisponível */ }
  }
  return "";
};

const authHeaders = (extra = {}) => {
  const token = getAuthToken();
  return { ...extra, Authorization: token ? `Bearer ${token}` : "" };
};

// Os números vêm da API: se um campo faltar, .toFixed/.toLocaleString derrubam
// a tela inteira. Estas duas funções são o cinto de segurança.
const num = (v) => Number(v || 0);
const brl = (v) => `R$ ${num(v).toFixed(2).replace(".", ",")}`;
const milhar = (v) => num(v).toLocaleString("pt-BR");

const PLANOS = [
  { id: "mensal_simples", nome: "Mensal Simples", detalhe: "30 dias · chave própria" },
  { id: "trimestral_simples", nome: "Trimestral Simples", detalhe: "90 dias · chave própria" },
  { id: "semestral_simples", nome: "Semestral Simples", detalhe: "180 dias · chave própria" },
  { id: "mensal_plus", nome: "Mensal Plus", detalhe: "30 dias · 3M tokens" },
  { id: "trimestral_plus", nome: "Trimestral Plus", detalhe: "90 dias · 3M tokens" },
  { id: "semestral_plus", nome: "Semestral Plus", detalhe: "180 dias · 3M tokens" },
  { id: "trimestral_pro", nome: "Trimestral Pro", detalhe: "90 dias · 6M tokens" },
  { id: "semestral_pro", nome: "Semestral Pro", detalhe: "180 dias · 6M tokens" },
];

const ABAS = [
  { id: "users", rotulo: "Usuários", icone: UserCog },
  { id: "ai_config", rotulo: "IA global", icone: Settings2 },
  { id: "coupons", rotulo: "Cupons", icone: Ticket },
];

export default function AdminPanel() {
  const { user } = useAuth();

  const [adminTab, setAdminTab] = useState("users");
  const [aviso, setAviso] = useState(null); // { tone, texto }
  const [confirmacao, setConfirmacao] = useState(null);
  const [executando, setExecutando] = useState(false);

  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filtroPapel, setFiltroPapel] = useState("todos");

  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userFormData, setUserFormData] = useState({
    email: "", password: "", role: "user", can_manage_lessons: false, is_active: true, allowed_concursos: "",
  });
  const [savingUser, setSavingUser] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  const [coupons, setCoupons] = useState([]);
  const [loadingCoupons, setLoadingCoupons] = useState(false);
  const [couponModalOpen, setCouponModalOpen] = useState(false);
  const [savingCoupon, setSavingCoupon] = useState(false);
  const [couponFormData, setCouponFormData] = useState({ code: "", discount_percentage: 10, max_uses: 100, expires_at: "" });

  const [commissionModalOpen, setCommissionModalOpen] = useState(false);
  const [selectedUserForCommission, setSelectedUserForCommission] = useState(null);
  const [commissionTab, setCommissionTab] = useState("history");
  const [commissionHistory, setCommissionHistory] = useState([]);
  const [actionAmount, setActionAmount] = useState("");
  const [actionDesc, setActionDesc] = useState("");
  const [isProcessingComm, setIsProcessingComm] = useState(false);
  const [erroComm, setErroComm] = useState("");

  const [aiConfig, setAiConfig] = useState({ model: "", api_key: "", temperature: 0.5, max_tokens: 8192, top_p: 1.0, global_prompt: "" });
  const [aiStats, setAiStats] = useState({ total_plus: 0, total_pro: 0, tokens_today: 0, tokens_month: 0, tokens_total: 0, estimated_cost: 0 });
  const [savingAi, setSavingAi] = useState(false);

  useEffect(() => {
    if (user?.role === "admin") {
      fetchUsers();
      fetchAiData();
      fetchCoupons();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ------------------------------------------------------------ usuários
  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const resUsers = await fetch(`${API_URL}/users`, { headers: authHeaders() });
      if (!resUsers.ok) throw new Error("Não foi possível carregar os usuários.");
      setUsers((await resUsers.json()) || []);
    } catch (err) {
      console.error(err);
      setAviso({ tone: "err", texto: err.message || "Erro ao carregar os usuários." });
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleOpenUserModal = (userData = null) => {
    setEditingUser(userData);
    setUserFormData(
      userData
        ? {
            email: userData.email,
            password: "",
            role: userData.role || "user",
            can_manage_lessons: userData.can_manage_lessons || false,
            is_active: userData.is_active !== undefined ? userData.is_active : true,
            allowed_concursos: userData.allowed_concursos || "",
          }
        : { email: "", password: "", role: "user", can_manage_lessons: false, is_active: true, allowed_concursos: "" }
    );
    setUserModalOpen(true);
  };

  const handleSaveUser = async () => {
    if (!userFormData.email) {
      setAviso({ tone: "warn", texto: "O e-mail é obrigatório." });
      return;
    }
    if (!editingUser && !userFormData.password) {
      setAviso({ tone: "warn", texto: "Defina uma senha para o novo usuário." });
      return;
    }

    setSavingUser(true);
    const method = editingUser ? "PUT" : "POST";
    const endpoint = editingUser ? `${API_URL}/users/${editingUser.id}` : `${API_URL}/users`;
    const payload = { ...userFormData };
    if (editingUser && !payload.password) delete payload.password;

    try {
      const res = await fetch(endpoint, {
        method,
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Erro ao salvar o usuário.");
      }
      setUserModalOpen(false);
      setAviso({ tone: "ok", texto: editingUser ? "Usuário atualizado." : "Usuário criado." });
      fetchUsers();
    } catch (e) {
      setAviso({ tone: "err", texto: e.message });
    } finally {
      setSavingUser(false);
    }
  };

  const executarAcao = async () => {
    if (!confirmacao?.acao) return;
    setExecutando(true);
    try {
      await confirmacao.acao();
      setConfirmacao(null);
    } catch (e) {
      setAviso({ tone: "err", texto: e.message || "Não foi possível concluir a ação." });
      setConfirmacao(null);
    } finally {
      setExecutando(false);
    }
  };

  const pedirExclusaoUsuario = (u) =>
    setConfirmacao({
      titulo: "Excluir usuário",
      mensagem: <>Excluir a conta de <b>{u.email}</b> permanentemente?</>,
      detalhe: "Todo o histórico de desempenho e as comissões dessa conta deixam de ser acessíveis. Não há como desfazer.",
      rotulo: "Excluir conta",
      acao: async () => {
        const res = await fetch(`${API_URL}/users/${u.id}`, { method: "DELETE", headers: authHeaders() });
        if (!res.ok) throw new Error("O servidor recusou a exclusão.");
        setUsers((atual) => atual.filter((x) => x.id !== u.id));
        setAviso({ tone: "ok", texto: `Conta de ${u.email} excluída.` });
      },
    });

  const pedirTrocaStatus = (u) => {
    if (u.id === 1) {
      setAviso({ tone: "warn", texto: "O administrador principal não pode ser suspenso." });
      return;
    }
    const novoStatus = !u.is_active;
    setConfirmacao({
      titulo: novoStatus ? "Reativar conta" : "Suspender conta",
      danger: !novoStatus,
      mensagem: novoStatus
        ? <>Devolver o acesso de <b>{u.email}</b>?</>
        : <>Suspender o acesso de <b>{u.email}</b>?</>,
      detalhe: novoStatus
        ? "A pessoa volta a entrar normalmente, com o plano que já tinha."
        : "A pessoa não consegue mais entrar até ser reativada. O plano e o histórico são preservados.",
      rotulo: novoStatus ? "Reativar" : "Suspender",
      acao: async () => {
        const res = await fetch(`${API_URL}/users/${u.id}`, {
          method: "PUT",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ is_active: novoStatus }),
        });
        if (!res.ok) throw new Error("O servidor recusou a alteração.");
        setUsers((atual) => atual.map((x) => (x.id === u.id ? { ...x, is_active: novoStatus } : x)));
        setAviso({ tone: "ok", texto: novoStatus ? "Conta reativada." : "Conta suspensa." });
      },
    });
  };

  const handleSavePlan = async (planType) => {
    try {
      const res = await fetch(`${API_URL}/admin/grant-plan/${selectedUser.id}?plan=${planType}`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
      });
      if (!res.ok) throw new Error("O servidor recusou a atribuição do plano.");
      setShowModal(false);
      setAviso({ tone: "ok", texto: `Plano atribuído a ${selectedUser.email}.` });
      await fetchUsers();
    } catch (e) {
      setAviso({ tone: "err", texto: e.message || "Erro ao atribuir o plano." });
    }
  };

  const pedirRevogacao = (u) =>
    setConfirmacao({
      titulo: "Remover plano ativo",
      mensagem: <>Remover agora o acesso pago de <b>{u.email}</b>?</>,
      detalhe: "O acesso é cortado imediatamente, sem esperar o fim do período contratado.",
      rotulo: "Remover plano",
      acao: async () => {
        const res = await fetch(`${API_URL}/admin/revoke-plan/${u.id}`, { method: "POST", headers: authHeaders() });
        if (!res.ok) throw new Error("O servidor recusou a remoção.");
        setUsers((atual) =>
          atual.map((x) => (x.id === u.id ? { ...x, plan_expires_at: new Date(Date.now() - 60000).toISOString() } : x))
        );
        setShowModal(false);
        setAviso({ tone: "ok", texto: "Plano removido." });
      },
    });

  const pedirZerarTokens = (u) =>
    setConfirmacao({
      titulo: "Zerar consumo de IA",
      danger: false,
      mensagem: <>Zerar os tokens já usados por <b>{u.email}</b>?</>,
      detalhe: "A cota do plano volta ao valor integral neste ciclo. O custo já gasto na API não é devolvido.",
      rotulo: "Zerar consumo",
      acao: async () => {
        const res = await fetch(`${API_URL}/admin/users/${u.id}/reset-tokens`, { method: "POST", headers: authHeaders() });
        if (!res.ok) throw new Error("O servidor recusou a operação.");
        await fetchUsers();
        setAviso({ tone: "ok", texto: "Consumo zerado." });
      },
    });

  const handleToggleAiBlock = async (userId) => {
    try {
      const res = await fetch(`${API_URL}/admin/users/${userId}/toggle-ai-block`, { method: "POST", headers: authHeaders() });
      if (!res.ok) throw new Error("O servidor recusou a operação.");
      await fetchUsers();
    } catch (e) {
      setAviso({ tone: "err", texto: e.message });
    }
  };

  // ---------------------------------------------------------- comissões
  const handleOpenCommissionModal = async (userObj) => {
    setSelectedUserForCommission(userObj);
    setActionAmount("");
    setActionDesc("");
    setErroComm("");
    setCommissionTab("history");
    setCommissionHistory([]);
    setCommissionModalOpen(true);
    try {
      const res = await fetch(`${API_URL}/admin/users/${userObj.id}/commissions`, { headers: authHeaders() });
      if (res.ok) setCommissionHistory(await res.json());
    } catch (e) {
      setErroComm("Não foi possível carregar o histórico.");
    }
  };

  const submitCommissionAction = async (actionType) => {
    const amount = parseFloat(actionAmount.toString().replace(",", "."));
    if (isNaN(amount) || amount < 0) {
      setErroComm("Digite um valor válido.");
      return;
    }
    if (actionType === "pagamento" && amount > num(selectedUserForCommission.commission_balance)) {
      setErroComm("O pagamento não pode ser maior que o saldo atual.");
      return;
    }

    setErroComm("");
    setIsProcessingComm(true);
    try {
      const res = await fetch(`${API_URL}/admin/users/${selectedUserForCommission.id}/commission-action`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ action: actionType, amount, description: actionDesc }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Erro ao processar a ação.");
      }
      const data = await res.json();
      setUsers((atual) =>
        atual.map((u) => (u.id === selectedUserForCommission.id ? { ...u, commission_balance: data.new_balance } : u))
      );
      setSelectedUserForCommission({ ...selectedUserForCommission, commission_balance: data.new_balance });
      setActionAmount("");
      setActionDesc("");
      setCommissionTab("history");

      const histRes = await fetch(`${API_URL}/admin/users/${selectedUserForCommission.id}/commissions`, { headers: authHeaders() });
      if (histRes.ok) setCommissionHistory(await histRes.json());
      setAviso({ tone: "ok", texto: actionType === "pagamento" ? "Pagamento registrado." : "Saldo ajustado." });
    } catch (e) {
      setErroComm(e.message);
    } finally {
      setIsProcessingComm(false);
    }
  };

  // ----------------------------------------------------------------- IA
  const fetchAiData = async () => {
    try {
      const [confRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/admin/ai-config`, { headers: authHeaders() }),
        fetch(`${API_URL}/admin/ai-stats`, { headers: authHeaders() }),
      ]);
      if (confRes.ok) {
        const data = await confRes.json();
        if (data.model) setAiConfig((atual) => ({ ...atual, ...data }));
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setAiStats((atual) => ({ ...atual, ...data }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveAiConfig = async () => {
    setSavingAi(true);
    try {
      const res = await fetch(`${API_URL}/admin/ai-config`, {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(aiConfig),
      });
      if (!res.ok) throw new Error("Erro ao salvar a configuração da IA.");
      setAviso({ tone: "ok", texto: "Configuração da IA salva." });
    } catch (e) {
      setAviso({ tone: "err", texto: e.message });
    } finally {
      setSavingAi(false);
    }
  };

  // ------------------------------------------------------------- cupons
  const fetchCoupons = async () => {
    setLoadingCoupons(true);
    try {
      const res = await fetch(`${API_URL}/admin/coupons`, { headers: authHeaders() });
      if (res.ok) setCoupons((await res.json()) || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingCoupons(false);
    }
  };

  const handleSaveCoupon = async () => {
    if (!couponFormData.code) {
      setAviso({ tone: "warn", texto: "O código do cupom é obrigatório." });
      return;
    }
    setSavingCoupon(true);
    try {
      const res = await fetch(`${API_URL}/admin/coupons`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(couponFormData),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Erro ao criar o cupom.");
      }
      setCouponModalOpen(false);
      setCouponFormData({ code: "", discount_percentage: 10, max_uses: 100, expires_at: "" });
      setAviso({ tone: "ok", texto: "Cupom criado." });
      fetchCoupons();
    } catch (e) {
      setAviso({ tone: "err", texto: e.message });
    } finally {
      setSavingCoupon(false);
    }
  };

  const pedirExclusaoCupom = (c) =>
    setConfirmacao({
      titulo: "Excluir cupom",
      mensagem: <>Excluir o cupom <b>{c.code}</b>?</>,
      detalhe: "Quem ainda não usou deixa de conseguir aplicá-lo. Compras já feitas com ele não são afetadas.",
      rotulo: "Excluir cupom",
      acao: async () => {
        const res = await fetch(`${API_URL}/admin/coupons/${c.id}`, { method: "DELETE", headers: authHeaders() });
        if (!res.ok) throw new Error("O servidor recusou a exclusão.");
        setCoupons((atual) => atual.filter((x) => x.id !== c.id));
        setAviso({ tone: "ok", texto: "Cupom excluído." });
      },
    });

  // ------------------------------------------------------------ derivados
  const filteredUsers = useMemo(() => {
    const termo = searchTerm.trim().toLowerCase();
    return users.filter((u) => {
      const casaBusca = !termo || (u.email || "").toLowerCase().includes(termo);
      const casaPapel = filtroPapel === "todos" || (u.role || "user") === filtroPapel;
      return casaBusca && casaPapel;
    });
  }, [users, searchTerm, filtroPapel]);

  const resumo = useMemo(() => {
    const agora = new Date();
    let ativos = 0, suspensos = 0, comPlano = 0;
    users.forEach((u) => {
      if (u.is_active === false) suspensos += 1;
      else ativos += 1;
      if (u.role === "admin") comPlano += 1;
      else if (u.plan_expires_at && new Date(u.plan_expires_at) > agora) comPlano += 1;
    });
    return { total: users.length, ativos, suspensos, comPlano };
  }, [users]);

  const statusDoPlano = (u) => {
    const expira = u.plan_expires_at ? new Date(u.plan_expires_at) : null;
    if (u.role === "admin") return { texto: "Vitalício (admin)", tone: "accent", ativo: true };
    if (!expira || isNaN(expira.getTime())) return { texto: "Sem plano", tone: "default", ativo: false };
    if (expira > new Date()) return { texto: `Até ${expira.toLocaleDateString("pt-BR")}`, tone: "ok", ativo: true };
    return { texto: `Expirou em ${expira.toLocaleDateString("pt-BR")}`, tone: "danger", ativo: false };
  };

  if (user && user.role !== "admin") {
    return (
      <EmptyState
        icon={<Shield size={22} />}
        title="Área restrita"
        description="Esta página é do administrador da plataforma."
      />
    );
  }

  // ------------------------------------------------------------------ UI
  const BlocoIA = ({ u }) => {
    const limite = num(u.token_limit);
    const usados = num(u.tokens_used);
    const pct = limite > 0 ? (usados / limite) * 100 : 0;
    return (
      <div className="adm__ia">
        <div className="adm__ia-line">
          <span>{u.plan_type || "Simples"}</span>
          <b>{limite > 0 ? `${milhar(usados)} / ${milhar(limite)}` : "sem cota"}</b>
        </div>
        {limite > 0 && (
          <ProgressBar
            value={pct}
            color={pct >= 90 ? "var(--danger)" : pct >= 70 ? "var(--warn)" : "var(--accent)"}
            aria-label={`Consumo de tokens de ${u.email}`}
          />
        )}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button className="adm__mini" onClick={() => pedirZerarTokens(u)} disabled={u.role === "admin"}>
            Zerar
          </button>
          <button
            className={`adm__mini${u.ai_blocked ? "" : " adm__mini--danger"}`}
            onClick={() => handleToggleAiBlock(u.id)}
            disabled={u.role === "admin"}
          >
            {u.ai_blocked ? "Desbloquear IA" : "Bloquear IA"}
          </button>
        </div>
      </div>
    );
  };

  const AcoesUsuario = ({ u }) => (
    <div className="adm__actions">
      <button
        className={`adm__icon-btn ${u.is_active === false ? "adm__icon-btn--ok" : "adm__icon-btn--danger"}`}
        onClick={() => pedirTrocaStatus(u)}
        disabled={u.id === 1}
        title={u.is_active === false ? "Reativar" : "Suspender"}
        aria-label={`${u.is_active === false ? "Reativar" : "Suspender"} ${u.email}`}
      >
        {u.is_active === false ? <CheckCircle2 size={16} /> : <Ban size={16} />}
      </button>
      <button
        className="adm__icon-btn adm__icon-btn--accent"
        onClick={() => { setSelectedUser(u); setShowModal(true); }}
        title="Gerenciar plano"
        aria-label={`Gerenciar plano de ${u.email}`}
      >
        <Shield size={16} />
      </button>
      <button
        className="adm__icon-btn"
        onClick={() => handleOpenUserModal(u)}
        disabled={u.id === 1}
        title="Editar"
        aria-label={`Editar ${u.email}`}
      >
        <Pencil size={16} />
      </button>
      <button
        className="adm__icon-btn adm__icon-btn--danger"
        onClick={() => pedirExclusaoUsuario(u)}
        disabled={u.id === 1}
        title="Excluir"
        aria-label={`Excluir ${u.email}`}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );

  return (
    <div className="adm">
      <PageHeader
        eyebrow="Administração"
        title="Painel administrativo"
        description="Contas, planos, consumo da IA compartilhada, comissões de indicação e cupons."
        actions={
          <Button
            onClick={() => { fetchUsers(); fetchAiData(); fetchCoupons(); }}
            icon={<RefreshCw size={15} />}
          >
            Atualizar tudo
          </Button>
        }
      />

      {aviso && <Notice tone={aviso.tone} onClose={() => setAviso(null)}>{aviso.texto}</Notice>}

      <div className="adm__tabs" role="tablist">
        {ABAS.map(({ id, rotulo, icone: Icone }) => (
          <button
            key={id}
            role="tab"
            aria-selected={adminTab === id}
            className={`adm__tab${adminTab === id ? " is-on" : ""}`}
            onClick={() => setAdminTab(id)}
          >
            <Icone size={16} /> {rotulo}
          </button>
        ))}
      </div>

      {/* =========================== USUÁRIOS =========================== */}
      {adminTab === "users" && (
        <>
          <div className="adm__stats">
            <StatCard label="Contas" value={resumo.total} delta="cadastradas na plataforma" />
            <StatCard label="Com plano ativo" value={resumo.comPlano} delta="incluindo administradores" />
            <StatCard label="Ativas" value={resumo.ativos} delta="podem entrar normalmente" />
            <StatCard
              label="Suspensas"
              value={resumo.suspensos}
              delta={resumo.suspensos > 0 ? "sem acesso no momento" : "nenhuma suspensa"}
              deltaTone={resumo.suspensos > 0 ? "warn" : "flat"}
            />
          </div>

          <div className="adm__toolbar">
            <span className="adm__search">
              <Search size={16} />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por e-mail…"
                aria-label="Buscar usuários por e-mail"
              />
            </span>

            <label className="ui-field" style={{ flex: "0 1 200px" }}>
              <select
                className="ui-input"
                value={filtroPapel}
                onChange={(e) => setFiltroPapel(e.target.value)}
                aria-label="Filtrar por nível de acesso"
              >
                <option value="todos">Todos os níveis</option>
                <option value="user">Usuário padrão</option>
                <option value="custom">Personalizado</option>
                <option value="admin">Administrador</option>
              </select>
            </label>

            <div className="adm__toolbar-actions">
              <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-3)" }}>
                {filteredUsers.length} de {users.length}
              </span>
              <Button variant="primary" onClick={() => handleOpenUserModal()} icon={<Plus size={15} />}>
                Novo usuário
              </Button>
            </div>
          </div>

          {loadingUsers ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={72} radius="var(--radius-md)" />)}
            </div>
          ) : filteredUsers.length === 0 ? (
            <EmptyState
              icon={<Users size={22} />}
              title="Nenhum usuário encontrado"
              description={
                searchTerm || filtroPapel !== "todos"
                  ? "Nenhuma conta corresponde ao que você filtrou."
                  : "Ainda não há contas cadastradas."
              }
              action={
                (searchTerm || filtroPapel !== "todos") && (
                  <Button onClick={() => { setSearchTerm(""); setFiltroPapel("todos"); }}>Limpar filtros</Button>
                )
              }
            />
          ) : (
            <>
              <div className="adm__table-wrap">
                <div className="adm__scroll">
                  <table className="adm__table">
                    <thead>
                      <tr>
                        <th>Usuário</th>
                        <th style={{ width: 180 }}>Assinatura</th>
                        <th style={{ width: 210 }}>IA compartilhada</th>
                        <th style={{ width: 172 }}>Comissão</th>
                        <th style={{ width: 186, textAlign: "right" }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((u) => {
                        const plano = statusDoPlano(u);
                        return (
                          <tr key={u.id} className={u.is_active === false ? "is-off" : undefined}>
                            <td>
                              <span className="adm__user">
                                <span className={`adm__email${u.is_active === false ? " is-off" : ""}`}>{u.email}</span>
                                <span className="adm__meta">#{u.id}</span>
                                <span className="adm__tags">
                                  <Badge tone={u.role === "admin" ? "accent" : "default"}>
                                    {(u.role || "user").toUpperCase()}
                                  </Badge>
                                  {u.is_active === false && <Badge tone="danger">Suspenso</Badge>}
                                  {u.can_manage_lessons && <Badge outline>Gerencia aulas</Badge>}
                                </span>
                              </span>
                            </td>
                            <td>
                              <span style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
                                <Badge tone={plano.tone}>{plano.texto}</Badge>
                                {u.role !== "admin" && plano.ativo && (
                                  <button className="adm__mini adm__mini--danger" onClick={() => pedirRevogacao(u)}>
                                    <ShieldOff size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
                                    Revogar
                                  </button>
                                )}
                              </span>
                            </td>
                            <td><BlocoIA u={u} /></td>
                            <td>
                              <span style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
                                <span className="adm__money">{brl(u.commission_balance)}</span>
                                <button className="adm__mini" onClick={() => handleOpenCommissionModal(u)}>
                                  Gerenciar ganhos
                                </button>
                              </span>
                            </td>
                            <td><AcoesUsuario u={u} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="adm__cards">
                {filteredUsers.map((u) => {
                  const plano = statusDoPlano(u);
                  return (
                    <div className={`adm__card${u.is_active === false ? " is-off" : ""}`} key={u.id}>
                      <span className="adm__user">
                        <span className="adm__email">{u.email}</span>
                        <span className="adm__meta">#{u.id}</span>
                        <span className="adm__tags">
                          <Badge tone={u.role === "admin" ? "accent" : "default"}>{(u.role || "user").toUpperCase()}</Badge>
                          <Badge tone={plano.tone}>{plano.texto}</Badge>
                          {u.is_active === false && <Badge tone="danger">Suspenso</Badge>}
                        </span>
                      </span>
                      <div className="adm__card-row">
                        <span>Comissão</span>
                        <span className="adm__money">{brl(u.commission_balance)}</span>
                      </div>
                      <BlocoIA u={u} />
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button className="adm__mini" onClick={() => handleOpenCommissionModal(u)}>Ganhos</button>
                        {u.role !== "admin" && plano.ativo && (
                          <button className="adm__mini adm__mini--danger" onClick={() => pedirRevogacao(u)}>Revogar plano</button>
                        )}
                      </div>
                      <AcoesUsuario u={u} />
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* ============================ IA GLOBAL ========================== */}
      {adminTab === "ai_config" && (
        <>
          <div className="adm__stats">
            <StatCard label="Usuários Plus" value={num(aiStats.total_plus)} delta="3M tokens/mês" />
            <StatCard label="Usuários Pro" value={num(aiStats.total_pro)} delta="6M tokens/mês" />
            <StatCard label="Tokens hoje" value={milhar(aiStats.tokens_today)} delta="na chave compartilhada" />
            <StatCard label="Tokens no mês" value={milhar(aiStats.tokens_month)} delta="acumulado do ciclo" />
            <StatCard
              label="Custo estimado"
              value={`$ ${num(aiStats.estimated_cost).toFixed(2)}`}
              delta="estimativa da API"
              deltaTone="warn"
            />
          </div>

          <div className="ui-card">
            <div className="ui-card__head"><h3>Chave e modelo compartilhados</h3></div>
            <div className="ui-card__body" style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
              <Notice tone="info">
                Esta chave atende os planos Plus e Pro. Quem usa o plano Simples consome a própria chave.
              </Notice>

              <div className="adm__form-grid">
                <Input
                  label="Modelo de linguagem"
                  value={aiConfig.model || ""}
                  onChange={(e) => setAiConfig({ ...aiConfig, model: e.target.value })}
                  placeholder="ex: openai/gpt-4o-mini"
                />
                <Input
                  label="Chave da OpenRouter"
                  type="password"
                  value={aiConfig.api_key || ""}
                  onChange={(e) => setAiConfig({ ...aiConfig, api_key: e.target.value })}
                  placeholder="sk-or-v1-…"
                />
                <Input
                  label="Temperatura"
                  type="number"
                  step="0.1"
                  value={aiConfig.temperature}
                  onChange={(e) => setAiConfig({ ...aiConfig, temperature: parseFloat(e.target.value) })}
                />
                <Input
                  label="Máximo de tokens por requisição"
                  type="number"
                  value={aiConfig.max_tokens}
                  onChange={(e) => setAiConfig({ ...aiConfig, max_tokens: parseInt(e.target.value, 10) })}
                />
              </div>

              <label className="ui-field">
                <span className="ui-field__label">Prompt global (opcional)</span>
                <textarea
                  className="ui-input"
                  style={{ minHeight: 110, resize: "vertical", lineHeight: 1.6 }}
                  value={aiConfig.global_prompt || ""}
                  onChange={(e) => setAiConfig({ ...aiConfig, global_prompt: e.target.value })}
                  placeholder="Regra injetada em todas as chamadas de IA da plataforma."
                />
              </label>

              <Button variant="primary" onClick={handleSaveAiConfig} disabled={savingAi} style={{ alignSelf: "flex-start" }}>
                {savingAi ? "Salvando…" : "Salvar configuração"}
              </Button>
            </div>
          </div>
        </>
      )}

      {/* ============================== CUPONS =========================== */}
      {adminTab === "coupons" && (
        <>
          <div className="adm__toolbar">
            <span style={{ fontSize: "var(--text-sm)", color: "var(--fg-2)" }}>
              Cupons aplicados no cadastro, na etapa de escolha do plano.
            </span>
            <div className="adm__toolbar-actions">
              <Button variant="primary" onClick={() => setCouponModalOpen(true)} icon={<Plus size={15} />}>
                Novo cupom
              </Button>
            </div>
          </div>

          {loadingCoupons ? (
            <Skeleton height={180} radius="var(--radius-md)" />
          ) : coupons.length === 0 ? (
            <EmptyState
              icon={<Ticket size={22} />}
              title="Nenhum cupom cadastrado"
              description="Cupons dão desconto percentual no primeiro pagamento e podem ter limite de usos e validade."
              action={<Button variant="primary" onClick={() => setCouponModalOpen(true)} icon={<Plus size={15} />}>Criar cupom</Button>}
            />
          ) : (
            <div className="adm__table-wrap">
              <div className="adm__scroll">
                <table className="adm__table" style={{ minWidth: 680 }}>
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th style={{ width: 110 }}>Desconto</th>
                      <th style={{ width: 150 }}>Usos</th>
                      <th style={{ width: 150 }}>Validade</th>
                      <th style={{ width: 110 }}>Situação</th>
                      <th style={{ width: 80, textAlign: "right" }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coupons.map((c) => {
                      const expirado = c.expires_at && new Date(c.expires_at) < new Date();
                      const esgotado = c.max_uses > 0 && c.current_uses >= c.max_uses;
                      const valido = c.is_active && !expirado && !esgotado;
                      return (
                        <tr key={c.id}>
                          <td>
                            <span className="adm__email" style={{ fontFamily: "var(--font-mono)", letterSpacing: ".05em" }}>
                              {c.code}
                            </span>
                          </td>
                          <td><b style={{ color: "var(--fg)" }}>{c.discount_percentage}%</b></td>
                          <td>{num(c.current_uses)} / {c.max_uses > 0 ? c.max_uses : "ilimitado"}</td>
                          <td>{c.expires_at ? new Date(c.expires_at).toLocaleDateString("pt-BR") : "sem validade"}</td>
                          <td>
                            {valido ? (
                              <Badge tone="ok">Válido</Badge>
                            ) : (
                              <Badge tone="danger">{expirado ? "Expirado" : esgotado ? "Esgotado" : "Inativo"}</Badge>
                            )}
                          </td>
                          <td>
                            <div className="adm__actions">
                              <button
                                className="adm__icon-btn adm__icon-btn--danger"
                                onClick={() => pedirExclusaoCupom(c)}
                                title="Excluir cupom"
                                aria-label={`Excluir o cupom ${c.code}`}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ============================== MODAIS =========================== */}
      <ConfirmDialog
        open={!!confirmacao}
        title={confirmacao?.titulo}
        message={confirmacao?.mensagem}
        detail={confirmacao?.detalhe}
        confirmLabel={confirmacao?.rotulo}
        danger={confirmacao?.danger !== false}
        loading={executando}
        onConfirm={executarAcao}
        onCancel={() => setConfirmacao(null)}
      />

      <Modal
        open={userModalOpen}
        onClose={() => !savingUser && setUserModalOpen(false)}
        title={editingUser ? "Editar usuário" : "Novo usuário"}
        subtitle={editingUser?.email}
        footer={
          <>
            <Button onClick={() => setUserModalOpen(false)} disabled={savingUser}>Cancelar</Button>
            <Button variant="primary" onClick={handleSaveUser} disabled={savingUser}>
              {savingUser ? "Salvando…" : "Salvar"}
            </Button>
          </>
        }
      >
        <Input
          label="E-mail"
          type="email"
          autoFocus
          value={userFormData.email}
          onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
        />
        <Input
          label={editingUser ? "Senha (deixe em branco para manter)" : "Senha"}
          type="password"
          value={userFormData.password}
          onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
        />

        <label className="ui-field">
          <span className="ui-field__label">Nível de acesso</span>
          <select
            className="ui-input"
            value={userFormData.role}
            onChange={(e) => setUserFormData({ ...userFormData, role: e.target.value })}
          >
            <option value="user">Usuário padrão — vê as aulas públicas</option>
            <option value="custom">Personalizado — só os concursos atribuídos</option>
            <option value="admin">Administrador — acesso total</option>
          </select>
        </label>

        {userFormData.role === "custom" && (
          <Input
            label="Concursos permitidos (separados por vírgula)"
            value={userFormData.allowed_concursos}
            onChange={(e) => setUserFormData({ ...userFormData, allowed_concursos: e.target.value })}
            placeholder="Ex: Polícia Federal, INSS, DATAPREV"
          />
        )}

        <label className="adm__check">
          <input
            type="checkbox"
            checked={userFormData.can_manage_lessons}
            onChange={(e) => setUserFormData({ ...userFormData, can_manage_lessons: e.target.checked })}
          />
          <span>
            <b>Pode criar e gerenciar aulas</b>
            <span>Libera o gerador e a tela de gerenciamento para esta conta.</span>
          </span>
        </label>
      </Modal>

      <Modal
        open={couponModalOpen}
        onClose={() => !savingCoupon && setCouponModalOpen(false)}
        title="Novo cupom"
        footer={
          <>
            <Button onClick={() => setCouponModalOpen(false)} disabled={savingCoupon}>Cancelar</Button>
            <Button variant="primary" onClick={handleSaveCoupon} disabled={savingCoupon}>
              {savingCoupon ? "Criando…" : "Criar cupom"}
            </Button>
          </>
        }
      >
        <Input
          label="Código"
          autoFocus
          value={couponFormData.code}
          onChange={(e) => setCouponFormData({ ...couponFormData, code: e.target.value.toUpperCase() })}
          placeholder="Ex: APROVADO20"
          style={{ textTransform: "uppercase", fontFamily: "var(--font-mono)" }}
        />
        <div className="adm__form-grid">
          <Input
            label="Desconto (%)"
            type="number"
            min="1"
            max="100"
            value={couponFormData.discount_percentage}
            onChange={(e) => setCouponFormData({ ...couponFormData, discount_percentage: parseInt(e.target.value, 10) })}
          />
          <Input
            label="Limite de usos (0 = ilimitado)"
            type="number"
            min="0"
            value={couponFormData.max_uses}
            onChange={(e) => setCouponFormData({ ...couponFormData, max_uses: parseInt(e.target.value, 10) })}
          />
        </div>
        <Input
          label="Validade (opcional)"
          type="date"
          value={couponFormData.expires_at}
          onChange={(e) => setCouponFormData({ ...couponFormData, expires_at: e.target.value })}
        />
      </Modal>

      <Modal
        open={showModal && !!selectedUser}
        onClose={() => setShowModal(false)}
        title="Atribuir plano"
        subtitle={selectedUser?.email}
        wide
        footer={<Button onClick={() => setShowModal(false)}>Fechar</Button>}
      >
        <Notice tone="warn">
          O plano é concedido na hora, sem passar pelo pagamento. Use para cortesias, testes e correções.
        </Notice>
        <div className="adm__plans">
          {PLANOS.map((p) => (
            <button key={p.id} className="adm__plan" onClick={() => handleSavePlan(p.id)}>
              {p.nome}
              <small>{p.detalhe}</small>
            </button>
          ))}
        </div>
        {selectedUser && statusDoPlano(selectedUser).ativo && selectedUser.role !== "admin" && (
          <Button variant="danger" onClick={() => pedirRevogacao(selectedUser)} icon={<ShieldOff size={15} />}>
            Remover o plano ativo
          </Button>
        )}
      </Modal>

      <Modal
        open={commissionModalOpen && !!selectedUserForCommission}
        onClose={() => !isProcessingComm && setCommissionModalOpen(false)}
        title="Comissões de indicação"
        subtitle={selectedUserForCommission?.email}
        wide
        footer={
          <Button onClick={() => setCommissionModalOpen(false)} disabled={isProcessingComm}>Fechar</Button>
        }
      >
        <div className="adm__saldo">
          <span>Saldo disponível</span>
          <b>{brl(selectedUserForCommission?.commission_balance)}</b>
        </div>

        <div className="adm__tabs" role="tablist">
          <button
            role="tab"
            aria-selected={commissionTab === "history"}
            className={`adm__tab${commissionTab === "history" ? " is-on" : ""}`}
            onClick={() => setCommissionTab("history")}
          >
            <FileText size={15} /> Extrato
          </button>
          <button
            role="tab"
            aria-selected={commissionTab === "pay"}
            className={`adm__tab${commissionTab === "pay" ? " is-on" : ""}`}
            onClick={() => {
              setCommissionTab("pay");
              setActionAmount(num(selectedUserForCommission?.commission_balance).toFixed(2));
              setActionDesc("");
              setErroComm("");
            }}
          >
            <DollarSign size={15} /> Registrar pagamento
          </button>
          <button
            role="tab"
            aria-selected={commissionTab === "edit"}
            className={`adm__tab${commissionTab === "edit" ? " is-on" : ""}`}
            onClick={() => {
              setCommissionTab("edit");
              setActionAmount(num(selectedUserForCommission?.commission_balance).toFixed(2));
              setActionDesc("");
              setErroComm("");
            }}
          >
            <Settings2 size={15} /> Corrigir saldo
          </button>
        </div>

        {erroComm && <Notice tone="err" onClose={() => setErroComm("")}>{erroComm}</Notice>}

        {commissionTab === "history" && (
          <div className="adm__hist">
            {commissionHistory.length === 0 ? (
              <div className="adm__hist-empty">Nenhum lançamento registrado.</div>
            ) : (
              commissionHistory.map((item) => (
                <div className="adm__hist-row" key={item.id}>
                  <span>{new Date(item.created_at).toLocaleDateString("pt-BR")}</span>
                  <span>
                    {item.action_type === "ganho" && <Badge tone="ok">Entrada</Badge>}
                    {item.action_type === "pagamento" && <Badge tone="danger">Pagamento</Badge>}
                    {item.action_type === "ajuste" && <Badge tone="accent">Ajuste</Badge>}
                  </span>
                  <span className="d" style={{ color: "var(--fg-2)" }}>{item.description}</span>
                  <span className={`v${item.action_type === "pagamento" ? " is-out" : ""}`}>
                    {item.action_type === "pagamento" ? "−" : ""} {brl(item.amount)}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {commissionTab === "pay" && (
          <>
            <Notice tone="info">
              Registra que você já enviou o dinheiro ao afiliado (PIX ou transferência). O valor é
              deduzido do saldo — o envio em si acontece fora da plataforma.
            </Notice>
            <Input
              label="Valor pago (R$)"
              type="number"
              step="0.01"
              max={num(selectedUserForCommission?.commission_balance)}
              value={actionAmount}
              onChange={(e) => setActionAmount(e.target.value)}
            />
            <Input
              label="Comprovante ou observação (opcional)"
              value={actionDesc}
              onChange={(e) => setActionDesc(e.target.value)}
              placeholder="Ex: PIX enviado em 10/09"
            />
            <Button variant="primary" onClick={() => submitCommissionAction("pagamento")} disabled={isProcessingComm} block>
              {isProcessingComm ? "Processando…" : "Registrar pagamento e deduzir do saldo"}
            </Button>
          </>
        )}

        {commissionTab === "edit" && (
          <>
            <Notice tone="warn">
              Isto define o saldo exato da conta, ignorando o histórico. Use só para corrigir erros de
              lançamento — o valor antigo não fica guardado em lugar nenhum.
            </Notice>
            <Input
              label="Novo saldo exato (R$)"
              type="number"
              step="0.01"
              value={actionAmount}
              onChange={(e) => setActionAmount(e.target.value)}
            />
            <Input
              label="Motivo do ajuste"
              value={actionDesc}
              onChange={(e) => setActionDesc(e.target.value)}
              placeholder="Ex: correção de lançamento duplicado"
            />
            <Button onClick={() => submitCommissionAction("ajuste")} disabled={isProcessingComm} block>
              {isProcessingComm ? "Processando…" : "Definir este saldo"}
            </Button>
          </>
        )}
      </Modal>
    </div>
  );
}
