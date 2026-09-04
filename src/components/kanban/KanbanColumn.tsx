import React, { useState, useEffect } from "react";
import { Droppable, Draggable } from "@hello-pangea/dnd";
import { Aluno, AlunoStatus, AlertaInatividade } from "../../types";
import { getStatusLabel } from "../../utils/formatters";
import AlunoCard from "./AlunoCard";
import "./KanbanColumn.css";

const CARDS_POR_PAGINA = 40;

interface KanbanColumnProps {
  status: AlunoStatus;
  alunos: Aluno[];
  color: string;
  /** Total real da coluna (todos os colaboradores), sem detalhes. Só vem preenchido para quem não é admin. */
  totalGeral?: number;
  /** Alertas de inatividade por alunoId (E1). Vazio fora do Engajamento. */
  alertas?: Map<string, AlertaInatividade>;
  /**
   * Muda (ex: novo termo de busca) → volta a mostrar só os primeiros
   * CARDS_POR_PAGINA cards da coluna. Opcional; sem isso a coluna nunca
   * reseta sozinha (drag/edição não deve esconder cards já carregados).
   */
  resetSignal?: string;
  /** true enquanto qualquer card do board está sendo arrastado. */
  isDragging?: boolean;
}

// Otimização (Bloco B): React.memo evita re-renderizar uma coluna inteira
// quando a mudança foi em outra coluna. Só funciona de verdade porque
// KanbanBoard agora memoiza o agrupamento por status (ver KanbanBoard.tsx).
const KanbanColumn: React.FC<KanbanColumnProps> = React.memo(({
  status,
  alunos,
  color,
  totalGeral,
  alertas,
  resetSignal,
  isDragging = false,
}) => {
  const outrosNaColuna =
    typeof totalGeral === "number" ? Math.max(totalGeral - alunos.length, 0) : 0;

  const [visibleCount, setVisibleCount] = useState(CARDS_POR_PAGINA);

  useEffect(() => {
    setVisibleCount(CARDS_POR_PAGINA);
  }, [resetSignal]);

  const alunosVisiveis = alunos.slice(0, visibleCount);
  const restantes = alunos.length - alunosVisiveis.length;

  return (
    <Droppable droppableId={status} direction="vertical">
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className={[
            "kanban-column",
            snapshot.isDraggingOver ? "kanban-column--drag-over" : "",
            isDragging && !snapshot.isDraggingOver ? "kanban-column--drag-active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div className="column-header" style={{ borderLeftColor: color }}>
            <h3 className="column-title">{getStatusLabel(status)}</h3>
            <span className="column-count">{alunos.length}</span>
          </div>

          {outrosNaColuna > 0 && (
            <div className="column-outros-info">
              + {outrosNaColuna} de outros colaboradores
            </div>
          )}

          <div className="column-content">
            {alunos.length === 0 ? (
              <div className="empty-column">
                <p>
                  {snapshot.isDraggingOver
                    ? "Solte aqui"
                    : "Nenhum aluno neste estágio"}
                </p>
              </div>
            ) : (
              alunosVisiveis.map((aluno, index) => (
                <Draggable key={aluno.id} draggableId={aluno.id} index={index}>
                  {(dragProvided, dragSnapshot) => (
                    <div
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                      {...dragProvided.dragHandleProps}
                      style={{
                        ...dragProvided.draggableProps.style,
                        opacity: dragSnapshot.isDragging ? 0.9 : 1,
                      }}
                      data-dragging={dragSnapshot.isDragging ? "true" : undefined}
                    >
                      <AlunoCard
                        aluno={aluno}
                        alerta={alertas?.get(aluno.id)}
                      />
                    </div>
                  )}
                </Draggable>
              ))
            )}
            {provided.placeholder}
          </div>

          {restantes > 0 && (
            <button
              type="button"
              className="btn btn-secondary kanban-carregar-mais"
              onClick={() => setVisibleCount((v) => v + CARDS_POR_PAGINA)}
            >
              Carregar mais ({restantes} restantes)
            </button>
          )}
        </div>
      )}
    </Droppable>
  );
});

KanbanColumn.displayName = "KanbanColumn";

export default KanbanColumn;
