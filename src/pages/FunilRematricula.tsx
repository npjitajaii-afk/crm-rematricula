import React from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import {
  LayoutDashboard,
  Users,
  TrendingDown,
  BarChart2,
  Layers,
  UsersRound,
  UserCog,
} from "lucide-react";
import Dashboard from "./Dashboard";
import Alunos from "./Alunos";
import RiscoEvasao from "./RiscoEvasao";
import MetricasDashboard from "./MetricasDashboard";
import Grupos from "./Grupos";
import Colaboradores from "./Colaboradores";
import Usuarios from "./Usuarios";
import "./FunilRematricula.css";

// D1 (Início/Alunos/Risco de Evasão) + D4 (Métricas/Grupos/Colaboradores/
// Usuários) — página que consolida as 7 abas do Funil de Rematrícula numa
// única rota, reaproveitando os componentes já existentes sem alterar a
// lógica interna deles (ver README seção 4).
//
// Regra de acesso de cada aba replicada 1:1 do que já existia em
// App.tsx/AdminRoute/AreaRoute antes desta página existir — nenhuma aba
// ficou mais aberta ou mais fechada do que já era:
//   dashboard (Início)  -> AdminRoute
//   alunos               -> AreaRoute area="rematricula"
//   risco-evasao          -> AdminRoute
//   metricas               -> AdminRoute
//   grupos                  -> AdminRoute
//   colaboradores             -> AdminRoute
//   usuarios                   -> AdminRoute
type TabId =
  | "inicio"
  | "alunos"
  | "risco-evasao"
  | "metricas"
  | "grupos"
  | "colaboradores"
  | "usuarios";

interface TabConfig {
  id: TabId;
  label: string;
  icon: typeof Users;
  // Mesmo critério de acesso já usado em Layout.tsx / AdminRoute / AreaRoute,
  // só que aplicado aqui à aba em vez de à rota inteira.
  temAcesso: (isAdmin: boolean, areasPermitidas: string[]) => boolean;
  render: () => React.ReactNode;
}

const TABS: TabConfig[] = [
  {
    id: "inicio",
    label: "Início",
    icon: LayoutDashboard,
    // Dashboard hoje é adminOnly (ver App.tsx) — mantido aqui.
    temAcesso: (isAdmin) => isAdmin,
    render: () => <Dashboard />,
  },
  {
    id: "alunos",
    label: "Alunos",
    icon: Users,
    // Alunos hoje é AreaRoute area="rematricula" — mantido aqui.
    temAcesso: (isAdmin, areas) => isAdmin || areas.includes("rematricula"),
    render: () => <Alunos />,
  },
  {
    id: "risco-evasao",
    label: "Risco de Evasão",
    icon: TrendingDown,
    // Risco de Evasão hoje é adminOnly (ver App.tsx) — mantido aqui.
    temAcesso: (isAdmin) => isAdmin,
    render: () => <RiscoEvasao />,
  },
  {
    id: "metricas",
    label: "Métricas",
    icon: BarChart2,
    // Métricas hoje é adminOnly (ver App.tsx) — mantido aqui.
    temAcesso: (isAdmin) => isAdmin,
    render: () => <MetricasDashboard />,
  },
  {
    id: "grupos",
    label: "Grupos",
    icon: Layers,
    // Grupos hoje é adminOnly (ver App.tsx) — mantido aqui.
    temAcesso: (isAdmin) => isAdmin,
    render: () => <Grupos />,
  },
  {
    id: "colaboradores",
    label: "Colaboradores",
    icon: UsersRound,
    // Acesso só admin, conforme pedido (ver README seção 4.2).
    temAcesso: (isAdmin) => isAdmin,
    render: () => <Colaboradores />,
  },
  {
    id: "usuarios",
    label: "Usuários",
    icon: UserCog,
    // Acesso só admin, conforme pedido (ver README seção 4.2).
    temAcesso: (isAdmin) => isAdmin,
    render: () => <Usuarios />,
  },
];

const FunilRematricula: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const areasPermitidas = user?.areasPermitidas ?? [];

  // Lista de itens fixos — filtro simples, sem necessidade de useMemo
  // (evitava um array novo em `areasPermitidas` a cada render, que
  // deixava a dependência do memo sempre "diferente").
  const tabsVisiveis = TABS.filter((tab) =>
    tab.temAcesso(isAdmin, areasPermitidas)
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab") as TabId | null;

  const activeTab: TabId | null =
    (tabParam && tabsVisiveis.some((t) => t.id === tabParam) && tabParam) ||
    tabsVisiveis[0]?.id ||
    null;

  const handleTabClick = (id: TabId) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", id);
      return next;
    });
  };

  if (!activeTab) {
    return (
      <div className="funil-vazio">
        <p>Nenhuma área liberada para o seu usuário ainda.</p>
      </div>
    );
  }

  return (
    <div className="funil-rematricula">
      <div className="funil-tabs" role="tablist" aria-label="Funil de Rematrícula">
        {tabsVisiveis.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`funil-tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => handleTabClick(tab.id)}
          >
            <tab.icon size={17} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="funil-tab-content">
        {tabsVisiveis.map((tab) => (
          // Mantém as abas não-ativas montadas (display:none) em vez de
          // desmontar/remontar a cada clique — evita refazer fetch/estado
          // interno (filtros, busca, seleção) de cada aba toda vez que o
          // usuário troca de aba.
          <div
            key={tab.id}
            style={{ display: activeTab === tab.id ? "block" : "none" }}
          >
            {tab.render()}
          </div>
        ))}
      </div>
    </div>
  );
};

export default FunilRematricula;