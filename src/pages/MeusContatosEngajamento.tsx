import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Columns3, List, MoveHorizontal, Plus } from "lucide-react";
import SearchBox from "../components/SearchBox";
import { useAlunos } from "../hooks/useAlunos";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { useConfirm } from "../hooks/useConfirm";
import { useTransferenciasPendentes } from "../hooks/useTransferenciasPendentes";
import KanbanBoard from "../components/kanban/KanbanBoard";
import EngajamentoTabs from "../components/EngajamentoTabs";
import AlunoSwipeRow from "../components/AlunoSwipeRow";
import AlunoExpandModal from "../components/AlunoExpandModal";
import DelegarContatoModal from "../components/DelegarContatoModal";
import { getStatusLabel, getSourceLabel } from "../utils/formatters";
import "./MeusContatos.css";
import "./Alunos.css";
import "../components/AlunoSwipeRow.css";

type ViewMode = "kanban" | "lista";

const SCOPE_ID = "engajamento-meus-contatos";
const VIEW_STORAGE_KEY = `view-${SCOPE_ID}`;
const PAGE_SIZE = 10;

function loadViewMode(): ViewMode {
  try {
    const saved = localStorage.getItem(VIEW_STORAGE_KEY);
    if (saved === "lista" || saved === "kanban") return saved;
  } catch {
    /* ignore */
  }
  return "kanban";
}

/**
 * Meus Contatos (Engajamento): só alunos em que o usuário logado é o
 * responsável. Alterna entre Kanban e lista (linhas iguais a Alunos.tsx /
 * Engajamento.tsx). Busca e modo de visualização são locais a esta sub-aba.
 */
const MeusContatosEngajamento: React.FC = () => {
  const {
    alunos,
    colaboradores,
    deleteAluno,
    canGerenciarPolo,
  } = useAlunos();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const navigate = useNavigate();
  const {
    alunoIdsAguardandoMinhaAutorizacao,
    alunoIdsComPendente,
  } = useTransferenciasPendentes();

  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode);
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [expandedAlunoId, setExpandedAlunoId] = useState<string | null>(null);
  const [delegarAlunoId, setDelegarAlunoId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);

  const totalMeus = useMemo(
    () =>
      alunos.filter(
        (a) => a.area === "engajamento" && a.assignedTo === user?.id
      ).length,
    [alunos, user]
  );

  // Lista filtrada (só meus contatos + busca local) para o modo "lista".
  const meusFiltrados = useMemo(() => {
    const termo = searchTerm.trim().toLowerCase();
    return alunos.filter((a) => {
      if (a.area !== "engajamento") return false;
      if (a.assignedTo !== user?.id) return false;
      if (!termo) return true;
      const alvo =
        `${a.name} ${a.email ?? ""} ${a.phone ?? ""} ${a.ra ?? ""} ${a.curso ?? ""}`.toLowerCase();
      return alvo.includes(termo);
    });
  }, [alunos, searchTerm, user]);

  const totalPages = Math.max(1, Math.ceil(meusFiltrados.length / PAGE_SIZE));
  const paginated = useMemo(
    () =>
      meusFiltrados.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE
      ),
    [meusFiltrados, currentPage]
  );

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(1);
  }, [totalPages, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const outrosEncontrados = useMemo(() => {
    const termo = searchTerm.trim().toLowerCase();
    if (!termo || !user) return [];

    return alunos
      .filter((a) => {
        if (a.area !== "engajamento") return false;
        if (a.assignedTo === user.id) return false;
        const alvo =
          `${a.name} ${a.email ?? ""} ${a.phone ?? ""} ${a.ra ?? ""}`.toLowerCase();
        return alvo.includes(termo);
      })
      .slice(0, 8);
  }, [alunos, searchTerm, user]);

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

  return (
    <div className="meus-contatos-page">
      <EngajamentoTabs />

      <div className="meus-contatos-header">
        <div>
          <h1>Meus Contatos</h1>
          <p className="meus-contatos-subtitle">
            {totalMeus}{" "}
            {totalMeus === 1
              ? "aluno sob sua responsabilidade"
              : "alunos sob sua responsabilidade"}
          </p>
        </div>
        <div className="meus-contatos-actions">
          <button
            className="btn btn-primary"
            onClick={() => navigate("/engajamento/novo?paraMim=1")}
          >
            <Plus size={18} />
            Novo Contato
          </button>
        </div>
      </div>

      <div className="meus-contatos-toolbar">
        <SearchBox
          id={`search-${SCOPE_ID}`}
          placeholder="Buscar nos meus contatos..."
          value={searchTerm}
          onChange={setSearchTerm}
          maxWidth="360px"
        />

        <div
          className="meus-contatos-view-toggle"
          role="group"
          aria-label="Modo de visualização"
        >
          <button
            type="button"
            className={`meus-contatos-view-btn ${viewMode === "kanban" ? "active" : ""}`}
            onClick={() => setViewMode("kanban")}
            title="Visualização em Kanban"
            aria-pressed={viewMode === "kanban"}
          >
            <Columns3 size={16} />
            <span>Kanban</span>
          </button>
          <button
            type="button"
            className={`meus-contatos-view-btn ${viewMode === "lista" ? "active" : ""}`}
            onClick={() => setViewMode("lista")}
            title="Visualização em lista"
            aria-pressed={viewMode === "lista"}
          >
            <List size={16} />
            <span>Lista</span>
          </button>
        </div>
      </div>

      {outrosEncontrados.length > 0 && (
        <div className="meus-contatos-outros" role="status">
          <strong>
            {outrosEncontrados.length === 1
              ? "1 contato encontrado fora da sua carteira"
              : `${outrosEncontrados.length} contatos encontrados fora da sua carteira`}
          </strong>
          <ul>
            {outrosEncontrados.map((a) => {
              const resp =
                colaboradores.find((c) => c.id === a.assignedTo)?.name ||
                (a.assignedTo ? "outro colaborador" : "sem responsável");
              return (
                <li key={a.id}>
                  <span className="meus-contatos-outros-nome">{a.name}</span>
                  {a.ra ? (
                    <span className="meus-contatos-outros-meta">RA {a.ra}</span>
                  ) : null}
                  <span className="meus-contatos-outros-meta">· {resp}</span>
                </li>
              );
            })}
          </ul>
          <p className="meus-contatos-outros-hint">
            O contato já existe no polo. Não cadastre de novo — peça delegação
            ou fale com o responsável.
          </p>
        </div>
      )}

      {viewMode === "kanban" ? (
        <KanbanBoard area="engajamento" onlyMine searchTerm={searchTerm} />
      ) : meusFiltrados.length === 0 ? (
        <div className="leads-table-container">
          <div className="empty-state">
            <p>Nenhum contato encontrado na sua carteira</p>
            <button
              className="btn btn-primary"
              onClick={() => navigate("/engajamento/novo?paraMim=1")}
            >
              <Plus size={18} />
              Novo Contato
            </button>
          </div>
        </div>
      ) : (
        <div className="alunos-swipe-list">
          <div className="alunos-swipe-hint">
            <MoveHorizontal size={14} />
            <span>
              Arraste uma linha pro lado (clique e segure) pra ver, editar ou
              excluir um aluno.
            </span>
          </div>

          {paginated.map((aluno) => {
            // Nesta aba todos são do usuário logado → sempre pode editar.
            const podeEditar = true;
            const podeAssumir = false;
            const podeDelegar = canGerenciarPolo;

            return (
              <AlunoSwipeRow
                key={aluno.id}
                aluno={aluno}
                statusLabel={getStatusLabel(aluno.status)}
                sourceLabel={getSourceLabel(aluno.source)}
                responsavelNome={
                  colaboradores.find((c) => c.id === aluno.assignedTo)?.name
                }
                showSelect={false}
                selected={false}
                onToggleSelect={() => {}}
                podeEditar={podeEditar}
                podeAssumir={podeAssumir}
                podeDelegar={podeDelegar}
                isOpen={openRowId === aluno.id}
                onOpenChange={(open) => setOpenRowId(open ? aluno.id : null)}
                onView={() => setExpandedAlunoId(aluno.id)}
                onEdit={() => navigate(`/alunos/${aluno.id}/edit`)}
                onAssumir={() => {}}
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
                Página {currentPage} de {totalPages} ({meusFiltrados.length}{" "}
                contatos)
              </span>
              <button
                className="btn btn-secondary"
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
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
      {delegarAlunoId &&
        (() => {
          const aluno = meusFiltrados.find((item) => item.id === delegarAlunoId);
          return aluno ? (
            <DelegarContatoModal
              aluno={aluno}
              onClose={() => setDelegarAlunoId(null)}
            />
          ) : null;
        })()}
    </div>
  );
};

export default MeusContatosEngajamento;
