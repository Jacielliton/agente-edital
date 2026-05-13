// frontend/src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Link, Navigate } from "react-router-dom";
import { LayoutDashboard, PlusCircle, Settings, LogOut, LogIn } from "lucide-react";
import { AuthProvider, useAuth } from "./context/AuthContext";

import Dashboard from "./pages/Dashboard";
import AdminPanel from "./pages/AdminPanel";
import SingleLesson from "./pages/SingleLesson";
import Generator from "./pages/Generator";
import Login from "./pages/Login";
import Performance from './components/Performance';
import "./App.css";

// Componente para rotas protegidas
const PrivateRoute = ({ children, adminOnly = false }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/" />;
  return children;
};

function NavBar() {
  const { user, logout } = useAuth();

  return (
    <nav className="navbar">
      <div className="nav-container">
        <Link to="/" className="nav-logo">AgenteIA Edital</Link>
        
        <div className="nav-links">
          {user ? (
            <>
              {/* Todos veem o Dashboard */}
              <Link to="/" className="nav-item">
                <LayoutDashboard size={18}/> Dashboard
              </Link>

              {/* APENAS ADMIN vê Nova Aula */}
              {user.role === 'admin' && (
                <Link to="/generator" className="nav-item">
                  <PlusCircle size={18}/> Nova Aula
                </Link>
              )}

              {/* APENAS ADMIN vê Configurações/Admin */}
              {user.role === 'admin' && (
                <Link to="/admin" className="nav-item">
                  <Settings size={18}/> Admin
                </Link>
              )}

              <button 
                onClick={logout} 
                className="nav-item" 
                style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit' }}
              >
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
            
            {/* Rota Protegida (User e Admin) */}
            <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
            <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
            <Route path="/aula/:id" element={<PrivateRoute><SingleLesson /></PrivateRoute>} />
            <Route path="/performance" element={<Performance />} />

            {/* Rotas Exclusivas de Admin */}
            <Route path="/generator" element={
              <PrivateRoute adminOnly={true}>
                <Generator />
              </PrivateRoute>
            } />
            <Route path="/admin" element={
              <PrivateRoute adminOnly={true}>
                <AdminPanel />
              </PrivateRoute>
            } />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}