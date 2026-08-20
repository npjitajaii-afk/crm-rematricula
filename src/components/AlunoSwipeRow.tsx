import React, { useRef, useState } from "react";
import { Aluno } from "../types";
import {
  Mail,
  Phone,
  GraduationCap,
  Calendar,
  Eye,
  Edit,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { formatCurrency, formatDate, getStatusColor } from "../utils/formatters";

interface AlunoSwipeRowProps {
  aluno: Aluno;
  statusLabel?: string;
  sourceLabel?: string;
  /**
   * Nome de quem é responsável pelo contato (assignedTo resolvido contra a
   * lista de colaboradores). Precisa aparecer pra todo mundo que usa o CRM,
   * não só pra quem assumiu — é um controle operacional (ver pedido do
   * usuário: visibilidade de responsável em todos os funis).
   */
  responsavelNome?: string;
  showSelect: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  podeEditar: boolean;
  podeAssumir: boolean;
  podeDelegar?: boolean;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onView: () => void;
  onEdit: () => void;
  onAssumir: () => void;
  onDelegar?: () => void;
  onDelete: () => void;
}

// Largura de cada botão de ação revelado ao arrastar a linha pro lado
// (ver AlunoSwipeRow.css). Usado pra calcular quanto a linha precisa
// deslizar pra revelar todos os botões visíveis.
const ACTION_WIDTH = 52;
// Distância mínima de movimento pra considerar que o usuário está
// arrastando (e não só clicando/segurando parado em cima da linha).
const DRAG_THRESHOLD = 6;

const AlunoSwipeRow: React.FC<AlunoSwipeRowProps> = ({
  aluno,
  statusLabel,
  sourceLabel,
  responsavelNome,
  showSelect,
  selected,
  onToggleSelect,
  podeEditar,
  podeAssumir,
  podeDelegar = false,
  isOpen,
  onOpenChange,
  onView,
  onEdit,
  onAssumir,
  onDelegar,
  onDelete,
}) => {
  const actionsCount =
    1 /* ver */ + (podeEditar ? 1 : 0) + (podeAssumir ? 1 : 0) + (podeDelegar ? 1 : 0) + (podeEditar ? 1 : 0);
  const actionsWidth = actionsCount * ACTION_WIDTH;

  const [offset, setOffset] = useState(isOpen ? -actionsWidth : 0);
  const [dragging, setDragging] = useState(false);

  const drag = useRef<{
    pointerId: number;
    startX: number;
    startOffset: number;
    moved: boolean;
  } | null>(null);

  // Mantém o offset em sincronia se a linha for fechada de fora (ex: outra
  // linha foi aberta e esta precisa recolher).
  React.useEffect(() => {
    if (!dragging) setOffset(isOpen ? -actionsWidth : 0);
  }, [isOpen, actionsWidth, dragging]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== undefined && e.button !== 0) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startOffset: offset,
      moved: false,
    };
    setDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.pointerId !== e.pointerId) return;
    const delta = e.clientX - drag.current.startX;
    if (Math.abs(delta) > DRAG_THRESHOLD) drag.current.moved = true;
    const next = Math.min(0, Math.max(-actionsWidth, drag.current.startOffset + delta));
    setOffset(next);
  };

  const finishDrag = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.pointerId !== e.pointerId) return;
    const { moved } = drag.current;
    setDragging(false);

    if (!moved) {
      // Não foi um arraste de verdade: trata como clique/tap.
      if (isOpen) {
        onOpenChange(false);
      } else {
        onView();
      }
      drag.current = null;
      return;
    }

    const shouldOpen = offset < -actionsWidth / 2;
    setOffset(shouldOpen ? -actionsWidth : 0);
    onOpenChange(shouldOpen);
    drag.current = null;
  };

  return (
    <div className="aluno-row">
      {showSelect && (
        <input
          type="checkbox"
          className="aluno-row-checkbox"
          checked={selected}
          onChange={onToggleSelect}
        />
      )}

      <div className="aluno-row-swipe-area">
        <div className="aluno-row-actions" style={{ width: actionsWidth }}>
          <button
            className="aluno-row-action"
            title="Ver detalhes"
            onClick={onView}
          >
            <Eye size={18} />
          </button>
          {podeEditar && (
            <button
              className="aluno-row-action"
              title="Editar"
              onClick={onEdit}
            >
              <Edit size={18} />
            </button>
          )}
          {podeAssumir && (
            <button
              className="aluno-row-action"
              title="Assumir contato"
              onClick={onAssumir}
            >
              <UserPlus size={18} />
            </button>
          )}
          {podeDelegar && onDelegar && (
            <button
              className="aluno-row-action"
              title="Delegar contato"
              onClick={onDelegar}
            >
              <Users size={18} />
            </button>
          )}
          {podeEditar && (
            <button
              className="aluno-row-action aluno-row-action-danger"
              title="Excluir"
              onClick={onDelete}
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>

        <div
          className={`aluno-row-content ${dragging ? "dragging" : ""}`}
          style={{ transform: `translateX(${offset}px)` }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
        >
          {/* Linha principal: sempre com a mesma estrutura pra todo
              contato, com ou sem responsável — assim o nome fica sempre
              na mesma posição, linha após linha. A ação de assumir/
              delegar (quando existe) vai numa segunda linha, abaixo. */}
          <div className="aluno-row-info">
            <div className="aluno-row-main">
              <strong className="aluno-row-name">{aluno.name}</strong>
              {aluno.ra && <span className="aluno-row-ra">RA: {aluno.ra}</span>}
            </div>

            {aluno.curso && (
              <div className="aluno-row-field aluno-row-curso">
                <GraduationCap size={14} />
                <span>
                  {aluno.curso}
                  {aluno.turno ? ` · ${aluno.turno}` : ""}
                </span>
              </div>
            )}

            <div className="aluno-row-field aluno-row-contato">
              <Mail size={14} />
              <span>{aluno.email}</span>
              <Phone size={14} />
              <span>{aluno.phone}</span>
            </div>

            <span
              className="aluno-row-status"
              style={{ backgroundColor: getStatusColor(aluno.status) }}
            >
              {statusLabel}
            </span>

            {sourceLabel && (
              <span className="aluno-row-source">{sourceLabel}</span>
            )}

            {!!aluno.value && (
              <span className="aluno-row-value">{formatCurrency(aluno.value)}</span>
            )}

            <div className="aluno-row-field aluno-row-data">
              <Calendar size={14} />
              <span>{formatDate(aluno.createdAt)}</span>
            </div>
          </div>

          <div className="aluno-row-primary-actions">
            {podeAssumir && (
              <button
                type="button"
                className="aluno-row-primary-action"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onAssumir();
                }}
              >
                <UserPlus size={16} />
                Assumir contato
              </button>
            )}
            {podeDelegar && onDelegar && (
              <button
                type="button"
                className="aluno-row-primary-action"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onDelegar();
                }}
              >
                <Users size={16} />
                Delegar contato
              </button>
            )}
            {!podeAssumir && !podeDelegar && responsavelNome && (
              <span className="aluno-row-responsavel">
                <UserPlus size={13} />
                {responsavelNome}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(AlunoSwipeRow);