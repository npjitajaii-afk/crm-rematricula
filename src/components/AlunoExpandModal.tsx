import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Mail,
  Phone,
  GraduationCap,
  Tag,
  ListChecks,
  Check,
  Save,
  Hash,
  Users,
  Trash2,
  MessageSquare,
  Plus,
  Link2,
} from "lucide-react";
import { useAlunos } from "../hooks/useAlunos";
import { useAuth } from "../hooks/useAuth";
import { useChecklist } from "../hooks/useChecklist";
import { useToast } from "../hooks/useToast";
import { AlunoStatus } from "../types";
import { getAlunoById } from "../services/alunosService";
import { AREA_CONFIG } from "../config/areas";
import { TAGS_SELECIONAVEIS_POR_AREA, TAGS_DISPONIVEIS } from "../utils/tags";
import { getStatusColor, getStatusLabel } from "../utils/formatters";
import NovaMatriculaModal from "./NovaMatriculaModal";
import "../pages/AlunoDetails.css";
import "../pages/AlunoForm.css";
import "./AlunoExpandModal.css";

interface AnotacaoEntry {
  id: string;
  texto: string;
  autorNome: string;
  autorId: string;
  criadaEm: string;
}

interface AlunoExpandModalProps {
  /** Id do aluno cujo card foi clicado — sempre buscamos a versão mais
   * atual pelo contexto (getAluno), pra refletir imediatamente qualquer
   * mudança de status/tag feita aqui mesmo dentro do modal. */
  alunoId: string;
  onClose: () => void;
  /** Chamado quando o usuário clica na aba da matrícula vinculada — quem
   * abriu este modal decide o que fazer (normalmente troca o alunoId
   * exibido, sem fechar e reabrir o overlay). Opcional: se omitido, a
   * aba da matrícula vinculada não é exibida aqui. */
  onOpenVinculada?: (id: string) => void;
}

// Painel "expandido" do card do aluno: abre por cima da tela (Kanban ou
// lista) em vez de navegar pra /alunos/:id. Layout em 3 colunas — ver
// pedido do usuário: esquerda = dados de contato, meio (maior, dividido em
// duas partes) = anotações + tarefas do checklist, direita = status e
// etiquetas.
const AlunoExpandModal: React.FC<AlunoExpandModalProps> = ({
  alunoId,
  onClose,
  onOpenVinculada,
}) => {
  const { getAluno, updateAluno, colaboradores, isAdmin } = useAlunos();
  const [criandoVinculada, setCriandoVinculada] = useState(false);
  const {
    itensPorAluno,
    toggleItem,
    isLoading: checklistCarregando,
    garantirItensCarregados,
  } = useChecklist();
  const { showToast } = useToast();

  const { user } = useAuth();
  const [aluno, setAluno] = useState(getAluno(alunoId));
  // Quando o card clicado é o de uma matrícula vinculada (outra área/funil),
  // ela pode ainda não estar carregada na lista `alunos` do contexto (a
  // busca prioriza a área da rota atual — ver AlunosContext.tsx). Sem isso,
  // o modal simplesmente não abria: `aluno` ficava undefined e o componente
  // retornava null, dando a impressão de que o clique não fazia nada.
  const [buscandoVinculada, setBuscandoVinculada] = useState(false);
  const [naoEncontrado, setNaoEncontrado] = useState(false);
  const [novaAnotacao, setNovaAnotacao] = useState("");
  const [salvandoObs, setSalvandoObs] = useState(false);
  // Anotações e Tarefas dividem a coluna do meio em abas — só uma fica
  // visível por vez (ver pedido do usuário).
  const [abaMeio, setAbaMeio] = useState<"anotacoes" | "tarefas">(
    "anotacoes"
  );

  // Interpreta o campo observations como lista de entradas JSON.
  // Formato: [{id, texto, autorNome, autorId, criadaEm}]
  // Se for string simples (legado), converte em uma entrada.
  const parseAnotacoes = (raw: string | undefined) => {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as AnotacaoEntry[];
      return [{ id: "legado", texto: raw, autorNome: "—", autorId: "", criadaEm: "" }];
    } catch {
      return [{ id: "legado", texto: raw, autorNome: "—", autorId: "", criadaEm: "" }];
    }
  };

  // Re-sincroniza o aluno local sempre que o contexto atualizar o registro.
  // Se o id não estiver na lista já carregada (caso da matrícula vinculada
  // de outra área que ainda não chegou), busca direto pelo id no banco em
  // vez de deixar o modal em branco.
  useEffect(() => {
    let cancelado = false;
    setNaoEncontrado(false);

    const atual = getAluno(alunoId);
    if (atual) {
      setAluno(atual);
      return;
    }

    setAluno(undefined);
    setBuscandoVinculada(true);
    getAlunoById(alunoId)
      .then(({ aluno: encontrado }) => {
        if (cancelado) return;
        if (encontrado) {
          setAluno(encontrado);
        } else {
          setNaoEncontrado(true);
        }
      })
      .catch(() => {
        if (!cancelado) setNaoEncontrado(true);
      })
      .finally(() => {
        if (!cancelado) setBuscandoVinculada(false);
      });

    return () => {
      cancelado = true;
    };
  }, [alunoId, getAluno]);

  // Fecha com Esc.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const refreshAluno = () => {
    const atual = getAluno(alunoId);
    if (atual) setAluno(atual);
  };

  if (!aluno) {
    // Ainda buscando a matrícula vinculada (ou ela não existe mais) — sem
    // isso o overlay nem aparecia e o clique parecia não fazer nada.
    if (buscandoVinculada || !naoEncontrado) {
      return createPortal(
        <div
          className="aluno-expand-overlay"
          onClick={(e) => {
            e.stopPropagation();
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <div className="aluno-expand-modal aluno-expand-modal--carregando">
            <p>Carregando matrícula vinculada…</p>
          </div>
        </div>,
        document.body
      );
    }

    return createPortal(
      <div
        className="aluno-expand-overlay"
        onClick={(e) => {
          e.stopPropagation();
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="aluno-expand-modal aluno-expand-modal--carregando">
          <p>Não foi possível carregar essa matrícula.</p>
          <button type="button" className="aluno-expand-close" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>,
      document.body
    );
  }

  const config = AREA_CONFIG[aluno.area];
  const tagsSelecionaveis =
    aluno.area === "rematricula" || aluno.area === "engajamento"
      ? TAGS_SELECIONAVEIS_POR_AREA[aluno.area]
      : TAGS_DISPONIVEIS;

  const itensChecklist =
    aluno.area === "engajamento" ? itensPorAluno[aluno.id] : undefined;
  const concluidos = itensChecklist?.filter((i) => i.concluido).length || 0;

  // Mesmo caso do AlunoCard: garante que a checklist deste aluno foi
  // buscada, sem depender de o usuário mexer numa tarefa pra "revelar"
  // as demais.
  useEffect(() => {
    if (aluno.area === "engajamento") {
      garantirItensCarregados(aluno.id);
    }
  }, [aluno.area, aluno.id, garantirItensCarregados]);

  const handleStatusChange = async (status: AlunoStatus) => {
    try {
      await updateAluno(aluno.id, { status });
      refreshAluno();
    } catch {
      showToast("Erro ao atualizar status. Tente novamente.", "error");
    }
  };

  const handleToggleTag = async (tag: string) => {
    const tagsAtuais = aluno.tags || [];
    const novasTags = tagsAtuais.includes(tag)
      ? tagsAtuais.filter((t) => t !== tag)
      : [...tagsAtuais, tag];
    try {
      await updateAluno(aluno.id, { tags: novasTags });
      refreshAluno();
    } catch {
      showToast("Erro ao atualizar etiquetas. Tente novamente.", "error");
    }
  };

  const anotacoes = parseAnotacoes(aluno.observations);

  const handleSalvarAnotacao = async () => {
    if (!novaAnotacao.trim()) return;
    setSalvandoObs(true);
    try {
      const novaEntrada: AnotacaoEntry = {
        id: crypto.randomUUID(),
        texto: novaAnotacao.trim(),
        autorNome: user?.name || user?.email || "Desconhecido",
        autorId: user?.id || "",
        criadaEm: new Date().toISOString(),
      };
      const atualizado = JSON.stringify([novaEntrada, ...anotacoes]);
      await updateAluno(aluno.id, { observations: atualizado });
      setNovaAnotacao("");
      showToast("Anotação salva!", "success");
    } catch {
      showToast("Erro ao salvar anotação. Tente novamente.", "error");
    } finally {
      setSalvandoObs(false);
    }
  };

  const handleDeletarAnotacao = async (id: string) => {
    const restantes = anotacoes.filter((a) => a.id !== id);
    try {
      await updateAluno(aluno.id, {
        observations: restantes.length > 0 ? JSON.stringify(restantes) : undefined,
      });
      showToast("Anotação excluída.", "success");
    } catch {
      showToast("Erro ao excluir anotação. Tente novamente.", "error");
    }
  };

  return createPortal(
    <div
      className="aluno-expand-overlay"
      onClick={(e) => {
        // SEMPRE para a propagação: eventos de portal sobem pela árvore
        // React (não pelo DOM real), então sem isso o clique no overlay
        // chega ao onClick do AlunoCard e reabre o modal imediatamente.
        e.stopPropagation();
        // Fecha apenas quando o clique foi no próprio backdrop (fundo escuro).
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="aluno-expand-modal">
        <div className="aluno-expand-modal-header">
          <div className="aluno-expand-modal-title">
            <h2>{aluno.name}</h2>
            <span
              className="status-badge"
              style={{ backgroundColor: getStatusColor(aluno.status) }}
            >
              {getStatusLabel(aluno.status)}
            </span>
            {!aluno.matriculaVinculadaId && (
              <button
                type="button"
                className="aluno-expand-nova-matricula-btn"
                title="Adicionar nova matrícula vinculada (mesmo aluno, outro curso)"
                onClick={() => setCriandoVinculada(true)}
              >
                <Plus size={16} />
              </button>
            )}
          </div>
          <button
            className="aluno-expand-close"
            onClick={onClose}
            title="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        {aluno.matriculaVinculadaId && (
          <div className="aluno-expand-matriculas-tabs">
            <span className="aluno-expand-matricula-tab aluno-expand-matricula-tab--ativa">
              <Link2 size={12} />
              {aluno.curso || "Esta matrícula"} · {AREA_CONFIG[aluno.area].label}
            </span>
            {(() => {
              const vinculado = getAluno(aluno.matriculaVinculadaId);
              return (
                <button
                  type="button"
                  className="aluno-expand-matricula-tab aluno-expand-matricula-tab--outra"
                  onClick={() => onOpenVinculada?.(aluno.matriculaVinculadaId!)}
                  disabled={!onOpenVinculada}
                  title="Abrir a outra matrícula deste aluno"
                >
                  <Link2 size={12} />
                  {vinculado ? `${vinculado.curso || "Outro curso"} · ${AREA_CONFIG[vinculado.area].label}` : "Outra matrícula"}
                </button>
              );
            })()}
          </div>
        )}

        <div className="aluno-expand-columns">
          {/* Coluna esquerda: dados de contato */}
          <div className="aluno-expand-col aluno-expand-col-side">
            <div className="card">
              <h3>Contato</h3>
              <div className="info-item">
                <GraduationCap size={18} />
                <div>
                  <span className="info-label">Curso</span>
                  <span className="info-value">
                    {aluno.curso || "—"}
                    {aluno.turno ? ` · ${aluno.turno}` : ""}
                  </span>
                </div>
              </div>

              <div className="info-item">
                <Mail size={18} />
                <div>
                  <span className="info-label">E-mail</span>
                  <a href={`mailto:${aluno.email}`} className="info-value">
                    {aluno.email}
                  </a>
                </div>
              </div>

              <div className="info-item">
                <Phone size={18} />
                <div>
                  <span className="info-label">Telefone</span>
                  <a href={`tel:${aluno.phone}`} className="info-value">
                    {aluno.phone}
                  </a>
                </div>
              </div>

              {aluno.ra && (
                <div className="info-item">
                  <Hash size={18} />
                  <div>
                    <span className="info-label">RA / Matrícula</span>
                    <span className="info-value">{aluno.ra}</span>
                  </div>
                </div>
              )}

              <div className="info-item">
                <Users size={18} />
                <div>
                  <span className="info-label">Responsável</span>
                  <span className="info-value">
                    {colaboradores.find((c) => c.id === aluno.assignedTo)?.name || "Sem responsável"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Coluna do meio (maior): Anotações e Tarefas em abas — só uma
              fica visível por vez, cada uma com sua própria rolagem. */}
          <div className="aluno-expand-col aluno-expand-col-middle">
            <div className="aluno-expand-tabs">
              <button
                type="button"
                className={`aluno-expand-tab${
                  abaMeio === "anotacoes" ? " active" : ""
                }`}
                onClick={() => setAbaMeio("anotacoes")}
              >
                Anotações
              </button>
              <button
                type="button"
                className={`aluno-expand-tab${
                  abaMeio === "tarefas" ? " active" : ""
                }`}
                onClick={() => setAbaMeio("tarefas")}
              >
                <ListChecks size={14} />
                Tarefas
                {itensChecklist && itensChecklist.length > 0 && (
                  <span className="aluno-expand-tab-badge">
                    {concluidos}/{itensChecklist.length}
                  </span>
                )}
              </button>
            </div>

            <div className="aluno-expand-tab-panel">
              {abaMeio === "anotacoes" ? (
                <div className="card aluno-expand-anotacoes">
                  <div className="anotacoes-nova">
                    <textarea
                      className="aluno-expand-textarea"
                      value={novaAnotacao}
                      onChange={(e) => setNovaAnotacao(e.target.value)}
                      placeholder="Escreva uma anotação sobre este aluno..."
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault();
                          handleSalvarAnotacao();
                        }
                      }}
                    />
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleSalvarAnotacao}
                      disabled={!novaAnotacao.trim() || salvandoObs}
                    >
                      <Save size={14} />
                      {salvandoObs ? "Salvando..." : "Salvar anotação"}
                    </button>
                  </div>
                  {anotacoes.length > 0 && (
                    <div className="anotacoes-historico">
                      {anotacoes.map((entrada) => (
                        <div key={entrada.id} className="anotacao-entrada">
                          <div className="anotacao-meta">
                            <span className="anotacao-autor">
                              <MessageSquare size={11} />
                              {entrada.autorNome}
                            </span>
                            {entrada.criadaEm && (
                              <span className="anotacao-data">
                                {new Date(entrada.criadaEm).toLocaleString("pt-BR", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "2-digit",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            )}
                            {isAdmin && (
                              <button
                                type="button"
                                className="anotacao-deletar"
                                title="Excluir anotação"
                                onClick={() => handleDeletarAnotacao(entrada.id)}
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                          <p className="anotacao-texto">{entrada.texto}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="card aluno-expand-tarefas">
                  {aluno.area !== "engajamento" ? (
                    <p className="checklist-vazio">
                      Checklist de tarefas disponível apenas para alunos da
                      área de Engajamento.
                    </p>
                  ) : checklistCarregando && !itensChecklist ? (
                    <p className="checklist-vazio">Carregando checklist…</p>
                  ) : !itensChecklist || itensChecklist.length === 0 ? (
                    <p className="checklist-vazio">
                      Nenhuma tarefa cadastrada para este aluno.
                    </p>
                  ) : (
                    <>
                      <div className="checklist-progresso">
                        <div className="checklist-progresso-barra">
                          <div
                            className="checklist-progresso-preenchida"
                            style={{
                              width: `${Math.round(
                                (concluidos / itensChecklist.length) * 100
                              )}%`,
                            }}
                          />
                        </div>
                        <span>
                          {concluidos}/{itensChecklist.length} concluído
                        </span>
                      </div>
                      <ul className="checklist-detalhe-itens">
                        {itensChecklist.map((item) => (
                          <li key={item.id}>
                            <button
                              type="button"
                              className={`checklist-detalhe-item${
                                item.concluido
                                  ? " checklist-detalhe-item--concluido"
                                  : ""
                              }`}
                              onClick={() => toggleItem(item, !item.concluido)}
                            >
                              <span className="checklist-detalhe-checkbox">
                                {item.concluido && (
                                  <Check size={12} strokeWidth={3} />
                                )}
                              </span>
                              <div>
                                <span className="checklist-detalhe-label">
                                  {item.label}
                                </span>
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Coluna direita: status e etiquetas */}
          <div className="aluno-expand-col aluno-expand-col-side">
            <div className="card">
              <h3>Alterar Status</h3>
              <div className="status-options">
                {config.statuses.map((status) => (
                  <button
                    key={status}
                    className={`status-option ${
                      aluno.status === status ? "active" : ""
                    }`}
                    style={{
                      borderLeftColor: getStatusColor(status),
                      backgroundColor:
                        aluno.status === status
                          ? `${getStatusColor(status)}15`
                          : "transparent",
                    }}
                    onClick={() => handleStatusChange(status)}
                  >
                    {getStatusLabel(status)}
                  </button>
                ))}
              </div>
            </div>

            <div className="card">
              <h3>
                <Tag size={16} style={{ marginRight: "0.375rem" }} />
                Etiquetas
              </h3>
              <div className="tags-picker">
                {tagsSelecionaveis.map((tag) => {
                  const selected = (aluno.tags || []).includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      className={`tag-chip${
                        selected ? " tag-chip-selected" : ""
                      }`}
                      onClick={() => handleToggleTag(tag)}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
      {criandoVinculada && (
        <NovaMatriculaModal aluno={aluno} onClose={() => setCriandoVinculada(false)} />
      )}
    </div>,
    document.body
  );
};

export default AlunoExpandModal;