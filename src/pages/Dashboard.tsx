import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAlunos } from "../hooks/useAlunos";
import KanbanBoard from "../components/kanban/KanbanBoard";
import { Plus, Search, Filter, Download, Upload, X } from "lucide-react";
import "./Dashboard.css";

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { filters, setFilters, exportAlunos, importAlunos } = useAlunos();
  const [showFilters, setShowFilters] = useState(false);
  const [searchTerm, setSearchTerm] = useState(filters.search || "");
  const [isImporting, setIsImporting] = useState(false);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setFilters({ ...filters, search: value });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      await importAlunos(file);
      alert("Alunos importados com sucesso!");
    } catch (error) {
      alert(
        "Erro ao importar alunos: " +
          (error instanceof Error ? error.message : "Erro desconhecido")
      );
    } finally {
      setIsImporting(false);
      e.target.value = "";
    }
  };

  const clearFilters = () => {
    setSearchTerm("");
    setFilters({});
    setShowFilters(false);
  };

  const hasActiveFilters =
    searchTerm || filters.status?.length || filters.source?.length;

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h1>Início</h1>
          <p className="dashboard-subtitle">
            Acompanhe o pipeline de rematrícula
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
            <p className="text-secondary">
              Filtros adicionais em desenvolvimento...
            </p>
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
