import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAlunos } from "../hooks/useAlunos";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { useConfirm } from "../hooks/useConfirm";
import { Search, Plus, Sparkles, MoveHorizontal, Upload, Trash2 } from "lucide-react";
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
const Engajamento: React.FC = () => {
  const {
    filteredAlunos: filteredAlunosTodasAreas,
    filters,
    setFilters,
    importAlunosEngajamento,
    deleteAluno,
    deleteAlunosBulk,
    assumirAluno,
    isAdmin,
    colaboradores,
  } = useAlunos();

  const filteredAlunos = filteredAlunosTodasAreas.filter(
    (aluno) => aluno.area === "engajamento"
  );

  const { user } = useAuth();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState(filters.search || "");
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  // Ao clicar no card/linha do aluno, expande o painel por cima da tela
  // (ver AlunoExpandModal.tsx) em vez de navegar pra /alunos/:id.
  const [expandedAlunoId, setExpandedAlunoId] = useState<string | null>(null);
  const [delegarAlunoId, setDelegarAlunoId] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setFilters({ ...filters, search: value });
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
      const { imported, ignored, duplicados } = await importAlunosEngajamento(file, (done, total) => {
        setImportProgress({ done, total });
      });
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
        <div className="leads-actions">
          {isAdmin && selectedIds.length > 0 && (
            <button className="btn btn-danger" onClick={handleBulkDelete}>
              <Trash2 size={18} />
              Excluir selecionados ({selectedIds.length})
            </button>
          )}
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
      </div>

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
      </div>

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
            {isAdmin && (
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

          {filteredAlunos.map((aluno) => {
            const isOwner = aluno.assignedTo === user?.id;
            const semResponsavel = !aluno.assignedTo;
            const podeEditar = isAdmin || isOwner;
            const podeAssumir = !isAdmin && semResponsavel;
            const podeDelegar = isAdmin;

            return (
              <AlunoSwipeRow
                key={aluno.id}
                aluno={aluno}
                statusLabel={statuses.find((s) => s.value === aluno.status)?.label}
                sourceLabel={sources.find((s) => s.value === aluno.source)?.label}
                responsavelNome={colaboradores.find((c) => c.id === aluno.assignedTo)?.name}
                showSelect={isAdmin}
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
        </div>
      )}

      {expandedAlunoId && (
        <AlunoExpandModal
          alunoId={expandedAlunoId}
          onClose={() => setExpandedAlunoId(null)}
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