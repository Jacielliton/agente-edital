import React, { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Link, Navigate, useLocation } from "react-router-dom";
import { Instagram, Youtube, SearchX } from "lucide-react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import AppShell from "./components/AppShell";
import { Button, EmptyState, Skeleton } from "./components/ui";
import "./App.css";

// 1. LAZY LOADING (Code Splitting)
const Dashboard = lazy(() => import("./pages/Dashboard"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const GerenciarAulas = lazy(() => import("./pages/GerenciarAulas"));
const SingleLesson = lazy(() => import("./pages/SingleLesson"));
const Generator = lazy(() => import("./pages/Generator"));
const Login = lazy(() => import("./pages/Login"));
const Performance = lazy(() => import("./components/Performance"));
const OpenRouterCallback = lazy(() => import("./pages/OpenRouterCallback"));
const Profile = lazy(() => import("./pages/Profile"));
const TreinoDiscursiva = lazy(() => import("./pages/TreinoDiscursiva"));
const Ferramentas = lazy(() => import("./pages/Ferramentas"));
const Planos = lazy(() => import("./pages/Planos"));
const GabariteCespe = lazy(() => import("./pages/GabariteCespe"));
const GabariteLogica = lazy(() => import("./pages/GabariteLogica"));
const GabariteSintaxe = lazy(() => import("./pages/GabariteSintaxe"));
const GabariteDireito = lazy(() => import("./pages/GabariteDireito"));
const GabariteIngles = lazy(() => import("./pages/GabariteIngles"));
const GabariteJava = lazy(() => import("./pages/GabariteJava"));

// Esqueleto de carregamento: mesma silhueta da pagina que vai entrar,
// para a troca de rota nao "piscar" um vazio.
const LoadingFallback = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
    <Skeleton width="240px" height={30} />
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--space-3)" }}>
      {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={94} radius="var(--radius-md)" />)}
    </div>
    <Skeleton height={280} radius="var(--radius-md)" />
  </div>
);

const NotFound = () => (
  <EmptyState
    icon={<SearchX size={22} />}
    title="Página não encontrada"
    description="O caminho que você tentou acessar não existe ou foi movido."
    action={<Button variant="primary" to="/">Voltar para Minhas Aulas</Button>}
  />
);

const PrivateRoute = ({ children, adminOnly = false, requireManageLessons = false }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;

  if (user.role === "admin") return children;
  if (adminOnly && user.role !== "admin") return <Navigate to="/" />;
  if (requireManageLessons && !user.can_manage_lessons) return <Navigate to="/" />;

  return children;
};

// Rodape simples das paginas publicas (login e planos), que nao usam o AppShell.
function PublicFooter() {
  return (
    <footer
      style={{
        borderTop: "1px solid var(--line)",
        background: "var(--surface-2)",
        padding: "var(--space-5)",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        alignItems: "center",
        color: "var(--fg-3)",
        fontSize: "var(--text-xs)",
      }}
    >
      <span style={{ color: "var(--fg-2)" }}>
        A IA pode cometer erros. Na dúvida, consulte sempre o material oficial do edital.
      </span>
      <span style={{ display: "flex", gap: "var(--space-4)", alignItems: "center" }}>
        <a href="https://www.instagram.com/tecnopriv.top/" target="_blank" rel="noopener noreferrer" title="Instagram" style={{ color: "var(--fg-3)", display: "flex" }}>
          <Instagram size={20} />
        </a>
        <a href="https://www.youtube.com/@tecnopriv.top1" target="_blank" rel="noopener noreferrer" title="YouTube" style={{ color: "var(--fg-3)", display: "flex" }}>
          <Youtube size={22} />
        </a>
      </span>
      <span>© {new Date().getFullYear()} AgenteIA Edital. Todos os direitos reservados.</span>
    </footer>
  );
}

// Decide o "chrome" da pagina: quem esta logado navega dentro do AppShell;
// login e planos continuam como paginas de largura total.
function Chrome({ children }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const isPublicPage = pathname === "/login" || pathname === "/planos";

  if (!user || isPublicPage) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--surface)" }}>
        <div style={{ flex: 1 }}>{children}</div>
        <PublicFooter />
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Chrome>
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/planos" element={<Planos />} />
              <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
              <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
              <Route path="/aula/:id" element={<PrivateRoute><SingleLesson /></PrivateRoute>} />
              <Route path="/performance" element={<PrivateRoute><Performance /></PrivateRoute>} />
              <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />
              <Route path="/callback" element={<PrivateRoute><OpenRouterCallback /></PrivateRoute>} />

              {/* ROTAS DAS FERRAMENTAS */}
              <Route path="/ferramentas" element={<PrivateRoute><Ferramentas /></PrivateRoute>} />
              <Route path="/treino" element={<PrivateRoute><TreinoDiscursiva /></PrivateRoute>} />
              <Route path="/gabarite-cespe" element={<PrivateRoute><GabariteCespe /></PrivateRoute>} />
              <Route path="/gabarite-logica" element={<PrivateRoute><GabariteLogica /></PrivateRoute>} />
              <Route path="/gabarite-sintaxe" element={<PrivateRoute><GabariteSintaxe /></PrivateRoute>} />
              <Route path="/gabarite-direito" element={<PrivateRoute><GabariteDireito /></PrivateRoute>} />
              <Route path="/gabarite-ingles" element={<PrivateRoute><GabariteIngles /></PrivateRoute>} />
              <Route path="/gabarite-java" element={<PrivateRoute><GabariteJava /></PrivateRoute>} />
              <Route path="/generator" element={<PrivateRoute requireManageLessons={true}><Generator /></PrivateRoute>} />
              <Route path="/gerenciar" element={<PrivateRoute requireManageLessons={true}><GerenciarAulas /></PrivateRoute>} />

              <Route path="/admin" element={<PrivateRoute adminOnly={true}><AdminPanel /></PrivateRoute>} />

              {/* ROTA 404 (Catch-all) */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </Chrome>
      </BrowserRouter>
    </AuthProvider>
  );
}
