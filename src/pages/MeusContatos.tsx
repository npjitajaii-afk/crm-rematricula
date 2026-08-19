import React, { useMemo } from "react";
import { useAlunos } from "../hooks/useAlunos";
import { useAuth } from "../hooks/useAuth";
import KanbanBoard from "../components/kanban/KanbanBoard";
import RematriculaTabs from "../components/RematriculaTabs";
import "./MeusContatos.css";

// "Meus Contatos": janela dentro da Rematrícula que reaproveita o mesmo
// Kanban da aba Alunos, mas mostrando só os alunos em que o colaborador
// logado é o responsável (assignedTo === user.id). Serve tanto pra admin
// (que também pode ter alunos assumidos) quanto pra colaborador.
const MeusContatos: React.FC = () => {
  const { filteredAlunos } = useAlunos();
  const { user } = useAuth();

  const totalMeus = useMemo(
    () =>
      filteredAlunos.filter(
        (a) => a.area === "rematricula" && a.assignedTo === user?.id
      ).length,
    [filteredAlunos, user]
  );

  return (
    <div className="meus-contatos-page">
      {/* Abas da seção Rematrícula (Alunos / Meus Contatos / Risco de Evasão) */}
      <RematriculaTabs />

      <div className="meus-contatos-header">
        <div>
          <h1>Meus Contatos</h1>
          <p className="meus-contatos-subtitle">
            {totalMeus} {totalMeus === 1 ? "aluno sob sua responsabilidade" : "alunos sob sua responsabilidade"}
          </p>
        </div>
      </div>

      <KanbanBoard area="rematricula" onlyMine />
    </div>
  );
};

export default MeusContatos;
