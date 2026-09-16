import React, { useState, useRef, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAlunos } from "../hooks/useAlunos";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { useConfirm } from "../hooks/useConfirm";
import { Plus, Sparkles, MoveHorizontal, Upload, Trash2, Filter, Download } from "lucide-react";
import SearchBox from "../components/SearchBox";
import { AREA_CONFIG } from "../config/areas";
import { getStatusLabel, getSourceLabel } from "../utils/formatters";
import AlunoSwipeRow from "../components/AlunoSwipeRow";
import EngajamentoTabs from "../components/EngajamentoTabs";
import AlunoExpandModal from "../components/AlunoExpandModal";
import DelegarContatoModal from "../components/DelegarContatoModal";
import "./Alunos.css";
import "../components/AlunoSwipeRow.css";

// Rótulos de status/canal do Engajamento resolvidos a partir da mesma fonte
// de verdade usada pelo Kanban (AREA_CONFIG) — ver README.md seção 6.
const statuses = AREA_CONFIG.engajamento.statuses.map((value) => ({
  value,
  label: getStatusLabel(value),
}));

const sources = [
  "telefone",
  "whatsapp",
  "email",
  "presencial",
  "ava",
  "indicacao",
  "outro",
].map((value) => ({ value, label: getSourceLabel(value) }));

/**
 * Funil de Engajamento: acompanha calouros (matrícula nova) nas primeiras
 * semanas para reduzir evasão precoce. Entrada é manual, pelo cadastro em
 * /engajamento/novo (AlunoForm em modo Engajamento). Ver README.md seção 1 e 5.
 *
 * Exibida em LISTA (mesmo padrão de src/pages/Alunos.tsx, com
 * AlunoSwipeRow) — o Kanban desta área fica só em "Meus Contatos"
 * (ver MeusContatosEngajamento.tsx).
 */
/** Escopo único desta sub-aba (Engajamento → Alunos). Filtros e busca
 *  ficam 100% locais — não gravam em `filters` do AlunosContext e portanto
 *  não interferem em Rematrícula, Meus Contatos, Retenção etc. */
const SCOPE_ID = "engajamento-alunos";

const Engajamento: React.FC = () => {
  const {
    alunos,
    importAlunosEngajamento,
    deleteAluno,
    deleteAlunosBulk,
    assumirAluno,
    canGerenciarPolo,
    colaboradores,
    setores,
  } = useAlunos();

  const { user } = useAuth();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const navigate = useNavigate();
  // Estado LOCAL de busca/filtros (isolado por SCOPE_ID).
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string[]>([]);
  // "" = Todos | "__sem__" = contatos sem responsável | uuid = colaborador
  const [selectedColaborador, setSelectedColaborador] = useState<string>("");
  const [selectedSetor, setSelectedSetor] = useState<string>("");
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  // Ao clicar no card/linha do aluno, expande o painel por cima da tela
  // (ver AlunoExpandModal.tsx) em vez de navegar pra /alunos/:id.
  const [expandedAlunoId, setExpandedAlunoId] = useState<string | null>(null);
  const [delegarAlunoId, setDelegarAlunoId] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  /** Setor aplicado na importação; "" = sem setor */
  const [importSetorId, setImportSetorId] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const PAGE_SIZE = 10;
  const [currentPage, setCurrentPage] = useState(1);

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

  const handleColaboradorFilter = (colaboradorId: string) => {
    setSelectedColaborador(colaboradorId);
    setCurrentPage(1);
  };

  const handleSetorFilter = (setorId: string) => {
    setSelectedSetor(setorId);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setDebouncedSearch("");
    setSelectedStatus([]);
    setSelectedColaborador("");
    setSelectedSetor("");
    setCurrentPage(1);
  };

  // Filtro 100% local a partir da lista completa do contexto.
  // Scope: engajamento-alunos — isolado de outras sub-abas.
  const filteredAlunos = useMemo(() => {
    return alunos.filter((aluno) => {
      if (aluno.area !== "engajamento") return false;

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

      if (selectedColaborador) {
        if (selectedColaborador === "__sem__") {
          if (aluno.assignedTo) return false;
        } else if (aluno.assignedTo !== selectedColaborador) {
          return false;
        }
      }

      if (selectedSetor) {
        if (aluno.setorId !== selectedSetor) return false;
      }

      return true;
    });
  }, [alunos, debouncedSearch, selectedStatus, selectedColaborador, selectedSetor]);

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

  // Exporta só os contatos de Engajamento (já filtrados por status/colaborador/busca).
  const handleExport = async () => {
    try {
      const dataToExport = filteredAlunos.map((aluno) => ({
        Nome: aluno.name,
        Email: aluno.email,
        Telefone: aluno.phone,
        RA: aluno.ra || "",
        Curso: aluno.curso || "",
        Turno: aluno.turno || "",
        Status: statuses.find((s) => s.value === aluno.status)?.label || aluno.status,
        Canal: sources.find((s) => s.value === aluno.source)?.label || aluno.source,
        Setor: (aluno.setorNome === "Geral" ? "Pendente" : aluno.setorNome) || "Pendente",
        Responsável:
          colaboradores.find((c) => c.id === aluno.assignedTo)?.name || "",
        "Valor Pendente": aluno.value || 0,
        "Data Criação": new Date(aluno.createdAt).toLocaleDateString("pt-BR"),
        Observações: aluno.observations || "",
        Tags: (aluno.tags || []).join(", "),
      }));

      const XLSX = await import("xlsx");
      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Engajamento");

      const fileName = `alunos-engajamento-${
        new Date().toISOString().split("T")[0]
      }.xlsx`;
      XLSX.writeFile(workbook, fileName);
      showToast(
        `${dataToExport.length} contato(s) exportado(s) com sucesso.`,
        "success"
      );
    } catch (error) {
      console.error("Erro ao exportar:", error);
      showToast("Erro ao exportar planilha. Tente novamente.", "error");
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
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredAlunos.length) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(filteredAlunos.map((aluno) => aluno.id));
  };

  const handleBulkDelete = async () => {
    const confirmed = await confirm(
      `Tem certeza que deseja excluir ${selectedIds.length} contato(s) selecionado(s)? Essa ação não pode ser desfeita.`,
      { confirmLabel: "Excluir todos" }
    );
    if (!confirmed) return;

    try {
      const deletedCount = await deleteAlunosBulk(selectedIds);
      setSelectedIds([]);
      if (deletedCount < selectedIds.length) {
        showToast(
          `${deletedCount} de ${selectedIds.length} contato(s) excluído(s). Verifique as permissões dos demais.`,
          deletedCount > 0 ? "info" : "error"
        );
      } else {
        showToast(`${deletedCount} contato(s) excluído(s) com sucesso.`, "success");
      }
    } catch {
      showToast("Erro ao excluir os contatos selecionados. Tente novamente.", "error");
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    setImportProgress({ done: 0, total: 0 });

    try {
      const { imported, ignored, duplicados } = await importAlunosEngajamento(
        file,
        (done, total) => {
          setImportProgress({ done, total });
        },
        { setorId: importSetorId || null }
      );
      showToast(
        `${imported} card(s) criado(s) para o polo de Itajaí` +
          (ignored ? `; ${ignored} registro(s) de outros polos ignorado(s)` : "") +
          (duplicados ? `; ${duplicados} contato(s) já existente(s) ignorado(s) (duplicado).` : ".") ,
        "success"
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Erro ao importar a planilha.", "error");
    } finally {
      setImportProgress(null);
    }
  };

  return (
    <div className="leads-page">
      {/* Abas da seção Engajamento (Alunos / Meus Contatos) */}
      <EngajamentoTabs />

      <div className="leads-header">
        <div>
          <h1>
            <Sparkles size={22} style={{ verticalAlign: "text-bottom", marginRight: 8 }} />
            Engajamento
          </h1>
          <p className="leads-subtitle">
            {filteredAlunos.length}{" "}
            {filteredAlunos.length === 1 ? "calouro" : "calouros"} em
            acompanhamento
          </p>
        </div>
        <div
          className="leads-actions"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: "0.4rem",
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: "0.5rem",
            }}
          >
            {canGerenciarPolo && selectedIds.length > 0 && (
              <button className="btn btn-danger" onClick={handleBulkDelete}>
                <Trash2 size={18} />
                Excluir selecionados ({selectedIds.length})
              </button>
            )}
            <button className="btn btn-secondary" onClick={handleExport}>
              <Download size={18} />
              Exportar
            </button>
            <label className={`btn btn-secondary${importProgress ? " btn-disabled" : ""}`}>
              <Upload size={18} />
              {importProgress
                ? importProgress.total > 0
                  ? `Importando ${importProgress.done}/${importProgress.total}...`
                  : "Lendo arquivo..."
                : "Importar planilha"}
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
              onClick={() => navigate("/engajamento/novo")}
            >
              <Plus size={18} />
              Novo Aluno
            </button>
          </div>
          {canGerenciarPolo && (
            <select
              className="filter-select"
              style={{ maxWidth: 200 }}
              value={importSetorId}
              onChange={(e) => setImportSetorId(e.target.value)}
              disabled={!!importProgress}
              title="Setor dos contatos importados"
              aria-label="Setor da importação"
            >
              <option value="">Importar como Pendente (sem setor)</option>
              {(setores || [])
                .filter((s) => {
                  if (s.nome === "Geral" || s.nome === "Pendente") return false;
                  if (user?.poloId) return s.poloId === user.poloId;
                  return true;
                })
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
            </select>
          )}
        </div>
      </div>

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
            selectedColaborador ||
            selectedSetor) && (
            <span className="filter-badge">
              {selectedStatus.length +
                (selectedColaborador ? 1 : 0) +
                (selectedSetor ? 1 : 0)}
            </span>
          )}
        </button>
      </div>

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
                  {c.setorNome ? ` · ${c.setorNome}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Setor:</label>
            <select
              className="filter-select"
              value={selectedSetor}
              onChange={(e) => handleSetorFilter(e.target.value)}
            >
              <option value="">Todos os setores</option>
              {setores
                .filter((s) => {
                  // Sempre filtra pelo polo do usuário logado.
                  // Assim o admin também vê só os 3 setores do próprio polo
                  // (Comercial, Contato, Jornada) e não a lista repetida de todos os polos.
                  if (user?.poloId) return s.poloId === user.poloId;
                  return true;
                })
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
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
          pra revelar os botões de ação escondidos atrás dela. O Kanban
          desta área continua disponível em "Meus Contatos". */}
      {filteredAlunos.length === 0 ? (
        <div className="leads-table-container">
          <div className="empty-state">
            <p>Nenhum aluno encontrado</p>
            <button
              className="btn btn-primary"
              onClick={() => navigate("/engajamento/novo")}
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
                  checked={selectedIds.length === filteredAlunos.length && filteredAlunos.length > 0}
                  onChange={toggleSelectAll}
                />
                Selecionar todos
              </label>
            )}
          </div>

          {paginatedAlunos.map((aluno) => {
            const isOwner = aluno.assignedTo === user?.id;
            const semResponsavel = !aluno.assignedTo;
            // Admin/supervisor editam qualquer contato do polo (corrige infos erradas
            // mesmo sem ser o responsável). Colaborador só edita os próprios.
            const podeEditar = canGerenciarPolo || isOwner;
            const podeAssumir = !canGerenciarPolo && semResponsavel;
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

export default Engajamento;
