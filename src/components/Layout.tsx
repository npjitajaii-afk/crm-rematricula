import React, { useState } from "react";
import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Home, Users, LogOut, Menu, X, User, Briefcase, UsersRound } from "lucide-react";
import "./Layout.css";

const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const isAdmin = user?.role === "admin";
  const isColaborador = user?.role === "colaborador";

  const menuItems = [
    { path: "/dashboard", icon: Home, label: "Início" },
    ...(isColaborador
      ? [{ path: "/minha-area", icon: Briefcase, label: "Minha Área" }]
      : []),
    { path: "/alunos", icon: Users, label: "Geral" },
    ...(isAdmin
      ? [{ path: "/colaboradores", icon: UsersRound, label: "Colaboradores" }]
      : []),
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="layout">
      <aside className={`sidebar ${isSidebarOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          <div className="logo">
            <Home size={28} />
            <span>CRM Rematrícula</span>
          </div>
          <button
            className="sidebar-close"
            onClick={() => setIsSidebarOpen(false)}
          >
            <X size={24} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-item ${isActive(item.path) ? "active" : ""}`}
              onClick={() => setIsSidebarOpen(false)}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">
              <User size={20} />
            </div>
            <div className="user-details">
              <p className="user-name">{user?.name}</p>
              <p className="user-email">{user?.email}</p>
              <p className="user-role-badge">{isAdmin ? "Admin" : "Colaborador"}</p>
            </div>
          </div>
          <button
            className="btn btn-danger btn-sm w-full"
            onClick={handleLogout}
          >
            <LogOut size={18} />
            Sair
          </button>
        </div>
      </aside>

      <div className="main-content">
        <header className="header">
          <button
            className="menu-button"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          >
            <Menu size={24} />
          </button>

          <div className="header-user">
            <div className="user-avatar-small">
              <User size={18} />
            </div>
            <span className="user-name-header">{user?.name}</span>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>

      {isSidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </div>
  );
};

export default Layout;
