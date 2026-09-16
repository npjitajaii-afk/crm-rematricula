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
  Calendar,
  Clock3,
  ArrowLeftRight,
} from "lucide-react";
import { useAlunos } from "../hooks/useAlunos";
import { useAuth } from "../hooks/useAuth";
import { useChecklist } from "../hooks/useChecklist";
import { useToast } from "../hooks/useToast";
import { AlunoStatus, TarefaPessoal, AgendaCompromisso, SolicitacaoTransferencia } from "../types";
import { getAlunoById } from "../services/alunosService";
import { getTarefasPorAluno, TarefasArea } from "../services/tarefasEngajamentoService";
import { getCompromissosPorAluno, criarCompromissoAgenda, AgendaArea } from "../services/agendaEngajamentoService";
import {
  solicitacoesDoAluno,
  criarSolicitacaoTransferencia,
  autorizarSolicitacaoTransferencia,
  cancelarSolicitacaoTransferencia,
} from "../services/transferenciasService";
import { useTransferenciasPendentes } from "../hooks/useTransferenciasPendentes";
import { AREA_CONFIG } from "../config/areas";
import { TAGS_SELECIONAVEIS_POR_AREA, TAGS_DISPONIVEIS } from "../utils/tags";
import { getStatusColor, getStatusLabel } from "../utils/formatters";
import NovaMatriculaModal from "./NovaMatriculaModal";
import DelegarContatoModal from "./DelegarContatoModal";
import TarefaModal from "./TarefaModal";
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
  const { getAluno, updateAluno, assumirAluno, colaboradores, isAdmin, canGerenciarPolo, setores } = useAlunos();
  const [criandoVinculada, setCriandoVinculada] = useState(false);
  const [mostrarDelegar, setMostrarDelegar] = useState(false);
  const [assumindo, setAssumindo] = useState(false);
  const {
    itensPorAluno,
    toggleItem,
    isLoading: checklistCarregando,
    garantirItensCarregados,
  } = useChecklist();
  const { showToast } = useToast();

  const { user } = useAuth();
  const { refresh: refreshPendentesGlobais } = useTransferenciasPendentes();
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
  // Anotações | Tarefas | Agenda — só uma fica visível por vez.
  // Tarefas e Agenda respeitam vínculo ao aluno + isolamento por funil/polo.
  const [abaMeio, setAbaMeio] = useState<"anotacoes" | "tarefas" | "agenda" | "transferencia">(
    "anotacoes"
  );

  // Solicitações de transferência abertas deste aluno
  const [solsTransferencia, setSolsTransferencia] = useState<SolicitacaoTransferencia[]>([]);
  const [carregandoSols, setCarregandoSols] = useState(false);
  const [setorDestinoSol, setSetorDestinoSol] = useState("");
  const [colabDestinoSol, setColabDestinoSol] = useState("");
  const [motivoSol, setMotivoSol] = useState("");
  const [enviandoSol, setEnviandoSol] = useState(false);
  const [acaoSolId, setAcaoSolId] = useState<string | null>(null);

  // Tarefas pessoais vinculadas a este aluno (aparecem só se o colaborador vinculou)
  const [tarefasVinculadas, setTarefasVinculadas] = useState<TarefaPessoal[]>([]);
  const [carregandoTarefas, setCarregandoTarefas] = useState(false);
  const [modalTarefaAberto, setModalTarefaAberto] = useState(false);

  // Agenda vinculada a este aluno
  const [compromissosVinculados, setCompromissosVinculados] = useState<AgendaCompromisso[]>([]);
  const [carregandoAgenda, setCarregandoAgenda] = useState(false);
  const [criandoAgenda, setCriandoAgenda] = useState(false);
  const [novaAgendaData, setNovaAgendaData] = useState("");
  const [novaAgendaComentario, setNovaAgendaComentario] = useState("");
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

  // Área do funil do aluno (isolamento por funil).
  // "retencao" usa as tabelas de rematrícula por enquanto se necessário.
  const areaTarefas: TarefasArea =
    aluno?.area === "engajamento" ? "engajamento" : "rematricula";
  const areaAgenda: AgendaArea =
    aluno?.area === "engajamento" ? "engajamento" : "rematricula";

  const carregarTarefasVinculadas = useCallback(async () => {
    if (!aluno?.id) return;
    setCarregandoTarefas(true);
    try {
      const { tarefas, error } = await getTarefasPorAluno(aluno.id, areaTarefas);
      if (error) {
        console.error("Erro ao carregar tarefas do aluno:", error);
      } else {
        setTarefasVinculadas(tarefas);
      }
    } finally {
      setCarregandoTarefas(false);
    }
  }, [aluno?.id, areaTarefas]);

  const carregarAgendaVinculada = useCallback(async () => {
    if (!aluno?.id) return;
    setCarregandoAgenda(true);
    try {
      const { compromissos, error } = await getCompromissosPorAluno(
        aluno.id,
        areaAgenda
      );
      if (error) {
        console.error("Erro ao carregar agenda do aluno:", error);
      } else {
        setCompromissosVinculados(compromissos);
      }
    } finally {
      setCarregandoAgenda(false);
    }
  }, [aluno?.id, areaAgenda]);

  // Checklist: effect sempre na mesma ordem de hooks (antes do early return).
  useEffect(() => {
    if (aluno?.area === "engajamento" && aluno?.id) {
      garantirItensCarregados(aluno.id);
    }
  }, [aluno?.area, aluno?.id, garantirItensCarregados]);

  // Carrega tarefas e agenda vinculadas quando o aluno está disponível.

  const carregarSolsTransferencia = useCallback(async () => {
    if (!aluno?.id) return;
    setCarregandoSols(true);
    try {
      const { solicitacoes, error } = await solicitacoesDoAluno(aluno.id);
      if (!error) setSolsTransferencia(solicitacoes);
    } finally {
      setCarregandoSols(false);
    }
  }, [aluno?.id]);

  useEffect(() => {
    if (aluno?.id) {
      carregarTarefasVinculadas();
      carregarAgendaVinculada();
    }
  }, [aluno?.id, carregarTarefasVinculadas, carregarAgendaVinculada]);

  useEffect(() => {
    if (!aluno?.id) return;
    carregarSolsTransferencia();
  }, [aluno?.id, carregarSolsTransferencia]);


  const isDonoContato = !!aluno && !!user && aluno.assignedTo === user.id;
  const temResponsavelOutro =
    !!aluno && !!user && !!aluno.assignedTo && aluno.assignedTo !== user.id;
  const setoresDoPolo = (setores || []).filter((s) =>
    user?.poloId ? s.poloId === user.poloId : true
  );
  const resolverSetorIdDoColab = (colab?: {
    setorId?: string;
    setorNome?: string;
  } | null): string => {
    if (!colab) return "";
    if (colab.setorId) return colab.setorId;
    // Fallback: RPC às vezes manda só o nome do setor
    if (colab.setorNome) {
      const byName = (setores || []).find(
        (s) =>
          s.nome === colab.setorNome &&
          (!user?.poloId || s.poloId === user.poloId)
      );
      if (byName) return byName.id;
    }
    return "";
  };

  const colabsDoSetorDestino = (colaboradores || []).filter((c) => {
    if (!setorDestinoSol) return true;
    const sid = resolverSetorIdDoColab(c);
    // Mantém o já selecionado na lista mesmo se o setor divergir temporariamente
    if (c.id === colabDestinoSol) return true;
    return sid === setorDestinoSol;
  });

  const handleCriarSolicitacao = async () => {
    // Pedido para assumir contato de outro: setor = setor do solicitante (automático)
    const setorDestino =
      temResponsavelOutro
        ? user?.setorId ||
          (setores || []).find(
            (s) =>
              s.nome === user?.setorNome &&
              (!user?.poloId || s.poloId === user.poloId)
          )?.id ||
          ""
        : setorDestinoSol;

    if (!aluno || !setorDestino) {
      showToast(
        temResponsavelOutro
          ? "Seu usuário precisa ter um setor cadastrado para solicitar o contato."
          : "Selecione o setor de destino.",
        "error"
      );
      return;
    }
    setEnviandoSol(true);
    try {
      const { error } = await criarSolicitacaoTransferencia({
        alunoId: aluno.id,
        setorDestinoId: setorDestino,
        colaboradorDestinoId: temResponsavelOutro
          ? user?.id
          : colabDestinoSol || null,
        motivo: temResponsavelOutro ? undefined : motivoSol.trim() || undefined,
      });
      if (error) {
        showToast(error, "error");
      } else {
        showToast("Solicitação de transferência enviada.", "success");
        setMotivoSol("");
        setSetorDestinoSol("");
        setColabDestinoSol("");
        await carregarSolsTransferencia();
        await refreshPendentesGlobais();
      }
    } finally {
      setEnviandoSol(false);
    }
  };

  const handleAutorizarSol = async (solId: string, aprovar: boolean) => {
    setAcaoSolId(solId);
    try {
      const { error } = await autorizarSolicitacaoTransferencia(solId, aprovar);
      if (error) showToast(error, "error");
      else {
        showToast(
          aprovar
            ? "Autorizado. Aguardando supervisor/admin."
            : "Solicitação recusada.",
          aprovar ? "success" : "info"
        );
        await carregarSolsTransferencia();
        await refreshPendentesGlobais();
      }
    } finally {
      setAcaoSolId(null);
    }
  };

  const handleCancelarSol = async (solId: string) => {
    setAcaoSolId(solId);
    try {
      const { error } = await cancelarSolicitacaoTransferencia(solId);
      if (error) showToast(error, "error");
      else {
        showToast("Solicitação cancelada.", "success");
        await carregarSolsTransferencia();
        await refreshPendentesGlobais();
      }
    } finally {
      setAcaoSolId(null);
    }
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
      ? TAGS_SELECIONAVEIS_POR_AREA[aluno.area] ?? []
      : TAGS_DISPONIVEIS;

  const itensChecklist =
    aluno.area === "engajamento" ? itensPorAluno[aluno.id] : undefined;
  const concluidos = itensChecklist?.filter((i) => i.concluido).length || 0;

  const isOwner = aluno.assignedTo === user?.id;
  const podeEditarCard = canGerenciarPolo || isOwner;
  // Colaborador pode assumir contatos sem dono; admin/supervisor delegam
  // diretamente (mesma regra usada em Alunos.tsx e Engajamento.tsx).
  const podeAssumir = !canGerenciarPolo && !aluno.assignedTo;
  const podeDelegar = canGerenciarPolo;

  const handleAssumir = async () => {
    setAssumindo(true);
    try {
      await assumirAluno(aluno.id);
      showToast("Contato assumido com sucesso.", "success");
      refreshAluno();
    } catch {
      showToast("Erro ao assumir contato. Tente novamente.", "error");
    } finally {
      setAssumindo(false);
    }
  };

  const handleStatusChange = async (status: AlunoStatus) => {
    if (!podeEditarCard) {
      showToast("Você só pode editar contatos sob sua responsabilidade.", "error");
      return;
    }
    try {
      await updateAluno(aluno.id, { status });
      refreshAluno();
    } catch {
      showToast("Erro ao atualizar status. Tente novamente.", "error");
    }
  };

  const handleToggleTag = async (tag: string) => {
    if (!podeEditarCard) {
      showToast("Você só pode editar contatos sob sua responsabilidade.", "error");
      return;
    }
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
    if (!podeEditarCard) {
      showToast("Você só pode editar contatos sob sua responsabilidade.", "error");
      return;
    }
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
    if (!podeEditarCard) {
      showToast("Você só pode editar contatos sob sua responsabilidade.", "error");
      return;
    }
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
                    {!podeEditarCard && (
                      <span style={{ display: "block", marginTop: 6, fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                        Somente leitura — este contato é de outro colaborador.
                      </span>
                    )}
                    {(podeAssumir || podeDelegar) && (
                      <span style={{ display: "block", marginTop: 8 }}>
                        {podeAssumir && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: "0.35rem 0.7rem", fontSize: "0.82rem" }}
                            disabled={assumindo}
                            onClick={handleAssumir}
                          >
                            {assumindo ? "Assumindo..." : "Assumir contato"}
                          </button>
                        )}
                        {podeDelegar && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: "0.35rem 0.7rem", fontSize: "0.82rem" }}
                            onClick={() => setMostrarDelegar(true)}
                          >
                            {aluno.assignedTo ? "Reatribuir contato" : "Delegar contato"}
                          </button>
                        )}
                      </span>
                    )}
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
                {aluno.area === "engajamento" &&
                  itensChecklist &&
                  itensChecklist.length > 0 && (
                    <span className="aluno-expand-tab-badge">
                      {concluidos}/{itensChecklist.length}
                    </span>
                  )}
                {tarefasVinculadas.length > 0 && (
                  <span className="aluno-expand-tab-badge">
                    {tarefasVinculadas.filter((t) => t.status === "em_andamento").length}
                  </span>
                )}
              </button>
              <button
                type="button"
                className={`aluno-expand-tab${
                  abaMeio === "agenda" ? " active" : ""
                }`}
                onClick={() => setAbaMeio("agenda")}
              >
                <Calendar size={14} />
                Agenda
                {compromissosVinculados.length > 0 && (
                  <span className="aluno-expand-tab-badge">
                    {compromissosVinculados.length}
                  </span>
                )}
              </button>
              {aluno.area === "engajamento" && (
                <button
                  type="button"
                  className={`aluno-expand-tab${
                    abaMeio === "transferencia" ? " active" : ""
                  }`}
                  onClick={() => setAbaMeio("transferencia")}
                >
                  <ArrowLeftRight size={14} />
                  Transferência
                  {solsTransferencia.length > 0 && (
                    <span className="aluno-expand-tab-badge">
                      {solsTransferencia.length}
                    </span>
                  )}
                </button>
              )}
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
                      disabled={!podeEditarCard || !novaAnotacao.trim() || salvandoObs}
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
              ) : abaMeio === "tarefas" ? (
                <div className="card aluno-expand-tarefas">
                  {/* Checklist fixo de 7 itens — somente no funil de Engajamento */}
                  {aluno.area === "engajamento" && (
                    <>
                      {checklistCarregando && !itensChecklist ? (
                        <p className="checklist-vazio">Carregando checklist…</p>
                      ) : !itensChecklist || itensChecklist.length === 0 ? (
                        <p className="checklist-vazio">
                          Nenhuma tarefa de checklist cadastrada para este aluno.
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
                      <hr style={{ margin: "1rem 0", border: "none", borderTop: "1px solid #e5e7eb" }} />
                    </>
                  )}

                  {/* Tarefas pessoais vinculadas a este aluno (ambos os funis) */}
                  <div style={{ marginBottom: "0.75rem" }}>
                    <strong style={{ fontSize: "0.85rem", color: "#374151" }}>
                      Tarefas vinculadas
                    </strong>
                  </div>
                  {carregandoTarefas ? (
                    <p className="checklist-vazio">Carregando tarefas…</p>
                  ) : tarefasVinculadas.length === 0 ? (
                    <p className="checklist-vazio">
                      Nenhuma tarefa vinculada a este aluno.
                    </p>
                  ) : (
                    <ul className="checklist-detalhe-itens">
                      {tarefasVinculadas.map((tarefa) => (
                        <li key={tarefa.id}>
                          <div
                            className={`checklist-detalhe-item${
                              tarefa.status === "concluido"
                                ? " checklist-detalhe-item--concluido"
                                : ""
                            }`}
                            style={{ cursor: "default" }}
                          >
                            <span className="checklist-detalhe-checkbox">
                              {tarefa.status === "concluido" && (
                                <Check size={12} strokeWidth={3} />
                              )}
                            </span>
                            <div>
                              <span className="checklist-detalhe-label">
                                {tarefa.titulo}
                              </span>
                              {tarefa.prazo && (
                                <span
                                  style={{
                                    display: "block",
                                    fontSize: "0.75rem",
                                    color: "#6b7280",
                                  }}
                                >
                                  <Clock3
                                    size={11}
                                    style={{
                                      display: "inline",
                                      marginRight: 4,
                                    }}
                                  />
                                  {tarefa.prazo.toLocaleDateString("pt-BR")}
                                </span>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {podeEditarCard && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      style={{ marginTop: "0.75rem" }}
                      onClick={() => setModalTarefaAberto(true)}
                    >
                      <Plus size={14} />
                      Criar tarefa
                    </button>
                  )}
                </div>
              ) : abaMeio === "agenda" ? (
                /* ===== Aba Agenda ===== */
                <div className="card aluno-expand-tarefas">
                  {carregandoAgenda ? (
                    <p className="checklist-vazio">Carregando agenda…</p>
                  ) : compromissosVinculados.length === 0 && !criandoAgenda ? (
                    <p className="checklist-vazio">
                      Nenhum compromisso vinculado a este aluno.
                    </p>
                  ) : (
                    <ul className="checklist-detalhe-itens">
                      {compromissosVinculados.map((c) => (
                        <li key={c.id}>
                          <div
                            className="checklist-detalhe-item"
                            style={{ cursor: "default" }}
                          >
                            <span className="checklist-detalhe-checkbox">
                              <Calendar size={12} />
                            </span>
                            <div>
                              <span className="checklist-detalhe-label">
                                {c.comentario}
                              </span>
                              <span
                                style={{
                                  display: "block",
                                  fontSize: "0.75rem",
                                  color: "#6b7280",
                                }}
                              >
                                {c.data.toLocaleDateString("pt-BR")}
                                {c.ticket ? ` · Ticket: ${c.ticket}` : ""}
                              </span>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {criandoAgenda ? (
                    <div style={{ marginTop: "0.75rem" }}>
                      <input
                        type="date"
                        className="aluno-expand-textarea"
                        style={{ marginBottom: 8, height: 36 }}
                        value={novaAgendaData}
                        onChange={(e) => setNovaAgendaData(e.target.value)}
                      />
                      <textarea
                        className="aluno-expand-textarea"
                        placeholder="Comentário / descrição do compromisso..."
                        value={novaAgendaComentario}
                        onChange={(e) => setNovaAgendaComentario(e.target.value)}
                        rows={2}
                      />
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={
                            !novaAgendaData ||
                            !novaAgendaComentario.trim() ||
                            salvandoAgenda
                          }
                          onClick={async () => {
                            if (!user || !aluno) return;
                            setSalvandoAgenda(true);
                            try {
                              const { error } = await criarCompromissoAgenda(
                                user.id,
                                {
                                  alunoId: aluno.id,
                                  data: new Date(
                                    `${novaAgendaData}T12:00:00`
                                  ),
                                  comentario: novaAgendaComentario,
                                },
                                areaAgenda
                              );
                              if (error) throw new Error(error);
                              showToast("Compromisso criado.", "success");
                              setCriandoAgenda(false);
                              setNovaAgendaData("");
                              setNovaAgendaComentario("");
                              carregarAgendaVinculada();
                            } catch (err) {
                              showToast(
                                err instanceof Error
                                  ? err.message
                                  : "Erro ao criar compromisso",
                                "error"
                              );
                            } finally {
                              setSalvandoAgenda(false);
                            }
                          }}
                        >
                          {salvandoAgenda ? "Salvando..." : "Salvar"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => setCriandoAgenda(false)}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    podeEditarCard && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        style={{ marginTop: "0.75rem" }}
                        onClick={() => setCriandoAgenda(true)}
                      >
                        <Plus size={14} />
                        Criar compromisso
                      </button>
                    )
                  )}
                </div>
              ) : (
                /* ===== Aba Transferência ===== */
                <div className="card aluno-expand-tarefas">
                  {carregandoSols ? (
                    <p className="checklist-vazio">Carregando solicitações…</p>
                  ) : solsTransferencia.length > 0 ? (
                    <ul className="checklist-detalhe-itens" style={{ marginBottom: "1rem" }}>
                      {solsTransferencia.map((sol) => (
                        <li key={sol.id} style={{ marginBottom: 12 }}>
                          <div className="checklist-detalhe-item" style={{ cursor: "default", flexDirection: "column", alignItems: "stretch", gap: 6 }}>
                            <div>
                              <strong style={{ fontSize: "0.85rem" }}>
                                {sol.tipo === "assumir_responsabilidade"
                                  ? "Pedido para assumir contato"
                                  : "Pedido de mudança de setor"}
                              </strong>
                              <span style={{ display: "block", fontSize: "0.75rem", color: "#6b7280" }}>
                                {sol.solicitanteNome ? `Por ${sol.solicitanteNome}` : ""}
                                {sol.setorOrigemNome ? ` · ${sol.setorOrigemNome}` : " · sem setor"}
                                {" → "}
                                {sol.setorDestinoNome || "?"}
                                {sol.colaboradorDestinoNome
                                  ? ` · ${sol.colaboradorDestinoNome}`
                                  : " · sem colaborador"}
                              </span>
                              <span style={{ display: "block", fontSize: "0.75rem", color: "#6b7280" }}>
                                Status:{" "}
                                {sol.status === "aguardando_responsavel"
                                  ? "Aguardando responsável atual"
                                  : sol.status === "aguardando_gestor"
                                  ? "Aguardando supervisor/admin"
                                  : sol.status}
                              </span>
                              {sol.motivo && (
                                <span style={{ display: "block", fontSize: "0.75rem" }}>
                                  Motivo: {sol.motivo}
                                </span>
                              )}
                            </div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {sol.status === "aguardando_responsavel" &&
                                user?.id === sol.responsavelOrigemId && (
                                  <>
                                    <button
                                      type="button"
                                      className="btn btn-primary btn-sm"
                                      disabled={acaoSolId === sol.id}
                                      onClick={() => handleAutorizarSol(sol.id, true)}
                                    >
                                      Autorizar
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-sm"
                                      disabled={acaoSolId === sol.id}
                                      onClick={() => handleAutorizarSol(sol.id, false)}
                                    >
                                      Recusar
                                    </button>
                                  </>
                                )}
                              {(sol.solicitanteId === user?.id || canGerenciarPolo) &&
                                (sol.status === "aguardando_responsavel" ||
                                  sol.status === "aguardando_gestor") && (
                                  <button
                                    type="button"
                                    className="btn btn-sm"
                                    disabled={acaoSolId === sol.id}
                                    onClick={() => handleCancelarSol(sol.id)}
                                  >
                                    Cancelar pedido
                                  </button>
                                )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="checklist-vazio">
                      Nenhuma solicitação de transferência em andamento.
                    </p>
                  )}

                  {/* Formulário de novo pedido — só se não houver pendente */}
                  {solsTransferencia.length === 0 && aluno.area === "engajamento" && (
                    <div style={{ marginTop: "0.5rem" }}>
                      {temResponsavelOutro ? (
                        /* Colaborador de outro setor: só solicitar o contato */
                        <>
                          <h4 style={{ margin: "0 0 0.5rem", fontSize: "0.9rem" }}>
                            Solicitar este contato
                          </h4>
                          <p style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: 12 }}>
                            O responsável atual precisa autorizar; depois o
                            supervisor/admin aprova. O contato vai para o seu setor.
                          </p>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={enviandoSol}
                            onClick={handleCriarSolicitacao}
                          >
                            {enviandoSol ? "Enviando…" : "Solicitar contato"}
                          </button>
                        </>
                      ) : (
                        /* Dono do contato: mudança de setor (+ colab opcional) */
                        <>
                          <h4 style={{ margin: "0 0 0.5rem", fontSize: "0.9rem" }}>
                            {isDonoContato
                              ? "Solicitar mudança de setor"
                              : "Solicitar transferência"}
                          </h4>
                          <p style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: 8 }}>
                            O pedido será enviado ao supervisor/admin para aprovação.
                          </p>
                          <label style={{ display: "block", fontSize: "0.8rem", marginBottom: 4 }}>
                            Setor de destino *
                            <select
                              className="filter-select"
                              style={{ display: "block", width: "100%", marginTop: 4 }}
                              value={setorDestinoSol}
                              onChange={(e) => {
                                const novoSetor = e.target.value;
                                setSetorDestinoSol(novoSetor);
                                if (colabDestinoSol) {
                                  const colab = (colaboradores || []).find(
                                    (c) => c.id === colabDestinoSol
                                  );
                                  const sid = resolverSetorIdDoColab(colab);
                                  if (sid && sid !== novoSetor) {
                                    setColabDestinoSol("");
                                  }
                                }
                              }}
                            >
                              <option value="">Selecione…</option>
                              {setoresDoPolo.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.nome}
                                </option>
                              ))}
                            </select>
                          </label>
                          {isDonoContato && (
                            <label style={{ display: "block", fontSize: "0.8rem", marginBottom: 4, marginTop: 8 }}>
                              Colaborador destino (opcional)
                              <select
                                className="filter-select"
                                style={{ display: "block", width: "100%", marginTop: 4 }}
                                value={colabDestinoSol}
                                onChange={(e) => {
                                  const colabId = e.target.value;
                                  const colab = (colaboradores || []).find((c) => c.id === colabId);
                                  setColabDestinoSol(colabId);
                                  const setorId = resolverSetorIdDoColab(colab);
                                  if (setorId) {
                                    setSetorDestinoSol(setorId);
                                  }
                                }}
                              >
                                <option value="">Sem responsável</option>
                                {colabsDoSetorDestino.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                    {c.setorNome ? ` · ${c.setorNome}` : ""}
                                  </option>
                                ))}
                              </select>
                              {colabDestinoSol &&
                                (() => {
                                  const colab = (colaboradores || []).find(
                                    (c) => c.id === colabDestinoSol
                                  );
                                  const sid = resolverSetorIdDoColab(colab);
                                  if (sid && sid === setorDestinoSol) {
                                    return (
                                      <span
                                        style={{
                                          display: "block",
                                          fontSize: "0.75rem",
                                          color: "#6b7280",
                                          marginTop: 4,
                                        }}
                                      >
                                        Setor preenchido pelo colaborador
                                        {colab?.setorNome ? ` (${colab.setorNome})` : ""}.
                                      </span>
                                    );
                                  }
                                  return null;
                                })()}
                            </label>
                          )}
                          <label style={{ display: "block", fontSize: "0.8rem", marginTop: 8 }}>
                            Motivo (opcional)
                            <textarea
                              className="aluno-expand-textarea"
                              style={{ marginTop: 4 }}
                              rows={2}
                              value={motivoSol}
                              onChange={(e) => setMotivoSol(e.target.value)}
                              placeholder="Por que deseja transferir este contato?"
                            />
                          </label>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            style={{ marginTop: 8 }}
                            disabled={!setorDestinoSol || enviandoSol}
                            onClick={handleCriarSolicitacao}
                          >
                            {enviandoSol ? "Enviando…" : "Enviar solicitação"}
                          </button>
                        </>
                      )}
                    </div>
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
      {mostrarDelegar && (
        <DelegarContatoModal
          aluno={aluno}
          onClose={() => {
            setMostrarDelegar(false);
            refreshAluno();
          }}
        />
      )}
      {modalTarefaAberto && aluno && (
        <TarefaModal
          onClose={() => {
            setModalTarefaAberto(false);
            carregarTarefasVinculadas();
          }}
          alunos={[{ id: aluno.id, name: aluno.name }]}
          alunoIdFixo={aluno.id}
          areaFixa={areaTarefas}
          onSaved={carregarTarefasVinculadas}
        />
      )}
    </div>,
    document.body
  );
};

export default AlunoExpandModal;