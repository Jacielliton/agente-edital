import React, { useState, useEffect } from "react";
import { PenTool, Target, RefreshCw, Send, CheckCircle, Wand2, Save } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import ReactMarkdown from "react-markdown";

const getAuthToken = () => {
  const storages = [localStorage, sessionStorage];
  for (const storage of storages) {
    let t = storage.getItem("access_token") || storage.getItem("token") || storage.getItem("professor_ai_token");
    if (t && t.startsWith("eyJ")) return t;
  }
  return null;
};

const safeArray = (v) => (Array.isArray(v) ? v : []);
const safeString = (v) => (typeof v === "string" ? v : v == null ? "" : String(v));

const fetchStreamAsJson = async (url, options) => {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`Erro do servidor: ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let rawText = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    rawText += decoder.decode(value, { stream: true });
  }
  try {
    let cleanText = rawText.replace(/<think>[\s\S]*?<\/think>/gi, "").trim(); 
    const jsonMatch = cleanText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) cleanText = jsonMatch[0];
    cleanText = cleanText.replace(/,\s*([\]}])/g, '$1');
    return JSON.parse(cleanText);
  } catch (e) {
    throw new Error("A IA gerou um formato inválido. Tente novamente.");
  }
};

export default function TreinoDiscursiva() {
  const { user } = useAuth();
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  // Configurações e Parâmetros Complexos da Prova
  const [banca, setBanca] = useState("CEBRASPE");
  const [tipoProva, setTipoProva] = useState("Questão Discursiva (Estudo de Caso)");
  const [cargo, setCargo] = useState(""); // <-- Agora começa vazio
  const [nivel, setNivel] = useState("Normal"); // <-- NOVO ESTADO
  const [showSavedFeedback, setShowSavedFeedback] = useState(false);
  
  // Novos Estados para o Trecho do Edital Inteligente
  const [editalTrecho, setEditalTrecho] = useState("");
  const [area, setArea] = useState("");
  const [topicos, setTopicos] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [showCamposExtraidos, setShowCamposExtraidos] = useState(false);
  
  // Estados da Prova
  const [prova, setProva] = useState(null);
  const [resposta, setResposta] = useState("");
  const [correcao, setCorrecao] = useState(null);
  
  // Estados de UI
  const [loading, setLoading] = useState(false);
  const [loadingCorrecao, setLoadingCorrecao] = useState(false);
  const [error, setError] = useState(null);

  const [userApiKey, setUserApiKey] = useState("");
  const [userModel, setUserModel] = useState("");

  // RECUPERAR PREFERÊNCIAS SALVAS & CONFIGURAÇÕES DA IA
  useEffect(() => {
    // Busca Configurações da API
    const fetchDBSettings = async () => {
      const token = getAuthToken();
      if (!token) return;
      try {
        const res = await fetch(`${API_URL}/users/me/settings`, { headers: { "Authorization": `Bearer ${token}` }});
        if (res.ok) {
          const data = await res.json();
          if (data.api_key) setUserApiKey(data.api_key);
          if (data.preferred_model) setUserModel(data.preferred_model);
        }
      } catch (err) { console.error("Erro ao buscar configurações da IA", err); }
    };
    
    // Busca Preferências Locais da Prova
    const loadSavedPrefs = () => {
      const savedPrefs = localStorage.getItem("treino_discursiva_prefs");
      if (savedPrefs) {
        const prefs = JSON.parse(savedPrefs);
        if (prefs.banca) setBanca(prefs.banca);
        if (prefs.tipoProva) setTipoProva(prefs.tipoProva);
        if (prefs.cargo) setCargo(prefs.cargo);
        if (prefs.nivel) setNivel(prefs.nivel); // <-- LÊ O NÍVEL SALVO
        if (prefs.editalTrecho) setEditalTrecho(prefs.editalTrecho);
        if (prefs.area) setArea(prefs.area);
        if (prefs.topicos) setTopicos(prefs.topicos);
        if (prefs.area || prefs.topicos) setShowCamposExtraidos(true);
      }
    };

    fetchDBSettings();
    loadSavedPrefs();
  }, [API_URL]);

  const handleSavePrefs = () => {
    localStorage.setItem("treino_discursiva_prefs", JSON.stringify({
      banca, tipoProva, cargo, nivel, editalTrecho, area, topicos // <-- SALVA O NÍVEL
    }));
    setShowSavedFeedback(true);
    setTimeout(() => setShowSavedFeedback(false), 2000); // Retorna ao normal após 2s
  };

  const handleAnalisarEdital = async () => {
    if (!editalTrecho.trim()) return alert("Cole o trecho do conteúdo programático no campo primeiro.");
    
    setIsExtracting(true);
    setError(null);
    try {
      const data = await fetchStreamAsJson(`${API_URL}/extract-topics`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getAuthToken()}` },
        body: JSON.stringify({
          texto: editalTrecho,
          api_key: userApiKey || null, 
          model: userModel || "arcee-ai/trinity-large-thinking:free"
        })
      });

      if (data.area && data.topicos) {
        setArea(data.area);
        setTopicos(data.topicos);
        setShowCamposExtraidos(true);
      } else {
        throw new Error("Não foi possível identificar a área. Tente novamente.");
      }
    } catch (err) {
      setError(err.message || "Falha ao extrair as informações com a IA.");
    } finally {
      setIsExtracting(false);
    }
  };

  const palavrasCount = resposta.trim() === "" ? 0 : resposta.trim().split(/\s+/).length;
  // Assumindo média de 9 palavras por linha escrita à mão
  const linhasEstimadas = Math.ceil(palavrasCount / 9);
  const excedeuLinhas = linhasEstimadas > 30;

  const handleGerarProva = async () => {
    if (!area || !topicos) return alert("Por favor, clique em 'Extrair Área e Tópicos' ou preencha-os manualmente antes de gerar a prova.");
    
    setLoading(true); setError(null); setCorrecao(null); setProva(null); setResposta("");
    try {
      const topicosArray = topicos.split(",").map(t => t.trim()).filter(t => t.length > 0);
      const data = await fetchStreamAsJson(`${API_URL}/generate-treino-discursiva`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getAuthToken()}` },
        body: JSON.stringify({
          area: area,
          topicos: topicosArray.length > 0 ? topicosArray : ["Tema Geral"],
          tipo_prova: tipoProva,
          cargo: cargo,
          banca: banca,
          nivel: nivel, // <--- ADICIONADO AQUI! AGORA O BACKEND SABE O NÍVEL!
          api_key: userApiKey || null, 
          model: userModel || "arcee-ai/trinity-large-thinking:free"
        })
      });
      
      const novaQuestao = data.discursiva ? data.discursiva : data;
      if (novaQuestao && novaQuestao.comando) setProva(novaQuestao);
      else throw new Error("Retorno inválido da IA.");
    } catch (err) {
      setError(err.message || "Erro ao gerar a prova. Verifique sua conexão ou chave de API.");
    } finally { setLoading(false); }
  };

  const handleCorrigir = async () => {
    if (palavrasCount < 30) return alert("Desenvolva mais a sua resposta (mínimo de 30 palavras).");
    setLoadingCorrecao(true); setError(null);
    try {
      const data = await fetchStreamAsJson(`${API_URL}/correct-essay`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getAuthToken()}` },
        body: JSON.stringify({
          texto_motivador: prova.texto_motivador || "",
          comando: prova.comando || "",
          aspectos: prova.aspectos || [],
          resposta_aluno: resposta,
          api_key: userApiKey || null, 
          model: userModel || "arcee-ai/trinity-large-thinking:free"
        })
      });

      const notaCalculada = Array.isArray(data.avaliacoes_aspectos) 
        ? data.avaliacoes_aspectos.reduce((acc, curr) => acc + (parseFloat(curr.nota_atribuida) || 0), 0)
        : (parseFloat(data.nota_final) || 0);
        
      data.nota_final_calculada = notaCalculada;
      setCorrecao(data);

      await fetch(`${API_URL}/performance`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getAuthToken()}` },
        body: JSON.stringify({
          tipo: "discursiva",
          tema: `Treino: ${area} (${topicos.split(',')[0]})`,
          nota_obtida: notaCalculada,
          nota_maxima: 20.0,
          formato: tipoProva,
          nivel: nivel, // <-- AGORA USA O NÍVEL DINÂMICO
          concurso: `${banca} - ${cargo}`
        })
      });

    } catch (err) {
      setError("Erro ao corrigir a redação.");
    } finally { setLoadingCorrecao(false); }
  };

  return (
    <div className="container" style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ color: 'var(--heading-color)', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <PenTool size={32} color="var(--primary)" /> Simulador de Discursivas (Banca IA)
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>Gere cenários inéditos e treine a sua escrita adaptada a diferentes bancas e cargos.</p>
      </header>

      {/* CONFIGURAÇÃO DO TEMA */}
      {!prova && !loading && (
        <div style={{ background: 'var(--card-bg)', padding: '30px', borderRadius: '12px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ margin: 0, color: 'var(--heading-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Target size={20} color="var(--primary)" /> Definir Parâmetros da Prova
            </h3>
            <button onClick={handleSavePrefs} className="btn small" style={{ background: 'var(--success-bg)', color: 'var(--success-text)', border: '1px solid var(--success-text)', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 'bold', transition: 'all 0.2s' }}>
              {showSavedFeedback ? <><CheckCircle size={16} /> Salvo!</> : <><Save size={16} /> Salvar Preferências</>}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px', marginBottom: '25px' }}>
            <div>
              <label style={{ display: 'block', fontWeight: 'bold', color: 'var(--text-main)', marginBottom: '8px' }}>Banca Organizadora</label>
              <select value={banca} onChange={e => setBanca(e.target.value)} className="select" style={{ width: '100%' }}>
                <option value="CEBRASPE">CEBRASPE / CESPE</option>
                <option value="FGV">FGV</option>
                <option value="FCC">FCC</option>
                <option value="VUNESP">VUNESP</option>
                <option value="IDECAN">IDECAN</option>
              </select>
            </div>
            
            <div>
              <label style={{ display: 'block', fontWeight: 'bold', color: 'var(--text-main)', marginBottom: '8px' }}>Tipo de Prova</label>
              <select value={tipoProva} onChange={e => setTipoProva(e.target.value)} className="select" style={{ width: '100%' }}>
                <option value="Questão Discursiva (Estudo de Caso)">Questão Discursiva (Estudo de Caso Técnico)</option>
                <option value="Redação (Atualidades/Temas Gerais)">Redação (Atualidades e Impactos Sociais)</option>
                <option value="Peça Prático-Profissional">Peça Prático-Profissional (Delegado / Policial)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 'bold', color: 'var(--text-main)', marginBottom: '8px' }}>Cargo / Foco</label>
              <input 
                type="text" 
                value={cargo} 
                onChange={e => setCargo(e.target.value)} 
                className="input" 
                style={{ width: '100%' }} 
                placeholder="Ex: Analista de TI, Perito Criminal..." 
              />
            </div>

            {/* NOVO CAMPO DE NÍVEL DE DIFICULDADE */}
            <div>
              <label style={{ display: 'block', fontWeight: 'bold', color: 'var(--text-main)', marginBottom: '8px' }}>Dificuldade</label>
              <select value={nivel} onChange={e => setNivel(e.target.value)} className="select" style={{ width: '100%' }}>
                <option value="Iniciante">Iniciante</option>
                <option value="Normal">Normal</option>
                <option value="Avançado">Avançado</option>
                <option value="Expert">Expert</option>
              </select>
            </div>
          </div>
          
          <div style={{ marginBottom: '25px', padding: '20px', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <label style={{ display: 'block', fontWeight: 'bold', color: 'var(--text-main)', marginBottom: '8px' }}>Trecho do Edital (Conteúdo Programático)</label>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '10px' }}>Cole o bloco do edital. A Inteligência Artificial fará a separação automática dos tópicos.</p>
            <textarea 
              value={editalTrecho} 
              onChange={e => setEditalTrecho(e.target.value)} 
              className="input" 
              style={{ width: '100%', minHeight: '100px', resize: 'vertical', marginBottom: '10px' }} 
              placeholder="Ex: DIREITO PENAL: 1 Princípios básicos. 2 Aplicação da lei penal. 2.1 A lei penal no tempo e no espaço. 3 O fato típico e seus elementos..." 
            />
            <button 
              onClick={handleAnalisarEdital} 
              disabled={isExtracting || !editalTrecho.trim()} 
              className="btn" 
              style={{ width: '100%', background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 'bold', border: '1px solid var(--primary)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
            >
              {isExtracting ? <RefreshCw className="spin" size={18} /> : <Wand2 size={18} />}
              {isExtracting ? "A processar texto..." : "Extrair Tópicos Automaticamente com IA"}
            </button>
          </div>

          {showCamposExtraidos && (
            <div style={{ marginBottom: '25px', padding: '15px', background: 'var(--hover-bg)', borderRadius: '8px', border: '1px dashed var(--border)' }}>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', fontWeight: 'bold', color: 'var(--text-main)', marginBottom: '8px' }}>Disciplina Identificada <span style={{fontSize: '0.8rem', fontWeight: 'normal', color: 'var(--text-muted)'}}>(Pode editar se necessário)</span></label>
                <input type="text" value={area} onChange={e => setArea(e.target.value)} className="input" style={{ width: '100%' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 'bold', color: 'var(--text-main)', marginBottom: '8px' }}>Tópicos Específicos <span style={{fontSize: '0.8rem', fontWeight: 'normal', color: 'var(--text-muted)'}}>(Separados por vírgula)</span></label>
                <textarea value={topicos} onChange={e => setTopicos(e.target.value)} className="input" style={{ width: '100%', minHeight: '80px', resize: 'vertical' }} />
              </div>
            </div>
          )}

          <button onClick={handleGerarProva} disabled={!area || !topicos} className="btn primary" style={{ width: '100%', padding: '15px', fontSize: '1.1rem', display: 'flex', justifyContent: 'center', gap: '10px' }}>
            <RefreshCw size={20} /> Gerar Prova Inédita
          </button>
          
          {error && <div style={{ marginTop: '15px', padding: '15px', background: 'var(--error-bg)', color: 'var(--error-text)', borderRadius: '8px', border: '1px solid var(--error-text)' }}>{error}</div>}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '50px', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)' }}>
          <RefreshCw size={40} className="spin" color="var(--primary)" style={{ margin: '0 auto', marginBottom: '20px' }} />
          <h3 style={{ color: 'var(--heading-color)' }}>A banca IA está a elaborar a prova...</h3>
          <p style={{ color: 'var(--text-secondary)' }}>Configurando: {banca} • {tipoProva} • {cargo}</p>
        </div>
      )}

      {/* AMBIENTE DE PROVA */}
      {prova && !correcao && (
        <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
          <div style={{ background: 'var(--hover-bg)', padding: '20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 style={{ margin: 0, color: 'var(--heading-color)' }}>Caderno de Prova ({banca})</h3>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{cargo} • {tipoProva}</span>
            </div>
            <button onClick={() => setProva(null)} className="btn small" style={{ background: 'transparent', border: '1px solid var(--border)' }}>Abandonar Prova</button>
          </div>

          <div style={{ padding: '30px' }}>
            <div style={{ marginBottom: '20px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
              <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: '10px' }}>Texto Motivador / Cenário:</strong>
              <ReactMarkdown>{safeString(prova.texto_motivador)}</ReactMarkdown>
            </div>
            
            <div style={{ marginBottom: '20px', background: 'var(--bg)', padding: '15px', borderRadius: '8px', borderLeft: '4px solid var(--primary)' }}>
              <strong style={{ color: 'var(--text-main)' }}>Comando da Questão:</strong>
              <div style={{ fontWeight: '500', color: 'var(--text-main)', marginTop: '5px' }}>
                <ReactMarkdown>{safeString(prova.comando)}</ReactMarkdown>
              </div>
            </div>

            <div style={{ marginBottom: '30px' }}>
              <strong style={{ color: 'var(--text-main)' }}>Aspectos a serem abordados obrigatoriamente:</strong>
              <ul style={{ marginTop: '10px', color: 'var(--text-secondary)' }}>
                {safeArray(prova.aspectos).map((asp, i) => (
                  <li key={i} style={{ marginBottom: '8px' }}>
                    {safeString(asp.aspecto)} <strong style={{ color: 'var(--error-text)' }}>({safeString(asp.valor_maximo)} pts)</strong>
                  </li>
                ))}
              </ul>
            </div>

            <div style={{ position: 'relative' }}>
              <textarea 
                value={resposta}
                onChange={e => setResposta(e.target.value)}
                disabled={loadingCorrecao}
                placeholder="Transcreva aqui o seu texto definitivo detalhado..."
                style={{ 
                  width: '100%', 
                  minHeight: '350px', 
                  padding: '20px', 
                  borderRadius: '8px', 
                  border: excedeuLinhas ? '2px solid var(--error-text)' : '1px solid var(--border)', 
                  background: 'var(--input-bg)', 
                  color: 'var(--text-main)', 
                  fontSize: '1rem', 
                  lineHeight: '1.6', 
                  resize: 'vertical' 
                }}
              />
              <div style={{ 
                position: 'absolute', 
                bottom: '15px', 
                right: '15px', 
                fontSize: '0.85rem', 
                backgroundColor: 'var(--card-bg)',
                padding: '4px 8px',
                borderRadius: '4px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                color: excedeuLinhas ? 'var(--error-text)' : (linhasEstimadas > 20 ? 'var(--warning-text)' : 'var(--text-muted)'), 
                fontWeight: 'bold' 
              }}>
                {palavrasCount} palavras (~{linhasEstimadas}/30 linhas)
                {excedeuLinhas && " ⚠️ Excedeu!"}
              </div>
            </div>

            <div style={{ marginTop: '20px', display: 'flex', gap: '15px' }}>
              <button onClick={handleCorrigir} disabled={loadingCorrecao || palavrasCount < 10} className="btn primary" style={{ flex: 1, padding: '15px', fontSize: '1.1rem', display: 'flex', justifyContent: 'center', gap: '10px' }}>
                {loadingCorrecao ? <RefreshCw size={20} className="spin" /> : <Send size={20} />}
                {loadingCorrecao ? "A banca está a corrigir..." : "Entregar Prova Definitiva"}
              </button>
            </div>
            {error && <div style={{ marginTop: '15px', color: 'var(--error-text)', textAlign: 'center', fontWeight: 'bold' }}>{error}</div>}
          </div>
        </div>
      )}

      {/* RESULTADO DA CORREÇÃO DIDÁTICA */}
      {correcao && (
        <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}>
          <div style={{ background: 'var(--success-bg)', padding: '20px', borderBottom: '1px solid var(--success-text)', display: 'flex', alignItems: 'center', gap: '10px', borderRadius: '12px 12px 0 0' }}>
            <CheckCircle size={28} color="var(--success-text)" />
            <h2 style={{ margin: 0, color: 'var(--success-text)' }}>Nota Final: {correcao.nota_final_calculada?.toFixed(1)} / 20.0</h2>
          </div>

          <div style={{ padding: '30px' }}>
            <div style={{ fontStyle: 'italic', marginBottom: '25px', color: 'var(--text-secondary)', background: 'var(--bg)', padding: '15px', borderRadius: '8px' }}>
              <strong>Parecer da Banca:</strong> <ReactMarkdown>{safeString(correcao.feedback_geral)}</ReactMarkdown>
            </div>

            <h4 style={{ color: 'var(--heading-color)', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>Avaliação e Padrão de Resposta (Espelho)</h4>
            {safeArray(correcao.avaliacoes_aspectos).map((av, k) => (
              <div key={k} style={{ marginBottom: '25px', background: 'var(--bg)', padding: '20px', borderRadius: '8px', borderLeft: '4px solid var(--primary)', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                <div style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '1.05rem' }}>{safeString(av.aspecto)}</div>
                <div style={{ color: 'var(--primary)', fontWeight: 'bold', margin: '10px 0', fontSize: '1.1rem' }}>Nota Obtida: {safeString(av.nota_atribuida)}</div>
                
                <div style={{ fontSize: '0.95em', color: 'var(--text-secondary)', marginBottom: '15px' }}>
                  <strong>Análise do seu texto:</strong>
                  <div style={{ marginTop: '5px' }}>
                    <ReactMarkdown>{safeString(av.comentario)}</ReactMarkdown>
                  </div>
                </div>

                {/* BLOCO DIDÁTICO: PADRÃO ESPERADO */}
                {av.padrao_esperado && (
                  <div style={{ background: 'var(--success-bg)', border: '1px dashed var(--success-text)', padding: '15px', borderRadius: '8px', marginTop: '10px' }}>
                    <strong style={{ color: 'var(--success-text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      💡 Espelho de Correção (Como responder perfeitamente):
                    </strong>
                    <div style={{ color: 'var(--text-main)', marginTop: '8px', fontSize: '0.95em', lineHeight: '1.5' }}>
                      <ReactMarkdown>{safeString(av.padrao_esperado)}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            ))}

            <h4 style={{ color: 'var(--heading-color)', borderBottom: '1px solid var(--border)', paddingBottom: '10px', marginTop: '30px' }}>Microestrutura (Gramática e Coesão)</h4>
            <div style={{ fontSize: '0.95em', color: 'var(--error-text)', background: 'var(--error-bg)', padding: '15px', borderRadius: '8px', border: '1px solid var(--error-text)' }}>
              <ReactMarkdown>{safeString(correcao.erros_gramaticais)}</ReactMarkdown>
            </div>

            {/* BLOCO DIDÁTICO: DICA DE ESTUDO GERAL */}
            {correcao.dica_estudo && (
              <div style={{ marginTop: '30px', padding: '20px', background: 'var(--primary-light)', borderRadius: '8px', border: '1px solid var(--primary)', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
                <strong style={{ color: 'var(--primary)', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  📚 Plano de Ação / Dica de Estudo:
                </strong>
                <div style={{ color: 'var(--text-main)', marginTop: '10px', fontSize: '1rem', lineHeight: '1.6' }}>
                  <ReactMarkdown>{safeString(correcao.dica_estudo)}</ReactMarkdown>
                </div>
              </div>
            )}

            <button onClick={() => { setCorrecao(null); setProva(null); }} className="btn primary" style={{ width: '100%', marginTop: '35px', padding: '15px', fontSize: '1.1rem', fontWeight: 'bold' }}>
              Voltar e Gerar Novo Treino
            </button>
          </div>
        </div>
      )}
    </div>
  );
}