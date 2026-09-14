import React, { useEffect, useRef, useState } from "react";
import LessonContent from "../components/LessonContent";
import {
  Button, Card, CardHead, CardBody, Input, PageHeader, ProgressBar, Modal, Notice, Toast,
} from "../components/ui";
import { Sparkles, Download, Upload, Save } from "lucide-react";
import { AiKeyBar, AiKeyPanel, useAiKey, getAuthToken } from "../components/AiKeyConfig";
import "./Generator.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000"; 

const safeArray = (v) => (Array.isArray(v) ? v : []);
const safeString = (v) => (typeof v === "string" ? v : v == null ? "" : String(v));

function downloadJson(data, filename = "saida_professor_ai.json") {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        resolve(JSON.parse(r.result));
      } catch (e) {
        reject(e);
      }
    };
    r.onerror = () => reject(new Error("Falha ao ler arquivo"));
    r.readAsText(file);
  });
}

// FUNÇÃO ROBUSTA DE TOKEN UNIFICADA
// getAuthToken vive em ../components/AiKeyConfig.jsx — uma cópia só para todas as telas.

export default function Generator() { 
  const [text, setText] = useState("");
  
  // Estados para as Questões
  const [questionFormat, setQuestionFormat] = useState("Múltipla Escolha");
  const [questionLevel, setQuestionLevel] = useState("Normal");

  // Config do Servidor
  const [availableModels, setAvailableModels] = useState([]);
  const [model, setModel] = useState(""); 

  // ESTADOS GLOBAIS DE CONFIGURAÇÃO DE IA INDIVIDUAL
  const [showConfig, setShowConfig] = useState(false);
  const { userApiKey, userModel, setUserApiKey, setUserModel, ia } = useAiKey();
  const [aviso, setAviso] = useState(null);

  // Execução e UX
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0); // <-- NOVO: Barra de progresso
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  // Contexto da prova: pedido ANTES de gerar, porque a banca muda o estilo da
  // aula e das questoes. Os mesmos valores sao reaproveitados ao salvar.
  const [saveTitle, setSaveTitle] = useState("");
  const [saveAno, setSaveAno] = useState("");
  const [saveBanca, setSaveBanca] = useState("");
  const [saveConcurso, setSaveConcurso] = useState("");
  const [saveCargo, setSaveCargo] = useState("");
  const [qtdQuestoes, setQtdQuestoes] = useState(10);
  const [saveVisibility, setSaveVisibility] = useState("public");

  // Geracao modulo a modulo
  const [estrutura, setEstrutura] = useState(null);   // { modulos, instrucoes, area... }
  const [falhas, setFalhas] = useState([]);           // modulos que nao geraram
  const [refazendo, setRefazendo] = useState(null);   // indice em regeneracao

  const timeoutsRef = useRef([]);

  // Recupera o rascunho salvo no LocalStorage ao carregar a página
  useEffect(() => {
    const draft = localStorage.getItem("generator_draft_text");
    if (draft) setText(draft);
  }, []);

  const handleTextChange = (e) => {
    const newText = e.target.value;
    setText(newText);
    localStorage.setItem("generator_draft_text", newText); // <-- NOVO: Auto-save do rascunho
  };

  const fetchConfig = async () => {
    try {
      // COM token: /config passou a exigir autenticação em 13/09/2026 (antes
      // respondia a qualquer um na internet). Sem o cabeçalho, a resposta vira
      // 401, o resp.ok falha em silêncio e esta tela fica SEM lista de modelos
      // — nenhum erro aparece, o seletor só nasce vazio.
      const token = getAuthToken();
      const resp = await fetch(`${API_URL}/config`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok) {
        const models = safeArray(data?.available_models);
        setAvailableModels(models);
        const def = safeString(data?.default_model).trim();
        setModel(def || (models[0] || ""));
      }
    } catch (e) {
      console.error("Falha ao buscar modelos do backend:", e);
    }
  };

  useEffect(() => {
    fetchConfig();
    return () => {
      timeoutsRef.current.forEach((id) => clearTimeout(id));
      timeoutsRef.current = [];
    };
  }, []);

  const saveToDb = async () => {
    if (!result) return;
    setError("");
    
    if (!saveAno.trim() || !saveBanca.trim() || !saveConcurso.trim()) {
      setError("⚠️ Por favor, preencha o Ano, Banca e Concurso para salvar a aula.");
      return;
    }

    const finalTitle = saveTitle.trim() || safeString(result?.resumo_cargo).substring(0, 60) || "Plano de Estudo Sem Título";
    const token = getAuthToken();

    try {
      const resp = await fetch(`${API_URL}/plans`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": token ? `Bearer ${token}` : ""
        },
        body: JSON.stringify({
          title: finalTitle,
          area: result.area_identificada || "Geral",
          content: result,
          ano: saveAno.trim(),
          banca: saveBanca.trim(),
          concurso: saveConcurso.trim(),
          visibility: saveVisibility 
        })
      });

      if (resp.ok) {
        setStatus("Salvo no banco com sucesso! ✅");
        setSaveTitle("");
      } else {
        const errData = await resp.json().catch(() => ({}));
        setError(errData.detail || "Erro ao salvar no banco.");
      }
    } catch (e) {
      console.error(e);
      setError("Erro de conexão ao salvar.");
    }
  };

  // Chamada autenticada, usada por todas as etapas da geracao.
  const postJson = async (rota, corpo) => {
    const token = getAuthToken();
    const resp = await fetch(`${API_URL}${rota}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": token ? `Bearer ${token}` : "",
      },
      body: JSON.stringify(corpo),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.detail || "Falha na comunicação com o servidor.");
    return data;
  };

  // Dados da prova que acompanham todas as etapas.
  const contextoDaProva = () => ({
    model: userModel || model || null,
    api_key: userApiKey || null,
    banca: saveBanca.trim() || null,
    concurso: saveConcurso.trim() || null,
    cargo: saveCargo.trim() || null,
    ano: saveAno.trim() || null,
  });

  const gerarUmModulo = (est, indice) =>
    postJson("/analyze/modulo", {
      ...contextoDaProva(),
      modulo: est.modulos[indice],
      area: est.area_identificada,
      instrucoes: est.instrucoes,
      texto_edital: text,
      question_format: questionFormat,
      question_level: questionLevel,
      qtd_questoes: Number(qtdQuestoes) || 10,
    });

  // A geracao acontece em etapas: primeiro o edital vira uma lista de modulos,
  // depois cada modulo e gerado numa chamada propria. Assim o progresso e real,
  // uma falha custa um modulo em vez do edital inteiro, e da para refazer so ele.
  const run = async () => {
    if (text.trim().length < 50) {
      setError("⚠️ O texto do edital é muito curto. Cole pelo menos um parágrafo válido.");
      return;
    }
    if (!saveBanca.trim() || !saveConcurso.trim() || !saveAno.trim()) {
      setError("⚠️ Informe banca, concurso e ano antes de gerar — é o que faz a IA escrever no padrão certo.");
      return;
    }

    setError("");
    setResult(null);
    setEstrutura(null);
    setFalhas([]);
    setLoading(true);
    setProgress(0);
    setStatus("Lendo o edital e separando os módulos...");

    try {
      // ---------- Etapa 1: estrutura ----------
      const est = await postJson("/analyze/estrutura", { ...contextoDaProva(), text });
      const modulos = safeArray(est?.modulos);
      if (modulos.length === 0) throw new Error("Não foi possível identificar módulos neste texto.");

      setEstrutura(est);
      if (est.truncado) {
        setError(`O edital tem mais de ${est.limite_modulos} tópicos. Serão gerados os ${est.limite_modulos} primeiros — gere o restante numa segunda aula.`);
      }

      // ---------- Etapa 2: um módulo por vez ----------
      const aulas = [];
      const naoGerados = [];

      for (let i = 0; i < modulos.length; i++) {
        const titulo = safeString(modulos[i]?.titulo) || `Módulo ${i + 1}`;
        setStatus(`Módulo ${i + 1} de ${modulos.length}: ${titulo}`);
        setProgress(Math.round((i / modulos.length) * 95));

        try {
          const aula = await gerarUmModulo(est, i);
          aulas.push(aula);
        } catch (e) {
          console.error(`Falha no módulo ${i + 1}`, e);
          naoGerados.push({ indice: i, titulo, mensagem: e.message });
        }

        // Mostra o que já ficou pronto, mesmo antes de terminar tudo.
        setResult({
          schema_version: 1,
          resumo_cargo: est.resumo_cargo,
          area_identificada: est.area_identificada,
          aulas: [...aulas],
          plano_estudo: "",
        });
      }

      setFalhas(naoGerados);

      if (aulas.length === 0) {
        throw new Error("Nenhum módulo pôde ser gerado. Verifique a sua chave de IA e tente novamente.");
      }

      // ---------- Etapa 3: plano de estudo ----------
      setStatus("Montando o plano de estudo...");
      setProgress(97);
      const plano = await postJson("/analyze/plano", {
        aulas,
        area: est.area_identificada,
        model: userModel || model || null,
        api_key: userApiKey || null,
      }).catch(() => ({ plano_estudo: "" }));

      setResult({
        schema_version: 1,
        resumo_cargo: est.resumo_cargo,
        area_identificada: est.area_identificada,
        aulas,
        plano_estudo: plano?.plano_estudo || "",
      });

      setProgress(100);
      setStatus(
        naoGerados.length > 0
          ? `Gerado com ${naoGerados.length} módulo(s) com falha — dá para refazer só eles abaixo.`
          : "Conteúdo gerado com sucesso!"
      );

      localStorage.removeItem("generator_draft_text");
      setTimeout(() => {
        document.getElementById("gerador-resultado")?.scrollIntoView({ behavior: "smooth" });
      }, 400);
    } catch (e) {
      console.error(e);
      setError(e.message || "Erro inesperado ao gerar a aula.");
      setStatus("");
      setProgress(0);
    } finally {
      setLoading(false);
    }
  };

  // Refaz um módulo isolado, sem regerar (nem pagar) o edital inteiro.
  const refazerModulo = async (indice) => {
    if (!estrutura) return;
    setRefazendo(indice);
    setError("");
    try {
      const aula = await gerarUmModulo(estrutura, indice);

      setResult((anterior) => {
        const aulas = safeArray(anterior?.aulas).slice();
        const posicao = aulas.findIndex((a) => a?.meta_modulo?.titulo === estrutura.modulos[indice]?.titulo);
        if (posicao >= 0) aulas[posicao] = aula;
        else aulas.push(aula);
        return { ...(anterior || {}), aulas };
      });

      setFalhas((anterior) => anterior.filter((f) => f.indice !== indice));
      setStatus("Módulo refeito com sucesso.");
    } catch (e) {
      setError(`Não foi possível refazer o módulo: ${e.message}`);
    } finally {
      setRefazendo(null);
    }
  };

  const onLoadJson = async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    setError("");
    try {
      const data = await readJsonFile(file);

      // Sem validacao, um arquivo em outro formato derruba a tela de aula.
      const aulas = safeArray(data?.aulas);
      if (aulas.length === 0) {
        throw new Error("O arquivo não tem a lista de aulas no formato esperado.");
      }
      const incompletos = aulas
        .map((a, i) => (safeString(a?.titulo).trim() ? null : i + 1))
        .filter((x) => x !== null);
      if (incompletos.length === aulas.length) {
        throw new Error("Nenhum módulo do arquivo tem título — o formato não confere.");
      }

      setResult(data);
      setEstrutura(null);
      setFalhas([]);
      setStatus(
        incompletos.length > 0
          ? `Arquivo carregado. Atenção: ${incompletos.length} módulo(s) estão incompletos.`
          : "Arquivo carregado."
      );
    } catch (e) {
      console.error(e);
      setError(e.message || "Arquivo JSON inválido ou corrompido.");
    } finally {
      ev.target.value = "";
    }
  };

  return (
    <div className="gen">
      <PageHeader
        eyebrow="Gestão"
        title="Gerador de aulas"
        description="Cole o conteúdo programático do seu edital. A plataforma devolve a aula explicada, as questões no padrão da banca e a discursiva do módulo."
      />

      <AiKeyBar
        ia={ia}
        userApiKey={userApiKey}
        userModel={userModel}
        onConfigurar={() => setShowConfig(true)}
        label="IA que gera as aulas"
      />

      <Card>
        <CardHead title="O que gerar" />
        <CardBody className="gen__form">
          <div className="gen__campo">
            <div className="gen__campo-topo">
              <span className="ui-field__label">Assunto ou trecho do edital</span>
              <span className={`gen__contagem${text.length > 50 ? " is-ok" : ""}`}>{text.length} caracteres</span>
            </div>
            <textarea
              className="gen__textarea"
              value={text}
              onChange={handleTextChange}
              disabled={loading}
              rows={8}
              placeholder="Cole aqui o trecho do edital, da lei ou o conteúdo programático…"
            />
          </div>

          {/* A banca precisa ser conhecida ANTES da geração: é ela que define o
              estilo do enunciado, das alternativas e da pegadinha. */}
          <div className="gen__linha">
            <Input label="Banca *" value={saveBanca} onChange={(e) => setSaveBanca(e.target.value)}
              disabled={loading} placeholder="ex: CEBRASPE, FGV, FCC" />
            <Input label="Concurso *" value={saveConcurso} onChange={(e) => setSaveConcurso(e.target.value)}
              disabled={loading} placeholder="ex: DATAPREV, Polícia Federal" />
            <Input label="Cargo" value={saveCargo} onChange={(e) => setSaveCargo(e.target.value)}
              disabled={loading} placeholder="ex: Analista de TI" />
            <Input label="Ano *" value={saveAno} onChange={(e) => setSaveAno(e.target.value)}
              disabled={loading} placeholder="2026" className="gen__estreito" />
          </div>

          <div className="gen__linha">
            <label className="ui-field">
              <span className="ui-field__label">Nível das questões</span>
              <select className="ui-input" value={questionLevel} disabled={loading}
                onChange={(e) => setQuestionLevel(e.target.value)}>
                <option value="Iniciante">Iniciante</option>
                <option value="Normal">Normal</option>
                <option value="Avançado">Avançado</option>
                <option value="Expert">Expert</option>
              </select>
            </label>
            <label className="ui-field">
              <span className="ui-field__label">Formato das questões</span>
              <select className="ui-input" value={questionFormat} disabled={loading}
                onChange={(e) => setQuestionFormat(e.target.value)}>
                <option value="Múltipla Escolha">Múltipla escolha (A a E)</option>
                <option value="Certo/Errado">Certo / Errado</option>
              </select>
            </label>
            <Input label="Questões por módulo" type="number" min="3" max="20" value={qtdQuestoes}
              onChange={(e) => setQtdQuestoes(e.target.value)} disabled={loading} className="gen__estreito" />
          </div>

          {loading && (
            <div className="gen__progresso">
              <div className="gen__progresso-topo">
                <span>{status}</span>
                <b>{progress}%</b>
              </div>
              <ProgressBar value={progress} aria-label="Progresso da geração" />
              {estrutura && (
                <p>Cada módulo é gerado numa chamada própria — o resultado aparece abaixo conforme fica pronto.</p>
              )}
            </div>
          )}

          <div className="gen__acoes">
            <Button variant="primary" size="lg" onClick={run} disabled={loading || text.trim().length < 10} icon={<Sparkles size={16} />}>
              {loading ? "Processando…" : "Gerar material completo"}
            </Button>
            <Button onClick={() => result && downloadJson(result)} disabled={!result} icon={<Download size={15} />}>
              Baixar JSON
            </Button>
            <label className="ui-btn gen__arquivo">
              <Upload size={15} /> Carregar JSON
              <input type="file" accept="application/json" onChange={onLoadJson} hidden />
            </label>
          </div>

          {/* Módulos que falharam: refazer só eles, sem regerar o edital todo. */}
          {falhas.length > 0 && !loading && (
            <div className="gen__falhas">
              <b>{falhas.length} módulo(s) não foram gerados</b>
              {falhas.map((f) => (
                <div key={f.indice} className="gen__falha">
                  <span>
                    {f.titulo}
                    <i>{f.mensagem}</i>
                  </span>
                  <Button size="sm" onClick={() => refazerModulo(f.indice)} disabled={refazendo !== null}>
                    {refazendo === f.indice ? "Refazendo…" : "Refazer este módulo"}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {!!error && <Notice tone="err" onClose={() => setError("")}>{error}</Notice>}
          {!!status && !loading && !error && <Notice tone="ok">{status}</Notice>}

          {result && !loading && (
            <div className="gen__salvar">
              <h3>Salvar a aula</h3>
              <p>
                Gerada para <b>{saveBanca || "—"}</b>
                {saveConcurso ? ` · ${saveConcurso}` : ""}
                {saveCargo ? ` · ${saveCargo}` : ""}
                {saveAno ? ` · ${saveAno}` : ""}
              </p>
              <div className="gen__linha">
                <label className="ui-field">
                  <span className="ui-field__label">Visibilidade</span>
                  <select className="ui-input" value={saveVisibility} onChange={(e) => setSaveVisibility(e.target.value)}>
                    <option value="public">Pública — qualquer assinante vê</option>
                    <option value="private">Privada — só você e quem você compartilhar</option>
                  </select>
                </label>
                <Input label="Título da aula" value={saveTitle} onChange={(e) => setSaveTitle(e.target.value)}
                  placeholder="Um título fácil de reencontrar depois" />
              </div>
              <Button variant="primary" onClick={saveToDb} icon={<Save size={15} />}>
                Confirmar e salvar
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      {result && (
        <section id="gerador-resultado" className="gen__resultado">
          <LessonContent result={result} />
        </section>
      )}

      {/* CONFIGURAÇÃO DE IA — painel único, compartilhado com as demais telas */}
      <Modal
        open={showConfig}
        onClose={() => setShowConfig(false)}
        title="Conectar a sua inteligência artificial"
        subtitle="É a chave que gera as aulas. Sem ela, a geração usa a cota do seu plano."
      >
        <AiKeyPanel
          userApiKey={userApiKey}
          userModel={userModel}
          onChange={({ apiKey, model }) => { setUserApiKey(apiKey); setUserModel(model); }}
          onFechar={() => setShowConfig(false)}
        />
      </Modal>

      <Toast aviso={aviso} onFechar={() => setAviso(null)} />
    </div>
  );
}
