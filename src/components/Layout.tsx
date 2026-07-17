import React, { useState } from "react";
import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useAlunos } from "../hooks/useAlunos";
import {
  LayoutDashboard,
  Users,
  BarChart2,
  LogOut,
  Menu,
  X,
  User,
  Send,
} from "lucide-react";
import NotificacoesSininho from "./NotificacoesSininho";
import ModalRecado from "./ModalRecado";
import "./Layout.css";

const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const { isAdmin, colaboradores } = useAlunos();
  const navigate = useNavigate();
  const location = useLocation();
  const [isRailOpen, setIsRailOpen] = useState(false);
  const [showRecado, setShowRecado] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  // Mesmos itens de navegação de sempre — só a apresentação visual mudou
  // (de lista com texto para ícones com tooltip, como no rail escuro).
  const menuItems = [
    { path: "/dashboard", icon: LayoutDashboard, label: "Pipeline" },
    { path: "/alunos", icon: Users, label: "Alunos" },
    { path: "/metricas", icon: BarChart2, label: "Métricas" },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="layout">
      <header className="topbar">
        <button
          className="rail-toggle"
          onClick={() => setIsRailOpen(!isRailOpen)}
          aria-label="Abrir menu"
        >
          <Menu size={22} />
        </button>

        <div className="topbar-logo">
          <LayoutDashboard size={22} />
          <span>CRM Rematrícula</span>
        </div>

        <div className="topbar-spacer" />

        <div className="topbar-actions">
          {isAdmin && (
            <button
              className="topbar-icon-btn"
              onClick={() => setShowRecado(true)}
              title="Enviar recado"
              aria-label="Enviar recado"
            >
              <Send size={18} />
            </button>
          )}

          <NotificacoesSininho />

          <div className="topbar-user">
            <div className="user-avatar-small">
              <User size={16} />
            </div>
            <div className="topbar-user-text">
              <span className="user-name-header">{user?.name}</span>
              <span className="user-email-header">{user?.email}</span>
            </div>
          </div>

          <button
            className="topbar-logout"
            onClick={handleLogout}
            title="Sair"
            aria-label="Sair"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {showRecado && (
        <ModalRecado
          onClose={() => setShowRecado(false)}
          colaboradores={colaboradores}
        />
      )}

      <div className="body-row">
        <aside className={`rail ${isRailOpen ? "open" : ""}`}>
          <button
            className="rail-close"
            onClick={() => setIsRailOpen(false)}
            aria-label="Fechar menu"
          >
            <X size={18} />
          </button>

          <nav className="rail-nav">
            {menuItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`rail-btn ${isActive(item.path) ? "active" : ""}`}
                onClick={() => setIsRailOpen(false)}
              >
                <item.icon size={20} />
                <span className="rail-label">{item.label}</span>
                <span className="rail-tip">{item.label}</span>
              </Link>
            ))}
          </nav>

          <div className="rail-spacer" />

          <button className="rail-btn rail-logout-mobile" onClick={handleLogout}>
            <LogOut size={20} />
            <span className="rail-label">Sair</span>
          </button>
        </aside>

        <main className="content">
          <Outlet />
        </main>
      </div>

      {isRailOpen && (
        <div className="rail-overlay" onClick={() => setIsRailOpen(false)} />
      )}
    </div>
  );
};

export default Layout;
