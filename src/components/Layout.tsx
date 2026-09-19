import React, { Suspense, useState, useEffect, useCallback, useRef } from "react";
import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useAlunos } from "../hooks/useAlunos";
import { useTransferenciasPendentes } from "../hooks/useTransferenciasPendentes";
import { useTheme } from "../hooks/useTheme";
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
  ClipboardList,
  Sun,
  Moon,
  Monitor,
  Pin,
  PinOff,
} from "lucide-react";
import { Area } from "../types";
import NotificacoesSininho from "./NotificacoesSininho";
import ModalRecado from "./ModalRecado";
import "./Layout.css";

const PINNED_STORAGE_KEY = "bask-crm-pinned-tabs";

function readPinnedPaths(): string[] {
  try {
    const raw = localStorage.getItem(PINNED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((p) => typeof p === "string") : [];
  } catch {
    return [];
  }
}

function savePinnedPaths(paths: string[]) {
  try {
    localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(paths));
  } catch {
    /* ignore */
  }
}

/** Interpola duas cores hex (#rrggbb) pelo fator t (0–1). */
function lerpHex(a: string, b: string, t: number): string {
  const parse = (h: string) => {
    const n = h.replace("#", "");
    return [
      parseInt(n.slice(0, 2), 16),
      parseInt(n.slice(2, 4), 16),
      parseInt(n.slice(4, 6), 16),
    ];
  };
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${[r, g, bl].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Tokens claros → escuros usados na prévia enquanto arrasta o slider. */
const THEME_BLEND = {
  light: {
    "--bg-primary": "#ffffff",
    "--bg-secondary": "#f4f4f5",
    "--bg-elevated": "#ffffff",
    "--surface": "#ffffff",
    "--text-primary": "#18181b",
    "--text-secondary": "#71717a",
    "--gray-50": "#fafafa",
    "--gray-100": "#f4f4f5",
    "--gray-200": "#e4e4e7",
  },
  dark: {
    "--bg-primary": "#0f0f12",
    "--bg-secondary": "#18181b",
    "--bg-elevated": "#1c1c21",
    "--surface": "#1c1c21",
    "--text-primary": "#f4f4f5",
    "--text-secondary": "#a1a1aa",
    "--gray-50": "#18181b",
    "--gray-100": "#27272a",
    "--gray-200": "#3f3f46",
  },
} as const;

function applyThemeBlend(t: number) {
  const root = document.documentElement;
  const clamped = Math.min(1, Math.max(0, t));
  (Object.keys(THEME_BLEND.light) as (keyof typeof THEME_BLEND.light)[]).forEach(
    (key) => {
      root.style.setProperty(
        key,
        lerpHex(THEME_BLEND.light[key], THEME_BLEND.dark[key], clamped)
      );
    }
  );
}

function clearThemeBlend() {
  const root = document.documentElement;
  (Object.keys(THEME_BLEND.light) as (keyof typeof THEME_BLEND.light)[]).forEach(
    (key) => {
      root.style.removeProperty(key);
    }
  );
}

type ThemePref = "light" | "dark" | "system";

const THEME_ORDER: ThemePref[] = ["light", "system", "dark"];

function preferenceToT(pref: ThemePref): number {
  const i = THEME_ORDER.indexOf(pref);
  return i < 0 ? 0 : i / (THEME_ORDER.length - 1);
}

function tToPreference(t: number): ThemePref {
  if (t < 0.33) return "light";
  if (t < 0.66) return "system";
  return "dark";
}

const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const { isAdmin, canGerenciarPolo, colaboradores } = useAlunos();
  const { totalPendentes, totalAguardandoGestor } = useTransferenciasPendentes();
  const { preference, setPreference } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [isRailOpen, setIsRailOpen] = useState(false);
  const [showRecado, setShowRecado] = useState(false);
  const [pinnedPaths, setPinnedPaths] = useState<string[]>(() => readPinnedPaths());
  const themeSliderRef = useRef<HTMLDivElement>(null);
  const draggingThemeRef = useRef(false);
  const [themeDragT, setThemeDragT] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    path: string;
  } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Badge na aba Transferências: prioriza as que aguardam o gestor;
  // se não houver, mostra o total de pendentes do polo.
  const badgeTransferencias =
    totalAguardandoGestor > 0 ? totalAguardandoGestor : totalPendentes;

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const togglePin = useCallback((path: string) => {
    setPinnedPaths((prev) => {
      const next = prev.includes(path)
        ? prev.filter((p) => p !== path)
        : [...prev, path];
      savePinnedPaths(next);
      return next;
    });
    setContextMenu(null);
  }, []);

  // Fecha menu de contexto ao clicar fora / Escape
  useEffect(() => {
    if (!contextMenu) return;
    const onDown = (e: MouseEvent) => {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(e.target as Node)
      ) {
        setContextMenu(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

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
      path: "/relatorio",
      icon: ClipboardList,
      label: "Relatório",
      adminOnly: true,
      adminOrder: 5.5,
      isActive: (p) => p === "/relatorio",
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
      // Polos: creator (estrutura) e admin (setores do próprio polo)
      if (item.path === "/polos") return !!isAdmin;
      // Usuários: creator (todos) ou admin (próprio polo — filtro no backend)
      if (item.path === "/usuarios") return !!isAdmin;
      if (isAdmin) return true;
      // Transferências: supervisor com engajamento (ou admin/creator já retornaram)
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
      // Fixados sempre no topo (ordem em que foram fixados)
      const aPinned = pinnedPaths.includes(a.path);
      const bPinned = pinnedPaths.includes(b.path);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      if (aPinned && bPinned) {
        return pinnedPaths.indexOf(a.path) - pinnedPaths.indexOf(b.path);
      }
      const useGestorOrder = isAdmin || !!canGerenciarPolo;
      const orderA = useGestorOrder ? a.adminOrder : a.colabOrder ?? a.adminOrder;
      const orderB = useGestorOrder ? b.adminOrder : b.colabOrder ?? b.adminOrder;
      return orderA - orderB;
    });

  const isActive = (item: (typeof allMenuItems)[number]) =>
    item.isActive(location.pathname);
  const initial = (user?.name ?? "?").trim().charAt(0).toUpperCase();

  const themeOptions: {
    value: ThemePref;
    icon: typeof Sun;
    label: string;
  }[] = [
    { value: "light", icon: Sun, label: "Claro" },
    { value: "system", icon: Monitor, label: "Sistema" },
    { value: "dark", icon: Moon, label: "Escuro" },
  ];

  const themeT =
    themeDragT !== null ? themeDragT : preferenceToT(preference as ThemePref);
  const themeThumbLeft = `calc(16.666% + ${themeT * 66.668}%)`;

  const themeTFromClientX = useCallback((clientX: number) => {
    const el = themeSliderRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const pad = 17; // metade do botão — zona útil interna
    const x = clientX - rect.left - pad;
    const w = Math.max(1, rect.width - pad * 2);
    return Math.min(1, Math.max(0, x / w));
  }, []);

  const endThemeDrag = useCallback(
    (clientX?: number) => {
      if (!draggingThemeRef.current) return;
      draggingThemeRef.current = false;
      const t =
        clientX !== undefined ? themeTFromClientX(clientX) : themeDragT ?? 0;
      const next = tToPreference(t);
      clearThemeBlend();
      setThemeDragT(null);
      setPreference(next);
    },
    [setPreference, themeDragT, themeTFromClientX]
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!draggingThemeRef.current) return;
      const t = themeTFromClientX(e.clientX);
      setThemeDragT(t);
      applyThemeBlend(t);
    };
    const onUp = (e: PointerEvent) => {
      endThemeDrag(e.clientX);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [endThemeDrag, themeTFromClientX]);

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
          {menuItems.map((item) => {
            const pinned = pinnedPaths.includes(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`rail-btn ${isActive(item) ? "active" : ""} ${
                  pinned ? "pinned" : ""
                }`}
                onClick={() => setIsRailOpen(false)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    path: item.path,
                  });
                }}
              >
                <item.icon size={19} />
                <span className="rail-label">{item.label}</span>
                {pinned && (
                  <Pin size={12} className="rail-pin-icon" aria-hidden />
                )}
                {item.path === "/transferencias" && badgeTransferencias > 0 && (
                  <span
                    className="rail-badge"
                    title={`${badgeTransferencias} transferência(s) pendente(s)`}
                  >
                    {badgeTransferencias > 99 ? "99+" : badgeTransferencias}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="rail-spacer" />

        <div className="rail-footer">
          <div className="rail-user">
            <div className="rail-user-avatar">{initial}</div>
            <div className="rail-user-text">
              <span className="rail-user-name">{user?.name}</span>
              <span className="rail-user-role">
                {user?.role === "creator"
                  ? "Creator"
                  : user?.role === "admin"
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

      {/* Menu de contexto para fixar/desafixar aba */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="rail-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          role="menu"
        >
          <button
            type="button"
            className="rail-context-item"
            role="menuitem"
            onClick={() => togglePin(contextMenu.path)}
          >
            {pinnedPaths.includes(contextMenu.path) ? (
              <>
                <PinOff size={14} />
                <span>Desafixar aba</span>
              </>
            ) : (
              <>
                <Pin size={14} />
                <span>Fixar no topo</span>
              </>
            )}
          </button>
        </div>
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
            <div
              ref={themeSliderRef}
              className={`theme-slider${themeDragT !== null ? " dragging" : ""}`}
              role="slider"
              aria-label="Tema da interface"
              aria-valuemin={0}
              aria-valuemax={2}
              aria-valuenow={Math.round(themeT * 2)}
              aria-valuetext={
                themeOptions[Math.round(themeT * 2)]?.label ?? "Tema"
              }
              onPointerDown={(e) => {
                // Clique na trilha também inicia o arraste / define posição
                if ((e.target as HTMLElement).closest(".theme-slider-btn")) {
                  return;
                }
                e.preventDefault();
                draggingThemeRef.current = true;
                const t = themeTFromClientX(e.clientX);
                setThemeDragT(t);
                applyThemeBlend(t);
                (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
              }}
            >
              <span
                className="theme-slider-thumb"
                style={{ left: themeThumbLeft }}
                aria-hidden
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  draggingThemeRef.current = true;
                  const t = themeTFromClientX(e.clientX);
                  setThemeDragT(t);
                  applyThemeBlend(t);
                }}
              />
              {themeOptions.map(({ value, icon: Icon, label }, idx) => (
                <button
                  key={value}
                  type="button"
                  className={`theme-slider-btn${
                    themeDragT === null && preference === value ? " active" : ""
                  }${
                    themeDragT !== null && Math.round(themeT * 2) === idx
                      ? " active"
                      : ""
                  }`}
                  onClick={() => {
                    clearThemeBlend();
                    setThemeDragT(null);
                    setPreference(value);
                  }}
                  title={label}
                  aria-label={label}
                  aria-pressed={preference === value}
                >
                  <Icon size={15} />
                </button>
              ))}
            </div>

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
