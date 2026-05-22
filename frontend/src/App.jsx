import React, { useState, useEffect, Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Link, Navigate, useLocation } from "react-router-dom";
import { LayoutDashboard, PlusCircle, Settings, BookOpen, LogOut, LogIn, Moon, Sun, Menu, X, UserCircle, Wrench } from "lucide-react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import "./App.css";

// 1. LAZY LOADING (Code Splitting)
const Dashboard = lazy(() => import("./pages/Dashboard"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const GerenciarAulas = lazy(() => import("./pages/GerenciarAulas")); 
const SingleLesson = lazy(() => import("./pages/SingleLesson"));
const Generator = lazy(() => import("./pages/Generator"));
const Login = lazy(() => import("./pages/Login"));
const Performance = lazy(() => import('./components/Performance'));
const OpenRouterCallback = lazy(() => import("./pages/OpenRouterCallback"));
const Profile = lazy(() => import("./pages/Profile"));
const TreinoDiscursiva = lazy(() => import("./pages/TreinoDiscursiva"));
const Ferramentas = lazy(() => import("./pages/Ferramentas")); // <-- NOVO IMPORT
const GabariteCespe = lazy(() => import("./pages/GabariteCespe"));
const GabariteLogica = lazy(() => import("./pages/GabariteLogica"));

// Componente de Carregamento para o Suspense
const LoadingFallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh', color: 'var(--text-secondary)' }}>
    <div className="spinner"></div> Carregando...
  </div>
);

// Rota 404 (Página Não Encontrada)
const NotFound = () => (
  <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-main)' }}>
    <h2>404 - Página Não Encontrada</h2>
    <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>O caminho que tentou acessar não existe.</p>
    <Link to="/" className="btn primary">Voltar ao Início</Link>
  </div>
);

// Componente PrivateRoute
const PrivateRoute = ({ children, adminOnly = false, requireManageLessons = false }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;
  
  if (user.role === 'admin') return children;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/" />;
  if (requireManageLessons && !user.can_manage_lessons) return <Navigate to="/" />;

  return children;
};

// Componente NavBar
function NavBar() {
  const { user, logout } = useAuth();
  const podeGerenciar = user?.role === 'admin' || user?.can_manage_lessons === true;
  const location = useLocation();

  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') === 'dark');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); 

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  // Fecha o menu mobile automaticamente ao mudar de rota
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location]);

  return (
    <nav className="navbar">
      <div className="nav-container">
        <Link to="/" className="nav-logo">AgenteIA Edital</Link>
        
        {/* Botão Hambúrguer (Mobile) */}
        <button 
          className="mobile-menu-btn" 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          style={{ background: 'none', border: 'none', color: 'var(--text-main)', cursor: 'pointer', display: 'none' }}
        >
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        <div className={`nav-links ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
          {/* Botão de Modo Noturno */}
          <button 
            onClick={() => setIsDark(!isDark)} 
            className="nav-item" 
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
            title="Alternar Tema"
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
            <span className="mobile-only-text" style={{ display: 'none' }}>Alternar Tema</span>
          </button>
          
          {user ? (
            <>
              <Link to="/" className="nav-item"><LayoutDashboard size={18}/> Dashboard</Link>
              
              {/* NOVA OPÇÃO NO MENU: HUB DE FERRAMENTAS */}
              <Link to="/ferramentas" className="nav-item"><Wrench size={18}/> Utilitários</Link>

              {podeGerenciar && (
                <>
                  <Link to="/generator" className="nav-item"><PlusCircle size={18}/> Nova Aula</Link>
                  <Link to="/gerenciar" className="nav-item"><BookOpen size={18}/> Gerenciar Aulas</Link>
                </>
              )}

              {user.role === 'admin' && (
                <Link to="/admin" className="nav-item"><Settings size={18}/> Painel Admin</Link>
              )}

              {/* Link para a página de perfil */}
              <Link to="/profile" className="nav-item user-info" style={{ cursor: 'pointer', transition: 'color 0.2s' }} title="Acessar Perfil">
                <UserCircle size={18}/> <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>{user.email.split('@')[0]}</span>
              </Link>

              <button onClick={logout} className="nav-item" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error-text)' }}>
                <LogOut size={18}/> Sair
              </button>
            </>
          ) : (
            <Link to="/login" className="nav-item"><LogIn size={18}/> Entrar</Link>
          )}
        </div>
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <NavBar />
        <div className="main-content">
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/login" element={<Login />} />
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

              <Route path="/generator" element={<PrivateRoute requireManageLessons={true}><Generator /></PrivateRoute>} />
              <Route path="/gerenciar" element={<PrivateRoute requireManageLessons={true}><GerenciarAulas /></PrivateRoute>} />
              
              <Route path="/admin" element={<PrivateRoute adminOnly={true}><AdminPanel /></PrivateRoute>} />

              {/* ROTA 404 (Catch-all) */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}