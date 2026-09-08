import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Trash2, Eye, RefreshCw, Pencil, BookOpen, ChevronLeft, ChevronRight,
  UserPlus, X, Search, Download, Archive, Globe, Lock, Upload, Plus,
} from "lucide-react";
import JSZip from "jszip";
import {
  Button, Badge, Input, EmptyState, Skeleton, PageHeader, Modal, ConfirmDialog, Notice,
} from "../components/ui";
import "./GerenciarAulas.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const POR_PAGINA = 10;

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

const nomeArquivo = (titulo) =>
  (titulo ? titulo.replace(/[^a-z0-9]/gi, "_").toLowerCase() : "aula");

function baixarBlob(blob, nome) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function GerenciarAulas() {
  const [plans, setPlans] = useState([]);
  const [total, setTotal] = useState(0);
  const [loadingPlans, setLoadingPlans] = useState(true);

  const [pagina, setPagina] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");

  // Um único lugar para o resultado das ações, no lugar dos alert() nativos.
  const [aviso, setAviso] = useState(null); // { tone, texto }

  const [editingPlan, setEditingPlan] = useState(null);
  const [editFormData, setEditFormData] = useState({
    title: "", area: "", ano: "", banca: "", concurso: "", visibility: "public", content: null,
  });
  const [savingPlan, setSavingPlan] = useState(false);

  const [confirmacao, setConfirmacao] = useState(null); // { tipo, plan }
  const [executando, setExecutando] = useState(false);

  const [downloadingId, setDownloadingId] = useState(null);
  const [backup, setBackup] = useState(null); // { feitos, total }

  const [sharingPlan, setSharingPlan] = useState(null);
  const [sharedEmails, setSharedEmails] = useState([]);
  const [newEmail, setNewEmail] = useState("");
  const [loadingShares, setLoadingShares] = useState(false);
  const [erroShare, setErroShare] = useState("");

  const buscaTimer = useRef(null);

  // ------------------------------------------------------------------ dados
  const fetchPlans = useCallback((page, termo) => {
    setLoadingPlans(true);
    const params = new URLSearchParams({ page, limit: POR_PAGINA, manage_mode: "true" });
    if (termo) params.append("search", termo);

    fetch(`${API_URL}/plans?${params.toString()}`, { headers: authHeaders() })
      .then((res) => {
        if (!res.ok) throw new Error("Não foi possível carregar as aulas.");
        return res.json();
      })
      .then((data) => {
        setPlans(data.items || []);
        setTotal(data.total || 0);
        const paginas = Math.ceil((data.total || 0) / POR_PAGINA);
        setTotalPages(paginas > 0 ? paginas : 1);
      })
      .catch((err) => {
        console.error(err);
        setPlans([]);
        setAviso({ tone: "err", texto: err.message || "Erro ao carregar as aulas." });
      })
      .finally(() => setLoadingPlans(false));
  }, []);

  useEffect(() => {
    fetchPlans(pagina, buscaAplicada);
  }, [pagina, buscaAplicada, fetchPlans]);

  // A busca aplica sozinha depois que a pessoa para de digitar, e sempre
  // volta para a primeira página — antes dava para ficar na página 3 vendo
  // os resultados da página 1.
  const handleBusca = (valor) => {
    setBusca(valor);
    if (buscaTimer.current) clearTimeout(buscaTimer.current);
    buscaTimer.current = setTimeout(() => {
      setPagina(1);
      setBuscaAplicada(valor.trim());
    }, 400);
  };

  const limparBusca = () => {
    if (buscaTimer.current) clearTimeout(buscaTimer.current);
    setBusca("");
    setPagina(1);
    setBuscaAplicada("");
  };

  useEffect(() => () => buscaTimer.current && clearTimeout(buscaTimer.current), []);

  const irParaPagina = (n) => {
    if (n < 1 || n > totalPages) return;
    setPagina(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ------------------------------------------------------------------ ações
  const confirmarExclusao = async () => {
    const plan = confirmacao?.plan;
    if (!plan) return;
    setExecutando(true);
    try {
      const res = await fetch(`${API_URL}/plans/${plan.id}`, { method: "DELETE", headers: authHeaders() });
      if (!res.ok) throw new Error("O servidor recusou a exclusão.");
      setConfirmacao(null);
      setAviso({ tone: "ok", texto: `Aula "${plan.title}" excluída.` });
      // Se era o último item da página, volta uma página para não ficar vazio.
      const ultimaDaPagina = plans.length === 1 && pagina > 1;
      if (ultimaDaPagina) setPagina(pagina - 1);
      else fetchPlans(pagina, buscaAplicada);
    } catch (e) {
      console.error(e);
      setAviso({ tone: "err", texto: e.message || "Erro ao excluir a aula." });
      setConfirmacao(null);
    } finally {
      setExecutando(false);
    }
  };

  const handleOpenEdit = (plan) => {
    setEditingPlan(plan);
    setEditFormData({
      title: plan.title || "",
      area: plan.area || "",
      ano: plan.ano || "",
      banca: plan.banca || "",
      concurso: plan.concurso || "",
      visibility: plan.visibility || "public",
      content: null,
    });
  };

  const handleJsonUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target.result);
        // Aceita tanto o backup { meta, content } quanto o conteúdo direto.
        const actualContent = json.meta && json.content ? json.content : json;

        if (!Array.isArray(actualContent?.aulas) || actualContent.aulas.length === 0) {
          throw new Error("O arquivo não tem a lista de aulas no formato esperado.");
        }

        setEditFormData((prev) => ({ ...prev, content: actualContent, contentNome: file.name }));
        setAviso(null);
      } catch (error) {
        console.error(error);
        setEditFormData((prev) => ({ ...prev, content: null, contentNome: null }));
        setAviso({ tone: "err", texto: error.message || "Arquivo JSON inválido ou corrompido." });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleSaveEdit = async () => {
    if (!editFormData.title.trim()) {
      setAviso({ tone: "warn", texto: "A aula precisa de um título." });
      return;
    }
    setSavingPlan(true);

    const normalizedData = {
      ...editFormData,
      concurso: editFormData.concurso ? editFormData.concurso.trim().toUpperCase() : "",
      banca: editFormData.banca ? editFormData.banca.trim().toUpperCase() : "",
      area: editFormData.area ? editFormData.area.trim() : "",
    };
    delete normalizedData.contentNome;

    try {
      const res = await fetch(`${API_URL}/plans/${editingPlan.id}`, {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(normalizedData),
      });
      if (!res.ok) throw new Error("O servidor recusou a alteração.");
      setEditingPlan(null);
      setAviso({ tone: "ok", texto: "Aula atualizada." });
      fetchPlans(pagina, buscaAplicada);
    } catch (e) {
      console.error(e);
      setAviso({ tone: "err", texto: e.message || "Erro ao salvar a aula." });
    } finally {
      setSavingPlan(false);
    }
  };

  // ----------------------------------------------------------- acessos
  const handleOpenShare = async (plan) => {
    setSharingPlan(plan);
    setSharedEmails([]);
    setErroShare("");
    setLoadingShares(true);
    try {
      const res = await fetch(`${API_URL}/plans/${plan.id}/shares`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setSharedEmails(data.emails || []);
      }
    } catch (e) {
      console.error(e);
      setErroShare("Não foi possível carregar a lista de acessos.");
    } finally {
      setLoadingShares(false);
    }
  };

  const handleAddEmail = async () => {
    const email = newEmail.trim();
    if (!email || !email.includes("@")) {
      setErroShare("Digite um e-mail válido.");
      return;
    }
    setErroShare("");
    try {
      const res = await fetch(`${API_URL}/plans/${sharingPlan.id}/shares`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Não foi possível adicionar este e-mail.");
      }
      setSharedEmails((atual) => [...atual, email]);
      setNewEmail("");
    } catch (e) {
      setErroShare(e.message);
    }
  };

  const handleRemoveEmail = async (emailToRemove) => {
    try {
      const res = await fetch(`${API_URL}/plans/${sharingPlan.id}/shares/${emailToRemove}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (res.ok) setSharedEmails((atual) => atual.filter((e) => e !== emailToRemove));
    } catch (e) {
      console.error(e);
      setErroShare("Não foi possível remover o acesso.");
    }
  };

  // ---------------------------------------------------------- downloads
  const handleDownloadPlan = async (plan) => {
    setDownloadingId(plan.id);
    try {
      const res = await fetch(`${API_URL}/plans/${plan.id}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Erro ao buscar o conteúdo da aula.");
      const content = await res.json();
      baixarBlob(
        new Blob([JSON.stringify(content, null, 2)], { type: "application/json" }),
        `aula_${nomeArquivo(plan.title)}.json`
      );
    } catch (e) {
      console.error(e);
      setAviso({ tone: "err", texto: "Não foi possível baixar esta aula." });
    } finally {
      setDownloadingId(null);
    }
  };

  const confirmarBackup = async () => {
    setConfirmacao(null);
    setBackup({ feitos: 0, total: 0 });

    try {
      const summaryRes = await fetch(`${API_URL}/plans?limit=1000&manage_mode=true`, { headers: authHeaders() });
      if (!summaryRes.ok) throw new Error("Erro ao buscar a lista de aulas.");
      const summaryData = await summaryRes.json();
      const plansToDownload = summaryData.items || [];

      if (plansToDownload.length === 0) {
        setBackup(null);
        setAviso({ tone: "warn", texto: "Não há aulas para gerar backup." });
        return;
      }

      setBackup({ feitos: 0, total: plansToDownload.length });

      const zip = new JSZip();
      const folder = zip.folder("backup_aulas");
      let falharam = 0;

      for (let i = 0; i < plansToDownload.length; i++) {
        const plan = plansToDownload[i];
        try {
          const detailRes = await fetch(`${API_URL}/plans/${plan.id}`, { headers: authHeaders() });
          if (detailRes.ok) {
            const content = await detailRes.json();
            const exportData = {
              meta: {
                id: plan.id, title: plan.title, area: plan.area,
                banca: plan.banca, concurso: plan.concurso, ano: plan.ano,
                visibility: plan.visibility,
              },
              content,
            };
            folder.file(`${plan.id}_${nomeArquivo(plan.title)}.json`, JSON.stringify(exportData, null, 2));
          } else {
            falharam += 1;
          }
        } catch (e) {
          falharam += 1;
        }
        setBackup({ feitos: i + 1, total: plansToDownload.length });
      }

      const zipContent = await zip.generateAsync({ type: "blob" });
      const data = new Date().toISOString().split("T")[0];
      baixarBlob(zipContent, `backup_aulas_${data}.zip`);

      setAviso({
        tone: falharam > 0 ? "warn" : "ok",
        texto: falharam > 0
          ? `Backup gerado com ${plansToDownload.length - falharam} de ${plansToDownload.length} aulas — ${falharam} falharam.`
          : `Backup de ${plansToDownload.length} aula(s) gerado.`,
      });
    } catch (e) {
      console.error(e);
      setAviso({ tone: "err", texto: "Erro ao gerar o arquivo ZIP." });
    } finally {
      setBackup(null);
    }
  };

  // ------------------------------------------------------------------ UI
  const paginas = useMemo(() => {
    const lista = [];
    for (let n = 1; n <= totalPages; n++) {
      if (n === 1 || n === totalPages || (n >= pagina - 1 && n <= pagina + 1)) lista.push(n);
      else if (n === pagina - 2 || n === pagina + 2) lista.push("…");
    }
    return lista;
  }, [totalPages, pagina]);

  const AcoesDaAula = ({ plan }) => (
    <div className="ga__actions">
      <Link className="ga__icon-btn" to={`/aula/${plan.id}`} title="Abrir a aula" aria-label={`Abrir ${plan.title}`}>
        <Eye size={16} />
      </Link>
      <button
        className="ga__icon-btn"
        onClick={() => handleDownloadPlan(plan)}
        disabled={downloadingId === plan.id}
        title="Baixar JSON"
        aria-label={`Baixar ${plan.title} em JSON`}
      >
        {downloadingId === plan.id ? <RefreshCw size={16} className="spin" /> : <Download size={16} />}
      </button>
      {plan.visibility === "private" && (
        <button
          className="ga__icon-btn ga__icon-btn--accent"
          onClick={() => handleOpenShare(plan)}
          title="Gerenciar quem tem acesso"
          aria-label={`Gerenciar acessos de ${plan.title}`}
        >
          <UserPlus size={16} />
        </button>
      )}
      <button
        className="ga__icon-btn"
        onClick={() => handleOpenEdit(plan)}
        title="Editar"
        aria-label={`Editar ${plan.title}`}
      >
        <Pencil size={16} />
      </button>
      <button
        className="ga__icon-btn ga__icon-btn--danger"
        onClick={() => setConfirmacao({ tipo: "excluir", plan })}
        title="Excluir"
        aria-label={`Excluir ${plan.title}`}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );

  const Visibilidade = ({ plan }) =>
    plan.visibility === "private" ? (
      <Badge icon={<Lock size={11} />}>Privado</Badge>
    ) : (
      <Badge tone="ok" icon={<Globe size={11} />}>Público</Badge>
    );

  const vazioPorBusca = !loadingPlans && plans.length === 0 && !!buscaAplicada;
  const vazioTotal = !loadingPlans && plans.length === 0 && !buscaAplicada;

  return (
    <div className="ga">
      <PageHeader
        eyebrow="Gestão"
        title="Gerenciar aulas"
        description="Edite os dados, controle quem enxerga cada aula, baixe backups ou exclua o que não usa mais."
        actions={
          <>
            <Button
              onClick={() => setConfirmacao({ tipo: "backup" })}
              disabled={backup !== null}
              icon={<Archive size={15} />}
            >
              {backup ? `Backup ${backup.feitos}/${backup.total || "…"}` : "Baixar todas"}
            </Button>
            <Button variant="primary" to="/generator" icon={<Plus size={15} />}>Nova aula</Button>
          </>
        }
      />

      {aviso && (
        <Notice tone={aviso.tone} onClose={() => setAviso(null)}>{aviso.texto}</Notice>
      )}

      <div className="ga__toolbar">
        <span className="ga__search">
          <Search size={16} />
          <input
            type="search"
            value={busca}
            onChange={(e) => handleBusca(e.target.value)}
            placeholder="Buscar por título, banca ou concurso…"
            aria-label="Buscar aulas"
          />
          {busca && (
            <button className="ga__search-clear" onClick={limparBusca} aria-label="Limpar busca">
              <X size={15} />
            </button>
          )}
        </span>

        <div className="ga__toolbar-actions">
          <span className="ga__count" style={{ alignSelf: "center" }}>
            {loadingPlans ? "carregando…" : `${total} aula(s)${buscaAplicada ? " encontradas" : ""}`}
          </span>
          <Button onClick={() => fetchPlans(pagina, buscaAplicada)} icon={<RefreshCw size={15} />}>
            Atualizar
          </Button>
        </div>
      </div>

      {loadingPlans ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={56} radius="var(--radius-md)" />)}
        </div>
      ) : vazioTotal ? (
        <EmptyState
          icon={<BookOpen size={22} />}
          title="Nenhuma aula cadastrada"
          description="As aulas que você gerar aparecem aqui para editar, compartilhar ou baixar."
          action={<Button variant="primary" to="/generator" icon={<Plus size={15} />}>Gerar a primeira aula</Button>}
        />
      ) : vazioPorBusca ? (
        <EmptyState
          icon={<Search size={22} />}
          title="Nada encontrado"
          description={`Nenhuma aula corresponde a "${buscaAplicada}". Tente outro título, banca ou concurso.`}
          action={<Button onClick={limparBusca}>Limpar busca</Button>}
        />
      ) : (
        <>
          {/* Tabela (telas largas) */}
          <div className="ga__table-wrap">
            <div className="ga__scroll">
              <table className="ga__table">
                <thead>
                  <tr>
                    <th style={{ width: 64 }}>ID</th>
                    <th>Aula</th>
                    <th style={{ width: 120 }}>Visibilidade</th>
                    <th style={{ width: 200 }}>Banca / concurso</th>
                    <th style={{ width: 190, textAlign: "right" }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((plan) => (
                    <tr key={plan.id}>
                      <td className="ga__id">#{plan.id}</td>
                      <td>
                        <span className="ga__title">{plan.title}</span>
                        {plan.area && <span className="ga__title-sub">{plan.area}</span>}
                      </td>
                      <td><Visibilidade plan={plan} /></td>
                      <td>
                        <span className="ga__cell-tags">
                          {plan.banca && <Badge>{plan.banca}</Badge>}
                          {plan.ano && <Badge outline>{plan.ano}</Badge>}
                        </span>
                        {plan.concurso && <span className="ga__title-sub">{plan.concurso}</span>}
                      </td>
                      <td><AcoesDaAula plan={plan} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cartões (celular) */}
          <div className="ga__cards">
            {plans.map((plan) => (
              <div className="ga__card" key={plan.id}>
                <div className="ga__card-top">
                  <span style={{ minWidth: 0 }}>
                    <span className="ga__title">{plan.title}</span>
                    <span className="ga__title-sub">
                      #{plan.id}{plan.area ? ` · ${plan.area}` : ""}
                    </span>
                  </span>
                  <Visibilidade plan={plan} />
                </div>
                <span className="ga__cell-tags">
                  {plan.banca && <Badge>{plan.banca}</Badge>}
                  {plan.ano && <Badge outline>{plan.ano}</Badge>}
                  {plan.concurso && <Badge outline>{plan.concurso}</Badge>}
                </span>
                <AcoesDaAula plan={plan} />
              </div>
            ))}
          </div>
        </>
      )}

      {totalPages > 1 && !loadingPlans && (
        <div className="ga__pager">
          <Button onClick={() => irParaPagina(pagina - 1)} disabled={pagina === 1} icon={<ChevronLeft size={15} />}>
            Anterior
          </Button>
          {paginas.map((n, i) =>
            n === "…" ? (
              <span key={`sep-${i}`} style={{ color: "var(--fg-3)" }}>…</span>
            ) : (
              <button
                key={n}
                className={`ga__page${pagina === n ? " is-current" : ""}`}
                onClick={() => irParaPagina(n)}
                aria-current={pagina === n ? "page" : undefined}
              >
                {n}
              </button>
            )
          )}
          <Button onClick={() => irParaPagina(pagina + 1)} disabled={pagina === totalPages}>
            Próxima <ChevronRight size={15} />
          </Button>
        </div>
      )}

      {/* ----------------------------- Modais ----------------------------- */}
      <ConfirmDialog
        open={confirmacao?.tipo === "excluir"}
        title="Excluir aula"
        message={<>Excluir <b>{confirmacao?.plan?.title}</b> definitivamente?</>}
        detail="A aula sai da biblioteca de todos que têm acesso a ela. Não há como desfazer — se quiser guardar uma cópia, baixe o JSON antes."
        confirmLabel="Excluir aula"
        loading={executando}
        onConfirm={confirmarExclusao}
        onCancel={() => setConfirmacao(null)}
      />

      <ConfirmDialog
        open={confirmacao?.tipo === "backup"}
        title="Gerar backup completo"
        danger={false}
        message="Baixar um ZIP com o conteúdo de todas as aulas?"
        detail="Cada aula é buscada uma a uma, então isso pode levar alguns minutos se houver muitas. Você acompanha o progresso no botão."
        confirmLabel="Gerar backup"
        onConfirm={confirmarBackup}
        onCancel={() => setConfirmacao(null)}
      />

      <Modal
        open={!!sharingPlan}
        onClose={() => setSharingPlan(null)}
        title="Quem pode acessar"
        subtitle={sharingPlan?.title}
        footer={<Button onClick={() => setSharingPlan(null)}>Fechar</Button>}
      >
        <p style={{ margin: 0, color: "var(--fg-2)", fontSize: "var(--text-sm)", lineHeight: 1.55 }}>
          Esta aula é privada. Some ao seu acesso os e-mails das pessoas que também podem abri-la.
        </p>

        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <Input
            type="email"
            value={newEmail}
            onChange={(e) => { setNewEmail(e.target.value); setErroShare(""); }}
            onKeyDown={(e) => e.key === "Enter" && handleAddEmail()}
            placeholder="pessoa@exemplo.com"
            aria-label="E-mail para liberar acesso"
          />
          <Button variant="primary" onClick={handleAddEmail} icon={<Plus size={15} />}>Adicionar</Button>
        </div>

        {erroShare && <Notice tone="err" onClose={() => setErroShare("")}>{erroShare}</Notice>}

        <div className="ga__emails">
          {loadingShares ? (
            <div className="ga__email-empty">Carregando acessos…</div>
          ) : sharedEmails.length === 0 ? (
            <div className="ga__email-empty">Só você tem acesso a esta aula.</div>
          ) : (
            sharedEmails.map((email, i) => (
              <div className="ga__email" key={`${email}-${i}`}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{email}</span>
                <button
                  className="ga__icon-btn ga__icon-btn--danger"
                  onClick={() => handleRemoveEmail(email)}
                  title="Remover acesso"
                  aria-label={`Remover o acesso de ${email}`}
                >
                  <X size={15} />
                </button>
              </div>
            ))
          )}
        </div>
      </Modal>

      <Modal
        open={!!editingPlan}
        onClose={() => !savingPlan && setEditingPlan(null)}
        title="Editar aula"
        subtitle={editingPlan ? `#${editingPlan.id}` : ""}
        footer={
          <>
            <Button onClick={() => setEditingPlan(null)} disabled={savingPlan}>Cancelar</Button>
            <Button variant="primary" onClick={handleSaveEdit} disabled={savingPlan}>
              {savingPlan ? "Salvando…" : "Salvar alterações"}
            </Button>
          </>
        }
      >
        <Input
          label="Título da aula"
          value={editFormData.title}
          onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
        />

        <div className="ga__grid">
          <Input
            label="Área"
            value={editFormData.area}
            onChange={(e) => setEditFormData({ ...editFormData, area: e.target.value })}
          />
          <Input
            label="Banca"
            value={editFormData.banca}
            onChange={(e) => setEditFormData({ ...editFormData, banca: e.target.value })}
          />
          <Input
            label="Concurso"
            value={editFormData.concurso}
            onChange={(e) => setEditFormData({ ...editFormData, concurso: e.target.value })}
          />
          <Input
            label="Ano"
            value={editFormData.ano}
            onChange={(e) => setEditFormData({ ...editFormData, ano: e.target.value })}
          />
        </div>

        <label className="ui-field">
          <span className="ui-field__label">Visibilidade</span>
          <select
            className="ui-input"
            value={editFormData.visibility}
            onChange={(e) => setEditFormData({ ...editFormData, visibility: e.target.value })}
          >
            <option value="public">Público — qualquer assinante encontra</option>
            <option value="private">Privado — só você e quem você liberar</option>
          </select>
        </label>

        <div className="ga__file">
          <span className="ui-field__label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Upload size={14} /> Substituir o conteúdo por um arquivo
          </span>
          <input type="file" accept=".json" onChange={handleJsonUpload} aria-label="Arquivo JSON da aula" />
          <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-3)", lineHeight: 1.5 }}>
            Aceita o backup gerado aqui ou o JSON exportado do gerador. O conteúdo antigo é
            substituído ao salvar — baixe uma cópia antes se quiser guardá-lo.
          </span>
          {editFormData.content && (
            <Notice tone="ok">
              {editFormData.contentNome || "Arquivo"} carregado, com {editFormData.content.aulas.length} módulo(s).
              Salve para aplicar.
            </Notice>
          )}
        </div>
      </Modal>
    </div>
  );
}
