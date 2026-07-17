import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAlunos } from "../hooks/useAlunos";
import { useToast } from "../hooks/useToast";
import KanbanBoard from "../components/kanban/KanbanBoard";
import { AlunoStatus, CanalContato } from "../types";
import { Plus, Search, Filter, Download, Upload, X } from "lucide-react";
import "./Dashboard.css";

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

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { filters, setFilters, exportAlunos, importAlunos } = useAlunos();
  const { showToast } = useToast();
  const [showFilters, setShowFilters] = useState(false);
  const [searchTerm, setSearchTerm] = useState(filters.search || "");
  const [isImporting, setIsImporting] = useState(false);

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

  const handleSearchChange = (value: string) => {
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

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      await importAlunos(file);
      showToast("Alunos importados com sucesso!", "success");
    } catch (error) {
      showToast(
        "Erro ao importar alunos: " +
          (error instanceof Error ? error.message : "Erro desconhecido"),
        "error"
      );
    } finally {
      setIsImporting(false);
      e.target.value = "";
    }
  };

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedStatus([]);
    setSelectedSource([]);
    setDateFrom("");
    setDateTo("");
    setFilters({});
    setShowFilters(false);
  };

  const hasActiveFilters =
    searchTerm ||
    filters.status?.length ||
    filters.source?.length ||
    filters.dateFrom ||
    filters.dateTo;

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h1>Pipeline de Rematrícula</h1>
          <p className="dashboard-subtitle">
            Gerencie o acompanhamento de rematrícula dos alunos
          </p>
        </div>

        <div className="dashboard-actions">
          <button
            className="btn btn-primary"
            onClick={() => navigate("/alunos/new")}
          >
            <Plus size={20} />
            <span className="btn-text">Novo Aluno</span>
          </button>
        </div>
      </div>

      <div className="dashboard-toolbar">
        <div className="search-wrapper">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Buscar por nome, email, RA, curso..."
            className="search-input"
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          {searchTerm && (
            <button
              className="clear-search"
              onClick={() => handleSearchChange("")}
            >
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
            <span className="btn-text">Filtros</span>
            {hasActiveFilters && <span className="filter-indicator" />}
          </button>

          <label className="btn btn-secondary" htmlFor="import-file">
            <Upload size={18} />
            <span className="btn-text">
              {isImporting ? "Importando..." : "Importar"}
            </span>
            <input
              id="import-file"
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleImport}
              disabled={isImporting}
              style={{ display: "none" }}
            />
          </label>

          <button className="btn btn-secondary" onClick={exportAlunos}>
            <Download size={18} />
            <span className="btn-text">Exportar</span>
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="filters-panel">
          <div className="filters-header">
            <h3>Filtros Avançados</h3>
            {hasActiveFilters && (
              <button
                className="btn btn-sm btn-secondary"
                onClick={clearFilters}
              >
                Limpar Filtros
              </button>
            )}
          </div>
          <div className="filters-content">
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
                  <label htmlFor="dashDateFrom">De:</label>
                  <input
                    type="date"
                    id="dashDateFrom"
                    value={dateFrom}
                    onChange={(e) => handleDateFromChange(e.target.value)}
                  />
                </div>
                <div className="date-filter-item">
                  <label htmlFor="dashDateTo">Até:</label>
                  <input
                    type="date"
                    id="dashDateTo"
                    value={dateTo}
                    onChange={(e) => handleDateToChange(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="dashboard-content">
        <KanbanBoard />
      </div>
    </div>
  );
};

export default Dashboard;