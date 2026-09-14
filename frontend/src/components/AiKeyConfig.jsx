import React, { useCallback, useEffect, useState } from "react";
import { ExternalLink, Link2, ShieldCheck, Settings } from "lucide-react";
import { Button, Input, ConfirmDialog, Notice } from "./ui";
import "./AiKeyConfig.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export const getAuthToken = () => {
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

/**
 * Chave de IA do usuário, compartilhada por todas as telas que chamam a IA.
 *
 * Este bloco estava copiado em nove arquivos (as seis telas Gabarite, o
 * LessonContent, o Generator e o Profile), cada cópia com os seus próprios
 * alert(). Manter um lugar só evita que uma correção precise ser feita nove
 * vezes — e que oito delas sejam esquecidas.
 */
export function useAiKey() {
  const [userApiKey, setUserApiKey] = useState("");
  const [userModel, setUserModel] = useState("");
  const [carregando, setCarregando] = useState(true);
  // A situação da IA DO PLANO, calculada no servidor (situacao_da_ia no
  // main.py). Fica aqui e não no JavaScript porque a regra de quem pode usar a
  // IA compartilhada é do backend — copiá-la para cá garantiria divergência.
  const [ia, setIa] = useState(null);

  const recarregar = useCallback(async () => {
    try {
      if (!getAuthToken()) return;
      const res = await fetch(`${API_URL}/users/me/settings`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setUserApiKey(data.api_key || "");
        setUserModel(data.preferred_model || "");
        setIa({
          estado: data.ia_do_plano || null,
          motivo: data.ia_motivo || null,
          plano: data.plan_type || null,
          tokensRestantes: data.tokens_restantes ?? null,
          tokenLimit: data.token_limit ?? null,
        });
      }
    } catch (err) {
      console.error("Falha ao buscar as configurações de IA", err);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { recarregar(); }, [recarregar]);

  return { userApiKey, userModel, setUserApiKey, setUserModel, carregando, recarregar, ia };
}

/**
 * Barra de status da chave, no topo de cada ferramenta. Substitui o bloco de
 * estilos inline que estava repetido nas seis telas Gabarite.
 */
/* Formata "1.234.567 tokens" sem virar um número ilegível. */
const emMilhares = (n) => {
  if (n === null || n === undefined) return null;
  if (n >= 1000000) return (n / 1000000).toFixed(n >= 10000000 ? 0 : 1).replace(".", ",") + " milhões de";
  if (n >= 1000) return Math.round(n / 1000) + " mil";
  return String(n);
};

/**
 * Barra de status no topo de cada ferramenta.
 *
 * O ERRO QUE ELA COMETIA (corrigido em 14/09/2026)
 * ------------------------------------------------
 * Ela só olhava a chave PESSOAL. Para quem assina Plus ou Pro — planos que já
 * incluem a IA da plataforma — a barra dizia "Nenhuma chave conectada. Leva
 * menos de um minuto" e oferecia um botão azul "Conectar a minha IA".
 *
 * Ou seja: o assinante que pagou justamente para NÃO precisar configurar nada
 * era mandado configurar. Ou ele perdia tempo criando uma conta no OpenRouter
 * sem necessidade, ou concluía que o produto estava quebrado.
 *
 * Agora há três situações, não duas: chave própria, IA do plano ativa, e IA
 * indisponível — esta última dizendo POR QUE (plano sem IA, cota esgotada,
 * bloqueio do administrador, plataforma sem chave).
 */
export function AiKeyBar({ userApiKey, userModel, onConfigurar, label = "IA geradora", ia = null }) {
  const conectada = Boolean(userApiKey);
  const doPlanoAtiva = !conectada && ia?.estado === "ativa";
  const indisponivel = !conectada && ia && ia.estado !== "ativa";
  const ligada = conectada || doPlanoAtiva;

  const restantes = emMilhares(ia?.tokensRestantes);

  return (
    <div className="aik-bar">
      <span className="aik-bar__status">
        <span className={`aik-bar__dot${ligada ? " is-on" : ""}`} aria-hidden="true" />
        <span className="aik-bar__text">
          <b>{label}</b>
          {conectada ? (
            <span>Chave própria conectada · modelo <code>{userModel || "padrão do plano"}</code></span>
          ) : doPlanoAtiva ? (
            <span>
              Ativa pelo seu plano{ia.plano ? <> <b>{ia.plano}</b></> : null} — você não precisa
              configurar nada.
              {restantes ? <> Restam {restantes} tokens neste ciclo.</> : null}
            </span>
          ) : indisponivel ? (
            <span>{ia.motivo}</span>
          ) : (
            <span>Nenhuma chave conectada. Leva menos de um minuto e há modelos gratuitos.</span>
          )}
        </span>
      </span>
      <Button
        /* Com a IA do plano ativa, conectar chave própria é opção, não tarefa:
           o botão deixa de ser o azul que pede atenção. */
        variant={ligada ? "default" : "primary"}
        size="sm"
        onClick={onConfigurar}
        icon={<Settings size={15} />}
      >
        {conectada ? "Alterar chave" : doPlanoAtiva ? "Usar a minha própria chave" : "Conectar a minha IA"}
      </Button>
    </div>
  );
}

const MODELO_PADRAO = { openrouter: "google/gemini-2.5-flash-lite", aistudio: "gemini-2.5-flash-lite" };

/**
 * Conteúdo do painel de configuração da chave. Fica dentro de um Modal da tela
 * que o usa, para cada uma manter o seu próprio enquadramento.
 */
export function AiKeyPanel({ userApiKey, userModel, onChange, onFechar }) {
  const ehAiStudio = userApiKey && !userApiKey.startsWith("sk-or-");
  const [providerTab, setProviderTab] = useState(ehAiStudio ? "aistudio" : "openrouter");
  const [tempApiKey, setTempApiKey] = useState(userApiKey || "");
  const [tempModel, setTempModel] = useState(userModel || MODELO_PADRAO[ehAiStudio ? "aistudio" : "openrouter"]);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [confirmarDesvinculo, setConfirmarDesvinculo] = useState(false);

  const gravar = async (chave, modelo) => {
    if (!getAuthToken()) {
      setAviso({ tone: "err", texto: "Sua sessão expirou. Entre novamente para salvar." });
      return false;
    }
    const res = await fetch(`${API_URL}/users/me/settings`, {
      method: "PUT",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ api_key: chave, preferred_model: modelo }),
    });
    if (!res.ok) throw new Error("O servidor recusou as configurações.");
    return true;
  };

  const salvar = async () => {
    setSalvando(true);
    setAviso(null);
    try {
      const chave = providerTab === "aistudio" ? tempApiKey.trim() : userApiKey;
      const modelo = tempModel.trim();
      if (await gravar(chave, modelo)) {
        onChange?.({ apiKey: chave, model: modelo });
        onFechar?.();
      }
    } catch (e) {
      setAviso({ tone: "err", texto: e.message || "Falha de conexão ao salvar." });
    } finally {
      setSalvando(false);
    }
  };

  const desvincular = async () => {
    setSalvando(true);
    try {
      if (await gravar("", tempModel.trim())) {
        setTempApiKey("");
        onChange?.({ apiKey: "", model: tempModel.trim() });
        setAviso({ tone: "ok", texto: "Chave desvinculada." });
      }
    } catch (e) {
      setAviso({ tone: "err", texto: e.message || "Não foi possível desvincular." });
    } finally {
      setSalvando(false);
      setConfirmarDesvinculo(false);
    }
  };

  const conectarOpenRouter = () => {
    const callbackUrl = encodeURIComponent(`${window.location.origin}/callback`);
    window.location.href = `https://openrouter.ai/auth?callback_url=${callbackUrl}`;
  };

  return (
    <div className="aik">
      {aviso && <Notice tone={aviso.tone} onClose={() => setAviso(null)}>{aviso.texto}</Notice>}

      <div className="aik__providers">
        <button
          className={`aik__provider${providerTab === "openrouter" ? " is-on" : ""}`}
          onClick={() => { setProviderTab("openrouter"); setTempModel(MODELO_PADRAO.openrouter); }}
        >
          <b>OpenRouter</b>
          <span>Conecta em um clique com a conta que você já tem. Dezenas de modelos, vários gratuitos.</span>
        </button>
        <button
          className={`aik__provider${providerTab === "aistudio" ? " is-on" : ""}`}
          onClick={() => { setProviderTab("aistudio"); setTempModel(MODELO_PADRAO.aistudio); }}
        >
          <b>Google AI Studio</b>
          <span>Exige gerar a chave na sua conta Google e colar aqui.</span>
        </button>
      </div>

      {providerTab === "openrouter" && (
        userApiKey && userApiKey.startsWith("sk-or-") ? (
          <div className="aik__linked">
            <b><ShieldCheck size={16} /> Conta OpenRouter vinculada</b>
            <Button variant="danger" size="sm" onClick={() => setConfirmarDesvinculo(true)} disabled={salvando}>
              Desvincular
            </Button>
          </div>
        ) : (
          <Button variant="primary" onClick={conectarOpenRouter} icon={<Link2 size={15} />} block>
            Conectar OpenRouter
          </Button>
        )
      )}

      {providerTab === "aistudio" && (
        <>
          <Button
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            icon={<ExternalLink size={15} />}
            block
          >
            1. Gerar a chave no AI Studio (gratuito)
          </Button>
          <Input
            label="2. Cole a chave gerada"
            type="password"
            value={tempApiKey}
            onChange={(e) => setTempApiKey(e.target.value)}
            placeholder="AIzaSy… ou AQ.Ab8…"
          />
        </>
      )}

      <Input
        label="Modelo de IA"
        value={tempModel}
        onChange={(e) => setTempModel(e.target.value)}
        placeholder="ex: google/gemini-2.5-flash-lite"
      />

      <div className="aik__foot">
        <Button onClick={onFechar} disabled={salvando}>Fechar</Button>
        <Button variant="primary" onClick={salvar} disabled={salvando} icon={<Settings size={15} />}>
          {salvando ? "Salvando…" : "Salvar configurações"}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmarDesvinculo}
        title="Desvincular a chave de IA"
        message="Remover a sua chave da plataforma?"
        detail="Os recursos de IA passam a depender da cota do seu plano. No plano Simples, eles ficam indisponíveis até você conectar outra chave."
        confirmLabel="Desvincular"
        loading={salvando}
        onConfirm={desvincular}
        onCancel={() => setConfirmarDesvinculo(false)}
      />
    </div>
  );
}
