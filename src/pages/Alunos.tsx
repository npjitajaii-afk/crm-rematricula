import React, { useState, useRef, useMemo, useEffect } from "react";
import { useAlunos } from "../hooks/useAlunos";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { useConfirm } from "../hooks/useConfirm";
import { useTransferenciasPendentes } from "../hooks/useTransferenciasPendentes";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Filter,
  Download,
  Upload,
  Trash2,
  MoveHorizontal,
} from "lucide-react";
import SearchBox from "../components/SearchBox";
import AlunoSwipeRow from "../components/AlunoSwipeRow";
import RematriculaTabs from "../components/RematriculaTabs";
import AlunoExpandModal from "../components/AlunoExpandModal";
import DelegarContatoModal from "../components/DelegarContatoModal";
import "./Alunos.css";
import "../components/AlunoSwipeRow.css";

/** Escopo único desta sub-aba (Rematrícula → Alunos). Filtros e busca
 *  ficam 100% locais — não gravam em `filters` do AlunosContext e portanto
 *  não interferem em Engajamento, Meus Contatos, Retenção etc. */
const SCOPE_ID = "rematricula-alunos";

const Alunos: React.FC = () => {
  const {
    alunos,
    exportAlunos,
    importAlunos,
    deleteAluno,
    deleteAlunosBulk,
    assumirAluno,
    canGerenciarPolo,
    colaboradores,
  } = useAlunos();

  const { user } = useAuth();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const navigate = useNavigate();
  const {
    alunoIdsAguardandoMinhaAutorizacao,
    alunoIdsComPendente,
  } = useTransferenciasPendentes();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  // Ao clicar no card/linha do aluno, expande o painel por cima da tela
  // (ver AlunoExpandModal.tsx) em vez de navegar pra /alunos/:id.
  const [expandedAlunoId, setExpandedAlunoId] = useState<string | null>(null);
  const [delegarAlunoId, setDelegarAlunoId] = useState<string | null>(null);
  // Estado LOCAL de busca/filtros (isolado por SCOPE_ID).
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string[]>([]);
  const [selectedSource, setSelectedSource] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  // "" = Todos | "__sem__" = sem responsável | uuid = colaborador
  const [selectedColaborador, setSelectedColaborador] = useState<string>("");
  const [importProgress, setImportProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const PAGE_SIZE = 10;
  const [currentPage, setCurrentPage] = useState(1);

  const statuses = [
    { value: "cadastrado", label: "Cadastrado" },
    { value: "pendente", label: "Pendente de Contato" },
    { value: "contatado", label: "Contato Realizado" },
    { value: "aguardando_retorno", label: "Aguardando Retorno" },
    { value: "confirmado", label: "Confirmou Interesse" },
    { value: "documentacao", label: "Documentação/Pagamento" },
    { value: "aguardando_matricula", label: "Aguardando Matrícula" },
    { value: "matricula_confirmada", label: "Matrícula Confirmada" },
    { value: "rematriculado", label: "Rematriculado" },
    { value: "desistente", label: "Desistente" },
    { value: "retido", label: "Retido" },
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

  // Debounce local: só atualiza o termo usado no filtro 300ms após parar
  // de digitar (não toca no contexto global).
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
    }, 300);
  };

  const handleStatusFilter = (status: string) => {
    const newStatus = selectedStatus.includes(status)
      ? selectedStatus.filter((s) => s !== status)
      : [...selectedStatus, status];
    setSelectedStatus(newStatus);
    setCurrentPage(1);
  };

  const handleSourceFilter = (source: string) => {
    const newSource = selectedSource.includes(source)
      ? selectedSource.filter((s) => s !== source)
      : [...selectedSource, source];
    setSelectedSource(newSource);
    setCurrentPage(1);
  };

  const handleDateFromChange = (value: string) => {
    setDateFrom(value);
    setCurrentPage(1);
  };

  const handleDateToChange = (value: string) => {
    setDateTo(value);
    setCurrentPage(1);
  };

  const handleColaboradorFilter = (colaboradorId: string) => {
    setSelectedColaborador(colaboradorId);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setDebouncedSearch("");
    setSelectedStatus([]);
    setSelectedSource([]);
    setSelectedColaborador("");
    setDateFrom("");
    setDateTo("");
    setCurrentPage(1);
  };

  // Filtro 100% local a partir da lista completa do contexto.
  // Scope: rematricula-alunos — isolado de outras sub-abas.
  const filteredAlunos = useMemo(() => {
    return alunos.filter((aluno) => {
      if (aluno.area !== "rematricula") return false;

      if (debouncedSearch) {
        const searchLower = debouncedSearch.toLowerCase();
        const matchesSearch =
          aluno.name.toLowerCase().includes(searchLower) ||
          aluno.email.toLowerCase().includes(searchLower) ||
          aluno.curso?.toLowerCase().includes(searchLower) ||
          aluno.ra?.toLowerCase().includes(searchLower) ||
          aluno.phone.includes(debouncedSearch);
        if (!matchesSearch) return false;
      }

      if (selectedStatus.length > 0) {
        if (!selectedStatus.includes(aluno.status)) return false;
      }

      if (selectedSource.length > 0) {
        if (!selectedSource.includes(aluno.source)) return false;
      }

      if (dateFrom) {
        if (new Date(aluno.createdAt) < new Date(dateFrom)) return false;
      }

      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        if (new Date(aluno.createdAt) > to) return false;
      }

      if (selectedColaborador) {
        if (selectedColaborador === "__sem__") {
          if (aluno.assignedTo) return false;
        } else if (aluno.assignedTo !== selectedColaborador) {
          return false;
        }
      }

      return true;
    });
  }, [
    alunos,
    debouncedSearch,
    selectedStatus,
    selectedSource,
    dateFrom,
    dateTo,
    selectedColaborador,
  ]);

  // Paginação client-side (10 por página).
  const totalPages = Math.max(1, Math.ceil(filteredAlunos.length / PAGE_SIZE));
  const paginatedAlunos = useMemo(
    () =>
      filteredAlunos.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE
      ),
    [filteredAlunos, currentPage]
  );
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(1);
  }, [totalPages, currentPage]);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Permite selecionar o mesmo arquivo de novo depois de um import
    e.target.value = "";

    setImportProgress({ done: 0, total: 0 });

    try {
      const { duplicados } = await importAlunos(file, (done, total) => {
        setImportProgress({ done, total });
      });
      showToast(
        duplicados > 0
          ? `Alunos importados! ${duplicados} contato(s) ignorado(s) por já existir (RA ou nome+telefone repetido).`
          : "Alunos importados com sucesso!",
        "success"
      );
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
    const qtd = selectedIds.length;
    const confirmed = await confirm(
      qtd > 100
        ? `Você está prestes a excluir ${qtd} alunos. A exclusão será feita em lotes e pode levar alguns segundos. Essa ação não pode ser desfeita.`
        : `Tem certeza que deseja excluir ${qtd} aluno(s) selecionado(s)? Essa ação não pode ser desfeita.`,
      { confirmLabel: qtd > 100 ? `Excluir ${qtd} alunos` : "Excluir todos" }
    );
    if (!confirmed) return;

    try {
      if (qtd > 50) {
        showToast(`Excluindo ${qtd} alunos em lotes...`, "info");
      }
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
      {/* Abas da seção Rematrícula (Alunos / Risco de Evasão) */}
      <RematriculaTabs />

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
          {canGerenciarPolo && selectedIds.length > 0 && (
            <button className="btn btn-danger" onClick={handleBulkDelete}>
              <Trash2 size={18} />
              Excluir selecionados ({selectedIds.length})
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => exportAlunos()}>
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
        <SearchBox
          id={`search-${SCOPE_ID}`}
          placeholder="Buscar por nome, email, RA, curso..."
          value={searchTerm}
          onChange={handleSearch}
        />
        <button
          className={`btn btn-secondary ${showFilters ? "active" : ""}`}
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter size={18} />
          Filtros
          {(selectedStatus.length > 0 ||
            selectedSource.length > 0 ||
            selectedColaborador ||
            dateFrom ||
            dateTo) && (
            <span className="filter-badge">
              {selectedStatus.length +
                selectedSource.length +
                (selectedColaborador ? 1 : 0) +
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

          <div className="filter-group">
            <label>Colaborador:</label>
            <select
              className="filter-select"
              value={selectedColaborador}
              onChange={(e) => handleColaboradorFilter(e.target.value)}
            >
              <option value="">Todos</option>
              <option value="__sem__">Sem responsável</option>
              {colaboradores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-actions">
            <button className="btn btn-secondary" onClick={handleClearFilters}>
              Limpar Filtros
            </button>
          </div>
        </div>
      )}

      {/* Lista de Alunos: sem Kanban, cada linha é arrastada pro lado
          (clicando e segurando o botão do mouse, ou com o dedo no touch)
          pra revelar os botões de ação escondidos atrás dela. */}
      {filteredAlunos.length === 0 ? (
        <div className="leads-table-container">
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
        </div>
      ) : (
        <div className="alunos-swipe-list">
          <div className="alunos-swipe-hint">
            <MoveHorizontal size={14} />
            <span>
              Arraste uma linha pro lado (clique e segure) pra ver, editar,
              assumir ou excluir um aluno.
            </span>
            {canGerenciarPolo && (
              <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <input
                  type="checkbox"
                  checked={
                    selectedIds.length === filteredAlunos.length &&
                    filteredAlunos.length > 0
                  }
                  onChange={toggleSelectAll}
                />
                Selecionar todos
              </label>
            )}
          </div>

          {paginatedAlunos.map((aluno) => {
            const isOwner = aluno.assignedTo === user?.id;
            const semResponsavel = !aluno.assignedTo;
            // Admin/supervisor editam qualquer contato do polo (ex.: corrigir
            // informações cadastradas erradas), independente de ser o responsável.
            // Colaborador só edita os próprios.
            const podeEditar = canGerenciarPolo || isOwner;
            // Colaborador pode assumir contatos sem dono; admin/supervisor delegam diretamente
            const podeAssumir = !canGerenciarPolo && semResponsavel;
            // Admin e supervisor podem delegar qualquer contato do polo
            const podeDelegar = canGerenciarPolo;

            return (
              <AlunoSwipeRow
                key={aluno.id}
                aluno={aluno}
                statusLabel={statuses.find((s) => s.value === aluno.status)?.label}
                sourceLabel={sources.find((s) => s.value === aluno.source)?.label}
                responsavelNome={colaboradores.find((c) => c.id === aluno.assignedTo)?.name}
                showSelect={canGerenciarPolo}
                selected={selectedIds.includes(aluno.id)}
                onToggleSelect={() => toggleSelect(aluno.id)}
                podeEditar={podeEditar}
                podeAssumir={podeAssumir}
                podeDelegar={podeDelegar}
                isOpen={openRowId === aluno.id}
                onOpenChange={(open) => setOpenRowId(open ? aluno.id : null)}
                onView={() => setExpandedAlunoId(aluno.id)}
                onEdit={() => navigate(`/alunos/${aluno.id}/edit`)}
                onAssumir={() => handleAssumir(aluno.id)}
                onDelegar={() => setDelegarAlunoId(aluno.id)}
                onDelete={() => handleDelete(aluno.id, aluno.name)}
                aguardaMinhaAutorizacao={alunoIdsAguardandoMinhaAutorizacao.has(
                  aluno.id
                )}
                temTransferenciaPendente={alunoIdsComPendente.has(aluno.id)}
              />
            );
          })}

          {totalPages > 1 && (
            <div
              className="leads-pagination"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "1rem",
                padding: "1rem",
              }}
            >
              <button
                className="btn btn-secondary"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Anterior
              </button>
              <span>
                Página {currentPage} de {totalPages} ({filteredAlunos.length}{" "}
                contatos)
              </span>
              <button
                className="btn btn-secondary"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Próxima
              </button>
            </div>
          )}
        </div>
      )}

      {expandedAlunoId && (
        <AlunoExpandModal
          alunoId={expandedAlunoId}
          onClose={() => setExpandedAlunoId(null)}
          onOpenVinculada={(id) => setExpandedAlunoId(id)}
        />
      )}
      {delegarAlunoId && (() => {
        const aluno = filteredAlunos.find((item) => item.id === delegarAlunoId);
        return aluno ? <DelegarContatoModal aluno={aluno} onClose={() => setDelegarAlunoId(null)} /> : null;
      })()}
    </div>
  );
};

export default Alunos;