import React, { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  BookOpen, Wrench, PlusCircle, FolderCog, Settings, LogOut, Moon, Sun, Menu, X, Search, Sparkles, UserCircle, Instagram, Youtube, TrendingUp, PenTool, Brain, Calculator, FileText, Scale, Type, Coffee, Gavel, GitCompare, Layers,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Button, SegmentedControl } from "./ui";
import { ESCALAS, lerEscala, aplicarEscala, lerTema, aplicarTema } from "../preferencias";
import "./AppShell.css";

const ICON = 17;

/* Menu declarativo: cada item pode exigir um papel especifico. */
const NAV = [
  {
    label: "Estudo",
    items: [
      { to: "/", label: "Minhas Aulas", icon: BookOpen, end: true },
      { to: "/performance", label: "Meu Desempenho", icon: TrendingUp },
      { to: "/treino", label: "Treino Discursivo", icon: PenTool },
    ],
  },
  {
    label: "Ferramentas",
    items: [
      { to: "/ferramentas", label: "Central", icon: Wrench, end: true },
      { to: "/gabarite-cespe", label: "Português CESPE", icon: Brain },
      { to: "/gabarite-logica", label: "Raciocínio Lógico", icon: Calculator },
      { to: "/gabarite-sintaxe", label: "Sintaxe", icon: FileText },
      { to: "/gabarite-direito", label: "Noções de Direito", icon: Scale },
      { to: "/gabarite-ingles", label: "Inglês", icon: Type },
      { to: "/gabarite-java", label: "Java", icon: Coffee },
      { to: "/lei-seca", label: "Lei Seca", icon: Gavel },
      { to: "/comparador-bancas", label: "Comparar Bancas", icon: GitCompare },
      { to: "/baralho", label: "Baralho", icon: Layers },
    ],
  },
  {
    label: "Gestão",
    requires: "manage",
    items: [
      { to: "/generator", label: "Nova Aula", icon: PlusCircle, requires: "manage" },
      { to: "/gerenciar", label: "Gerenciar Aulas", icon: FolderCog, requires: "manage" },
      { to: "/admin", label: "Painel Admin", icon: Settings, requires: "admin" },
    ],
  },
];

function planLabel(user) {
  if (!user?.plan_expires_at) return { text: user?.plan_type ? `Plano ${user.plan_type}` : "Sem plano ativo", warn: false };
  const dias = Math.ceil((new Date(user.plan_expires_at) - new Date()) / 86400000);
  const tipo = user.plan_type || "Ativo";
  if (dias <= 0) return { text: "Plano expirado", warn: true };
  return { text: `Plano ${tipo} · ${dias} ${dias === 1 ? "dia" : "dias"}`, warn: dias <= 7 };
}

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isAdmin = user?.role === "admin";
  const podeGerenciar = isAdmin || user?.can_manage_lessons === true;

  const [isDark, setIsDark] = useState(lerTema);
  const [escala, setEscala] = useState(lerEscala);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busca, setBusca] = useState("");

  useEffect(() => { aplicarTema(isDark); }, [isDark]);
  useEffect(() => { aplicarEscala(escala); }, [escala]);

  useEffect(() => { setMenuOpen(false); }, [location]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const grupos = useMemo(
    () =>
      NAV.map((g) => ({
        ...g,
        items: g.items.filter((i) =>
          i.requires === "admin" ? isAdmin : i.requires === "manage" ? podeGerenciar : true
        ),
      })).filter((g) => g.items.length > 0),
    [isAdmin, podeGerenciar]
  );

  const iniciais = (user?.email || "?").slice(0, 2).toUpperCase();
  const apelido = user?.email ? user.email.split("@")[0] : "";
  const plano = planLabel(user);

  const submitBusca = (e) => {
    e.preventDefault();
    const q = busca.trim();
    navigate(q ? `/?busca=${encodeURIComponent(q)}` : "/");
  };

  return (
    <div className={`shell${menuOpen ? " is-open" : ""}`}>
      {/* Primeiro elemento focavel da pagina: quem navega por teclado pula
          os ~20 links do menu em vez de tabular por todos a cada tela. */}
      <a className="shell__skip" href="#conteudo">Pular para o conteúdo</a>

      <button
        className="shell__scrim"
        aria-label="Fechar menu"
        tabIndex={menuOpen ? 0 : -1}
        onClick={() => setMenuOpen(false)}
      />

      <aside className="shell__side" aria-label="Navegação principal">
        <Link to="/" className="shell__brand">
          <span className="shell__brand-mark"><Sparkles size={16} /></span>
          AgenteIA Edital
        </Link>

        {grupos.map((g) => (
          <nav className="shell__group" key={g.label}>
            <div className="shell__group-label">{g.label}</div>
            {g.items.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => `shell__item${isActive ? " is-active" : ""}`}
              >
                <Icon size={ICON} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        ))}

        <div className="shell__side-foot">
          <Link to="/profile" className="shell__user" title="Acessar perfil">
            <span className="shell__avatar">{iniciais}</span>
            <span style={{ minWidth: 0 }}>
              <span className="shell__user-name">{apelido}</span>
              <span className={`shell__user-plan${plano.warn ? " is-warn" : ""}`}>{plano.text}</span>
            </span>
          </Link>
          <div className="shell__fonte">
            <span className="shell__fonte-rotulo">Tamanho da letra</span>
            <SegmentedControl
              aria="Tamanho da letra"
              valor={escala}
              onTrocar={setEscala}
              itens={ESCALAS.map((e) => ({ id: e.id, rotulo: e.rotulo, aria: e.aria }))}
            />
          </div>

          <div className="shell__side-actions">
            <button
              className="shell__item"
              onClick={() => setIsDark(!isDark)}
              title={isDark ? "Usar tema claro" : "Usar tema escuro"}
            >
              {isDark ? <Sun size={ICON} /> : <Moon size={ICON} />}
            </button>
            <button className="shell__item" onClick={logout} title="Sair da conta">
              <LogOut size={ICON} />
            </button>
          </div>
        </div>
      </aside>

      <div className="shell__main">
        <header className="shell__top">
          <button
            className="shell__icon-btn shell__burger"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          <form className="shell__search" role="search" onSubmit={submitBusca}>
            <Search size={16} />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar aula, concurso ou banca…"
              aria-label="Buscar aula, concurso ou banca"
            />
          </form>

          <div className="shell__top-actions">
            <Link to="/profile" className="shell__icon-btn" title="Perfil e configurações de IA">
              <UserCircle size={18} />
            </Link>
            {podeGerenciar && (
              <Button variant="primary" to="/generator" icon={<Sparkles size={15} />}>
                <span className="shell__label">Gerar com IA</span>
              </Button>
            )}
          </div>
        </header>

        {/* tabIndex -1: o "pular para o conteudo" precisa poder POR o foco
            aqui, senao o link rola a pagina e o foco continua no menu. */}
        <main className="shell__content" id="conteudo" tabIndex={-1}>{children}</main>

        <footer className="shell__foot">
          <span>A IA pode cometer erros. Na dúvida, consulte sempre o material oficial do edital.</span>
          <span className="shell__foot-social">
            <a href="https://www.instagram.com/tecnopriv.top/" target="_blank" rel="noopener noreferrer" title="Instagram">
              <Instagram size={18} />
            </a>
            <a href="https://www.youtube.com/@tecnopriv.top1" target="_blank" rel="noopener noreferrer" title="YouTube">
              <Youtube size={20} />
            </a>
            <span>© {new Date().getFullYear()} AgenteIA Edital</span>
          </span>
        </footer>
      </div>
    </div>
  );
}
