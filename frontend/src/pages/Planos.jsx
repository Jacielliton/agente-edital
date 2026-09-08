import React, { useEffect, useState } from "react";
import { CreditCard, Check } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Button, Card, CardBody, Badge, Input, Notice } from "../components/ui";
import "./Planos.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

/* As cotas vêm do `planos_info` em backend/main.py, que é quem de fato credita
   os tokens. A tela anunciava "300k" e "600k" — dez vezes menos do que o
   assinante recebe. Ao mexer aqui, conferir contra o backend, nunca de memória. */
const PLANOS = [
  { id: "diario_teste",       nome: "Teste Diário",       preco: "1,90",   periodo: "24 horas",  familia: "Plus",    ia: "IA inclusa · 200 mil tokens" },
  { id: "mensal_simples",     nome: "Mensal Simples",     preco: "49,90",  periodo: "30 dias",   familia: "Simples", ia: "Você conecta a sua chave — modelos gratuitos servem" },
  { id: "trimestral_simples", nome: "Trimestral Simples", preco: "119,90", periodo: "90 dias",   familia: "Simples", ia: "Você conecta a sua chave — modelos gratuitos servem" },
  { id: "semestral_simples",  nome: "Semestral Simples",  preco: "199,90", periodo: "180 dias",  familia: "Simples", ia: "Você conecta a sua chave — modelos gratuitos servem" },
  { id: "mensal_plus",        nome: "Mensal Plus",        preco: "99,90",  periodo: "30 dias",   familia: "Plus",    ia: "IA inclusa · 3 milhões de tokens por mês", destaque: true },
  { id: "trimestral_plus",    nome: "Trimestral Plus",    preco: "159,90", periodo: "90 dias",   familia: "Plus",    ia: "IA inclusa · 3 milhões de tokens por mês" },
  { id: "semestral_plus",     nome: "Semestral Plus",     preco: "239,90", periodo: "180 dias",  familia: "Plus",    ia: "IA inclusa · 3 milhões de tokens por mês" },
  { id: "trimestral_pro",     nome: "Trimestral Pro",     preco: "189,90", periodo: "90 dias",   familia: "Pro",     ia: "IA inclusa · 6 milhões de tokens por mês" },
  { id: "semestral_pro",      nome: "Semestral Pro",      preco: "269,90", periodo: "180 dias",  familia: "Pro",     ia: "IA inclusa · 6 milhões de tokens por mês" },
];

export default function Planos() {
  const { user } = useAuth();
  const [email, setEmail] = useState(user?.email || "");
  const [cupom, setCupom] = useState("");
  const [carregando, setCarregando] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => { if (user?.email) setEmail(user.email); }, [user]);

  const contratar = async (planoId) => {
    if (!email) {
      setErro("Informe o e-mail da sua conta para ativar ou renovar.");
      return;
    }
    setCarregando(planoId);
    setErro("");
    try {
      const res = await fetch(`${API_URL}/payments/create-preference`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          plano: planoId,
          coupon_code: cupom ? cupom.toUpperCase() : null,
        }),
      });
      const dados = await res.json();
      if (!res.ok) throw new Error(dados.detail || "Não foi possível gerar a cobrança.");
      window.location.href = dados.init_point;
    } catch (e) {
      setErro(e.message);
      setCarregando(null);
    }
  };

  return (
    <div className="pl">
      <header className="pl__topo">
        <h1>Ative ou renove a sua conta</h1>
        <p>
          O pagamento é único e a renovação é feita por você quando quiser — não há cobrança
          recorrente automática.
        </p>
      </header>

      <Card className="pl__conta">
        <CardBody>
          {user ? (
            <div className="pl__campo">
              <span className="ui-field__label">Conta conectada</span>
              <div className="pl__email">{user.email}</div>
            </div>
          ) : (
            <Input
              label="Qual o e-mail da sua conta?"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@exemplo.com"
              required
            />
          )}

          <Input
            label="Cupom de desconto (opcional)"
            value={cupom}
            onChange={(e) => setCupom(e.target.value)}
            placeholder="ex: PROMO20"
            className="pl__cupom"
          />

          {erro && <Notice tone="err" onClose={() => setErro("")}>{erro}</Notice>}
        </CardBody>
      </Card>

      <div className="pl__grade">
        {PLANOS.map((p) => (
          <article key={p.id} className={`pl__plano${p.destaque ? " is-destaque" : ""}`}>
            {p.destaque && <span className="pl__selo">mais escolhido</span>}

            <header className="pl__plano-topo">
              <h3>{p.nome}</h3>
              <Badge outline>{p.familia}</Badge>
            </header>

            <div className="pl__preco">
              <b>R$ {p.preco}</b>
              <span>{p.periodo}</span>
            </div>

            <ul className="pl__itens">
              <li><Check size={15} /> {p.ia}</li>
              <li><Check size={15} /> Todas as ferramentas da plataforma</li>
              <li><Check size={15} /> Liberação assim que o pagamento é aprovado</li>
            </ul>

            <Button
              variant={p.destaque ? "primary" : "default"}
              onClick={() => contratar(p.id)}
              disabled={carregando !== null}
              icon={<CreditCard size={16} />}
              block
            >
              {carregando === p.id ? "Abrindo o pagamento…" : "Contratar"}
            </Button>
          </article>
        ))}
      </div>

      <p className="pl__rodape">
        Pagamento processado pelo Mercado Pago. Os planos Simples usam a sua própria chave de IA —
        há modelos gratuitos disponíveis, e nesse caso não há custo de IA nenhum.
      </p>
    </div>
  );
}
