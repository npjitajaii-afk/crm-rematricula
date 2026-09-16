import React, { useMemo, useCallback, useEffect, useRef, useState } from "react";
import { DragDropContext, DropResult } from "@hello-pangea/dnd";
import { useAlunos } from "../../hooks/useAlunos";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";
import { Area, AlunoStatus, AlertaInatividade } from "../../types";
import { AREA_CONFIG } from "../../config/areas";
import { getAlertasInatividade } from "../../services/engajamentoAlertaService";
import KanbanColumn from "./KanbanColumn";
import "./KanbanBoard.css";

interface KanbanBoardProps {
  /** Qual funil este board exibe. Default "rematricula" mantém o comportamento atual. */
  area?: Area;
  /**
   * Quando true, mostra só os alunos em que o usuário logado é o
   * responsável (assignedTo === user.id). Usado pelo board "Meus
   * Contatos" dentro da Rematrícula, que reaproveita este mesmo
   * componente em vez de duplicar a lógica do Kanban.
   */
  onlyMine?: boolean;
  /**
   * Busca LOCAL, aplicada só neste board (nome/e-mail/telefone/RA).
   * Isolada de propósito: não usa `filters`/`setFilters` do AlunosContext,
   * para que a busca de uma sub-aba (ex.: Meus Contatos) nunca interfira
   * em outra (Alunos, Engajamento, Risco de Evasão etc.).
   */
  searchTerm?: string;
}

const KanbanBoard: React.FC<KanbanBoardProps> = ({
  area = "rematricula",
  onlyMine = false,
  searchTerm,
}) => {
  // Lista completa (`alunos`), nunca `filteredAlunos` do contexto:
  // filtros/busca de outras abas não podem contaminar este board.
  const { alunos, updateAluno, statusResumo, isAdmin } = useAlunos();
  const { user } = useAuth();
  const { showToast } = useToast();
  const boardWrapperRef = useRef<HTMLDivElement>(null);
  const arrastandoCardRef = useRef(false);
  const ponteiroXRef = useRef<number | null>(null);
  const animacaoAutoScrollRef = useRef<number | null>(null);
  const panRef = useRef<{ pointerId: number; startX: number; startScrollLeft: number } | null>(null);
  const [arrastandoQuadro, setArrastandoQuadro] = useState(false);
  // Enquanto um card está sendo arrastado, as colunas mostram TODOS os
  // alunos (não só a página de 10). Sem isso o @hello-pangea/dnd calcula
  // índices errados e o card às vezes cai na coluna/posição errada.
  const [arrastandoCard, setArrastandoCard] = useState(false);

  const config = AREA_CONFIG[area];
  const statuses = config.statuses;

  // Alerta de inatividade (E1): só existe no funil de Engajamento. Busca
  // uma vez ao montar o board — não precisa recalcular a cada
  // drag/edição, então fica fora do useMemo de agrupamento por status.
  const [alertas, setAlertas] = useState<Map<string, AlertaInatividade>>(
    new Map()
  );

  useEffect(() => {
    if (area !== "engajamento") return;

    let ativo = true;
    getAlertasInatividade().then(({ data, error }) => {
      if (!ativo) return;
      if (error) {
        console.error("Erro ao buscar alertas de inatividade:", error);
        showToast("Não foi possível carregar os alertas de inatividade.", "error");
        return;
      }
      setAlertas(data);
    });

    return () => {
      ativo = false;
    };
  }, [area, showToast]);

  // Otimização (Bloco B): antes cada render recalculava um novo array por
  // coluna com .filter() — como um card de UMA coluna mudando recriava o
  // array de TODAS as colunas, o board inteiro re-renderizava a cada drag
  // ou edição, mesmo memoizando KanbanColumn (ver README.md Bloco B). Agora
  // o agrupamento por status é feito uma única vez por mudança real de
  // dados, então uma coluna cujo conteúdo não mudou mantém a mesma
  // referência de array entre renders — e o React.memo de KanbanColumn
  // (abaixo) passa a realmente evitar o re-render dela.
  const alunosPorStatus = useMemo(() => {
    const mapa = new Map<AlunoStatus, typeof alunos>();
    for (const status of statuses) mapa.set(status, []);

    const termo = searchTerm?.trim().toLowerCase();

    for (const aluno of alunos) {
      if (aluno.area !== area) continue;
      if (onlyMine && aluno.assignedTo !== user?.id) continue;
      if (termo) {
        const alvo = `${aluno.name} ${aluno.email ?? ""} ${aluno.phone ?? ""} ${aluno.ra ?? ""}`.toLowerCase();
        if (!alvo.includes(termo)) continue;
      }
      mapa.get(aluno.status)?.push(aluno);
    }

    return mapa;
  }, [alunos, area, statuses, onlyMine, user, searchTerm]);

  const getAlunosByStatus = useCallback(
    (status: AlunoStatus) => alunosPorStatus.get(status) ?? [],
    [alunosPorStatus]
  );

  // O resumo (contagem por status sem detalhes, usado por quem não é
  // admin) hoje só existe para a Rematrícula (view pipeline_rematricula_resumo).
  const getTotalByStatus = useCallback(
    (status: AlunoStatus) => {
      // No board "Meus Contatos" o total geral da organização não faz
      // sentido (a lista já é só do próprio colaborador), então esse
      // selo comparativo só aparece no Kanban geral da Rematrícula.
      if (area !== "rematricula" || onlyMine) return undefined;
      return statusResumo.find((r) => r.status === status)?.total;
    },
    [area, statusResumo, onlyMine]
  );

  const handleDragEnd = async (result: DropResult) => {
    arrastandoCardRef.current = false;
    setArrastandoCard(false);
    ponteiroXRef.current = null;
    if (animacaoAutoScrollRef.current) {
      cancelAnimationFrame(animacaoAutoScrollRef.current);
      animacaoAutoScrollRef.current = null;
    }
    const { destination, source, draggableId } = result;

    // Soltou fora de qualquer coluna, ou na mesma posição — não faz nada.
    if (!destination) return;
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    // Mesma coluna: só reordenação visual (não persistimos ordem no banco).
    if (destination.droppableId === source.droppableId) {
      return;
    }

    const newStatus = destination.droppableId as AlunoStatus;
    // Segurança: só aceita status que realmente existem neste funil.
    // Evita gravar um droppableId inesperado se o DOM/estado estiver inconsistente.
    if (!statuses.includes(newStatus)) {
      console.warn("Drop em status inválido para a área:", newStatus, area);
      return;
    }

    try {
      // updateAluno é otimista — o card já some da coluna de origem na hora.
      await updateAluno(draggableId, { status: newStatus });
    } catch (error) {
      console.error("Erro ao atualizar status do aluno:", error);
      showToast("Erro ao mover aluno. Tente novamente.", "error");
    }
  };

  const handleDragStart = () => {
    arrastandoCardRef.current = true;
    setArrastandoCard(true);
  };

  // O auto-scroll nativo da biblioteca não alcança consistentemente o
  // container horizontal em todos os navegadores. Ao aproximar o card das
  // bordas, rolamos o quadro até que a próxima coluna fique visível.
  useEffect(() => {
    const atualizarPonteiro = (event: PointerEvent) => {
      if (!arrastandoCardRef.current) return;
      ponteiroXRef.current = event.clientX;

      if (animacaoAutoScrollRef.current !== null) return;
      const rolar = () => {
        const wrapper = boardWrapperRef.current;
        const x = ponteiroXRef.current;
        if (!arrastandoCardRef.current || !wrapper || x === null) {
          animacaoAutoScrollRef.current = null;
          return;
        }

        const { left, right } = wrapper.getBoundingClientRect();
        const limite = 100;
        let deslocamento = 0;
        if (x < left + limite && wrapper.scrollLeft > 0) {
          deslocamento = -Math.ceil(((left + limite - x) / limite) * 18);
        } else if (x > right - limite && wrapper.scrollLeft < wrapper.scrollWidth - wrapper.clientWidth) {
          deslocamento = Math.ceil(((x - (right - limite)) / limite) * 18);
        }

        if (deslocamento) wrapper.scrollLeft += deslocamento;
        animacaoAutoScrollRef.current = requestAnimationFrame(rolar);
      };
      animacaoAutoScrollRef.current = requestAnimationFrame(rolar);
    };

    window.addEventListener("pointermove", atualizarPonteiro);
    return () => {
      window.removeEventListener("pointermove", atualizarPonteiro);
      if (animacaoAutoScrollRef.current) cancelAnimationFrame(animacaoAutoScrollRef.current);
    };
  }, []);

  const handlePanStart = (event: React.PointerEvent<HTMLDivElement>) => {
    // Enquanto um card está sendo arrastado, o pan do quadro NÃO pode
    // capturar o ponteiro — senão o @hello-pangea/dnd perde o hit-test
    // nas colunas e o isDraggingOver fica intermitente.
    if (arrastandoCardRef.current) return;

    // Cards continuam reservados ao drag-and-drop do Kanban. O restante do
    // quadro pode ser clicado e arrastado para navegar entre as colunas.
    if ((event.target as HTMLElement).closest(
      "[data-rfd-draggable-id], [data-rbd-draggable-id], .lead-card"
    )) return;
    // Modais renderizados via portal ficam no document.body (fora do DOM
    // real do wrapper), mas o React ainda entrega eventos pelo tree de
    // componentes. Se o clique veio de dentro de um overlay ou modal,
    // não capturamos o ponteiro — senão bloqueamos o X e o backdrop.
    if ((event.target as HTMLElement).closest(
      ".aluno-expand-overlay, .modal-overlay, .aluno-expand-modal, " +
      ".modal-tarefa, .confirm-dialog, .delegar-contato-modal, .modal-recado"
    )) return;
    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: event.currentTarget.scrollLeft,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePanMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (arrastandoCardRef.current) return;
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    const deslocamento = event.clientX - pan.startX;
    if (Math.abs(deslocamento) > 3) setArrastandoQuadro(true);
    event.currentTarget.scrollLeft = pan.startScrollLeft - deslocamento;
  };

  const handlePanEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (panRef.current?.pointerId !== event.pointerId) return;
    panRef.current = null;
    setArrastandoQuadro(false);
  };

  return (
    <div
      ref={boardWrapperRef}
      className={[
        "kanban-board-wrapper",
        arrastandoQuadro ? "kanban-board-wrapper--panning" : "",
        arrastandoCard ? "kanban-board-wrapper--card-dragging" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onPointerDown={handlePanStart}
      onPointerMove={handlePanMove}
      onPointerUp={handlePanEnd}
      onPointerCancel={handlePanEnd}
    >
      <DragDropContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="kanban-board">
          {statuses.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              alunos={getAlunosByStatus(status)}
              color={config.getColor(status)}
              totalGeral={isAdmin ? undefined : getTotalByStatus(status)}
              alertas={alertas}
              resetSignal={searchTerm}
              isDragging={arrastandoCard}
            />
          ))}
        </div>
      </DragDropContext>
    </div>
  );
};

export default KanbanBoard;
