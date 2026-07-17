import React from "react";
import { DragDropContext, DropResult } from "@hello-pangea/dnd";
import { useAlunos } from "../../hooks/useAlunos";
import { useToast } from "../../hooks/useToast";
import { AlunoStatus } from "../../types";
import { getStatusColor } from "../../utils/formatters";
import KanbanColumn from "./KanbanColumn";
import "./KanbanBoard.css";

const KanbanBoard: React.FC = () => {
  const { filteredAlunos, updateAluno, statusResumo, isAdmin } = useAlunos();
  const { showToast } = useToast();

  const statuses: AlunoStatus[] = [
    "pendente",
    "contatado",
    "aguardando_retorno",
    "confirmado",
    "documentacao",
    "rematriculado",
    "desistente",
  ];

  const getAlunosByStatus = (status: AlunoStatus) => {
    return filteredAlunos.filter((aluno) => aluno.status === status);
  };

  const getTotalByStatus = (status: AlunoStatus) => {
    return statusResumo.find((r) => r.status === status)?.total;
  };

  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (
      !destination ||
      (destination.droppableId === source.droppableId &&
        destination.index === source.index)
    ) {
      return;
    }

    const newStatus = destination.droppableId as AlunoStatus;

    try {
      await updateAluno(draggableId, { status: newStatus });
    } catch (error) {
      console.error("Erro ao atualizar status do aluno:", error);
      showToast("Erro ao mover aluno. Tente novamente.", "error");
    }
  };

  return (
    <div className="kanban-board-wrapper">
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="kanban-board">
          {statuses.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              alunos={getAlunosByStatus(status)}
              color={getStatusColor(status)}
              totalGeral={isAdmin ? undefined : getTotalByStatus(status)}
            />
          ))}
        </div>
      </DragDropContext>
    </div>
  );
};

export default KanbanBoard;