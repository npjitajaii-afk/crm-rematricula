import React, { useState } from "react";
import { Aluno, AlertaInatividade } from "../../types";
import {
  Mail,
  Phone,
  GraduationCap,
  AlertCircle,
  AlertTriangle,
  UserPlus,
  Users,
  CalendarClock,
} from "lucide-react";
import {
  formatCurrency,
  formatDate,
  getTipoAlunoColor,
} from "../../utils/formatters";
import { useAlunos } from "../../hooks/useAlunos";
import { useToast } from "../../hooks/useToast";
import { useChecklist } from "../../hooks/useChecklist";
import { useWhatsapp } from "../../hooks/useWhatsapp";
import { useAgendaEngajamento } from "../../hooks/useAgendaEngajamento";
import { useAuth } from "../../hooks/useAuth";
import { isSameDay, startOfToday } from "date-fns";
import EngajamentoChecklist from "./EngajamentoChecklist";
import WhatsappBadge from "./WhatsappBadge";
import AlunoExpandModal from "../AlunoExpandModal";
import DelegarContatoModal from "../DelegarContatoModal";
import "./AlunoCard.css";

interface AlunoCardProps {
  aluno: Aluno;
  /** Alerta de inatividade (E1) — undefined quando não há alerta ou fora do Engajamento. */
  alerta?: AlertaInatividade;
}

// Otimização (Bloco B): evita re-renderizar cards de alunos que não
// mudaram. Efetivo para drags/edições pontuais, já que a AlunosContext
// só cria um novo objeto `aluno` para o item que realmente foi alterado
// (os demais mantêm a mesma referência — ver AlunosContext.tsx).
// Observação: como o card também consome useAlunos() (isAdmin,
// assumirAluno), ele ainda re-renderiza quando QUALQUER aluno da lista
// muda, porque o array `alunos`/`filteredAlunos` do contexto muda de
// referência nesse caso. Eliminar isso por completo exigiria separar o
// estado por card (ex: contexto por aluno ou uma lib tipo React Query) —
// fica registrado como possível próximo passo, fora do escopo deste bloco.
const AlunoCard: React.FC<AlunoCardProps> = React.memo(({ aluno, alerta }) => {
  const { isAdmin, assumirAluno, colaboradores } = useAlunos();
  // Ao clicar no card, expande um painel por cima da tela (ver
  // AlunoExpandModal.tsx) em vez de navegar pra /alunos/:id.
  const [expandido, setExpandido] = useState(false);
  const [delegando, setDelegando] = useState(false);
  const { showToast } = useToast();
  const { itensPorAluno } = useChecklist();
  const { resumoPorAluno } = useWhatsapp();
  const { compromissos } = useAgendaEngajamento();
  const { user } = useAuth();

  // Checklist só existe (é criada automaticamente pelo banco) para
  // alunos das áreas "engajamento" e "rematricula" — ver
  // database/009_checklist_engajamento.sql e
  // database/016_checklist_rematricula.sql.
  const itensChecklist =
    aluno.area === "engajamento" || aluno.area === "rematricula"
      ? itensPorAluno[aluno.id]
      : undefined;
  // Resumo de WhatsApp vale pra qualquer área — a mensagem chega pelo
  // telefone, independente do funil em que o aluno está.
  const resumoWhatsapp = resumoPorAluno[aluno.id];
  // Um alerta sÃ³ aparece no dia agendado e para o dono do compromisso.
  const compromissosHoje = compromissos.filter(
    (item) => item.alunoId === aluno.id && item.userId === user?.id && isSameDay(item.data, startOfToday())
  );

  // Nome de quem cadastrou o aluno (E1/pedido do usuário: "quem criou o
  // contato" precisa aparecer). createdBy guarda o id do usuário (ver
  // types/index.ts) — resolvido aqui contra a lista de colaboradores/admins
  // já carregada pelo contexto, sem precisar de outra consulta.
  const criadoPorNome = colaboradores.find((c) => c.id === aluno.createdBy)?.name;

  const handleClick = () => {
    setExpandido(true);
  };

  const handleAssumir = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await assumirAluno(aluno.id);
    } catch {
      showToast("Erro ao assumir contato. Tente novamente.", "error");
    }
  };

  const semResponsavel = !aluno.assignedTo;

  const TIPOS_ALUNO = ["Calouro", "Veterano", "Winback"];
  const tipoAluno = aluno.tags?.find((t) => TIPOS_ALUNO.includes(t));
  const outrasTags = aluno.tags?.filter((t) => t !== tipoAluno) || [];

  return (
    <div
      className="lead-card"
      onClick={handleClick}
      onPointerDown={expandido ? (e) => e.stopPropagation() : undefined}
    >
      <div className="lead-card-header">
        <h4 className="lead-name">{aluno.name}</h4>
        {!!aluno.value && (
          <span className="lead-value">{formatCurrency(aluno.value)}</span>
        )}
      </div>

      {alerta && (
        <span
          className={`lead-alerta-inatividade lead-alerta-inatividade--${alerta.nivel}`}
          title={`${alerta.diasSemInteracao} dias sem interação registrada`}
        >
          <AlertTriangle size={12} />
          {alerta.diasSemInteracao} dias sem interação
        </span>
      )}

      {compromissosHoje.map((compromisso) => (
        <span
          key={compromisso.id}
          className="lead-alerta-agenda"
          title={compromisso.comentario}
        >
          <CalendarClock size={12} />
          Agenda hoje{compromisso.ticket ? ` · Ticket ${compromisso.ticket}` : ""}
        </span>
      ))}

      {tipoAluno && (
        <span
          className="lead-tipo-badge"
          style={{ backgroundColor: getTipoAlunoColor(tipoAluno) }}
        >
          {tipoAluno}
        </span>
      )}

      <div className="lead-card-body">
        {resumoWhatsapp && <WhatsappBadge resumo={resumoWhatsapp} />}

        {itensChecklist && itensChecklist.length > 0 && (
          <EngajamentoChecklist itens={itensChecklist} />
        )}

        {aluno.curso && (
          <div className="lead-info">
            <GraduationCap size={14} />
            <span>
              {aluno.curso}
              {aluno.turno ? ` · ${aluno.turno}` : ""}
            </span>
          </div>
        )}

        <div className="lead-info">
          <Mail size={14} />
          <span>{aluno.email}</span>
        </div>

        <div className="lead-info">
          <Phone size={14} />
          <span>{aluno.phone}</span>
        </div>

        {!!aluno.value && (
          <div className="lead-info">
            <AlertCircle size={14} />
            <span>Débito em aberto</span>
          </div>
        )}

        {outrasTags.length > 0 && (
          <div className="lead-tags">
            {outrasTags.slice(0, 2).map((tag, index) => (
              <span key={index} className="lead-tag">
                {tag}
              </span>
            ))}
            {outrasTags.length > 2 && (
              <span className="lead-tag">+{outrasTags.length - 2}</span>
            )}
          </div>
        )}
      </div>

      {semResponsavel && (
        <div className="lead-card-actions" onPointerDown={(event) => event.stopPropagation()}>
          {isAdmin ? (
            <button
              type="button"
              className="lead-assumir-btn"
              onClick={(event) => {
                event.stopPropagation();
                setDelegando(true);
              }}
            >
              <Users size={14} />
              Delegar contato
            </button>
          ) : (
            <button type="button" className="lead-assumir-btn" onClick={handleAssumir}>
              <UserPlus size={14} />
              Assumir contato
            </button>
          )}
        </div>
      )}

      <div className="lead-card-footer">
        <div className="lead-meta">
          <span>{formatDate(aluno.createdAt)}</span>
          {criadoPorNome && (
            <span className="lead-criado-por" title={`Cadastrado por ${criadoPorNome}`}>
              · por {criadoPorNome}
            </span>
          )}
        </div>
        {aluno.interactions.length > 0 && (
          <span className="interaction-count">
            {aluno.interactions.length} interações
          </span>
        )}
      </div>

      {expandido && (
        <AlunoExpandModal
          alunoId={aluno.id}
          onClose={() => setExpandido(false)}
        />
      )}
      {delegando && (
        <DelegarContatoModal aluno={aluno} onClose={() => setDelegando(false)} />
      )}
    </div>
  );
});

AlunoCard.displayName = "AlunoCard";

export default AlunoCard;