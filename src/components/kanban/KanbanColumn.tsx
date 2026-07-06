import React from "react";
import { Droppable, Draggable } from "@hello-pangea/dnd";
import { Aluno, AlunoStatus } from "../../types";
import { getStatusLabel } from "../../utils/formatters";
import AlunoCard from "./AlunoCard";
import "./KanbanColumn.css";

interface KanbanColumnProps {
  status: AlunoStatus;
  alunos: Aluno[];
  color: string;
  /** Total real da coluna (todos os colaboradores), sem detalhes. Só vem preenchido para quem não é admin. */
  totalGeral?: number;
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({
  status,
  alunos,
  color,
  totalGeral,
}) => {
  const outrosNaColuna =
    typeof totalGeral === "number" ? Math.max(totalGeral - alunos.length, 0) : 0;

  return (
    <div className="kanban-column">
      <div className="column-header" style={{ borderLeftColor: color }}>
        <h3 className="column-title">{getStatusLabel(status)}</h3>
        <span className="column-count">{alunos.length}</span>
      </div>

      {outrosNaColuna > 0 && (
        <div className="column-outros-info">
          + {outrosNaColuna} de outros colaboradores
        </div>
      )}

      <Droppable droppableId={status}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`column-content ${
              snapshot.isDraggingOver ? "dragging-over" : ""
            }`}
          >
            {alunos.length === 0 ? (
              <div className="empty-column">
                <p>Nenhum aluno neste estágio</p>
              </div>
            ) : (
              alunos.map((aluno, index) => (
                <Draggable key={aluno.id} draggableId={aluno.id} index={index}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      style={{
                        ...provided.draggableProps.style,
                        opacity: snapshot.isDragging ? 0.8 : 1,
                      }}
                    >
                      <AlunoCard aluno={aluno} />
                    </div>
                  )}
                </Draggable>
              ))
            )}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
};

export default KanbanColumn;
