import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { lerLancamento, sinalDe, detalheDoLancamento } from "../comissao";
import {
  Key, Clock, Copy, Check, Sparkles,
} from "lucide-react";
import {
  Button, Badge, Card, CardHead, CardBody, Input, ProgressBar, StatCard,
  PageHeader, Notice,
} from "../components/ui";
import { AiKeyPanel, useAiKey } from "../components/AiKeyConfig";
import "./Profile.css";

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

const num = (v) => Number(v || 0);
const brl = (v) => `R$ ${num(v).toFixed(2).replace(".", ",")}`;
const milhar = (v) => num(v).toLocaleString("pt-BR");

export default function Profile() {
  const { user } = useAuth();

  const [aviso, setAviso] = useState(null);

  const [passwords, setPasswords] = useState({ current: "", new: "", confirm: "" });
  const [passStatus, setPassStatus] = useState(null);
  const [isChangingPass, setIsChangingPass] = useState(false);

  const { userApiKey, userModel, setUserApiKey, setUserModel, ia } = useAiKey();

  const [commissionHistory, setCommissionHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    const fetchHistory = async () => {
      setLoadingHistory(true);
      try {
        if (!getAuthToken()) return;
        const res = await fetch(`${API_URL}/users/me/commission-history`, { headers: authHeaders() });
        if (res.ok) {
          const data = await res.json();
          setCommissionHistory(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error("Erro ao buscar histórico:", err);
      } finally {
        setLoadingHistory(false);
      }
    };

    fetchHistory();
  }, []);

  // ------------------------------------------------------------- senha
  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
      setPassStatus({ tone: "err", texto: "As novas senhas não coincidem." });
      return;
    }
    if (passwords.new.length < 6) {
      setPassStatus({ tone: "err", texto: "A nova senha precisa ter pelo menos 6 caracteres." });
      return;
    }

    setIsChangingPass(true);
    setPassStatus(null);
    try {
      const res = await fetch(`${API_URL}/users/me/password`, {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ current_password: passwords.current, new_password: passwords.new }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Não foi possível atualizar a senha.");
      }
      setPassStatus({ tone: "ok", texto: "Senha atualizada." });
      setPasswords({ current: "", new: "", confirm: "" });
    } catch (e) {
      setPassStatus({ tone: "err", texto: e.message });
    } finally {
      setIsChangingPass(false);
    }
  };

  // ------------------------------------------------------------ indicação
  const linkIndicacao = user?.referral_code
    ? `${window.location.origin}/login?ref=${user.referral_code}`
    : "";

  const copiarLink = async () => {
    if (!linkIndicacao) return;
    try {
      // A API de área de transferência só existe em HTTPS e em navegadores
      // recentes. Sem o fallback, o antigo dizia "copiado" mesmo falhando.
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(linkIndicacao);
      } else {
        const campo = document.getElementById("pf-link-indicacao");
        campo?.select();
        if (!document.execCommand("copy")) throw new Error("cópia recusada");
      }
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2200);
    } catch (e) {
      setAviso({
        tone: "warn",
        texto: "Não consegui copiar automaticamente. Selecione o link no campo e copie com Ctrl+C.",
      });
    }
  };

  if (!user) return null;

  // ------------------------------------------------------------- derivados
  const expira = user.plan_expires_at ? new Date(user.plan_expires_at) : null;
  const plano = (() => {
    if (user.role === "admin") return { texto: "Vitalício", detalhe: "conta de administrador", tone: "accent" };
    if (!expira || isNaN(expira.getTime())) return { texto: "Sem plano", detalhe: "nenhuma assinatura ativa", tone: "flat" };
    if (expira > new Date()) {
      const dias = Math.ceil((expira - new Date()) / 86400000);
      return {
        texto: `${dias} ${dias === 1 ? "dia" : "dias"}`,
        detalhe: `${user.plan_type || "Ativo"} · até ${expira.toLocaleDateString("pt-BR")}`,
        tone: dias <= 7 ? "warn" : "up",
      };
    }
    return { texto: "Expirado", detalhe: `desde ${expira.toLocaleDateString("pt-BR")}`, tone: "down" };
  })();

  const limite = num(user.token_limit);
  const usados = num(user.tokens_used);
  const pctTokens = limite > 0 ? Math.min((usados / limite) * 100, 100) : 0;
  const semCota = user.role !== "admin" && (user.plan_type === "Simples" || limite === 0);
  const temChave = Boolean(userApiKey);

  return (
    <div className="pf">
      <PageHeader
        eyebrow="Conta"
        title="Meu perfil"
        description="Sua assinatura, a integração de IA, a senha de acesso e o programa de indicações."
        actions={
          user.role !== "admin" && (
            <Button variant="primary" to="/planos" icon={<Sparkles size={15} />}>
              Renovar ou trocar de plano
            </Button>
          )
        }
      />

      {aviso && <Notice tone={aviso.tone} onClose={() => setAviso(null)}>{aviso.texto}</Notice>}

      {/* ---------------------------- Resumo ---------------------------- */}
      <div className="pf__stats">
        <StatCard label="Conta" value={user.email.split("@")[0]} textValue delta={user.email} />
        <StatCard
          label="Assinatura"
          value={plano.texto}
          textValue={plano.texto.length > 8}
          delta={plano.detalhe}
          deltaTone={plano.tone === "accent" ? "flat" : plano.tone}
        />
        <StatCard
          label="Nível de acesso"
          value={(user.role || "user").toUpperCase()}
          textValue
          delta={user.can_manage_lessons ? "pode criar e gerenciar aulas" : "acesso de estudo"}
        />
        <StatCard
          label="Comissões acumuladas"
          value={brl(user.commission_balance)}
          textValue
          delta="programa de indicações"
        />
      </div>

      {/* ------------------------- IA compartilhada ---------------------- */}
      <Card>
        <CardHead title="Consumo da IA da plataforma" />
        <CardBody>
          {user.role === "admin" ? (
            <p className="pf__hint">Contas de administrador não têm cota de consumo.</p>
          ) : semCota ? (
            <>
              <p className="pf__hint">
                O plano Simples não inclui a IA da plataforma — ele usa a chave que você conectar
                abaixo. Os planos Plus e Pro incluem cota mensal e não exigem configuração.
              </p>
              <Button to="/planos" icon={<Sparkles size={15} />} style={{ alignSelf: "flex-start" }}>
                Ver os planos com IA inclusa
              </Button>
            </>
          ) : (
            <div className="pf__usage">
              <div className="pf__usage-line">
                <span>Plano {user.plan_type}</span>
                <b>{milhar(usados)} / {milhar(limite)} tokens</b>
              </div>
              <ProgressBar
                value={pctTokens}
                color={pctTokens >= 90 ? "var(--danger)" : pctTokens >= 70 ? "var(--warn)" : "var(--accent)"}
                aria-label="Consumo de tokens do seu plano"
              />
              {usados >= limite && limite > 0 && (
                <Notice tone="warn">
                  Cota do mês esgotada. Ela volta ao valor cheio na renovação do plano — ou conecte
                  uma chave própria abaixo para continuar usando agora.
                </Notice>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      {/* --------------------------- Integração IA ----------------------- */}
      <Card>
        <CardHead
          title="Sua chave de IA"
          /* Com a IA do plano ativa, não ter chave própria não é pendência —
             é o normal. O selo "não conectada" fazia o assinante Plus/Pro achar
             que faltava configurar alguma coisa. */
          action={
            temChave ? <Badge tone="ok" icon={<Check size={11} />}>conectada</Badge>
            : ia?.estado === "ativa" ? <Badge outline>opcional</Badge>
            : <Badge outline>não conectada</Badge>
          }
        />
        <CardBody>
          {!temChave && ia?.estado === "ativa" && (
            <p className="pf__hint">
              A IA do seu plano{ia.plano ? ` ${ia.plano}` : ""} já está ativa — você só precisa de
              uma chave própria se quiser usar outro modelo ou não consumir a sua cota.
            </p>
          )}
          <AiKeyPanel
            userApiKey={userApiKey}
            userModel={userModel}
            onChange={({ apiKey, model }) => {
              setUserApiKey(apiKey);
              setUserModel(model);
              setAviso({ tone: "ok", texto: "Configurações de IA salvas." });
            }}
          />
        </CardBody>
      </Card>

      {/* ------------------------------ Senha ---------------------------- */}
      <Card>
        <CardHead title="Alterar senha" />
        <CardBody>
          <form className="pf__form" onSubmit={handlePasswordChange}>
            <Input
              label="Senha atual"
              type="password"
              required
              autoComplete="current-password"
              value={passwords.current}
              onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
            />
            <Input
              label="Nova senha"
              type="password"
              required
              autoComplete="new-password"
              value={passwords.new}
              onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
            />
            <Input
              label="Confirmar a nova senha"
              type="password"
              required
              autoComplete="new-password"
              value={passwords.confirm}
              onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
            />
            {passStatus && (
              <Notice tone={passStatus.tone} onClose={() => setPassStatus(null)}>{passStatus.texto}</Notice>
            )}
            <Button variant="primary" type="submit" disabled={isChangingPass} icon={<Key size={15} />} style={{ alignSelf: "flex-start" }}>
              {isChangingPass ? "Atualizando…" : "Atualizar senha"}
            </Button>
          </form>
        </CardBody>
      </Card>

      {/* --------------------------- Indicações -------------------------- */}
      <Card>
        <CardHead
          title="Programa de indicações"
          action={<Badge tone="ok">{brl(user.commission_balance)} acumulados</Badge>}
        />
        <CardBody className="pf__section">
          <p className="pf__hint">
            Compartilhe o seu link. A cada pessoa que se cadastrar por ele e assinar um plano, você
            recebe 20% de comissão. O pagamento é combinado e registrado pelo administrador.
          </p>

          <div className="pf__ref">
            <label className="ui-field">
              <span className="ui-field__label">Seu link</span>
              <input
                id="pf-link-indicacao"
                className="ui-input"
                type="text"
                readOnly
                value={linkIndicacao || "Gerando o seu link…"}
                onFocus={(e) => e.target.select()}
              />
            </label>
            <Button
              variant={copiado ? "default" : "primary"}
              onClick={copiarLink}
              disabled={!linkIndicacao}
              icon={copiado ? <Check size={15} /> : <Copy size={15} />}
            >
              {copiado ? "Copiado" : "Copiar link"}
            </Button>
          </div>

          <div>
            <div className="ui-field__label" style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: "var(--space-3)" }}>
              <Clock size={14} /> Extrato de movimentações
            </div>

            {loadingHistory ? (
              <div className="pf__hist-empty">Carregando…</div>
            ) : commissionHistory.length === 0 ? (
              <div className="pf__hist">
                <div className="pf__hist-empty">
                  Nenhuma movimentação ainda. Assim que alguém assinar pelo seu link, o lançamento
                  aparece aqui.
                </div>
              </div>
            ) : (
              <div className="pf__hist">
                {commissionHistory.map((item, idx) => {
                  // O sinal vem do lançamento, não do tipo: desde 13/09/2026
                  // `amount` é a variação (negativa numa saída), e os
                  // lançamentos antigos continuam no formato velho.
                  const lanc = lerLancamento(item);
                  const saida = lanc.tipo === "saida";
                  return (
                    <div className="pf__hist-row" key={item.id ?? idx}>
                      <span className="t">{new Date(item.created_at || Date.now()).toLocaleDateString("pt-BR")}</span>
                      <span>
                        {saida ? <Badge tone="danger">Pagamento</Badge>
                          : item.action_type === "ajuste" ? <Badge tone="accent">Ajuste</Badge>
                          : <Badge tone="ok">Comissão</Badge>}
                      </span>
                      <span className="d">{item.description || "—"}</span>
                      <span
                        className={`v${saida ? " is-out" : ""}`}
                        title={detalheDoLancamento(item, brl)}
                      >
                        {lanc.tipo === "saldo-definido"
                          ? <>saldo → {brl(lanc.valor)}</>
                          : <>{sinalDe(lanc.tipo)} {brl(lanc.valor)}</>}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardBody>
      </Card>

    </div>
  );
}
