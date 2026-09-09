import React, { useCallback, useEffect, useState } from "react";
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
  CalendarDays,
  Circle,
  Clock3,
} from "lucide-react";
import { useAlunos } from "../hooks/useAlunos";
import { useAuth } from "../hooks/useAuth";
import { useChecklist } from "../hooks/useChecklist";
import { useToast } from "../hooks/useToast";
import {
  AlunoStatus,
  AgendaCompromisso,
  TarefaPessoal,
} from "../types";
import { getAlunoById } from "../services/alunosService";
import {
  getTarefasPorAluno,
  atualizarTarefaPessoal,
  TarefasArea,
} from "../services/tarefasEngajamentoService";
import {
  getCompromissosPorAluno,
  criarCompromissoAgenda,
  excluirCompromissoAgenda,
  AgendaArea,
} from "../services/agendaEngajamentoService";
import { AREA_CONFIG } from "../config/areas";
import { TAGS_SELECIONAVEIS_POR_AREA, TAGS_DISPONIVEIS } from "../utils/tags";
import { getStatusColor, getStatusLabel } from "../utils/formatters";
import NovaMatriculaModal from "./NovaMatriculaModal";
import TarefaModal from "./TarefaModal";
import "../pages/AlunoDetails.css";
import "../pages/AlunoForm.css";
import "./AlunoExpandModal.css";

type AbaMeio = "anotacoes" | "tarefas" | "agendamentos";

function areaOperacional(
  area: string | undefined
): TarefasArea | AgendaArea | null {
  if (area === "rematricula" || area === "engajamento") return area;
  return null;
}

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
  // Anotações / Tarefas (pessoais da aba Tarefas) / Agendamentos (agenda).
  const [abaMeio, setAbaMeio] = useState<AbaMeio>("anotacoes");
  const [tarefasAluno, setTarefasAluno] = useState<TarefaPessoal[]>([]);
  const [compromissosAluno, setCompromissosAluno] = useState<
    AgendaCompromisso[]
  >([]);
  const [carregandoVinculos, setCarregandoVinculos] = useState(false);
  const [tarefaModalAberta, setTarefaModalAberta] = useState(false);
  const [tarefaEditando, setTarefaEditando] = useState<
    TarefaPessoal | undefined
  >(undefined);
  const [mostrandoFormAgenda, setMostrandoFormAgenda] = useState(false);
  const [agendaData, setAgendaData] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [agendaTicket, setAgendaTicket] = useState("");
  const [agendaComentario, setAgendaComentario] = useState("");
  const [salvandoAgenda, setSalvandoAgenda] = useState(false);

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

  // Sempre busca a versão completa (com interações) via getAlunoById.
  // A lista do contexto é leve (sem interações) desde a Fase 1 — se usarmos
  // só getAluno(), o histórico de contatos fica vazio no modal.
  // Estratégia: mostra o que já estiver no contexto (otimista) e atualiza
  // assim que a versão completa chegar do banco.
  useEffect(() => {
    let cancelado = false;
    setNaoEncontrado(false);

    const atual = getAluno(alunoId);
    if (atual) {
      setAluno(atual); // versão leve imediata (UI não fica em branco)
    } else {
      setAluno(undefined);
      setBuscandoVinculada(true);
    }

    getAlunoById(alunoId)
      .then(({ aluno: encontrado }) => {
        if (cancelado) return;
        if (encontrado) {
          setAluno(encontrado); // versão completa com interações
        } else if (!atual) {
          setNaoEncontrado(true);
        }
      })
      .catch(() => {
        if (!cancelado && !atual) setNaoEncontrado(true);
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

  // Carrega tarefas e agendamentos vinculados a este aluno (tabelas da
  // área: rematricula_* ou engajamento_*). Independente da rota atual,
  // para o card em /alunos também enxergar os vínculos.
  const carregarVinculos = useCallback(async (areaAluno: string | undefined) => {
    const area = areaOperacional(areaAluno);
    if (!area) {
      setTarefasAluno([]);
      setCompromissosAluno([]);
      return;
    }
    setCarregandoVinculos(true);
    try {
      const [tarefasRes, agendaRes] = await Promise.all([
        getTarefasPorAluno(alunoId, area),
        getCompromissosPorAluno(alunoId, area),
      ]);
      setTarefasAluno(tarefasRes.tarefas);
      setCompromissosAluno(agendaRes.compromissos);
    } catch (err) {
      console.error("Erro ao carregar tarefas/agenda do aluno:", err);
    } finally {
      setCarregandoVinculos(false);
    }
  }, [alunoId]);

  useEffect(() => {
    const atual = getAluno(alunoId);
    const areaHint = atual?.area;
    if (areaHint) {
      carregarVinculos(areaHint);
      return;
    }
    // Se ainda não está no contexto, espera o getAlunoById preencher
    // e dispara de novo quando `aluno` tiver área (efeito abaixo).
  }, [alunoId, getAluno, carregarVinculos]);

  useEffect(() => {
    if (aluno?.area) carregarVinculos(aluno.area);
  }, [aluno?.area, aluno?.id, carregarVinculos]);

  const refreshAluno = () => {
    // Preferimos a versão completa (com interações) após mutações no modal.
    getAlunoById(alunoId).then(({ aluno: encontrado }) => {
      if (encontrado) setAluno(encontrado);
      else {
        const atual = getAluno(alunoId);
        if (atual) setAluno(atual);
      }
    });
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

  const handleCriarAgendamento = async (e: React.FormEvent) => {
    e.preventDefault();
    const area = areaOperacional(aluno.area);
    if (!area || !user || !agendaComentario.trim()) return;

    setSalvandoAgenda(true);
    try {
      const { error } = await criarCompromissoAgenda(
        user.id,
        {
          alunoId: aluno.id,
          data: new Date(agendaData + "T12:00:00"),
          ticket: agendaTicket.trim() || undefined,
          comentario: agendaComentario.trim(),
        },
        area
      );
      if (error) throw new Error(error);
      showToast("Agendamento criado.", "success");
      setAgendaComentario("");
      setAgendaTicket("");
      setMostrandoFormAgenda(false);
      await carregarVinculos(aluno.area);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Erro ao criar agendamento",
        "error"
      );
    } finally {
      setSalvandoAgenda(false);
    }
  };

  const handleExcluirAgendamento = async (id: string) => {
    const area = areaOperacional(aluno.area);
    if (!area) return;
    try {
      const { error } = await excluirCompromissoAgenda(id, area);
      if (error) throw new Error(error);
      showToast("Agendamento removido.", "success");
      await carregarVinculos(aluno.area);
    } catch {
      showToast("Erro ao remover agendamento.", "error");
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

          {/* Coluna do meio: Anotações | Tarefas | Agendamentos */}
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
                {tarefasAluno.length > 0 && (
                  <span className="aluno-expand-tab-badge">
                    {tarefasAluno.filter((t) => t.status === "em_andamento").length}
                    /{tarefasAluno.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                className={`aluno-expand-tab${
                  abaMeio === "agendamentos" ? " active" : ""
                }`}
                onClick={() => setAbaMeio("agendamentos")}
              >
                <CalendarDays size={14} />
                Agendamentos
                {compromissosAluno.length > 0 && (
                  <span className="aluno-expand-tab-badge">
                    {compromissosAluno.length}
                  </span>
                )}
              </button>
            </div>

            <div className="aluno-expand-tab-panel">
              {abaMeio === "anotacoes" && (
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
                                {new Date(entrada.criadaEm).toLocaleString(
                                  "pt-BR",
                                  {
                                    day: "2-digit",
                                    month: "2-digit",
                                    year: "2-digit",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  }
                                )}
                              </span>
                            )}
                            {isAdmin && (
                              <button
                                type="button"
                                className="anotacao-deletar"
                                title="Excluir anotação"
                                onClick={() =>
                                  handleDeletarAnotacao(entrada.id)
                                }
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
              )}

              {abaMeio === "tarefas" && (
                <div className="card aluno-expand-tarefas">
                  <div className="aluno-expand-tarefas-header">
                    <span>Tarefas vinculadas a este aluno</span>
                    {areaOperacional(aluno.area) && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          setTarefaEditando(undefined);
                          setTarefaModalAberta(true);
                        }}
                      >
                        <Plus size={14} />
                        Nova tarefa
                      </button>
                    )}
                  </div>

                  {carregandoVinculos ? (
                    <p className="checklist-vazio">Carregando tarefas…</p>
                  ) : !areaOperacional(aluno.area) ? (
                    <p className="checklist-vazio">
                      Tarefas pessoais não estão disponíveis para esta área.
                    </p>
                  ) : tarefasAluno.length === 0 ? (
                    <p className="checklist-vazio">
                      Nenhuma tarefa vinculada a este aluno. Crie uma aqui ou
                      na aba Tarefas da Rematrícula/Engajamento, associando o
                      aluno.
                    </p>
                  ) : (
                    <ul className="aluno-expand-tarefas-lista">
                      {tarefasAluno.map((tarefa) => (
                        <li key={tarefa.id}>
                          <button
                            type="button"
                            className={`aluno-expand-tarefa-item${
                              tarefa.status === "concluido"
                                ? " aluno-expand-tarefa-item--concluida"
                                : ""
                            }`}
                            onClick={() => {
                              setTarefaEditando(tarefa);
                              setTarefaModalAberta(true);
                            }}
                          >
                            <span
                              className="aluno-expand-tarefa-status"
                              onClick={async (e) => {
                                e.stopPropagation();
                                const area = areaOperacional(aluno.area);
                                if (!area) return;
                                const novo =
                                  tarefa.status === "concluido"
                                    ? "em_andamento"
                                    : "concluido";
                                try {
                                  await atualizarTarefaPessoal(
                                    tarefa.id,
                                    { status: novo },
                                    area
                                  );
                                  await carregarVinculos(aluno.area);
                                } catch {
                                  showToast(
                                    "Erro ao atualizar status da tarefa.",
                                    "error"
                                  );
                                }
                              }}
                              title={
                                tarefa.status === "concluido"
                                  ? "Reabrir tarefa"
                                  : "Concluir tarefa"
                              }
                            >
                              {tarefa.status === "concluido" ? (
                                <Check size={14} />
                              ) : (
                                <Circle size={14} />
                              )}
                            </span>
                            <div className="aluno-expand-tarefa-corpo">
                              <strong>{tarefa.titulo}</strong>
                              {tarefa.anotacoes && <p>{tarefa.anotacoes}</p>}
                              <div className="aluno-expand-tarefa-meta">
                                {tarefa.prazo && (
                                  <span>
                                    <Clock3 size={12} />
                                    {tarefa.prazo.toLocaleDateString("pt-BR")}
                                  </span>
                                )}
                                {tarefa.checklist.length > 0 && (
                                  <span>
                                    <ListChecks size={12} />
                                    {
                                      tarefa.checklist.filter((c) => c.concluido)
                                        .length
                                    }
                                    /{tarefa.checklist.length}
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Checklist de engajamento (legado) continua visível
                      quando a área for engajamento. */}
                  {aluno.area === "engajamento" && (
                    <div className="aluno-expand-checklist-bloco">
                      <h4>Checklist de engajamento</h4>
                      {checklistCarregando && !itensChecklist ? (
                        <p className="checklist-vazio">Carregando checklist…</p>
                      ) : !itensChecklist || itensChecklist.length === 0 ? (
                        <p className="checklist-vazio">
                          Nenhum item de checklist para este aluno.
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
                                  onClick={() =>
                                    toggleItem(item, !item.concluido)
                                  }
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
              )}

              {abaMeio === "agendamentos" && (
                <div className="card aluno-expand-agendamentos">
                  <div className="aluno-expand-tarefas-header">
                    <span>Agendamentos vinculados a este aluno</span>
                    {areaOperacional(aluno.area) && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() =>
                          setMostrandoFormAgenda((v) => !v)
                        }
                      >
                        <Plus size={14} />
                        {mostrandoFormAgenda ? "Fechar" : "Novo"}
                      </button>
                    )}
                  </div>

                  {mostrandoFormAgenda && areaOperacional(aluno.area) && (
                    <form
                      className="aluno-expand-agenda-form"
                      onSubmit={handleCriarAgendamento}
                    >
                      <div className="aluno-expand-agenda-form-row">
                        <label>
                          Data
                          <input
                            type="date"
                            value={agendaData}
                            onChange={(e) => setAgendaData(e.target.value)}
                            required
                          />
                        </label>
                        <label>
                          Ticket (opcional)
                          <input
                            type="text"
                            value={agendaTicket}
                            onChange={(e) => setAgendaTicket(e.target.value)}
                            placeholder="Ex.: #12345"
                            maxLength={100}
                          />
                        </label>
                      </div>
                      <label>
                        Comentário
                        <textarea
                          value={agendaComentario}
                          onChange={(e) =>
                            setAgendaComentario(e.target.value)
                          }
                          placeholder="Descreva o que precisa ser acompanhado..."
                          rows={3}
                          required
                        />
                      </label>
                      <div className="aluno-expand-agenda-form-acoes">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setMostrandoFormAgenda(false)}
                          disabled={salvandoAgenda}
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="btn btn-primary btn-sm"
                          disabled={
                            salvandoAgenda || !agendaComentario.trim()
                          }
                        >
                          {salvandoAgenda ? "Salvando..." : "Agendar"}
                        </button>
                      </div>
                    </form>
                  )}

                  {carregandoVinculos ? (
                    <p className="checklist-vazio">Carregando agendamentos…</p>
                  ) : !areaOperacional(aluno.area) ? (
                    <p className="checklist-vazio">
                      Agenda não está disponível para esta área.
                    </p>
                  ) : compromissosAluno.length === 0 ? (
                    <p className="checklist-vazio">
                      Nenhum agendamento vinculado. Use o botão Novo acima ou
                      a aba Agenda.
                    </p>
                  ) : (
                    <ul className="aluno-expand-agenda-lista">
                      {compromissosAluno.map((item) => (
                        <li key={item.id} className="aluno-expand-agenda-item">
                          <div className="aluno-expand-agenda-item-topo">
                            <div className="aluno-expand-agenda-data">
                              <CalendarDays size={14} />
                              {item.data.toLocaleDateString("pt-BR", {
                                weekday: "short",
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                            </div>
                            <button
                              type="button"
                              className="anotacao-deletar aluno-expand-agenda-excluir"
                              title="Excluir agendamento"
                              onClick={() =>
                                handleExcluirAgendamento(item.id)
                              }
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                          {item.ticket && (
                            <span className="aluno-expand-agenda-ticket">
                              Ticket: {item.ticket}
                            </span>
                          )}
                          <p>{item.comentario}</p>
                        </li>
                      ))}
                    </ul>
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
      {tarefaModalAberta && areaOperacional(aluno.area) && (
        <TarefaModal
          onClose={() => {
            setTarefaModalAberta(false);
            setTarefaEditando(undefined);
          }}
          tarefa={tarefaEditando}
          alunos={[{ id: aluno.id, name: aluno.name }]}
          isAdmin={isAdmin}
          alunoIdFixo={aluno.id}
          areaFixa={areaOperacional(aluno.area) as TarefasArea}
          onSaved={() => carregarVinculos(aluno.area)}
        />
      )}
    </div>,
    document.body
  );
};

export default AlunoExpandModal;