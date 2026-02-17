import React from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { LayoutDashboard, PlusCircle, Settings } from "lucide-react";

// Importe suas páginas
import Dashboard from "./pages/Dashboard";
import AdminPanel from "./pages/AdminPanel";
import SingleLesson from "./pages/SingleLesson";
import Generator from "./pages/Generator"; // Seu antigo App.jsx renomeado

import "./App.css";

function NavBar() {
  return (
    <nav className="navbar">
      <div className="nav-container">
        <Link to="/" className="nav-logo">Professor AI</Link>
        <div className="nav-links">
          <Link to="/" className="nav-item"><LayoutDashboard size={18}/> Dashboard</Link>
          <Link to="/generator" className="nav-item"><PlusCircle size={18}/> Nova Aula</Link>
          <Link to="/admin" className="nav-item"><Settings size={18}/> Admin</Link>
        </div>
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <NavBar />
      <div className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/admin" element={<AdminPanel />} />
          <Route path="/generator" element={<Generator />} />
          <Route path="/aula/:id" element={<SingleLesson />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}