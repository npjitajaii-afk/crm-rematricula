import React, { useState } from "react";
import { useAlunos } from "../hooks/useAlunos";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { useConfirm } from "../hooks/useConfirm";
import { useNavigate } from "react-router-dom";
import { AlunoStatus, CanalContato } from "../types";
import {
  Search,
  Plus,
  Filter,
  Download,
  Upload,
  Mail,
  Phone,
  GraduationCap,
  AlertCircle,
  Calendar,
  Eye,
  Edit,
  Trash2,
  UserPlus,
} from "lucide-react";
import {
  formatCurrency,
  formatDate,
  getStatusColor,
} from "../utils/formatters";
import "./Alunos.css";

const Alunos: React.FC = () => {
  const {
    filteredAlunos,
    filters,
    setFilters,
    exportAlunos,
    importAlunos,
    deleteAluno,
    deleteAlunosBulk,
    assumirAluno,
    isAdmin,
  } = useAlunos();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const navigate = useNavigate();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState(filters.search || "");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string[]>(
    filters.status || []
  );
  const [selectedSource, setSelectedSource] = useState<string[]>(
    filters.source || []
  );
  const [dateFrom, setDateFrom] = useState<string>(
    filters.dateFrom
      ? new Date(filters.dateFrom).toISOString().split("T")[0]
      : ""
  );
  const [dateTo, setDateTo] = useState<string>(
    filters.dateTo ? new Date(filters.dateTo).toISOString().split("T")[0] : ""
  );
  const [importProgress, setImportProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  const statuses = [
    { value: "pendente", label: "Pendente de Contato" },
    { value: "contatado", label: "Contato Realizado" },
    { value: "aguardando_retorno", label: "Aguardando Retorno" },
    { value: "confirmado", label: "Confirmou Interesse" },
    { value: "documentacao", label: "Documentação/Pagamento" },
    { value: "rematriculado", label: "Rematriculado" },
    { value: "desistente", label: "Desistente" },
  ];

  const sources = [
    { value: "telefone", label: "Telefone" },
    { value: "whatsapp", label: "WhatsApp" },
    { value: "email", label: "E-mail" },
    { value: "presencial", label: "Presencial" },
    { value: "ava", label: "AVA / Portal do Aluno" },
    { value: "indicacao", label: "Indicação" },
    { value: "outro", label: "Outro" },
  ];

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setFilters({ ...filters, search: value });
  };

  const handleStatusFilter = (status: string) => {
    const newStatus = selectedStatus.includes(status)
      ? selectedStatus.filter((s) => s !== status)
      : [...selectedStatus, status];

    setSelectedStatus(newStatus);
    setFilters({
      ...filters,
      status: newStatus.length > 0 ? (newStatus as AlunoStatus[]) : undefined,
    });
  };

  const handleSourceFilter = (source: string) => {
    const newSource = selectedSource.includes(source)
      ? selectedSource.filter((s) => s !== source)
      : [...selectedSource, source];

    setSelectedSource(newSource);
    setFilters({
      ...filters,
      source: newSource.length > 0 ? (newSource as CanalContato[]) : undefined,
    });
  };

  const handleDateFromChange = (value: string) => {
    setDateFrom(value);
    setFilters({
      ...filters,
      dateFrom: value ? new Date(value) : undefined,
    });
  };

  const handleDateToChange = (value: string) => {
    setDateTo(value);
    setFilters({
      ...filters,
      dateTo: value ? new Date(value) : undefined,
    });
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setSelectedStatus([]);
    setSelectedSource([]);
    setDateFrom("");
    setDateTo("");
    setFilters({});
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Permite selecionar o mesmo arquivo de novo depois de um import
    e.target.value = "";

    setImportProgress({ done: 0, total: 0 });

    try {
      await importAlunos(file, (done, total) => {
        setImportProgress({ done, total });
      });
      showToast("Alunos importados com sucesso!", "success");
    } catch (err) {
      showToast(
        err instanceof Error
          ? err.message
          : "Erro ao importar alunos. Verifique o formato do arquivo.",
        "error"
      );
    } finally {
      setImportProgress(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const confirmed = await confirm(
      `Tem certeza que deseja excluir o aluno "${name}"?`,
      { confirmLabel: "Excluir" }
    );
    if (!confirmed) return;

    try {
      await deleteAluno(id);
      showToast("Aluno excluído com sucesso!", "success");
    } catch {
      showToast("Erro ao excluir aluno. Tente novamente.", "error");
    }
  };

  const handleAssumir = async (id: string) => {
    try {
      await assumirAluno(id);
    } catch {
      showToast("Erro ao assumir contato. Tente novamente.", "error");
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredAlunos.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredAlunos.map((a) => a.id));
    }
  };

  const handleBulkDelete = async () => {
    const confirmed = await confirm(
      `Tem certeza que deseja excluir ${selectedIds.length} aluno(s) selecionado(s)? Essa ação não pode ser desfeita.`,
      { confirmLabel: "Excluir todos" }
    );
    if (!confirmed) return;

    try {
      const deletedCount = await deleteAlunosBulk(selectedIds);
      setSelectedIds([]);

      if (deletedCount < selectedIds.length) {
        showToast(
          `${deletedCount} de ${selectedIds.length} aluno(s) excluído(s). Alguns não puderam ser removidos (verifique suas permissões).`,
          deletedCount > 0 ? "info" : "error"
        );
      } else {
        showToast(`${deletedCount} aluno(s) excluído(s) com sucesso.`, "success");
      }
    } catch {
      showToast("Erro ao excluir alunos selecionados. Tente novamente.", "error");
    }
  };

  return (
    <div className="leads-page">
      {/* Header */}
      <div className="leads-header">
        <div>
          <h1>Alunos</h1>
          <p className="leads-subtitle">
            {filteredAlunos.length}{" "}
            {filteredAlunos.length === 1
              ? "aluno encontrado"
              : "alunos encontrados"}
          </p>
        </div>
        <div className="leads-actions">
          {isAdmin && selectedIds.length > 0 && (
            <button className="btn btn-danger" onClick={handleBulkDelete}>
              <Trash2 size={18} />
              Excluir selecionados ({selectedIds.length})
            </button>
          )}
          <button className="btn btn-secondary" onClick={exportAlunos}>
            <Download size={18} />
            Exportar
          </button>
          <label
            className={`btn btn-secondary${
              importProgress ? " btn-disabled" : ""
            }`}
          >
            <Upload size={18} />
            {importProgress
              ? importProgress.total > 0
                ? `Importando ${importProgress.done}/${importProgress.total}...`
                : "Lendo arquivo..."
              : "Importar"}
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleImport}
              disabled={!!importProgress}
              style={{ display: "none" }}
            />
          </label>
          <button
            className="btn btn-primary"
            onClick={() => navigate("/alunos/new")}
          >
            <Plus size={18} />
            Novo Aluno
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="leads-toolbar">
        <div className="search-box">
          <Search size={20} />
          <input
            type="text"
            placeholder="Buscar por nome, email, RA, curso..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
        <button
          className={`btn btn-secondary ${showFilters ? "active" : ""}`}
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter size={18} />
          Filtros
          {(selectedStatus.length > 0 ||
            selectedSource.length > 0 ||
            dateFrom ||
            dateTo) && (
            <span className="filter-badge">
              {selectedStatus.length +
                selectedSource.length +
                (dateFrom ? 1 : 0) +
                (dateTo ? 1 : 0)}
            </span>
          )}
        </button>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="filters-panel">
          <div className="filter-group">
            <label>Status:</label>
            <div className="filter-options">
              {statuses.map((status) => (
                <label key={status.value} className="filter-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedStatus.includes(status.value)}
                    onChange={() => handleStatusFilter(status.value)}
                  />
                  <span>{status.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <label>Canal de Contato:</label>
            <div className="filter-options">
              {sources.map((source) => (
                <label key={source.value} className="filter-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedSource.includes(source.value)}
                    onChange={() => handleSourceFilter(source.value)}
                  />
                  <span>{source.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <label>Período de Criação:</label>
            <div className="date-filters">
              <div className="date-filter-item">
                <label htmlFor="dateFrom">De:</label>
                <input
                  type="date"
                  id="dateFrom"
                  value={dateFrom}
                  onChange={(e) => handleDateFromChange(e.target.value)}
                />
              </div>
              <div className="date-filter-item">
                <label htmlFor="dateTo">Até:</label>
                <input
                  type="date"
                  id="dateTo"
                  value={dateTo}
                  onChange={(e) => handleDateToChange(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="filter-actions">
            <button className="btn btn-secondary" onClick={handleClearFilters}>
              Limpar Filtros
            </button>
          </div>
        </div>
      )}

      {/* Tabela de Alunos */}
      <div className="leads-table-container">
        {filteredAlunos.length === 0 ? (
          <div className="empty-state">
            <p>Nenhum aluno encontrado</p>
            <button
              className="btn btn-primary"
              onClick={() => navigate("/alunos/new")}
            >
              <Plus size={18} />
              Adicionar Primeiro Aluno
            </button>
          </div>
        ) : (
          <table className="leads-table">
            <thead>
              <tr>
                {isAdmin && (
                  <th style={{ width: "2rem" }}>
                    <input
                      type="checkbox"
                      checked={
                        selectedIds.length === filteredAlunos.length &&
                        filteredAlunos.length > 0
                      }
                      onChange={toggleSelectAll}
                    />
                  </th>
                )}
                <th>Nome</th>
                <th>Curso</th>
                <th>Contato</th>
                <th>Status</th>
                <th>Canal</th>
                <th>Débito</th>
                <th>Criado em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredAlunos.map((aluno) => {
                const isOwner = aluno.assignedTo === user?.id;
                const semResponsavel = !aluno.assignedTo;
                const podeEditar = isAdmin || isOwner;

                return (
                  <tr key={aluno.id}>
                    {isAdmin && (
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(aluno.id)}
                          onChange={() => toggleSelect(aluno.id)}
                        />
                      </td>
                    )}
                    <td>
                    <div className="lead-name-cell">
                      <strong>{aluno.name}</strong>
                      {aluno.ra && (
                        <span className="lead-position">RA: {aluno.ra}</span>
                      )}
                    </div>
                  </td>
                  <td>
                    {aluno.curso ? (
                      <div className="company-cell">
                        <GraduationCap size={14} />
                        <span>
                          {aluno.curso}
                          {aluno.turno ? ` · ${aluno.turno}` : ""}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted">-</span>
                    )}
                  </td>
                  <td>
                    <div className="contact-cell">
                      <div className="contact-item">
                        <Mail size={14} />
                        <a href={`mailto:${aluno.email}`}>{aluno.email}</a>
                      </div>
                      <div className="contact-item">
                        <Phone size={14} />
                        <a href={`tel:${aluno.phone}`}>{aluno.phone}</a>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span
                      className="status-badge-table"
                      style={{ backgroundColor: getStatusColor(aluno.status) }}
                    >
                      {statuses.find((s) => s.value === aluno.status)?.label}
                    </span>
                  </td>
                  <td>
                    <span className="source-badge">
                      {sources.find((s) => s.value === aluno.source)?.label}
                    </span>
                  </td>
                  <td>
                    {aluno.value ? (
                      <div className="value-cell">
                        <AlertCircle size={14} />
                        <strong>{formatCurrency(aluno.value)}</strong>
                      </div>
                    ) : (
                      <span className="text-muted">-</span>
                    )}
                  </td>
                  <td>
                    <div className="date-cell">
                      <Calendar size={14} />
                      <span>{formatDate(aluno.createdAt)}</span>
                    </div>
                  </td>
                  <td>
                    <div className="table-actions">
                      <button
                        className="btn-icon"
                        title="Ver detalhes"
                        onClick={() => navigate(`/alunos/${aluno.id}`)}
                      >
                        <Eye size={16} />
                      </button>
                      {podeEditar && (
                        <button
                          className="btn-icon"
                          title="Editar"
                          onClick={() => navigate(`/alunos/${aluno.id}/edit`)}
                        >
                          <Edit size={16} />
                        </button>
                      )}
                      {!isAdmin && semResponsavel && (
                        <button
                          className="btn-icon"
                          title="Assumir contato"
                          onClick={() => handleAssumir(aluno.id)}
                        >
                          <UserPlus size={16} />
                        </button>
                      )}
                      {podeEditar && (
                        <button
                          className="btn-icon btn-icon-danger"
                          title="Excluir"
                          onClick={() => handleDelete(aluno.id, aluno.name)}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default Alunos;