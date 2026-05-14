// frontend/src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Link, Navigate } from "react-router-dom";
import { LayoutDashboard, PlusCircle, Settings, BookOpen, LogOut, LogIn } from "lucide-react";
import { AuthProvider, useAuth } from "./context/AuthContext";

import Dashboard from "./pages/Dashboard";
import AdminPanel from "./pages/AdminPanel";
import GerenciarAulas from "./pages/GerenciarAulas"; // <--- NOVO IMPORT
import SingleLesson from "./pages/SingleLesson";
import Generator from "./pages/Generator";
import Login from "./pages/Login";
import Performance from './components/Performance';
import "./App.css";

// No componente PrivateRoute
const PrivateRoute = ({ children, adminOnly = false, requireManageLessons = false }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;
  
  // Se for admin, tem acesso a tudo
  if (user.role === 'admin') return children;

  // Bloqueia se a rota for apenas para Admin e o usuário não for
  if (adminOnly && user.role !== 'admin') return <Navigate to="/" />;

  // Bloqueia se a rota exigir permissão de gestão e o usuário não tiver
  if (requireManageLessons && !user.can_manage_lessons) return <Navigate to="/" />;

  return children;
};

// No componente NavBar
function NavBar() {
  const { user, logout } = useAuth();
  
  // Variável para facilitar a checagem de permissão de conteúdo
  const podeGerenciar = user?.role === 'admin' || user?.can_manage_lessons === true;

  return (
    <nav className="navbar">
      <div className="nav-container">
        <Link to="/" className="nav-logo">AgenteIA Edital</Link>
        
        <div className="nav-links">
          {user ? (
            <>
              <Link to="/" className="nav-item">
                <LayoutDashboard size={18}/> Dashboard
              </Link>

              {/* Ajustado: Aparece para Admin OU Usuário Habilitado */}
              {podeGerenciar && (
                <>
                  <Link to="/generator" className="nav-item">
                    <PlusCircle size={18}/> Nova Aula
                  </Link>
                  <Link to="/gerenciar" className="nav-item">
                    <BookOpen size={18}/> Gerenciar Aulas
                  </Link>
                </>
              )}

              {/* Apenas Admin vê a gestão de usuários */}
              {user.role === 'admin' && (
                <Link to="/admin" className="nav-item">
                  <Settings size={18}/> Usuários
                </Link>
              )}

              <button onClick={logout} className="nav-item" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
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
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
            <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
            <Route path="/aula/:id" element={<PrivateRoute><SingleLesson /></PrivateRoute>} />
            <Route path="/performance" element={<Performance />} />

            {/* Rotas de Aulas (Admin + Usuário Habilitado) */}
            <Route path="/generator" element={<PrivateRoute requireManageLessons={true}><Generator /></PrivateRoute>} />
            <Route path="/gerenciar" element={<PrivateRoute requireManageLessons={true}><GerenciarAulas /></PrivateRoute>} />
            
            {/* Rota de Usuários (Apenas Admin Global) */}
            <Route path="/admin" element={<PrivateRoute adminOnly={true}><AdminPanel /></PrivateRoute>} />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}