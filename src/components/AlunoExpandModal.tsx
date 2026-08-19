import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Mail,
  Phone,
  GraduationCap,
  Tag,
  ListChecks,
  Check,
  Send,
  Hash,
  MessageSquare,
} from "lucide-react";
import { useAlunos } from "../hooks/useAlunos";
import { useAuth } from "../hooks/useAuth";
import { useChecklist } from "../hooks/useChecklist";
import { useToast } from "../hooks/useToast";
import { AlunoStatus } from "../types";
import { AREA_CONFIG } from "../config/areas";
import { TAGS_SELECIONAVEIS_POR_AREA, TAGS_DISPONIVEIS } from "../utils/tags";
import {
  getStatusColor,
  getStatusLabel,
  formatDateTime,
} from "../utils/formatters";
import "../pages/AlunoDetails.css";
import "../pages/AlunoForm.css";
import "./AlunoExpandModal.css";

interface AlunoExpandModalProps {
  /** Id do aluno cujo card foi clicado — sempre buscamos a versão mais
   * atual pelo contexto (getAluno), pra refletir imediatamente qualquer
   * mudança de status/tag feita aqui mesmo dentro do modal. */
  alunoId: string;
  onClose: () => void;
}

// Painel "expandido" do card do aluno: abre por cima da tela (Kanban ou
// lista) em vez de navegar pra /alunos/:id. Layout em 3 colunas — ver
// pedido do usuário: esquerda = dados de contato, meio (maior, dividido em
// duas partes) = anotações + tarefas do checklist, direita = status e
// etiquetas.
const AlunoExpandModal: React.FC<AlunoExpandModalProps> = ({
  alunoId,
  onClose,
}) => {
  const { getAluno, updateAluno, addInteraction } = useAlunos();
  const { user } = useAuth();
  const { itensPorAluno, toggleItem, isLoading: checklistCarregando } =
    useChecklist();
  const { showToast } = useToast();

  const [aluno, setAluno] = useState(getAluno(alunoId));
  // Novo comentário sendo digitado (o campo fica sempre vazio depois de
  // enviar — o histórico é uma lista de entradas, não mais um texto único
  // que se sobrescreve, ver pedido do usuário).
  const [novoComentario, setNovoComentario] = useState("");
  const [enviandoComentario, setEnviandoComentario] = useState(false);
  // Anotações e Tarefas dividem a coluna do meio em abas — só uma fica
  // visível por vez (ver pedido do usuário).
  const [abaMeio, setAbaMeio] = useState<"anotacoes" | "tarefas">(
    "anotacoes"
  );
  // Rola o histórico de comentários pro final (mais recente) sempre que
  // uma nova entrada é adicionada.
  const historicoRef = useRef<HTMLDivElement>(null);

  // Re-sincroniza quando o card clicado muda.
  useEffect(() => {
    const atual = getAluno(alunoId);
    setAluno(atual);
    setNovoComentario("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alunoId]);

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

  if (!aluno) return null;

  const config = AREA_CONFIG[aluno.area];
  const tagsSelecionaveis =
    aluno.area === "rematricula" || aluno.area === "engajamento"
      ? TAGS_SELECIONAVEIS_POR_AREA[aluno.area]
      : TAGS_DISPONIVEIS;

  const itensChecklist =
    aluno.area === "engajamento" ? itensPorAluno[aluno.id] : undefined;
  const concluidos = itensChecklist?.filter((i) => i.concluido).length || 0;

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

  // Histórico de comentários (tipo "nota" em `interacoes`), do mais antigo
  // pro mais recente — igual timeline de chat, mensagem nova embaixo.
  const comentarios = [...aluno.interactions]
    .filter((i) => i.type === "nota")
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const handleEnviarComentario = async () => {
    if (!novoComentario.trim() || !user) return;
    setEnviandoComentario(true);
    try {
      await addInteraction(aluno.id, {
        type: "nota",
        description: novoComentario.trim(),
        date: new Date(),
        userId: user.id,
        userName: user.name,
      });
      setNovoComentario("");
      refreshAluno();
      // Rola pro final assim que a nova entrada renderizar.
      requestAnimationFrame(() => {
        historicoRef.current?.scrollTo({
          top: historicoRef.current.scrollHeight,
          behavior: "smooth",
        });
      });
    } catch {
      showToast("Erro ao adicionar comentário. Tente novamente.", "error");
    } finally {
      setEnviandoComentario(false);
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
          </div>
          <button
            className="aluno-expand-close"
            onClick={onClose}
            title="Fechar"
          >
            <X size={20} />
          </button>
        </div>

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
                  {/* Histórico: só esta lista rola — o cabeçalho do modal e
                      as colunas laterais (contato / status / etiquetas)
                      ficam parados, ver pedido do usuário. */}
                  <div
                    className="aluno-expand-historico"
                    ref={historicoRef}
                  >
                    {comentarios.length === 0 ? (
                      <p className="checklist-vazio">
                        Nenhum comentário ainda. Escreva o primeiro abaixo.
                      </p>
                    ) : (
                      comentarios.map((c) => (
                        <div key={c.id} className="aluno-expand-comentario">
                          <div className="aluno-expand-comentario-icon">
                            <MessageSquare size={14} />
                          </div>
                          <div className="aluno-expand-comentario-content">
                            <div className="aluno-expand-comentario-header">
                              <span className="aluno-expand-comentario-autor">
                                {c.userName || "—"}
                              </span>
                              <span className="aluno-expand-comentario-data">
                                {formatDateTime(c.date)}
                              </span>
                            </div>
                            <p className="aluno-expand-comentario-texto">
                              {c.description}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="aluno-expand-novo-comentario">
                    <textarea
                      className="aluno-expand-textarea"
                      value={novoComentario}
                      onChange={(e) => setNovoComentario(e.target.value)}
                      placeholder="Escreva um comentário sobre este aluno..."
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          handleEnviarComentario();
                        }
                      }}
                    />
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleEnviarComentario}
                      disabled={!novoComentario.trim() || enviandoComentario}
                    >
                      <Send size={14} />
                      {enviandoComentario ? "Enviando..." : "Comentar"}
                    </button>
                  </div>
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
    </div>,
    document.body
  );
};

export default AlunoExpandModal;