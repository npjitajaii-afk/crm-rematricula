import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAlunos } from "../hooks/useAlunos";
import { useAuth } from "../hooks/useAuth";
import { AlunoStatus } from "../types";
import {
  Search,
  Filter,
  Mail,
  Phone,
  GraduationCap,
  AlertCircle,
  Eye,
  Edit,
  X,
  UserCheck,
  TrendingUp,
  Clock,
  CheckCircle2,
} from "lucide-react";
import {
  formatCurrency,
  formatDate,
  getStatusColor,
  getStatusLabel,
} from "../utils/formatters";
import "./MinhaArea.css";

const MinhaArea: React.FC = () => {
  const { alunos, updateAluno, isAdmin } = useAlunos();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  const statuses = [
    { value: "pendente", label: "Pendente de Contato" },
    { value: "contatado", label: "Contato Realizado" },
    { value: "aguardando_retorno", label: "Aguardando Retorno" },
    { value: "confirmado", label: "Confirmou Interesse" },
    { value: "documentacao", label: "Documentação/Pagamento" },
    { value: "rematriculado", label: "Rematriculado" },
    { value: "desistente", label: "Desistente" },
  ];

  // Admin vê tudo; colaborador vê só os seus
  const meusAlunos = useMemo(
    () => (isAdmin ? alunos : alunos.filter((a) => a.assignedTo === user?.id)),
    [alunos, user?.id, isAdmin]
  );

  const alunosFiltrados = useMemo(() => {
    return meusAlunos.filter((aluno) => {
      const matchSearch =
        !searchTerm ||
        aluno.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        aluno.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (aluno.ra || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (aluno.curso || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        aluno.phone.includes(searchTerm);

      const matchStatus =
        selectedStatus.length === 0 || selectedStatus.includes(aluno.status);

      return matchSearch && matchStatus;
    });
  }, [meusAlunos, searchTerm, selectedStatus]);

  const resumoPorStatus = useMemo(() => {
    const totals: Record<string, number> = {};
    meusAlunos.forEach((a) => {
      totals[a.status] = (totals[a.status] || 0) + 1;
    });
    return totals;
  }, [meusAlunos]);

  const handleStatusFilter = (status: string) => {
    setSelectedStatus((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  };

  const handleStatusChange = async (alunoId: string, newStatus: AlunoStatus) => {
    setUpdatingStatus(alunoId);
    try {
      await updateAluno(alunoId, { status: newStatus });
    } catch {
      alert("Erro ao atualizar status. Tente novamente.");
    } finally {
      setUpdatingStatus(null);
    }
  };

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedStatus([]);
    setShowFilters(false);
  };

  const hasActiveFilters = searchTerm || selectedStatus.length > 0;

  const statsCards = [
    {
      label: isAdmin ? "Total geral" : "Total atribuídos",
      value: meusAlunos.length,
      icon: UserCheck,
      color: "var(--primary)",
    },
    {
      label: "Pendentes",
      value: resumoPorStatus["pendente"] || 0,
      icon: Clock,
      color: "var(--warning)",
    },
    {
      label: "Em andamento",
      value:
        (resumoPorStatus["contatado"] || 0) +
        (resumoPorStatus["aguardando_retorno"] || 0) +
        (resumoPorStatus["confirmado"] || 0) +
        (resumoPorStatus["documentacao"] || 0),
      icon: TrendingUp,
      color: "var(--primary)",
    },
    {
      label: "Rematriculados",
      value: resumoPorStatus["rematriculado"] || 0,
      icon: CheckCircle2,
      color: "#15803d",
    },
  ];

  return (
    <div className="minha-area-page">
      <div className="minha-area-header">
        <div>
          <h1>Minha Área</h1>
          <p className="minha-area-subtitle">
            {isAdmin
              ? "Visão completa de todos os contatos do sistema"
              : "Seus contatos atribuídos — gerencie e acompanhe seu pipeline pessoal"}
          </p>
        </div>
      </div>

      <div className="minha-area-stats">
        {statsCards.map((card) => (
          <div key={card.label} className="stat-card">
            <div className="stat-icon" style={{ color: card.color }}>
              <card.icon size={22} />
            </div>
            <div className="stat-info">
              <span className="stat-value">{card.value}</span>
              <span className="stat-label">{card.label}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="minha-area-toolbar">
        <div className="search-wrapper">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Buscar por nome, email, RA, curso..."
            className="search-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button className="clear-search" onClick={() => setSearchTerm("")}>
              <X size={16} />
            </button>
          )}
        </div>

        <div className="toolbar-actions">
          <button
            className={`btn btn-secondary ${showFilters ? "active" : ""}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={18} />
            <span>Filtros</span>
            {selectedStatus.length > 0 && (
              <span className="filter-badge">{selectedStatus.length}</span>
            )}
          </button>
          {hasActiveFilters && (
            <button className="btn btn-secondary" onClick={clearFilters}>
              <X size={16} />
              Limpar
            </button>
          )}
        </div>
      </div>

      {showFilters && (
        <div className="filters-panel">
          <div className="filters-header">
            <h3>Filtrar por Status</h3>
          </div>
          <div className="filters-status-grid">
            {statuses.map((s) => (
              <button
                key={s.value}
                className={`status-filter-btn ${selectedStatus.includes(s.value) ? "selected" : ""}`}
                onClick={() => handleStatusFilter(s.value)}
              >
                <span
                  className="status-dot"
                  style={{ backgroundColor: getStatusColor(s.value as AlunoStatus) }}
                />
                {s.label}
                {resumoPorStatus[s.value] ? (
                  <span className="status-count">{resumoPorStatus[s.value]}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      )}

      {meusAlunos.length === 0 ? (
        <div className="empty-state">
          <UserCheck size={48} />
          <h3>Nenhum contato {isAdmin ? "cadastrado" : "atribuído"}</h3>
          <p>
            {isAdmin
              ? "Nenhum aluno cadastrado no sistema ainda."
              : "Você ainda não possui contatos atribuídos. Um administrador pode delegar alunos para você, ou você pode assumir contatos no pipeline."}
          </p>
        </div>
      ) : alunosFiltrados.length === 0 ? (
        <div className="empty-state">
          <Search size={48} />
          <h3>Nenhum resultado</h3>
          <p>Nenhum contato corresponde aos filtros aplicados.</p>
          <button className="btn btn-secondary" onClick={clearFilters}>
            Limpar Filtros
          </button>
        </div>
      ) : (
        <div className="minha-area-table-wrapper">
          <div className="minha-area-table-info">
            {alunosFiltrados.length} de {meusAlunos.length} contato
            {meusAlunos.length !== 1 ? "s" : ""}
          </div>
          <table className="minha-area-table">
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
              {alunosFiltrados.map((aluno) => (
                <tr key={aluno.id}>
                  <td>
                    <div className="aluno-name-cell">
                      <span className="aluno-name">{aluno.name}</span>
                      {aluno.ra && <span className="aluno-ra">RA: {aluno.ra}</span>}
                    </div>
                  </td>
                  <td>
                    {aluno.curso ? (
                      <div className="curso-cell">
                        <GraduationCap size={14} />
                        <span>{aluno.curso}{aluno.turno ? ` · ${aluno.turno}` : ""}</span>
                      </div>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td>
                    <div className="contato-cell">
                      <div className="contato-item">
                        <Mail size={13} />
                        <span>{aluno.email}</span>
                      </div>
                      <div className="contato-item">
                        <Phone size={13} />
                        <span>{aluno.phone}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <select
                      className="status-select"
                      value={aluno.status}
                      disabled={updatingStatus === aluno.id}
                      onChange={(e) => handleStatusChange(aluno.id, e.target.value as AlunoStatus)}
                      style={{
                        borderColor: getStatusColor(aluno.status),
                        color: getStatusColor(aluno.status),
                      }}
                    >
                      {statuses.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {aluno.value ? (
                      <div className="valor-cell">
                        <AlertCircle size={13} />
                        <span>{formatCurrency(aluno.value)}</span>
                      </div>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td>
                    <span className="date-cell">{formatDate(aluno.createdAt)}</span>
                  </td>
                  <td>
                    <div className="acoes-cell">
                      <button
                        className="action-btn action-btn-view"
                        title="Ver detalhes"
                        onClick={() => navigate(`/alunos/${aluno.id}`)}
                      >
                        <Eye size={15} />
                      </button>
                      <button
                        className="action-btn action-btn-edit"
                        title="Editar"
                        onClick={() => navigate(`/alunos/${aluno.id}/edit`)}
                      >
                        <Edit size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default MinhaArea;
