import React, { useEffect, useState } from "react";
import { Trash2, Eye, RefreshCw, Edit, BookOpen, ChevronLeft, ChevronRight, UserPlus, X, Search, Filter, Download } from "lucide-react";
import { Link } from "react-router-dom";
import JSZip from "jszip";

export default function GerenciarAulas() {
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
  
  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  
  // Estados de Paginação
  const [currentPlanPage, setCurrentPlanPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limitPlansPerPage = 10;

  // Estado do Filtro
  const [searchTerm, setSearchTerm] = useState("");

  // Estados de Edição
  const [editingPlan, setEditingPlan] = useState(null);
  const [editFormData, setEditFormData] = useState({ title: '', area: '', ano: '', banca: '', concurso: '', visibility: 'public' });
  const [savingPlan, setSavingPlan] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  // Novos Estados de Compartilhamento (Acesso Privado)
  const [sharingPlan, setSharingPlan] = useState(null);
  const [sharedEmails, setSharedEmails] = useState([]);
  const [newEmail, setNewEmail] = useState("");
  const [loadingShares, setLoadingShares] = useState(false);

  const getAuthToken = () => {
    // Usando a mesma lógica robusta que você tem nos outros arquivos
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

  const fetchPlans = (page = 1) => {
    setLoadingPlans(true);
    const token = getAuthToken();

    // Adiciona o parâmetro de busca na URL dinamicamente
    const queryParams = `page=${page}&limit=${limitPlansPerPage}&manage_mode=true${searchTerm ? `&search=${encodeURIComponent(searchTerm)}` : ''}`;

    fetch(`${API_URL}/plans?${queryParams}`, {
      headers: { "Authorization": token ? `Bearer ${token}` : "" }
    })
      .then((res) => {
        if (!res.ok) throw new Error("Não autorizado");
        return res.json();
      })
      .then((data) => {
        setPlans(data.items || []);
        const calculatedPages = Math.ceil((data.total || 0) / limitPlansPerPage);
        setTotalPages(calculatedPages > 0 ? calculatedPages : 1);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoadingPlans(false));
  };

  useEffect(() => {
    fetchPlans(currentPlanPage);
  }, [currentPlanPage]);

  const goToPage = (pageNumber) => {
    if (pageNumber >= 1 && pageNumber <= totalPages) {
      setCurrentPlanPage(pageNumber);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleDeletePlan = async (id) => {
    if (!window.confirm("Tem certeza que deseja deletar esta aula?")) return;
    try {
      const res = await fetch(`${API_URL}/plans/${id}`, { method: "DELETE", headers: { "Authorization": `Bearer ${getAuthToken()}` } });
      if (res.ok) fetchPlans(currentPlanPage);
    } catch (e) { console.error(e); }
  };

  const handleOpenEdit = (plan) => {
    setEditingPlan(plan);
    setEditFormData({
      title: plan.title || '', 
      area: plan.area || '', 
      ano: plan.ano || '', 
      banca: plan.banca || '', 
      concurso: plan.concurso || '', 
      visibility: plan.visibility || 'public',
      content: null // <--- ADICIONADO
    });
  };

  // --- NOVA FUNÇÃO PARA UPLOAD DE JSON ---
  const handleJsonUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target.result);
        
        // Verifica se o JSON tem estrutura de backup { meta: {...}, content: {...} } ou se é direto
        const actualContent = (json.meta && json.content) ? json.content : json;
        
        setEditFormData(prev => ({ ...prev, content: actualContent }));
        alert("✅ Arquivo JSON carregado com sucesso! Clique em 'Guardar Alterações' para aplicar na nuvem.");
      } catch (error) {
        console.error("Erro ao fazer parse do JSON:", error);
        alert("❌ Erro ao ler o arquivo. Certifique-se de que é um JSON válido e não está corrompido.");
      }
    };
    reader.readAsText(file);
  };

  const handleSaveEdit = async () => {
    setSavingPlan(true);
    const token = getAuthToken();

    // 1. Criar um objeto de dados normalizado, garantindo caixa alta
    const normalizedData = {
      ...editFormData,
      concurso: editFormData.concurso ? editFormData.concurso.trim().toUpperCase() : '',
      banca: editFormData.banca ? editFormData.banca.trim().toUpperCase() : '',
      area: editFormData.area ? editFormData.area.trim() : ''
    };

    try {
      const res = await fetch(`${API_URL}/plans/${editingPlan.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": token ? `Bearer ${token}` : ""
        },
        body: JSON.stringify(normalizedData) // 2. Passar o objeto recém-criado em vez do editFormData cru
      });
      if (res.ok) {
        setEditingPlan(null);
        fetchPlans(currentPlanPage);
      } else alert("Erro ao editar a aula");
    } catch (e) { console.error(e); } finally { setSavingPlan(false); }
  };

  // --- NOVAS FUNÇÕES DE COMPARTILHAMENTO ---
  const handleOpenShare = async (plan) => {
    setSharingPlan(plan);
    setLoadingShares(true);
    try {
      const res = await fetch(`${API_URL}/plans/${plan.id}/shares`, {
        headers: { "Authorization": `Bearer ${getAuthToken()}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSharedEmails(data.emails || []);
      }
    } catch (e) { console.error(e); } finally { setLoadingShares(false); }
  };

  const handleAddEmail = async () => {
    if (!newEmail.trim() || !newEmail.includes("@")) return alert("Digite um e-mail válido.");
    
    try {
      const res = await fetch(`${API_URL}/plans/${sharingPlan.id}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getAuthToken()}` },
        body: JSON.stringify({ email: newEmail.trim() })
      });
      
      if (res.ok) {
        setSharedEmails([...sharedEmails, newEmail.trim()]);
        setNewEmail("");
      } else {
        const err = await res.json();
        alert(err.detail || "Erro ao adicionar usuário");
      }
    } catch (e) { console.error(e); }
  };

  const handleRemoveEmail = async (emailToRemove) => {
    try {
      const res = await fetch(`${API_URL}/plans/${sharingPlan.id}/shares/${emailToRemove}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${getAuthToken()}` }
      });
      if (res.ok) {
        setSharedEmails(sharedEmails.filter(e => e !== emailToRemove));
      }
    } catch (e) { console.error(e); }
  };

  const handleDownloadPlan = async (plan) => {
    try {
      setDownloadingId(plan.id);
      const token = getAuthToken();
      
      // Busca o conteúdo completo da aula no backend
      const res = await fetch(`${API_URL}/plans/${plan.id}`, {
        headers: { "Authorization": token ? `Bearer ${token}` : "" }
      });

      if (!res.ok) throw new Error("Erro ao buscar o conteúdo da aula.");

      const content = await res.json();
      
      // Estrutura os dados para incluir os metadados da aula junto com o conteúdo
      const exportData = {
        meta: {
          id: plan.id,
          title: plan.title,
          area: plan.area,
          banca: plan.banca,
          concurso: plan.concurso,
          ano: plan.ano,
          visibility: plan.visibility
        },
        content: content
      };

      // Converte para JSON formatado (com indentação de 2 espaços)
      //ALTEREI exportData POR content PARA MANTER O MESMO FORMATO DE BACKUP ANTIGO
      const dataStr = JSON.stringify(content, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      
      // Cria um link temporário para forçar o download
      const link = document.createElement("a");
      link.href = url;
      
      // Limpa o título para usar no nome do ficheiro
      const safeTitle = plan.title ? plan.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'aula';
      link.download = `aula_${safeTitle}.json`;
      
      document.body.appendChild(link);
      link.click();
      
      // Limpeza
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("Erro ao tentar baixar a aula.");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownloadAllPlans = async () => {
    if (!window.confirm("Deseja gerar um backup em ZIP de TODAS as aulas? Isso pode demorar alguns segundos.")) return;

    setIsDownloadingAll(true);
    const token = getAuthToken();

    try {
      // 1. Busca a lista de todas as aulas
      const summaryRes = await fetch(`${API_URL}/plans?limit=1000&manage_mode=true`, {
        headers: { "Authorization": token ? `Bearer ${token}` : "" }
      });

      if (!summaryRes.ok) throw new Error("Erro ao buscar a lista de aulas.");
      const summaryData = await summaryRes.json();
      const plansToDownload = summaryData.items || [];

      if (plansToDownload.length === 0) {
        alert("Não há aulas para gerar backup.");
        setIsDownloadingAll(false);
        return;
      }

      // 2. Inicializa o JSZip e cria uma pasta interna
      const zip = new JSZip();
      const folder = zip.folder("backup_aulas");

      // 3. Busca o conteúdo detalhado de cada aula e adiciona ao ZIP
      for (const plan of plansToDownload) {
        const detailRes = await fetch(`${API_URL}/plans/${plan.id}`, {
          headers: { "Authorization": token ? `Bearer ${token}` : "" }
        });

        if (detailRes.ok) {
          const content = await detailRes.json();
          const exportData = {
            meta: {
              id: plan.id,
              title: plan.title,
              area: plan.area,
              banca: plan.banca,
              concurso: plan.concurso,
              ano: plan.ano,
              visibility: plan.visibility
            },
            content: content
          };

          const dataStr = JSON.stringify(exportData, null, 2);
          
          // Formata o nome do ficheiro (ex: 12_aula_de_portugues.json)
          const safeTitle = plan.title ? plan.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'aula';
          const fileName = `${plan.id}_${safeTitle}.json`;
          
          // Adiciona o ficheiro à pasta no ZIP
          folder.file(fileName, dataStr);
        }
      }

      // 4. Gera o ficheiro ZIP final e força o download
      const zipContent = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipContent);
      
      const link = document.createElement("a");
      link.href = url;
      
      // Nomeia o ZIP com a data de hoje
      const date = new Date().toISOString().split('T')[0];
      link.download = `backup_aulas_${date}.zip`;
      
      document.body.appendChild(link);
      link.click();
      
      // Limpeza da memória
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
    } catch (e) {
      console.error(e);
      alert("Erro ao tentar gerar o ficheiro ZIP.");
    } finally {
      setIsDownloadingAll(false);
    }
  };

  return (
    <div className="container">
      <div className="header" style={{ textAlign: "left" }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <BookOpen size={28} color="var(--primary)" /> Gerenciar Aulas
        </h1>
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Edite, altere a visibilidade ou exclua as aulas do banco de dados.</p>
      </div>

      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <h3 style={{ margin: 0, color: 'var(--heading-color)' }}>Aulas Cadastradas</h3>
          
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {/* NOVO CAMPO DE FILTRO COM ÍCONE DE BUSCA */}
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <Search size={16} color="var(--text-muted)" style={{ position: "absolute", left: "10px" }} />
              <input 
                type="text" 
                placeholder="Pesquisar aulas..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchPlans(1)}
                style={{ padding: "8px 10px 8px 32px", borderRadius: "6px", border: "1px solid var(--border)", backgroundColor: "var(--input-bg)", color: "var(--text-main)", fontSize: "0.9rem", width: "220px" }}
              />
            </div>
            
            {/* BOTÃO DE APLICAR FILTRO */}
            <button className="btn small" onClick={() => fetchPlans(1)} title="Aplicar Filtro" style={{ backgroundColor: 'var(--primary)', color: '#fff' }}>
              <Filter size={14}/> Filtrar
            </button>

            {/* NOVO BOTÃO: BAIXAR TODAS (BACKUP) */}
            <button 
              className="btn small" 
              onClick={handleDownloadAllPlans} 
              disabled={isDownloadingAll}
              style={{ backgroundColor: 'var(--success-bg, #d4edda)', color: 'var(--success-text, #155724)', borderColor: 'transparent' }}
            >
              {isDownloadingAll ? <RefreshCw size={14} className="spin" /> : <Download size={14} />} 
              {isDownloadingAll ? "A gerar backup..." : "Baixar Todas"}
            </button>

            {/* BOTÃO DE ATUALIZAR */}
            <button className="btn small" onClick={() => fetchPlans(currentPlanPage)}>
              <RefreshCw size={14}/> Atualizar
            </button>
          </div>
        </div>

        {loadingPlans ? <div className="status">A carregar aulas...</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Título</th>
                  <th>Visibilidade</th>
                  <th>Área</th>
                  <th>Banca / Concurso</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan.id}>
                    <td style={{ color: 'var(--text-secondary)' }}>#{plan.id}</td>
                    <td style={{ maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-main)' }}>
                      <strong>{plan.title}</strong>
                    </td>
                    <td>
                      <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', backgroundColor: plan.visibility === 'private' ? 'var(--error-bg)' : 'var(--success-bg)', color: plan.visibility === 'private' ? 'var(--error-text)' : 'var(--success-text)' }}>
                        {plan.visibility === 'private' ? 'PRIVADO' : 'PÚBLICO'}
                      </span>
                    </td>
                    <td><span className="badge-area">{plan.area}</span></td>
                    <td>
                      {plan.banca && <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{plan.banca}</span>}
                      {plan.concurso && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{plan.concurso}</div>}
                    </td>
                    <td>
                      <div className="actions-cell">
                        <Link to={`/aula/${plan.id}`} className="btn small" title="Ver"><Eye size={16} /></Link>
                        
                        {/* Botão de Download */}
                        <button 
                          className="btn small" 
                          onClick={() => handleDownloadPlan(plan)} 
                          title="Baixar Backup (JSON)"
                          disabled={downloadingId === plan.id}
                          style={{ 
                            backgroundColor: 'var(--success-bg, #d4edda)', 
                            color: 'var(--success-text, #155724)', 
                            borderColor: 'transparent',
                            opacity: downloadingId === plan.id ? 0.5 : 1
                          }}
                        >
                          {downloadingId === plan.id ? <RefreshCw size={16} className="spin" /> : <Download size={16} />}
                        </button>

                        {/* NOVO BOTÃO: Só aparece se a aula for privada */}
                        {plan.visibility === 'private' && (
                          <button className="btn small" onClick={() => handleOpenShare(plan)} title="Gerenciar Acesso" style={{ backgroundColor: 'var(--primary-light)', borderColor: 'var(--primary)', color: 'var(--primary)' }}><UserPlus size={16} /></button>
                        )}
                        
                        <button className="btn small" onClick={() => handleOpenEdit(plan)} title="Editar"><Edit size={16} /></button>
                        <button className="btn small error-btn" onClick={() => handleDeletePlan(plan.id)} title="Excluir"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paginação */}
      {totalPages > 1 && !loadingPlans && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', marginTop: '1.5rem', padding: '1rem', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)' }}>
          <button className="btn" onClick={() => goToPage(currentPlanPage - 1)} disabled={currentPlanPage === 1}><ChevronLeft size={18} /> Anterior</button>
          <div style={{ display: 'flex', gap: '5px' }}>
            {[...Array(totalPages)].map((_, i) => {
              const pageNum = i + 1;
              if (pageNum === 1 || pageNum === totalPages || (pageNum >= currentPlanPage - 1 && pageNum <= currentPlanPage + 1)) {
                return (
                  <button key={pageNum} onClick={() => goToPage(pageNum)} style={{ width: '40px', height: '40px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', border: '1px solid', backgroundColor: currentPlanPage === pageNum ? 'var(--primary)' : 'var(--card-bg)', color: currentPlanPage === pageNum ? '#fff' : 'var(--text-main)', borderColor: currentPlanPage === pageNum ? 'var(--primary)' : 'var(--border)' }}>{pageNum}</button>
                );
              } else if (pageNum === currentPlanPage - 2 || pageNum === currentPlanPage + 2) {
                return <span key={pageNum} style={{ alignSelf: 'center', color: 'var(--text-muted)' }}>...</span>;
              }
              return null;
            })}
          </div>
          <button className="btn" onClick={() => goToPage(currentPlanPage + 1)} disabled={currentPlanPage === totalPages}>Próxima <ChevronRight size={18} /></button>
        </div>
      )}

      {/* MODAL DE COMPARTILHAMENTO (NOVO) */}
      {sharingPlan && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.8)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '30px', width: '100%', maxWidth: '500px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
            <h3 style={{ marginTop: 0, borderBottom: '1px solid var(--border)', color: 'var(--heading-color)', paddingBottom: '15px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UserPlus size={22} color="var(--primary)" /> Acessos à Aula Privada
            </h3>
            
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Adicione os e-mails dos utilizadores que podem acessar <strong>{sharingPlan.title}</strong>.
            </p>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <input 
                type="email" 
                placeholder="E-mail do utilizador..." 
                value={newEmail} 
                onChange={e => setNewEmail(e.target.value)} 
                style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'var(--input-bg)', color: 'var(--text-main)' }} 
                onKeyDown={(e) => e.key === 'Enter' && handleAddEmail()}
              />
              <button onClick={handleAddEmail} className="btn primary small">Adicionar</button>
            </div>

            <div style={{ background: 'var(--bg)', borderRadius: '6px', border: '1px solid var(--border)', maxHeight: '200px', overflowY: 'auto', marginBottom: '20px' }}>
              {loadingShares ? (
                <div style={{ padding: '15px', textAlign: 'center', color: 'var(--text-muted)' }}>A carregar acessos...</div>
              ) : sharedEmails.length === 0 ? (
                <div style={{ padding: '15px', textAlign: 'center', color: 'var(--text-muted)' }}>Apenas você tem acesso a esta aula.</div>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {sharedEmails.map((email, i) => (
                    <li key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 15px', borderBottom: i < sharedEmails.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <span style={{ color: 'var(--text-main)', fontSize: '0.9rem' }}>{email}</span>
                      <button onClick={() => handleRemoveEmail(email)} style={{ background: 'none', border: 'none', color: 'var(--error-text)', cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="Remover Acesso">
                        <X size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setSharingPlan(null)} className="btn small" style={{ backgroundColor: 'var(--hover-bg)', color: 'var(--text-main)' }}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE EDIÇÃO */}
      {editingPlan && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.8)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '30px', width: '100%', maxWidth: '500px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
            <h3 style={{ marginTop: 0, borderBottom: '1px solid var(--border)', color: 'var(--heading-color)', paddingBottom: '15px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Edit size={22} color="var(--primary)" /> Editar Aula
            </h3>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '5px', color: 'var(--text-main)' }}>Título da Aula</label>
              <input type="text" value={editFormData.title} onChange={e => setEditFormData({...editFormData, title: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'var(--input-bg)', color: 'var(--text-main)' }} />
            </div>

            <div style={{ marginBottom: '15px', display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '5px', color: 'var(--text-main)' }}>Área</label>
                <input type="text" value={editFormData.area} onChange={e => setEditFormData({...editFormData, area: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'var(--input-bg)', color: 'var(--text-main)' }} />
              </div>
              <div style={{ flex: 1 }}>
                 <label style={{ display: 'block', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '5px', color: 'var(--text-main)' }}>Ano</label>
                 <input type="text" value={editFormData.ano} onChange={e => setEditFormData({...editFormData, ano: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'var(--input-bg)', color: 'var(--text-main)' }} />
              </div>
            </div>

            <div style={{ marginBottom: '15px', display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '5px', color: 'var(--text-main)' }}>Banca</label>
                <input type="text" value={editFormData.banca} onChange={e => setEditFormData({...editFormData, banca: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'var(--input-bg)', color: 'var(--text-main)' }} />
              </div>
              <div style={{ flex: 1 }}>
                 <label style={{ display: 'block', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '5px', color: 'var(--text-main)' }}>Concurso</label>
                 <input type="text" value={editFormData.concurso} onChange={e => setEditFormData({...editFormData, concurso: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'var(--input-bg)', color: 'var(--text-main)' }} />
              </div>
            </div>

            {/* --- NOVO CAMPO ADICIONADO AQUI --- */}
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '5px', color: 'var(--text-main)' }}>
                Substituir Conteúdo da Aula (Upload .json)
              </label>
              <input 
                type="file" 
                accept=".json" 
                onChange={handleJsonUpload} 
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px dashed var(--primary)', backgroundColor: 'var(--bg)', color: 'var(--text-main)', cursor: 'pointer' }} 
              />
              {editFormData.content && (
                <small style={{ color: 'var(--success-text)', display: 'block', marginTop: '5px', fontWeight: 'bold' }}>
                  Arquivo preparado. Salve para confirmar.
                </small>
              )}
            </div>
            {/* --------------------------------- */}

            <div style={{ marginBottom: '25px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '5px', color: 'var(--text-main)' }}>Visibilidade</label>
              <select 
                value={editFormData.visibility} 
                onChange={e => setEditFormData({...editFormData, visibility: e.target.value})}
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'var(--input-bg)', color: 'var(--text-main)' }}
              >
                <option value="public">🌍 Público</option>
                <option value="private">🔒 Privado</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setEditingPlan(null)} disabled={savingPlan} className="btn small" style={{ backgroundColor: 'var(--hover-bg)', color: 'var(--text-main)' }}>Cancelar</button>
              <button onClick={handleSaveEdit} disabled={savingPlan} className="btn primary small">{savingPlan ? "A guardar..." : "Guardar Alterações"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}