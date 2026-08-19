import React, { useState, useMemo, useRef } from "react";
import { useNavigate, NavigateFunction } from "react-router-dom";
import { useAlunos } from "../hooks/useAlunos";
import { Aluno, AlunoStatus } from "../types";
import {
  UsersRound,
  Search,
  ChevronDown,
  ChevronUp,
  Eye,
  Edit,
  Mail,
  Phone,
  GraduationCap,
  AlertCircle,
  UserX,
  MessageSquare,
  FileText,
} from "lucide-react";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  getStatusColor,
  getStatusLabel,
  getSourceLabel,
} from "../utils/formatters";
import "./Colaboradores.css";

const STATUS_LIST = [
  { value: "cadastrado", label: "Cadastrado" },
  { value: "pendente", label: "Pendente" },
  { value: "contatado", label: "Contatado" },
  { value: "aguardando_retorno", label: "Aguardando" },
  { value: "confirmado", label: "Confirmado" },
  { value: "documentacao", label: "Documentação" },
  { value: "aguardando_matricula", label: "Aguard. Matrícula" },
  { value: "matricula_confirmada", label: "Matrícula OK" },
  { value: "rematriculado", label: "Rematriculado" },
  { value: "desistente", label: "Desistente" },
];

// Hook reutilizável: permite arrastar horizontalmente com o mouse
// (clicar e segurar para mover a lista para os lados)
function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const state = useRef({ isDown: false, startX: 0, scrollLeft: 0, dragged: false });

  const onMouseDown = (e: React.MouseEvent) => {
    if (!ref.current) return;
    state.current.isDown = true;
    state.current.dragged = false;
    state.current.startX = e.pageX - ref.current.offsetLeft;
    state.current.scrollLeft = ref.current.scrollLeft;
    ref.current.classList.add("dragging");
  };

  const stopDrag = () => {
    state.current.isDown = false;
    ref.current?.classList.remove("dragging");
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!state.current.isDown || !ref.current) return;
    e.preventDefault();
    const x = e.pageX - ref.current.offsetLeft;
    const walk = x - state.current.startX;
    if (Math.abs(walk) > 5) state.current.dragged = true;
    ref.current.scrollLeft = state.current.scrollLeft - walk;
  };

  // Evita que o clique (que expande a linha do aluno) dispare
  // logo depois de um arraste do mouse
  const onClickCapture = (e: React.MouseEvent) => {
    if (state.current.dragged) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  return {
    ref,
    handlers: {
      onMouseDown,
      onMouseUp: stopDrag,
      onMouseLeave: stopDrag,
      onMouseMove,
      onClickCapture,
    },
  };
}

// Linha da tabela de um aluno: clicar em qualquer lugar da linha expande um
// painel com mais detalhes ali mesmo, sem sair da aba de Colaboradores.
// Os botões de ação continuam levando pra página completa do aluno.
interface ColabAlunoRowProps {
  aluno: Aluno;
  navigate: NavigateFunction;
}

const ColabAlunoRow: React.FC<ColabAlunoRowProps> = ({ aluno, navigate }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className={`colab-aluno-row ${expanded ? "expanded" : ""}`}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <td>
          <div className="aluno-name-cell">
            <ChevronDown
              size={14}
              className={`aluno-expand-chevron ${expanded ? "open" : ""}`}
            />
            <div>
              <span className="aluno-name">{aluno.name}</span>
              {aluno.ra && <span className="aluno-ra">RA: {aluno.ra}</span>}
            </div>
          </div>
        </td>
        <td>
          {aluno.curso ? (
            <div className="curso-cell">
              <GraduationCap size={13} />
              <span>{aluno.curso}{aluno.turno ? ` · ${aluno.turno}` : ""}</span>
            </div>
          ) : <span className="text-muted">—</span>}
        </td>
        <td>
          <div className="contato-cell">
            <div className="contato-item"><Mail size={12} /><span>{aluno.email}</span></div>
            <div className="contato-item"><Phone size={12} /><span>{aluno.phone}</span></div>
          </div>
        </td>
        <td>
          <span
            className="status-badge"
            style={{
              backgroundColor: getStatusColor(aluno.status) + "22",
              color: getStatusColor(aluno.status),
              borderColor: getStatusColor(aluno.status) + "55",
            }}
          >
            {getStatusLabel(aluno.status)}
          </span>
        </td>
        <td>
          {aluno.value ? (
            <div className="valor-cell">
              <AlertCircle size={12} />
              <span>{formatCurrency(aluno.value)}</span>
            </div>
          ) : <span className="text-muted">—</span>}
        </td>
        <td><span className="date-cell">{formatDate(aluno.createdAt)}</span></td>
        <td>
          <div className="acoes-cell" onClick={(e) => e.stopPropagation()}>
            <button
              className="action-btn action-btn-view"
              title="Ver página completa"
              onClick={() => navigate(`/alunos/${aluno.id}`)}
            >
              <Eye size={14} />
            </button>
            <button
              className="action-btn action-btn-edit"
              title="Editar"
              onClick={() => navigate(`/alunos/${aluno.id}/edit`)}
            >
              <Edit size={14} />
            </button>
          </div>
        </td>
      </tr>

      {expanded && (
        <tr className="colab-aluno-detail-row">
          <td colSpan={7}>
            <div className="aluno-detail-panel">
              <div className="aluno-detail-col">
                <span className="aluno-detail-label">
                  <FileText size={13} /> Observações
                </span>
                <p className="aluno-detail-text">
                  {aluno.observations || "Nenhuma observação registrada."}
                </p>
              </div>

              <div className="aluno-detail-col">
                <span className="aluno-detail-label">Etiquetas</span>
                {aluno.tags && aluno.tags.length > 0 ? (
                  <div className="aluno-detail-tags">
                    {aluno.tags.map((tag) => (
                      <span key={tag} className="aluno-detail-tag">{tag}</span>
                    ))}
                  </div>
                ) : (
                  <p className="aluno-detail-text">Nenhuma etiqueta.</p>
                )}
              </div>

              <div className="aluno-detail-col">
                <span className="aluno-detail-label">Canal de contato</span>
                <p className="aluno-detail-text">{getSourceLabel(aluno.source)}</p>
              </div>

              <div className="aluno-detail-col">
                <span className="aluno-detail-label">
                  <MessageSquare size={13} /> Interações
                </span>
                <p className="aluno-detail-text">
                  {aluno.interactions.length === 0
                    ? "Nenhuma interação registrada."
                    : `${aluno.interactions.length} interação(ões) — última em ${formatDateTime(
                        [...aluno.interactions].sort(
                          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
                        )[0].date
                      )}`}
                </p>
              </div>

              <button
                className="btn btn-secondary btn-sm aluno-detail-link"
                onClick={() => navigate(`/alunos/${aluno.id}`)}
              >
                Ver página completa
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

// Tabela de alunos de um colaborador (ou dos "sem responsável").
// Suporta arrastar com o mouse para o lado (drag to scroll).
interface ColabAlunosTableProps {
  alunos: Aluno[];
  navigate: NavigateFunction;
}

const ColabAlunosTable: React.FC<ColabAlunosTableProps> = ({ alunos, navigate }) => {
  const { ref, handlers } = useDragScroll<HTMLDivElement>();

  if (alunos.length === 0) {
    return (
      <div className="colab-empty">
        <p>Nenhum contato atribuído a este colaborador.</p>
      </div>
    );
  }

  return (
    <div className="colab-card-body colab-drag-scroll" ref={ref} {...handlers}>
      <table className="colab-table">
        <thead>
          <tr>
            <th>Aluno</th>
            <th>Curso</th>
            <th>Contato</th>
            <th>Status</th>
            <th>Valor</th>
            <th>Criado em</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {alunos.map((aluno) => (
            <ColabAlunoRow key={aluno.id} aluno={aluno} navigate={navigate} />
          ))}
        </tbody>
      </table>
    </div>
  );
};

const Colaboradores: React.FC = () => {
  const { alunos, colaboradores } = useAlunos();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [expandedColaborador, setExpandedColaborador] = useState<string | null>(null);

  // Monta visão por colaborador
  const colaboradoresData = useMemo(() => {
    const map: Record<
      string,
      { id: string; name: string; email: string; alunos: typeof alunos }
    > = {};

    // Inicializa todos os colaboradores registrados
    colaboradores.forEach((c) => {
      map[c.id] = { ...c, alunos: [] };
    });

    // Distribui os alunos
    alunos.forEach((a) => {
      if (a.assignedTo && map[a.assignedTo]) {
        map[a.assignedTo].alunos.push(a);
      }
    });

    return Object.values(map);
  }, [alunos, colaboradores]);

  // Alunos sem responsável
  const semResponsavel = useMemo(
    () => alunos.filter((a) => !a.assignedTo),
    [alunos]
  );

  const filteredColaboradores = useMemo(
    () =>
      colaboradoresData.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.email.toLowerCase().includes(search.toLowerCase())
      ),
    [colaboradoresData, search]
  );

  const toggle = (id: string) =>
    setExpandedColaborador((prev) => (prev === id ? null : id));

  const getResumo = (alunosList: typeof alunos) => {
    const totals: Record<string, number> = {};
    alunosList.forEach((a) => {
      totals[a.status] = (totals[a.status] || 0) + 1;
    });
    return totals;
  };

  return (
    <div className="colab-page">
      <div className="colab-header">
        <div>
          <h1>Colaboradores</h1>
          <p className="colab-subtitle">
            Visão da área de trabalho de cada colaborador
          </p>
        </div>
        <div className="colab-header-stats">
          <div className="colab-stat-chip">
            <UsersRound size={16} />
            {colaboradoresData.length} colaboradores
          </div>
          <div className="colab-stat-chip sem-responsavel">
            <UserX size={16} />
            {semResponsavel.length} sem responsável
          </div>
        </div>
      </div>

      {/* Busca */}
      <div className="colab-search-wrapper">
        <Search size={16} className="colab-search-icon" />
        <input
          className="colab-search"
          placeholder="Buscar colaborador..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Cards de colaboradores */}
      <div className="colab-list">
        {filteredColaboradores.map((colab) => {
          const resumo = getResumo(colab.alunos);
          const isOpen = expandedColaborador === colab.id;
          const rematriculados = resumo["rematriculado"] || 0;
          const taxa =
            colab.alunos.length > 0
              ? Math.round((rematriculados / colab.alunos.length) * 100)
              : 0;

          return (
            <div key={colab.id} className={`colab-card ${isOpen ? "open" : ""}`}>
              {/* Cabeçalho do colaborador */}
              <div
                className="colab-card-header"
                onClick={() => toggle(colab.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggle(colab.id);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-expanded={isOpen}
              >
                <div className="colab-card-header-top">
                  <div className="colab-identity">
                    <div className="colab-avatar">
                      {colab.name.charAt(0).toUpperCase()}
                    </div>
                    <p className="colab-name">{colab.name}</p>
                  </div>

                  <div className="colab-card-meta">
                    <div className="colab-numbers">
                      <span className="colab-total">{colab.alunos.length} contatos</span>
                      {colab.alunos.length > 0 && (
                        <span className="colab-taxa" style={{ color: taxa >= 50 ? "#15803d" : "var(--primary)" }}>
                          {taxa}% rematric.
                        </span>
                      )}
                    </div>

                    <button type="button" className="colab-toggle-btn" tabIndex={-1} aria-hidden="true">
                      {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                  </div>
                </div>

                {/* Mini pipeline por status */}
                <div className="colab-status-row">
                  {STATUS_LIST.map((s) =>
                    resumo[s.value] ? (
                      <span
                        key={s.value}
                        className="colab-status-chip"
                        style={{
                          backgroundColor: getStatusColor(s.value as AlunoStatus) + "22",
                          color: getStatusColor(s.value as AlunoStatus),
                          borderColor: getStatusColor(s.value as AlunoStatus) + "55",
                        }}
                        title={getStatusLabel(s.value)}
                      >
                        {resumo[s.value]} {s.label}
                      </span>
                    ) : null
                  )}
                </div>
              </div>

              {/* Tabela expandida (arrastável para os lados) */}
              {isOpen && <ColabAlunosTable alunos={colab.alunos} navigate={navigate} />}
            </div>
          );
        })}

        {/* Seção: sem responsável */}
        {semResponsavel.length > 0 && (
          <div className={`colab-card sem-resp-card ${expandedColaborador === "__sem__" ? "open" : ""}`}>
            <div
              className="colab-card-header"
              onClick={() => toggle("__sem__")}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggle("__sem__");
                }
              }}
              role="button"
              tabIndex={0}
              aria-expanded={expandedColaborador === "__sem__"}
            >
              <div className="colab-card-header-top">
                <div className="colab-identity">
                  <div className="colab-avatar colab-avatar-sem">
                    <UserX size={18} />
                  </div>
                  <div>
                    <p className="colab-name">Sem Responsável</p>
                    <p className="colab-email">Contatos ainda não atribuídos</p>
                  </div>
                </div>
                <div className="colab-card-meta">
                  <span className="colab-total">{semResponsavel.length} contatos</span>
                  <button type="button" className="colab-toggle-btn" tabIndex={-1} aria-hidden="true">
                    {expandedColaborador === "__sem__" ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>
                </div>
              </div>
            </div>

            {expandedColaborador === "__sem__" && (
              <ColabAlunosTable alunos={semResponsavel} navigate={navigate} />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Colaboradores;
