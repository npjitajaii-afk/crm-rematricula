import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Sparkles, Contact, CheckSquare, CalendarDays, ListTodo } from "lucide-react";
import "./RematriculaTabs.css";

// Abas internas do funil de Engajamento — mesmo padrão do
// RematriculaTabs.tsx, mas só com "Alunos" e "Meus Contatos" (Engajamento
// não tem Risco de Evasão, que é exclusivo da Rematrícula).
const TABS = [
  { path: "/engajamento", label: "Alunos", icon: Sparkles },
  { path: "/engajamento/meus-contatos", label: "Meus Contatos", icon: Contact },
  { path: "/engajamento/tarefas", label: "Tarefas", icon: CheckSquare },
  { path: "/engajamento/agenda", label: "Agenda", icon: CalendarDays },
  { path: "/engajamento/calendario", label: "Calendário", icon: CalendarDays },
  { path: "/engajamento/painel-tarefas", label: "Painel de tarefas", icon: ListTodo },
];

const EngajamentoTabs: React.FC = () => {
  const location = useLocation();

  return (
    <div className="rematricula-tabs">
      {TABS.map((tab) => (
        <Link
          key={tab.path}
          to={tab.path}
          className={`rematricula-tab ${
            location.pathname === tab.path ? "active" : ""
          }`}
          aria-current={location.pathname === tab.path ? "page" : undefined}
        >
          <tab.icon size={16} />
          {tab.label}
        </Link>
      ))}
    </div>
  );
};

export default EngajamentoTabs;
