import React, { useState } from "react";
import { ChecklistItem } from "../../types";
import { Check, ChevronDown, ChevronUp, ListChecks } from "lucide-react";
import { useChecklist } from "../../hooks/useChecklist";
import "./EngajamentoChecklist.css";

interface EngajamentoChecklistProps {
  itens: ChecklistItem[];
}

/**
 * Checklist de tarefas do calouro (login no Léo App, Teams, aulas,
 * livros, AV1, AV4, 1º boleto), direto no card do Kanban de
 * Engajamento. Fica colapsada por padrão mostrando só a barra de
 * progresso; ao clicar, expande e o colaborador marca cada item.
 *
 * Todo clique aqui dentro usa stopPropagation pra não disparar a
 * navegação para a tela de detalhes do card (ver AlunoCard.tsx).
 */
const EngajamentoChecklist: React.FC<EngajamentoChecklistProps> = ({ itens }) => {
  const { toggleItem } = useChecklist();
  const [expandido, setExpandido] = useState(false);

  const concluidos = itens.filter((i) => i.concluido).length;
  const total = itens.length;
  const percentual = total > 0 ? Math.round((concluidos / total) * 100) : 0;
  const completo = total > 0 && concluidos === total;

  const handleToggleExpandir = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandido((v) => !v);
  };

  const handleToggleItem = (e: React.MouseEvent, item: ChecklistItem) => {
    e.stopPropagation();
    toggleItem(item, !item.concluido);
  };

  return (
    <div className="engajamento-checklist" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={`engajamento-checklist-resumo${completo ? " engajamento-checklist-resumo--completo" : ""}`}
        onClick={handleToggleExpandir}
      >
        <ListChecks size={14} />
        <div className="engajamento-checklist-barra">
          <div
            className="engajamento-checklist-barra-preenchida"
            style={{ width: `${percentual}%` }}
          />
        </div>
        <span className="engajamento-checklist-contagem">
          {concluidos}/{total}
        </span>
        {expandido ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {expandido && (
        <ul className="engajamento-checklist-itens">
          {itens.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`engajamento-checklist-item${item.concluido ? " engajamento-checklist-item--concluido" : ""}`}
                onClick={(e) => handleToggleItem(e, item)}
                title={
                  item.concluido && item.concluidoPorNome
                    ? `Concluído por ${item.concluidoPorNome}`
                    : "Clique para marcar como concluído"
                }
              >
                <span className="engajamento-checklist-checkbox">
                  {item.concluido && <Check size={11} strokeWidth={3} />}
                </span>
                <span>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default EngajamentoChecklist;
