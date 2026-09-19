import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  CalendarClock,
  ClipboardList,
  Plus,
  Trash2,
  UserRound,
  X,
  Target,
  Users,
  MessageSquare,
  ChevronRight,
  ChevronLeft,
  Lock,
  CheckCircle2,
  Circle,
  GitBranch,
  Layers,
  CalendarRange,
  CalendarDays,
} from "lucide-react";
import {
  format,
  differenceInCalendarDays,
  eachDayOfInterval,
  startOfDay,
  addDays,
  isWithinInterval,
  parseISO,
  isValid,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  isSameDay,
  isSameMonth,
  startOfToday,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import EngajamentoTabs from "../components/EngajamentoTabs";
import RematriculaTabs from "../components/RematriculaTabs";
import {
  adicionarComentario,
  atualizarProgressoTarefa,
  criarTarefaGeral,
  excluirComentario,
  excluirTarefaGeral,
  getTarefasGerais,
  listarComentarios,
  TarefaComentario,
  TarefaGeral,
} from "../services/tarefasGeraisService";
import { AREA_CONFIG } from "../config/areas";
import type { Area } from "../types";
import { useAlunos } from "../hooks/useAlunos";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { useConfirm } from "../hooks/useConfirm";
import "./PainelTarefasGeral.css";

/* ------------------------------------------------------------------ */
/* Tipos estendidos (front antecipa backend com etapas + datas)       */
/* ------------------------------------------------------------------ */

export type ModoTarefa = "paralelo" | "sequencial";

export type StatusEtapa =
  | "pendente"
  | "em_andamento"
  | "concluida"
  | "bloqueada";

export interface TarefaEtapa {
  id: string;
  ordem: number;
  titulo: string;
  userId: string;
  userNome?: string;
  status: StatusEtapa;
  progressoPct: number;
}

/** Extensão local da tarefa (campos novos são opcionais até o backend existir) */
export interface TarefaGeralUI extends TarefaGeral {
  dataInicio?: Date;
  dataFim?: Date;
  modo?: ModoTarefa;
  etapas?: TarefaEtapa[];
}

/** Status da meta = status reais do funil da área (fonte: AREA_CONFIG). */
function statusMetaOpcoesDaArea(area: Area) {
  const cfg = AREA_CONFIG[area];
  return cfg.statuses.map((value) => ({
    value,
    label: cfg.getLabel(value),
  }));
}

type WizardStep = 1 | 2 | 3 | 4;

const CORES_BARRA = [
  "#6366f1",
  "#22c55e",
  "#f59e0b",
  "#ec4899",
  "#06b6d4",
  "#8b5cf6",
  "#ef4444",
  "#14b8a6",
];

function corDaTarefa(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * 17) % CORES_BARRA.length;
  return CORES_BARRA[h];
}

function parseDateInput(v: string): Date | undefined {
  if (!v) return undefined;
  const d = parseISO(`${v}T12:00:00`);
  return isValid(d) ? d : undefined;
}

/* ------------------------------------------------------------------ */
/* Componente                                                         */
/* ------------------------------------------------------------------ */

const PainelTarefasGeral: React.FC = () => {
  const pathname = useLocation().pathname;
  // Rota explícita por funil (evita misturar status/tabelas)
  const area: Area = pathname.includes("/engajamento")
    ? "engajamento"
    : pathname.includes("/rematricula")
      ? "rematricula"
      : "engajamento";
  const isRematricula = area === "rematricula";
  const { user } = useAuth();
  const { colaboradores } = useAlunos();
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  const isGestor = user?.role === "admin" || user?.role === "creator";
  const statusMetaOpcoes = useMemo(() => statusMetaOpcoesDaArea(area), [area]);
  const labelStatusMeta = (value?: string) => {
    if (!value) return "";
    const found = statusMetaOpcoes.find((o) => o.value === value);
    return found?.label ?? value;
  };

  /** Isolamento por polo: só colaboradores do mesmo polo do usuário */
  const colaboradoresDoPolo = useMemo(
    () =>
      colaboradores.filter(
        (c) => !user?.poloId || !c.poloId || c.poloId === user.poloId
      ),
    [colaboradores, user?.poloId]
  );

  const [tarefas, setTarefas] = useState<TarefaGeralUI[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [modal, setModal] = useState(false);
  const [wizard, setWizard] = useState<WizardStep>(1);

  // Form criação
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [modo, setModo] = useState<ModoTarefa>("paralelo");
  const [destinatarios, setDestinatarios] = useState<string[]>([]);
  /** Sequencial: cada etapa tem N colaboradores (trabalham juntos na etapa). */
  const [etapasForm, setEtapasForm] = useState<
    { titulo: string; userIds: string[] }[]
  >([{ titulo: "Etapa 1", userIds: [] }]);
  const [temMeta, setTemMeta] = useState(false);
  const [metaSemanal, setMetaSemanal] = useState("");
  const [statusMeta, setStatusMeta] = useState("");
  /** Meta individual por userId (string do input). */
  const [metasIndividuais, setMetasIndividuais] = useState<
    Record<string, string>
  >({});
  const [salvando, setSalvando] = useState(false);

  // Progresso
  const [editMembroId, setEditMembroId] = useState<string | null>(null);
  const [editPct, setEditPct] = useState(0);
  const [editAlunos, setEditAlunos] = useState(0);
  const [editTemMeta, setEditTemMeta] = useState(false);

  // Detalhe / comentários
  const [tarefaAbertaId, setTarefaAbertaId] = useState<string | null>(null);
  const [comentarios, setComentarios] = useState<TarefaComentario[]>([]);
  const [novoComentario, setNovoComentario] = useState("");
  const [carregandoComents, setCarregandoComents] = useState(false);

  // Visualização: timeline horizontal OU calendário mensal (estilo Agenda)
  type VistaCalendario = "timeline" | "calendario";
  const [vista, setVista] = useState<VistaCalendario>("calendario");

  // Timeline: sempre 7 dias
  const timelineDias = 7;
  const [timelineInicio, setTimelineInicio] = useState(() =>
    startOfDay(new Date())
  );

  // Calendário mensal (igual Agenda)
  const [mesCalendario, setMesCalendario] = useState(() => startOfToday());
  const [diaSelecionado, setDiaSelecionado] = useState(() => startOfToday());

  const carregar = async () => {
    setCarregando(true);
    const { tarefas: lista, error } = await getTarefasGerais(area);
    if (error) {
      console.error("[PainelTarefasGeral] carregar:", error);
      showToast(`Não foi possível carregar as tarefas. ${error}`, "error");
    } else {
      // Mapeia para UI — usa campos novos se o backend já devolver
      const mapped: TarefaGeralUI[] = lista.map((t) => ({
        ...t,
        dataInicio: t.dataInicio,
        dataFim: t.dataFim || t.prazo,
        modo: (t.modo as ModoTarefa) || "paralelo",
        etapas: t.etapas?.map((e) => ({
          id: e.id,
          ordem: e.ordem,
          titulo: e.titulo,
          userId: e.userId,
          userNome: e.userNome,
          status: e.status as StatusEtapa,
          progressoPct: e.progressoPct,
        })),
      }));
      setTarefas(mapped);
    }
    setCarregando(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    carregar();
  }, [area]);

  // Ao trocar de funil, limpa status da meta (lista de opções muda)
  useEffect(() => {
    setStatusMeta("");
  }, [area]);

  const abrirNova = () => {
    setTitulo("");
    setDescricao("");
    setDataInicio(format(new Date(), "yyyy-MM-dd"));
    setDataFim(format(addDays(new Date(), 7), "yyyy-MM-dd"));
    setModo("paralelo");
    setDestinatarios([]);
    setEtapasForm([{ titulo: "Etapa 1", userIds: [] }]);
    setTemMeta(false);
    setMetaSemanal("");
    setStatusMeta("");
    setMetasIndividuais({});
    setWizard(1);
    setModal(true);
  };

  const toggleDestinatario = (id: string) => {
    setDestinatarios((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const addEtapaForm = () => {
    setEtapasForm((prev) => [
      ...prev,
      { titulo: `Etapa ${prev.length + 1}`, userIds: [] },
    ]);
  };

  const removeEtapaForm = (idx: number) => {
    setEtapasForm((prev) =>
      prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)
    );
  };

  const updateEtapaTitulo = (idx: number, titulo: string) => {
    setEtapasForm((prev) =>
      prev.map((e, i) => (i === idx ? { ...e, titulo } : e))
    );
  };

  const toggleEtapaUser = (idx: number, userId: string) => {
    setEtapasForm((prev) =>
      prev.map((e, i) => {
        if (i !== idx) return e;
        const has = e.userIds.includes(userId);
        return {
          ...e,
          userIds: has
            ? e.userIds.filter((id) => id !== userId)
            : [...e.userIds, userId],
        };
      })
    );
  };

  const setMetaIndividual = (userId: string, value: string) => {
    setMetasIndividuais((prev) => ({ ...prev, [userId]: value }));
  };

  const duracaoDias = useMemo(() => {
    const ini = parseDateInput(dataInicio);
    const fim = parseDateInput(dataFim);
    if (!ini || !fim || fim < ini) return null;
    return differenceInCalendarDays(fim, ini) + 1;
  }, [dataInicio, dataFim]);

  const podeAvancar1 = titulo.trim().length > 0;
  const podeAvancar2 =
    !!dataInicio &&
    !!dataFim &&
    !!parseDateInput(dataInicio) &&
    !!parseDateInput(dataFim) &&
    (parseDateInput(dataFim)! >= parseDateInput(dataInicio)!);
  const podeAvancar3 =
    modo === "paralelo"
      ? destinatarios.length > 0
      : etapasForm.every((e) => e.titulo.trim() && e.userIds.length > 0);
  const membrosSelecionadosIds = useMemo(() => {
    if (modo === "paralelo") return destinatarios;
    return [
      ...new Set(etapasForm.flatMap((e) => e.userIds).filter(Boolean)),
    ];
  }, [modo, destinatarios, etapasForm]);

  // Meta é opcional: pode criar sem meta, só equipe, só individual, ou ambos
  const podeCriar = podeAvancar1 && podeAvancar2 && podeAvancar3;

  const salvar = async () => {
    if (!podeCriar) return;
    setSalvando(true);

    const paraUserIds = membrosSelecionadosIds;

    // Metas individuais preenchidas no passo Equipe ou Meta
    const metasInd: Record<string, number> = {};
    paraUserIds.forEach((id) => {
      const n = Number(metasIndividuais[id] || 0);
      if (n > 0) metasInd[id] = n;
    });

    const usarMetaEquipe = temMeta && Number(metaSemanal) > 0;
    const usarStatus =
      (temMeta || Object.keys(metasInd).length > 0) && statusMeta
        ? statusMeta
        : undefined;

    const { error } = await criarTarefaGeral(
      {
        titulo,
        descricao: descricao || undefined,
        prazo: dataFim ? new Date(`${dataFim}T12:00:00`) : undefined,
        dataInicio: dataInicio
          ? new Date(`${dataInicio}T12:00:00`)
          : undefined,
        dataFim: dataFim ? new Date(`${dataFim}T12:00:00`) : undefined,
        modo,
        paraUserIds,
        metaSemanal: usarMetaEquipe ? Number(metaSemanal) : undefined,
        statusMeta: usarStatus,
        poloId: user?.poloId,
        metasIndividuais:
          Object.keys(metasInd).length > 0 ? metasInd : undefined,
        etapas:
          modo === "sequencial"
            ? etapasForm.map((e) => ({
                titulo: e.titulo,
                userIds: e.userIds,
              }))
            : undefined,
      },
      area
    );

    setSalvando(false);
    if (error) {
      showToast(error, "error");
      return;
    }
    showToast("Tarefa criada.", "success");
    setModal(false);
    carregar();
  };

  const remover = async (id: string) => {
    const ok = await confirm("Excluir esta tarefa, progressos e comentários?", {
      danger: true,
      confirmLabel: "Excluir",
    });
    if (!ok) return;
    const { error } = await excluirTarefaGeral(id, area);
    if (error) showToast(error, "error");
    else {
      showToast("Tarefa excluída.", "success");
      if (tarefaAbertaId === id) setTarefaAbertaId(null);
      carregar();
    }
  };

  const abrirDetalhe = async (tarefa: TarefaGeralUI) => {
    if (tarefaAbertaId === tarefa.id) {
      setTarefaAbertaId(null);
      return;
    }
    setTarefaAbertaId(tarefa.id);
    setCarregandoComents(true);
    const { comentarios: lista, error } = await listarComentarios(
      tarefa.id,
      area
    );
    if (error) showToast(error, "error");
    else setComentarios(lista);
    setCarregandoComents(false);
  };

  const enviarComentario = async (tarefaId: string) => {
    if (!novoComentario.trim()) return;
    setSalvando(true);
    const { error } = await adicionarComentario(
      tarefaId,
      novoComentario,
      area
    );
    setSalvando(false);
    if (error) {
      showToast(error, "error");
      return;
    }
    setNovoComentario("");
    const { comentarios: lista } = await listarComentarios(tarefaId, area);
    setComentarios(lista);
  };

  const apagarComentario = async (id: string) => {
    const { error } = await excluirComentario(id, area);
    if (error) showToast(error, "error");
    else if (tarefaAbertaId) {
      const { comentarios: lista } = await listarComentarios(
        tarefaAbertaId,
        area
      );
      setComentarios(lista);
    }
  };

  const salvarProgresso = async () => {
    if (!editMembroId) return;
    setSalvando(true);
    const { error } = await atualizarProgressoTarefa(
      editMembroId,
      {
        progressoPct: editPct,
        alunosConcluidos: editTemMeta ? editAlunos : undefined,
      },
      area
    );
    setSalvando(false);
    if (error) {
      showToast(error, "error");
      return;
    }
    showToast("Progresso atualizado.", "success");
    setEditMembroId(null);
    carregar();
  };

  const meuUserId = user?.id;

  /* ---------- Timeline helpers ---------- */
  const diasTimeline = useMemo(() => {
    const fim = addDays(timelineInicio, timelineDias - 1);
    return eachDayOfInterval({ start: timelineInicio, end: fim });
  }, [timelineInicio, timelineDias]);

  const tarefaNoPeriodo = (t: TarefaGeralUI) => {
    const ini = t.dataInicio || t.createdAt;
    const fim = t.dataFim || t.prazo || addDays(ini, 3);
    if (!ini || !fim) return false;
    const rangeStart = timelineInicio;
    const rangeEnd = addDays(timelineInicio, timelineDias - 1);
    return (
      isWithinInterval(ini, { start: rangeStart, end: rangeEnd }) ||
      isWithinInterval(fim, { start: rangeStart, end: rangeEnd }) ||
      (ini <= rangeStart && fim >= rangeEnd)
    );
  };

  const posicaoBarra = (t: TarefaGeralUI) => {
    const ini = startOfDay(t.dataInicio || t.createdAt);
    const fim = startOfDay(t.dataFim || t.prazo || addDays(ini, 3));
    const total = diasTimeline.length;
    let startIdx = differenceInCalendarDays(ini, timelineInicio);
    let endIdx = differenceInCalendarDays(fim, timelineInicio);
    startIdx = Math.max(0, Math.min(total - 1, startIdx));
    endIdx = Math.max(startIdx, Math.min(total - 1, endIdx));
    const left = (startIdx / total) * 100;
    const width = ((endIdx - startIdx + 1) / total) * 100;
    return { left: `${left}%`, width: `${width}%` };
  };

  /* ---------- Calendário mensal (estilo Agenda) ---------- */
  const diasMes = useMemo(() => {
    const inicio = startOfWeek(startOfMonth(mesCalendario), { weekStartsOn: 0 });
    const fim = endOfWeek(endOfMonth(mesCalendario), { weekStartsOn: 0 });
    return eachDayOfInterval({ start: inicio, end: fim });
  }, [mesCalendario]);

  const intervaloTarefa = (t: TarefaGeralUI) => {
    const ini = startOfDay(t.dataInicio || t.createdAt);
    const fim = startOfDay(t.dataFim || t.prazo || addDays(ini, 3));
    return { ini, fim };
  };

  const tarefasNoDia = (dia: Date) =>
    tarefas.filter((t) => {
      const { ini, fim } = intervaloTarefa(t);
      return dia >= ini && dia <= fim;
    });

  const tarefasDoDiaSelecionado = useMemo(
    () => tarefasNoDia(diaSelecionado),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tarefas, diaSelecionado]
  );

  const tarefaAberta = tarefas.find((t) => t.id === tarefaAbertaId) || null;

  return (
    <div className="painel-tarefas-page ptg-novo">
      {isRematricula ? <RematriculaTabs /> : <EngajamentoTabs />}

      <div className="painel-header">
        <div>
          <h1>
            <ClipboardList size={22} /> Painel de tarefas
          </h1>
          <p>
            {isGestor
              ? "Tarefas com início/fim, modo paralelo ou em etapas, timeline e progresso da equipe."
              : "Suas tarefas, progresso e comentários da equipe."}
          </p>
        </div>
        {isGestor && (
          <button className="btn btn-primary" onClick={abrirNova}>
            <Plus size={18} /> Nova tarefa
          </button>
        )}
      </div>

      {carregando ? (
        <div className="painel-vazio">Carregando tarefas...</div>
      ) : (
        <div className="ptg-layout">
          {/* ========== PAINEL LATERAL (estilo Trello) ========== */}
          <aside className="ptg-sidebar">
            <div className="ptg-sidebar-head">
              <h2>
                <Layers size={16} /> Tarefas
              </h2>
              <span className="ptg-count">{tarefas.length}</span>
            </div>

            {tarefas.length === 0 ? (
              <div className="ptg-sidebar-empty">
                <ClipboardList size={28} />
                <p>
                  {isGestor
                    ? "Nenhuma tarefa ainda. Crie a primeira."
                    : "Nenhuma tarefa delegada a você."}
                </p>
              </div>
            ) : (
              <ul className="ptg-card-list">
                {tarefas.map((tarefa) => {
                  const ativa = tarefaAbertaId === tarefa.id;
                  const cor = corDaTarefa(tarefa.id);
                  const ini = tarefa.dataInicio || tarefa.createdAt;
                  const fim = tarefa.dataFim || tarefa.prazo;
                  const membrosVisiveis = isGestor
                    ? tarefa.membros
                    : tarefa.membros.filter((m) => m.userId === meuUserId);
                  const pct = isGestor
                    ? tarefa.progressoMedio ?? 0
                    : membrosVisiveis[0]?.progressoPct ?? 0;

                  return (
                    <li key={tarefa.id}>
                      <button
                        type="button"
                        className={`ptg-card ${ativa ? "ativa" : ""}`}
                        style={{ borderLeftColor: cor }}
                        onClick={() => abrirDetalhe(tarefa)}
                      >
                        <div className="ptg-card-top">
                          <strong>{tarefa.titulo}</strong>
                          {tarefa.modo === "sequencial" ? (
                            <span className="ptg-badge seq">
                              <GitBranch size={11} /> Etapas
                            </span>
                          ) : (
                            <span className="ptg-badge par">Paralelo</span>
                          )}
                        </div>

                        {tarefa.descricao && (
                          <p className="ptg-card-desc">{tarefa.descricao}</p>
                        )}

                        <div className="ptg-card-meta">
                          {fim && (
                            <span>
                              <CalendarClock size={12} />
                              {ini
                                ? `${format(ini, "dd/MM")} → ${format(fim, "dd/MM")}`
                                : format(fim, "dd/MM/yyyy")}
                            </span>
                          )}
                          <span>
                            <Users size={12} /> {tarefa.membros.length}
                          </span>
                          {tarefa.temMeta && (
                            <span className="ptg-meta-tag">
                              <Target size={12} /> {tarefa.metaSemanal}
                            </span>
                          )}
                        </div>

                        <div className="ptg-card-progress">
                          <div className="barra-track sm">
                            <div
                              className="barra-fill"
                              style={{ width: `${pct}%`, background: cor }}
                            />
                          </div>
                          <span>{pct}%</span>
                        </div>

                        {/* Mini etapas (modo sequencial) */}
                        {tarefa.modo === "sequencial" &&
                          tarefa.etapas &&
                          tarefa.etapas.length > 0 && (
                            <div className="ptg-mini-etapas">
                              {tarefa.etapas.map((e) => (
                                <span
                                  key={e.id}
                                  className={`ptg-mini-etapa ${e.status}`}
                                  title={`${e.ordem}. ${e.titulo} — ${e.userNome || "—"}`}
                                >
                                  {e.status === "concluida" ? (
                                    <CheckCircle2 size={12} />
                                  ) : e.status === "bloqueada" ? (
                                    <Lock size={12} />
                                  ) : (
                                    <Circle size={12} />
                                  )}
                                  {e.ordem}
                                </span>
                              ))}
                            </div>
                          )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>

          {/* ========== ÁREA PRINCIPAL: Calendário / Timeline + Detalhe ========== */}
          <main className="ptg-main">
            {/* Toggle de visualização */}
            <div className="ptg-vista-toggle">
              <button
                type="button"
                className={`ptg-vista-btn ${vista === "calendario" ? "ativa" : ""}`}
                onClick={() => setVista("calendario")}
              >
                <CalendarDays size={16} /> Calendário
              </button>
              <button
                type="button"
                className={`ptg-vista-btn ${vista === "timeline" ? "ativa" : ""}`}
                onClick={() => setVista("timeline")}
              >
                <CalendarRange size={16} /> Timeline
              </button>
            </div>

            {/* ===== VISTA CALENDÁRIO MENSAL (estilo Agenda) ===== */}
            {vista === "calendario" && (
              <div className="ptg-cal-layout">
                <section className="ptg-calendario">
                  <div className="ptg-cal-nav">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setMesCalendario((m) => subMonths(m, 1))}
                      aria-label="Mês anterior"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <h2>
                      {format(mesCalendario, "MMMM yyyy", { locale: ptBR })}
                    </h2>
                    <div className="ptg-cal-nav-right">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          const hoje = startOfToday();
                          setMesCalendario(hoje);
                          setDiaSelecionado(hoje);
                        }}
                      >
                        Hoje
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setMesCalendario((m) => addMonths(m, 1))}
                        aria-label="Próximo mês"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="ptg-cal-semana">
                    {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(
                      (d) => (
                        <span key={d}>{d}</span>
                      )
                    )}
                  </div>

                  <div className="ptg-cal-grade">
                    {diasMes.map((dia) => {
                      const qtd = tarefasNoDia(dia).length;
                      const fora = !isSameMonth(dia, mesCalendario);
                      const sel = isSameDay(dia, diaSelecionado);
                      const hoje = isSameDay(dia, startOfToday());
                      return (
                        <button
                          key={dia.toISOString()}
                          type="button"
                          className={`ptg-cal-dia ${fora ? "fora" : ""} ${sel ? "selecionado" : ""} ${hoje ? "hoje" : ""}`}
                          onClick={() => setDiaSelecionado(dia)}
                        >
                          <span className="ptg-cal-num">{format(dia, "d")}</span>
                          {qtd > 0 && (
                            <div className="ptg-cal-dots">
                              {tarefasNoDia(dia)
                                .slice(0, 3)
                                .map((t) => (
                                  <i
                                    key={t.id}
                                    style={{ background: corDaTarefa(t.id) }}
                                    title={t.titulo}
                                  />
                                ))}
                              {qtd > 3 && (
                                <span className="ptg-cal-mais">+{qtd - 3}</span>
                              )}
                            </div>
                          )}
                          {qtd > 0 && <em className="ptg-cal-badge">{qtd}</em>}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <aside className="ptg-cal-dia-panel">
                  <div className="ptg-cal-dia-titulo">
                    <div>
                      <span>Tarefas em</span>
                      <h2>
                        {format(diaSelecionado, "dd 'de' MMMM", {
                          locale: ptBR,
                        })}
                      </h2>
                    </div>
                  </div>

                  {tarefasDoDiaSelecionado.length === 0 ? (
                    <p className="ptg-cal-vazio">
                      Nenhuma tarefa neste dia.
                    </p>
                  ) : (
                    <ul className="ptg-cal-lista-dia">
                      {tarefasDoDiaSelecionado.map((t) => {
                        const cor = corDaTarefa(t.id);
                        const { ini, fim } = intervaloTarefa(t);
                        const ativa = tarefaAbertaId === t.id;
                        return (
                          <li key={t.id}>
                            <button
                              type="button"
                              className={`ptg-cal-item ${ativa ? "ativa" : ""}`}
                              style={{ borderLeftColor: cor }}
                              onClick={() => abrirDetalhe(t)}
                            >
                              <strong>{t.titulo}</strong>
                              <span>
                                <CalendarClock size={12} />
                                {format(ini, "dd/MM")} → {format(fim, "dd/MM")}
                              </span>
                              <span>
                                <Users size={12} /> {t.membros.length}
                                {t.modo === "sequencial" && (
                                  <> · <GitBranch size={12} /> Etapas</>
                                )}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </aside>
              </div>
            )}

            {/* ===== VISTA TIMELINE ===== */}
            {vista === "timeline" && (
              <>
                <div className="ptg-timeline-toolbar">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setTimelineInicio((d) => addDays(d, -7))}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setTimelineInicio(startOfDay(new Date()))}
                  >
                    Hoje
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setTimelineInicio((d) => addDays(d, 7))}
                  >
                    <ChevronRight size={16} />
                  </button>

                  <span className="ptg-timeline-label">
                    <CalendarRange size={15} />
                    {format(timelineInicio, "dd MMM", { locale: ptBR })} —{" "}
                    {format(
                      addDays(timelineInicio, 6),
                      "dd MMM yyyy",
                      { locale: ptBR }
                    )}
                    <span className="ptg-timeline-semana"> · 7 dias</span>
                  </span>
                </div>

                <div
                  className="ptg-timeline-wrap"
                  style={
                    {
                      ["--ptg-cols" as string]: timelineDias,
                    } as React.CSSProperties
                  }
                >
                  <div
                    className="ptg-timeline-header"
                    style={{
                      gridTemplateColumns: `repeat(${timelineDias}, minmax(48px, 1fr))`,
                    }}
                  >
                    {diasTimeline.map((dia) => {
                      const isHoje = isSameDay(dia, startOfToday());
                      return (
                        <div
                          key={dia.toISOString()}
                          className={`ptg-day-head ${isHoje ? "hoje" : ""}`}
                        >
                          <span className="ptg-day-name">
                            {format(dia, "EEE", { locale: ptBR })}
                          </span>
                          <span className="ptg-day-num">
                            {format(dia, "d")}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div
                    className="ptg-timeline-body"
                    style={{
                      backgroundImage: `repeating-linear-gradient(
                        90deg,
                        transparent,
                        transparent calc(100% / ${timelineDias} - 1px),
                        color-mix(in srgb, var(--border-color) 50%, transparent) calc(100% / ${timelineDias} - 1px),
                        color-mix(in srgb, var(--border-color) 50%, transparent) calc(100% / ${timelineDias})
                      )`,
                    }}
                  >
                    {tarefas.filter(tarefaNoPeriodo).length === 0 ? (
                      <div className="ptg-timeline-empty">
                        Nenhuma tarefa neste período.
                      </div>
                    ) : (
                      tarefas.filter(tarefaNoPeriodo).map((t) => {
                        const pos = posicaoBarra(t);
                        const cor = corDaTarefa(t.id);
                        const ativa = tarefaAbertaId === t.id;
                        return (
                          <div key={t.id} className="ptg-timeline-row">
                            <button
                              type="button"
                              className={`ptg-bar ${ativa ? "ativa" : ""}`}
                              style={{
                                left: pos.left,
                                width: pos.width,
                                background: cor,
                              }}
                              onClick={() => abrirDetalhe(t)}
                              title={t.titulo}
                            >
                              <span className="ptg-bar-label">{t.titulo}</span>
                              {t.modo === "sequencial" && t.etapas && (
                                <span className="ptg-bar-etapas">
                                  {t.etapas.map((e) => (
                                    <i
                                      key={e.id}
                                      className={e.status}
                                      style={{
                                        flex:
                                          e.status === "concluida" ||
                                          e.status === "em_andamento"
                                            ? 1
                                            : 0.6,
                                      }}
                                    />
                                  ))}
                                </span>
                              )}
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Detalhe expandido da tarefa selecionada */}
            {tarefaAberta && (
              <section className="ptg-detalhe">
                <div className="ptg-detalhe-head">
                  <div>
                    <h2>{tarefaAberta.titulo}</h2>
                    {tarefaAberta.descricao && (
                      <p className="painel-desc">{tarefaAberta.descricao}</p>
                    )}
                    <div className="painel-meta-tags">
                      {(tarefaAberta.dataInicio || tarefaAberta.dataFim) && (
                        <span>
                          <CalendarClock size={14} />
                          {tarefaAberta.dataInicio
                            ? format(tarefaAberta.dataInicio, "dd/MM/yyyy")
                            : "—"}{" "}
                          →{" "}
                          {tarefaAberta.dataFim
                            ? format(tarefaAberta.dataFim, "dd/MM/yyyy")
                            : tarefaAberta.prazo
                              ? format(tarefaAberta.prazo, "dd/MM/yyyy")
                              : "—"}
                        </span>
                      )}
                      <span>
                        {tarefaAberta.modo === "sequencial" ? (
                          <>
                            <GitBranch size={14} /> Sequencial
                          </>
                        ) : (
                          <>
                            <Users size={14} /> Paralelo
                          </>
                        )}
                      </span>
                      {tarefaAberta.temMeta && (
                        <span className="tag-meta">
                          <Target size={14} /> Meta {tarefaAberta.metaSemanal}{" "}
                          alunos
                          {tarefaAberta.statusMeta
                            ? ` · ${labelStatusMeta(tarefaAberta.statusMeta)}`
                            : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="painel-acoes-topo">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setTarefaAbertaId(null)}
                    >
                      <X size={14} /> Fechar
                    </button>
                    {isGestor && (
                      <button
                        type="button"
                        className="btn-icon-danger"
                        onClick={() => remover(tarefaAberta.id)}
                        aria-label="Excluir"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Etapas (modo sequencial) */}
                {tarefaAberta.modo === "sequencial" &&
                  tarefaAberta.etapas &&
                  tarefaAberta.etapas.length > 0 && (
                    <div className="ptg-etapas-lista">
                      <h3>
                        <GitBranch size={16} /> Etapas
                      </h3>
                      {tarefaAberta.etapas.map((e) => (
                        <div
                          key={e.id}
                          className={`ptg-etapa-item ${e.status}`}
                        >
                          <div className="ptg-etapa-icon">
                            {e.status === "concluida" ? (
                              <CheckCircle2 size={18} />
                            ) : e.status === "bloqueada" ? (
                              <Lock size={18} />
                            ) : (
                              <Circle size={18} />
                            )}
                          </div>
                          <div className="ptg-etapa-info">
                            <strong>
                              {e.ordem}. {e.titulo}
                            </strong>
                            <span>
                              <UserRound size={13} />{" "}
                              {e.userNome || "Colaborador"}
                              {e.status === "bloqueada" && " · Aguardando etapa anterior"}
                              {e.status === "em_andamento" && " · Em andamento"}
                              {e.status === "concluida" && " · Concluída"}
                            </span>
                          </div>
                          <div className="ptg-etapa-pct">{e.progressoPct}%</div>
                        </div>
                      ))}
                    </div>
                  )}

                {/* Progresso meta equipe */}
                {isGestor && tarefaAberta.temMeta && (
                  <div className="barra-bloco">
                    <div className="barra-labels">
                      <span>Meta semanal da equipe</span>
                      <strong>
                        {tarefaAberta.membros.reduce(
                          (s, m) => s + m.alunosConcluidos,
                          0
                        )}{" "}
                        / {tarefaAberta.metaSemanal} (
                        {tarefaAberta.progressoMetaEquipe ?? 0}%)
                      </strong>
                    </div>
                    <div className="barra-track">
                      <div
                        className="barra-fill meta"
                        style={{
                          width: `${tarefaAberta.progressoMetaEquipe ?? 0}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Membros / progresso individual */}
                {(() => {
                  const membrosVisiveis = isGestor
                    ? tarefaAberta.membros
                    : tarefaAberta.membros.filter(
                        (m) => m.userId === meuUserId
                      );
                  if (!isGestor && membrosVisiveis.length === 0) return null;
                  return (
                    <div className="membros-lista">
                      <h3>
                        <Users size={16} /> Progresso
                      </h3>
                      {membrosVisiveis.map((m) => (
                        <div key={m.id} className="membro-card">
                          <div className="membro-info">
                            <UserRound size={16} />
                            <span className="membro-nome">
                              {isGestor
                                ? m.userNome || "Colaborador"
                                : "Seu progresso"}
                            </span>
                            <span className="membro-nums">
                              {m.progressoPct}%
                              {m.metaIndividual
                                ? ` · ${m.alunosConcluidos}/${m.metaIndividual} aluno${
                                    m.metaIndividual !== 1 ? "s" : ""
                                  }`
                                : tarefaAberta.temMeta
                                  ? ` · ${m.alunosConcluidos} aluno${
                                      m.alunosConcluidos !== 1 ? "s" : ""
                                    }`
                                  : ""}
                            </span>
                          </div>
                          <div className="barra-track sm">
                            <div
                              className="barra-fill"
                              style={{ width: `${m.progressoPct}%` }}
                            />
                          </div>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setEditMembroId(m.id);
                              setEditPct(m.progressoPct);
                              setEditAlunos(m.alunosConcluidos);
                              setEditTemMeta(tarefaAberta.temMeta);
                            }}
                          >
                            Atualizar progresso
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Comentários */}
                <div className="painel-comentarios">
                  <h3>
                    <MessageSquare size={16} /> Comentários
                  </h3>
                  {carregandoComents ? (
                    <p className="painel-hint">Carregando...</p>
                  ) : comentarios.length === 0 ? (
                    <p className="painel-hint">Nenhum comentário ainda.</p>
                  ) : (
                    <ul className="comentarios-lista">
                      {comentarios.map((c) => (
                        <li key={c.id}>
                          <div className="comentario-cab">
                            <strong>{c.userNome || "Usuário"}</strong>
                            <span>
                              {format(c.createdAt, "dd/MM/yyyy HH:mm")}
                            </span>
                            {(c.userId === meuUserId || isGestor) && (
                              <button
                                type="button"
                                className="link-apagar"
                                onClick={() => apagarComentario(c.id)}
                              >
                                Apagar
                              </button>
                            )}
                          </div>
                          <p>{c.texto}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="comentario-novo">
                    <textarea
                      value={novoComentario}
                      onChange={(e) => setNovoComentario(e.target.value)}
                      placeholder="Escreva um comentário..."
                      rows={2}
                    />
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={salvando || !novoComentario.trim()}
                      onClick={() => enviarComentario(tarefaAberta.id)}
                    >
                      Enviar
                    </button>
                  </div>
                </div>
              </section>
            )}
          </main>
        </div>
      )}

      {/* ========== MODAL DE CRIAÇÃO (wizard visual) ========== */}
      {modal && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(false);
          }}
        >
          <div className="painel-modal ptg-modal" onClick={(e) => e.stopPropagation()}>
            <header className="ptg-modal-header">
              <h2>
                <Plus size={20} /> Nova tarefa
              </h2>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setModal(false)}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </header>

            {/* Steps indicator */}
            <div className="ptg-steps">
              {[1, 2, 3, 4].map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`ptg-step ${wizard === s ? "ativa" : ""} ${
                    wizard > s ? "feita" : ""
                  }`}
                  onClick={() => {
                    if (s < wizard) setWizard(s as WizardStep);
                  }}
                >
                  <span>{s}</span>
                  {s === 1 && "Info"}
                  {s === 2 && "Datas"}
                  {s === 3 && "Equipe"}
                  {s === 4 && "Meta"}
                </button>
              ))}
            </div>

            <div className="ptg-modal-body">
              {/* Step 1 — Título / descrição */}
              {wizard === 1 && (
                <div className="ptg-form-block">
                  <label>
                    Título *
                    <input
                      value={titulo}
                      onChange={(e) => setTitulo(e.target.value)}
                      placeholder="Ex.: Campanha de rematrícula 2026"
                      autoFocus
                      maxLength={120}
                    />
                  </label>
                  <label>
                    Descrição
                    <textarea
                      value={descricao}
                      onChange={(e) => setDescricao(e.target.value)}
                      placeholder="Detalhes, orientações, links..."
                      rows={3}
                    />
                  </label>
                </div>
              )}

              {/* Step 2 — Datas + modo */}
              {wizard === 2 && (
                <div className="ptg-form-block">
                  <div className="ptg-datas-row">
                    <label>
                      Data de início *
                      <input
                        type="date"
                        value={dataInicio}
                        onChange={(e) => setDataInicio(e.target.value)}
                      />
                    </label>
                    <label>
                      Data de fim *
                      <input
                        type="date"
                        value={dataFim}
                        onChange={(e) => setDataFim(e.target.value)}
                        min={dataInicio || undefined}
                      />
                    </label>
                  </div>

                  {duracaoDias !== null && (
                    <div className="ptg-duracao-preview">
                      <CalendarRange size={16} />
                      <span>
                        Duração: <strong>{duracaoDias}</strong> dia
                        {duracaoDias !== 1 ? "s" : ""}
                      </span>
                      <div className="ptg-duracao-bar">
                        <div
                          style={{
                            width: `${Math.min(100, (duracaoDias / 30) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="ptg-modo-escolha">
                    <p className="ptg-label">Modo de execução</p>
                    <div className="ptg-modo-cards">
                      <button
                        type="button"
                        className={`ptg-modo-card ${
                          modo === "paralelo" ? "ativo" : ""
                        }`}
                        onClick={() => setModo("paralelo")}
                      >
                        <Users size={22} />
                        <strong>Paralelo</strong>
                        <span>Todos trabalham ao mesmo tempo</span>
                      </button>
                      <button
                        type="button"
                        className={`ptg-modo-card ${
                          modo === "sequencial" ? "ativo" : ""
                        }`}
                        onClick={() => setModo("sequencial")}
                      >
                        <GitBranch size={22} />
                        <strong>Sequencial</strong>
                        <span>Etapas com dependência (uma após a outra)</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3 — Equipe / Etapas + meta individual */}
              {wizard === 3 && (
                <div className="ptg-form-block">
                  {modo === "paralelo" ? (
                    <>
                      <p className="ptg-label">
                        Responsáveis * (mesmo polo)
                      </p>
                      <div className="ptg-chips">
                        {colaboradoresDoPolo.length === 0 ? (
                          <p className="painel-hint">
                            Nenhum colaborador neste polo.
                          </p>
                        ) : (
                          colaboradoresDoPolo.map((c) => {
                            const sel = destinatarios.includes(c.id);
                            return (
                              <button
                                key={c.id}
                                type="button"
                                className={`ptg-chip ${sel ? "sel" : ""}`}
                                onClick={() => toggleDestinatario(c.id)}
                              >
                                <UserRound size={14} />
                                {c.name || c.email || "Colaborador"}
                              </button>
                            );
                          })
                        )}
                      </div>

                      {/* Meta individual logo abaixo dos selecionados */}
                      {destinatarios.length > 0 && (
                        <div className="ptg-metas-individuais ptg-metas-step3">
                          <p className="ptg-label">
                            <Target size={14} /> Meta individual (opcional)
                          </p>
                          <p className="painel-hint">
                            Quantos alunos cada pessoa deve atingir nesta
                            tarefa. Deixe vazio se não houver meta individual.
                          </p>
                          {destinatarios.map((uid) => {
                            const colab = colaboradoresDoPolo.find(
                              (c) => c.id === uid
                            );
                            return (
                              <label
                                key={uid}
                                className="ptg-meta-membro-row"
                              >
                                <span>
                                  {colab?.name ||
                                    colab?.email ||
                                    "Colaborador"}
                                </span>
                                <input
                                  type="number"
                                  min={1}
                                  value={metasIndividuais[uid] || ""}
                                  onChange={(e) =>
                                    setMetasIndividuais((prev) => ({
                                      ...prev,
                                      [uid]: e.target.value,
                                    }))
                                  }
                                  placeholder="Ex.: 10"
                                />
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="ptg-label">
                        Etapas (ordem = dependência entre etapas)
                      </p>
                      <p className="painel-hint">
                        Em cada etapa você pode colocar <strong>vários
                        colaboradores</strong> trabalhando ao mesmo tempo.
                        A etapa seguinte só libera quando esta for concluída.
                      </p>
                      <div className="ptg-etapas-form ptg-etapas-multi">
                        {etapasForm.map((e, idx) => (
                          <div key={idx} className="ptg-etapa-bloco">
                            <div className="ptg-etapa-form-row">
                              <span className="ptg-etapa-num">{idx + 1}</span>
                              <input
                                value={e.titulo}
                                onChange={(ev) =>
                                  updateEtapaTitulo(idx, ev.target.value)
                                }
                                placeholder="Nome da etapa"
                              />
                              <button
                                type="button"
                                className="btn-icon-danger"
                                onClick={() => removeEtapaForm(idx)}
                                disabled={etapasForm.length <= 1}
                                aria-label="Remover etapa"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>

                            <p className="ptg-label ptg-etapa-sublabel">
                              Responsáveis desta etapa * (pode marcar vários)
                            </p>
                            <div className="ptg-chips">
                              {colaboradoresDoPolo.map((c) => {
                                const sel = e.userIds.includes(c.id);
                                return (
                                  <button
                                    key={c.id}
                                    type="button"
                                    className={`ptg-chip ${sel ? "sel" : ""}`}
                                    onClick={() => toggleEtapaUser(idx, c.id)}
                                  >
                                    <UserRound size={14} />
                                    {c.name || c.email || "Colaborador"}
                                  </button>
                                );
                              })}
                            </div>

                            {e.userIds.length > 0 && (
                              <div className="ptg-metas-individuais ptg-metas-step3">
                                <p className="ptg-label">
                                  <Target size={14} /> Meta individual nesta
                                  etapa (opcional)
                                </p>
                                {e.userIds.map((uid) => {
                                  const colab = colaboradoresDoPolo.find(
                                    (c) => c.id === uid
                                  );
                                  return (
                                    <label
                                      key={uid}
                                      className="ptg-meta-membro-row"
                                    >
                                      <span>
                                        {colab?.name ||
                                          colab?.email ||
                                          "Colaborador"}
                                      </span>
                                      <input
                                        type="number"
                                        min={1}
                                        value={metasIndividuais[uid] || ""}
                                        onChange={(ev) =>
                                          setMetaIndividual(
                                            uid,
                                            ev.target.value
                                          )
                                        }
                                        placeholder="Ex.: 10"
                                      />
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={addEtapaForm}
                        >
                          <Plus size={14} /> Adicionar etapa
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Step 4 — Meta opcional (equipe + individual por membro) */}
              {wizard === 4 && (
                <div className="ptg-form-block">
                  <label className="ptg-check">
                    <input
                      type="checkbox"
                      checked={temMeta}
                      onChange={(e) => setTemMeta(e.target.checked)}
                    />
                    Esta tarefa tem meta de alunos
                  </label>
                  {temMeta && (
                    <>
                      <label>
                        Meta da equipe (opcional)
                        <input
                          type="number"
                          min={1}
                          value={metaSemanal}
                          onChange={(e) => setMetaSemanal(e.target.value)}
                          placeholder="Ex.: 30 — soma da equipe"
                        />
                      </label>
                      <label>
                        Status dos alunos para a meta (opcional)
                        <select
                          value={statusMeta}
                          onChange={(e) => setStatusMeta(e.target.value)}
                        >
                          <option value="">Sem vínculo a status</option>
                          {statusMetaOpcoes.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <p className="ptg-label" style={{ marginTop: 12 }}>
                        Meta individual por colaborador
                      </p>
                      <p className="painel-hint">
                        Defina quantos alunos cada pessoa deve atingir. Pode
                        deixar em branco se só usar meta da equipe.
                      </p>
                      <div className="ptg-metas-individuais">
                        {membrosSelecionadosIds.length === 0 ? (
                          <p className="painel-hint">
                            Nenhum responsável selecionado no passo Equipe.
                          </p>
                        ) : (
                          membrosSelecionadosIds.map((uid) => {
                            const colab = colaboradoresDoPolo.find(
                              (c) => c.id === uid
                            );
                            return (
                              <label key={uid} className="ptg-meta-membro-row">
                                <span>
                                  {colab?.name || colab?.email || "Colaborador"}
                                </span>
                                <input
                                  type="number"
                                  min={1}
                                  value={metasIndividuais[uid] || ""}
                                  onChange={(e) =>
                                    setMetasIndividuais((prev) => ({
                                      ...prev,
                                      [uid]: e.target.value,
                                    }))
                                  }
                                  placeholder="Meta"
                                />
                              </label>
                            );
                          })
                        )}
                      </div>
                    </>
                  )}

                  {/* Resumo final */}
                  <div className="ptg-resumo">
                    <h4>Resumo</h4>
                    <ul>
                      <li>
                        <strong>{titulo || "—"}</strong>
                      </li>
                      <li>
                        {dataInicio && dataFim
                          ? `${format(parseDateInput(dataInicio)!, "dd/MM")} → ${format(parseDateInput(dataFim)!, "dd/MM")} (${duracaoDias} dias)`
                          : "Datas não definidas"}
                      </li>
                      <li>
                        Modo:{" "}
                        {modo === "paralelo"
                          ? `Paralelo · ${destinatarios.length} pessoa(s)`
                          : `Sequencial · ${etapasForm.length} etapa(s)`}
                      </li>
                      {temMeta && (
                        <li>
                          Meta equipe: {metaSemanal || "—"} alunos
                          {statusMeta ? ` (${labelStatusMeta(statusMeta)})` : ""}
                        </li>
                      )}
                      {temMeta &&
                        membrosSelecionadosIds
                          .filter((id) => Number(metasIndividuais[id] || 0) > 0)
                          .map((id) => {
                            const colab = colaboradoresDoPolo.find(
                              (c) => c.id === id
                            );
                            return (
                              <li key={id}>
                                Meta{" "}
                                {colab?.name || colab?.email || "colaborador"}:{" "}
                                {metasIndividuais[id]} alunos
                              </li>
                            );
                          })}
                    </ul>
                  </div>
                </div>
              )}
            </div>

            <footer className="etapas-footer">
              {wizard > 1 ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setWizard((wizard - 1) as WizardStep)}
                >
                  <ChevronLeft size={16} /> Voltar
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setModal(false)}
                >
                  Cancelar
                </button>
              )}
              {wizard < 4 ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={
                    (wizard === 1 && !podeAvancar1) ||
                    (wizard === 2 && !podeAvancar2) ||
                    (wizard === 3 && !podeAvancar3)
                  }
                  onClick={() => setWizard((wizard + 1) as WizardStep)}
                >
                  Próximo <ChevronRight size={16} />
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!podeCriar || salvando}
                  onClick={salvar}
                >
                  {salvando ? "Criando..." : "Criar tarefa"}
                </button>
              )}
            </footer>
          </div>
        </div>
      )}

      {/* Modal atualizar progresso */}
      {editMembroId && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditMembroId(null);
          }}
        >
          <div className="painel-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Atualizar progresso</h2>
            <label>
              Progresso (%)
              <input
                type="number"
                min={0}
                max={100}
                value={editPct}
                onChange={(e) => setEditPct(Number(e.target.value))}
              />
            </label>
            {editTemMeta && (
              <label>
                Alunos concluídos
                <input
                  type="number"
                  min={0}
                  value={editAlunos}
                  onChange={(e) => setEditAlunos(Number(e.target.value))}
                />
              </label>
            )}
            <footer className="etapas-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setEditMembroId(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={salvando}
                onClick={salvarProgresso}
              >
                {salvando ? "Salvando..." : "Salvar"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

export default PainelTarefasGeral;
