import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Users, CheckSquare, CalendarDays, ListTodo, TrendingDown, Contact } from "lucide-react";
import "./RematriculaTabs.css";

const TABS = [
  { path: "/alunos", label: "Alunos", icon: Users },
  { path: "/meus-contatos", label: "Meus Contatos", icon: Contact },
  { path: "/risco-evasao", label: "Risco de Evasão", icon: TrendingDown },
  { path: "/rematricula/tarefas", label: "Tarefas", icon: CheckSquare },
  { path: "/rematricula/agenda", label: "Agenda", icon: CalendarDays },
  { path: "/rematricula/calendario", label: "Calendário", icon: CalendarDays },
  { path: "/rematricula/painel-tarefas", label: "Painel de tarefas", icon: ListTodo },
];

const RematriculaTabs: React.FC = () => {
  const location = useLocation();
  const isActive = (path: string) => path === "/alunos"
    ? location.pathname.startsWith(path)
    : location.pathname === path;

  return (
    <div className="rematricula-tabs">
      {TABS.map((tab) => (
        <Link key={tab.path} to={tab.path} className={`rematricula-tab ${isActive(tab.path) ? "active" : ""}`} aria-current={isActive(tab.path) ? "page" : undefined}>
          <tab.icon size={16} />
          {tab.label}
        </Link>
      ))}
    </div>
  );
};

export default RematriculaTabs;
