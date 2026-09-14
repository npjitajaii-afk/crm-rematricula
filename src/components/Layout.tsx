import React, { Suspense, useState } from "react";
import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useAlunos } from "../hooks/useAlunos";
import {
  LayoutDashboard,
  Users,
  BarChart2,
  Layers,
  UsersRound,
  UserCog,
  LifeBuoy,
  Sparkles,
  CircleUserRound,
  LogOut,
  Menu,
  X,
  Send,
  Loader2,
  MapPin,
  ArrowLeftRight,
} from "lucide-react";
import { Area } from "../types";
import NotificacoesSininho from "./NotificacoesSininho";
import ModalRecado from "./ModalRecado";
import "./Layout.css";

const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const { isAdmin, canGerenciarPolo, colaboradores } = useAlunos();
  const navigate = useNavigate();
  const location = useLocation();
  const [isRailOpen, setIsRailOpen] = useState(false);
  const [showRecado, setShowRecado] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  // Cada item pode ter `adminOnly` (gestão do polo: admin + supervisor) ou
  // `area` (colaborador só vê se o admin liberou aquela área pra ele).
  // Sem nenhum dos dois = visível pra todo mundo (ex: Minha área).
  //
  // Usuários e Polos são admin-only de verdade (path check no filter).
  //
  // "Rematrícula" passou a ser um único item de sidebar (em vez de dois:
  // Alunos + Risco de Evasão) — as duas telas agora vivem como abas dentro
  // dela (ver RematriculaTabs.tsx e App.tsx). O item leva pra /alunos (1ª
  // aba) e fica "ativo" também quando a rota é /risco-evasao.
  //
  // A ordem do menu é diferente para gestor (admin/supervisor) e colaborador
  // (pedido do usuário), por isso cada item tem `adminOrder` e `colabOrder`.
  const allMenuItems: {
    path: string;
    icon: typeof Users;
    label: string;
    adminOnly?: boolean;
    area?: Area;
    adminOrder: number;
    colabOrder?: number;
    isActive: (pathname: string) => boolean;
  }[] = [
    {
      path: "/dashboard",
      icon: LayoutDashboard,
      label: "Início",
      adminOnly: true,
      adminOrder: 1,
      isActive: (p) => p === "/dashboard",
    },
    {
      path: "/alunos",
      icon: Users,
      label: "Rematrícula",
      area: "rematricula",
      adminOrder: 2,
      colabOrder: 2,
      isActive: (p) =>
        p.startsWith("/alunos") ||
        p.startsWith("/meus-contatos") ||
        p.startsWith("/risco-evasao") ||
        p.startsWith("/rematricula/"),
    },
    {
      path: "/engajamento",
      icon: Sparkles,
      label: "Engajamento",
      area: "engajamento",
      adminOrder: 3,
      colabOrder: 3,
      // Engajamento agora tem abas (Alunos / Meus Contatos, ver
      // EngajamentoTabs.tsx) — mesmo critério usado no item "Rematrícula"
      // logo acima, pra continuar marcado como ativo em qualquer aba.
      isActive: (p) => p.startsWith("/engajamento"),
    },
    {
      path: "/retencao",
      icon: LifeBuoy,
      label: "Retenção",
      area: "retencao",
      adminOrder: 4,
      colabOrder: 1,
      isActive: (p) => p === "/retencao",
    },
    {
      path: "/metricas",
      icon: BarChart2,
      label: "Métricas",
      adminOnly: true,
      adminOrder: 5,
      isActive: (p) => p === "/metricas",
    },
    {
      path: "/grupos",
      icon: Layers,
      label: "Grupos",
      adminOnly: true,
      adminOrder: 6,
      isActive: (p) => p === "/grupos",
    },
    {
      path: "/colaboradores",
      icon: UsersRound,
      label: "Colaboradores",
      adminOnly: true,
      adminOrder: 7,
      isActive: (p) => p === "/colaboradores",
    },
    {
      path: "/transferencias",
      icon: ArrowLeftRight,
      label: "Transferências",
      adminOnly: true,
      adminOrder: 7.5,
      isActive: (p) => p === "/transferencias",
    },
    {
      path: "/polos",
      icon: MapPin,
      label: "Polos",
      adminOnly: true,
      adminOrder: 8,
      isActive: (p) => p === "/polos",
    },
    {
      path: "/usuarios",
      icon: UserCog,
      label: "Usuários",
      adminOnly: true,
      adminOrder: 9,
      isActive: (p) => p === "/usuarios",
    },
    {
      path: "/minha-area",
      icon: CircleUserRound,
      label: "Minha área",
      adminOrder: 10,
      colabOrder: 5,
      isActive: (p) => p === "/minha-area",
    },
  ];

  const menuItems = allMenuItems
    .filter((item) => {
      if (isAdmin) return true;
      // Usuários e Polos: exclusivamente admin
      if (item.path === "/usuarios" || item.path === "/polos") return false;
      // Transferências: só supervisor com funil de engajamento liberado
      // (colaborador nunca vê, mesmo com engajamento liberado)
      if (item.path === "/transferencias") {
        return (
          !!canGerenciarPolo &&
          !!user?.areasPermitidas?.includes("engajamento")
        );
      }
      // Métricas, Colaboradores, Dashboard, Grupos: admin + supervisor
      if (item.adminOnly) return !!canGerenciarPolo;
      if (item.area) return !!user?.areasPermitidas?.includes(item.area);
      return true;
    })
    .sort((a, b) => {
      const useGestorOrder = isAdmin || !!canGerenciarPolo;
      const orderA = useGestorOrder ? a.adminOrder : a.colabOrder ?? a.adminOrder;
      const orderB = useGestorOrder ? b.adminOrder : b.colabOrder ?? b.adminOrder;
      return orderA - orderB;
    });

  const isActive = (item: (typeof allMenuItems)[number]) =>
    item.isActive(location.pathname);
  const initial = (user?.name ?? "?").trim().charAt(0).toUpperCase();

  return (
    <div className="layout">
      <aside className={`rail ${isRailOpen ? "open" : ""}`}>
        <div className="rail-brand">
          <div className="rail-brand-badge">B</div>
          <span className="rail-brand-name">Bask CRM</span>
          <button
            className="rail-close"
            onClick={() => setIsRailOpen(false)}
            aria-label="Fechar menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="rail-nav">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`rail-btn ${isActive(item) ? "active" : ""}`}
              onClick={() => setIsRailOpen(false)}
            >
              <item.icon size={19} />
              <span className="rail-label">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="rail-spacer" />

        <div className="rail-footer">
          <div className="rail-user">
            <div className="rail-user-avatar">{initial}</div>
            <div className="rail-user-text">
              <span className="rail-user-name">{user?.name}</span>
              <span className="rail-user-role">
                {user?.role === "admin"
                  ? "Admin"
                  : user?.role === "supervisor"
                  ? "Supervisor"
                  : "Colaborador"}
              </span>
            </div>
          </div>
          <button className="rail-btn rail-logout" onClick={handleLogout}>
            <LogOut size={19} />
            <span className="rail-label">Sair</span>
          </button>
        </div>
      </aside>

      {isRailOpen && (
        <div className="rail-overlay" onClick={() => setIsRailOpen(false)} />
      )}

      <div className="main-col">
        <header className="topbar">
          <button
            className="rail-toggle"
            onClick={() => setIsRailOpen(!isRailOpen)}
            aria-label="Abrir menu"
          >
            <Menu size={22} />
          </button>

          <span className="topbar-title">Bask CRM</span>

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
          </div>
        </header>

        {showRecado && (
          <ModalRecado
            onClose={() => setShowRecado(false)}
            colaboradores={colaboradores}
          />
        )}

        <main className="content">
          <Suspense
            fallback={
              <div className="page-loader">
                <Loader2
                  size={32}
                  className="spin"
                  style={{ color: "var(--primary)" }}
                />
                <p style={{ color: "var(--text-secondary)" }}>Carregando...</p>
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
};

export default Layout;