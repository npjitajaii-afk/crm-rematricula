import React, { useState, useEffect } from "react";
import { Droppable, Draggable } from "@hello-pangea/dnd";
import { Aluno, AlunoStatus, AlertaInatividade } from "../../types";
import { getStatusLabel } from "../../utils/formatters";
import AlunoCard from "./AlunoCard";
import "./KanbanColumn.css";

const CARDS_POR_PAGINA = 10;

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
}

// Otimização (Bloco B): React.memo evita re-renderizar uma coluna inteira
// quando a mudança foi em outra coluna. Só funciona de verdade porque
// KanbanBoard agora memoiza o agrupamento por status (ver KanbanBoard.tsx)
// — sem isso, o array `alunos` seria recriado a cada render e o memo não
// pegaria nenhuma mudança.
const KanbanColumn: React.FC<KanbanColumnProps> = React.memo(({
  status,
  alunos,
  color,
  totalGeral,
  alertas,
  resetSignal,
}) => {
  const outrosNaColuna =
    typeof totalGeral === "number" ? Math.max(totalGeral - alunos.length, 0) : 0;

  // Performance: colunas com muitos alunos (ex: "Pendente de Contato" numa
  // importação grande) só montam os primeiros 10 cards de cada vez, em vez
  // de todos de uma vez — cada AlunoCard carrega bastante coisa (badges,
  // ações, contexto). "Carregar mais" estende 10 em 10.
  const [visibleCount, setVisibleCount] = useState(CARDS_POR_PAGINA);

  useEffect(() => {
    setVisibleCount(CARDS_POR_PAGINA);
  }, [resetSignal]);

  const alunosVisiveis = alunos.slice(0, visibleCount);
  const restantes = alunos.length - alunosVisiveis.length;

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
              alunosVisiveis.map((aluno, index) => (
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
        )}
      </Droppable>

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
  );
});

KanbanColumn.displayName = "KanbanColumn";

export default KanbanColumn;