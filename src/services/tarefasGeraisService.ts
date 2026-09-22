import { supabase } from "../lib/supabase";

export type AreaTarefaGeral = "engajamento" | "rematricula";

export interface TarefaGeralMembro {
  id: string;
  userId: string;
  userNome?: string;
  progressoPct: number;
  alunosConcluidos: number;
  /** Meta individual de alunos deste membro (opcional). */
  metaIndividual?: number;
  observacao?: string;
  updatedAt?: Date;
}

export interface TarefaComentario {
  id: string;
  tarefaId: string;
  userId: string;
  userNome?: string;
  texto: string;
  createdAt: Date;
}

export type ModoTarefaGeral = "paralelo" | "sequencial";
export type StatusEtapaGeral =
  | "pendente"
  | "em_andamento"
  | "concluida"
  | "bloqueada";

/** Uma linha = um colaborador em uma ordem (vários userIds na mesma ordem = etapa multi). */
export interface TarefaEtapaGeral {
  id: string;
  ordem: number;
  titulo: string;
  userId: string;
  userNome?: string;
  status: StatusEtapaGeral;
  progressoPct: number;
}

export interface TarefaGeral {
  id: string;
  titulo: string;
  descricao?: string;
  prazo?: Date;
  dataInicio?: Date;
  dataFim?: Date;
  modo?: ModoTarefaGeral;
  paraUserId: string;
  paraUserNome?: string;
  poloId?: string;
  metaSemanal?: number;
  statusMeta?: string;
  ativo: boolean;
  createdAt: Date;
  membros: TarefaGeralMembro[];
  etapas?: TarefaEtapaGeral[];
  progressoMetaEquipe?: number;
  progressoMedio?: number;
  temMeta: boolean;
}

/** Usa só o parâmetro `area` do page — não depende de window.location. */
function isRematriculaArea(area: AreaTarefaGeral) {
  return area === "rematricula";
}

const tabela = (area: AreaTarefaGeral) =>
  isRematriculaArea(area) ? "rematricula_tarefas_gerais" : "tarefas_gerais";
const tabelaMembros = (area: AreaTarefaGeral) =>
  isRematriculaArea(area)
    ? "rematricula_tarefas_gerais_membros"
    : "tarefas_gerais_membros";
const tabelaComentarios = (area: AreaTarefaGeral) =>
  isRematriculaArea(area)
    ? "rematricula_tarefas_gerais_comentarios"
    : "tarefas_gerais_comentarios";
const tabelaEtapas = (area: AreaTarefaGeral) =>
  isRematriculaArea(area)
    ? "rematricula_tarefas_gerais_etapas"
    : "tarefas_gerais_etapas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEtapa(row: any, nomesByUser: Map<string, string>): TarefaEtapaGeral {
  return {
    id: row.id,
    ordem: row.ordem,
    titulo: row.titulo,
    userId: row.user_id,
    userNome: nomesByUser.get(row.user_id),
    status: (row.status as StatusEtapaGeral) || "bloqueada",
    progressoPct: row.progresso_pct ?? 0,
  };
}

function mapTarefa(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  row: any,
  membros: TarefaGeralMembro[],
  etapas: TarefaEtapaGeral[] = []
): TarefaGeral {
  const meta = row.meta_semanal as number | null;
  const totalAlunos = membros.reduce((s, m) => s + m.alunosConcluidos, 0);
  const temMetaEquipe = !!(meta && meta > 0);
  const temMetaIndividual = membros.some(
    (m) => m.metaIndividual && m.metaIndividual > 0
  );
  const progressoMetaEquipe = temMetaEquipe
    ? Math.min(100, Math.round((totalAlunos / (meta as number)) * 100))
    : undefined;
  const progressoMedio =
    membros.length > 0
      ? Math.round(
          membros.reduce((s, m) => s + m.progressoPct, 0) / membros.length
        )
      : 0;

  return {
    id: row.id,
    titulo: row.titulo,
    descricao: row.descricao || undefined,
    prazo: row.prazo ? new Date(`${row.prazo}T12:00:00`) : undefined,
    dataInicio: row.data_inicio
      ? new Date(`${row.data_inicio}T12:00:00`)
      : undefined,
    dataFim: row.data_fim
      ? new Date(`${row.data_fim}T12:00:00`)
      : row.prazo
        ? new Date(`${row.prazo}T12:00:00`)
        : undefined,
    modo: (row.modo as ModoTarefaGeral) || "paralelo",
    paraUserId: row.para_user_id,
    paraUserNome: row.destinatario?.name,
    poloId: row.polo_id || undefined,
    metaSemanal: meta || undefined,
    statusMeta: row.status_meta || undefined,
    ativo: row.ativo !== false,
    createdAt: new Date(row.created_at),
    membros,
    etapas: etapas.length > 0 ? etapas : undefined,
    progressoMetaEquipe,
    progressoMedio,
    temMeta: temMetaEquipe || temMetaIndividual,
  };
}

export async function getTarefasGerais(
  area: AreaTarefaGeral = "engajamento"
): Promise<{ tarefas: TarefaGeral[]; error: string | null }> {
  const tab = tabela(area);
  const tabM = tabelaMembros(area);
  const tabE = tabelaEtapas(area);

  // Select simples (sem embed) — evita erro de relationship no PostgREST
  const { data, error } = await supabase
    .from(tab)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getTarefasGerais]", tab, error);
    return { tarefas: [], error: error.message };
  }

  const ids = (data || []).map((r: { id: string }) => r.id);
  const membrosByTarefa = new Map<string, TarefaGeralMembro[]>();
  const etapasByTarefa = new Map<string, TarefaEtapaGeral[]>();
  const nomesByUser = new Map<string, string>();

  if (ids.length > 0) {
    const [{ data: membros, error: errM }, { data: etapas, error: errE }] =
      await Promise.all([
        supabase.from(tabM).select("*").in("tarefa_id", ids),
        supabase
          .from(tabE)
          .select("*")
          .in("tarefa_id", ids)
          .order("ordem", { ascending: true }),
      ]);

    if (errM) {
      console.error("[getTarefasGerais] membros", tabM, errM);
    }
    if (errE) {
      console.error("[getTarefasGerais] etapas", tabE, errE);
    }

    const userIds = [
      ...new Set([
        ...(membros || []).map((r: { user_id: string }) => r.user_id),
        ...(etapas || []).map((r: { user_id: string }) => r.user_id),
      ].filter(Boolean)),
    ];

    if (userIds.length > 0) {
      const { data: perfis } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", userIds);

      (perfis || []).forEach((p: { id: string; name?: string }) => {
        if (p.name) nomesByUser.set(p.id, p.name);
      });
    }

    (membros || []).forEach(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (row: any) => {
        const list = membrosByTarefa.get(row.tarefa_id) || [];
        const metaInd = row.meta_individual as number | null;
        list.push({
          id: row.id,
          userId: row.user_id,
          userNome: nomesByUser.get(row.user_id),
          progressoPct: row.progresso_pct ?? 0,
          alunosConcluidos: row.alunos_concluidos ?? 0,
          metaIndividual: metaInd && metaInd > 0 ? metaInd : undefined,
          observacao: row.observacao || undefined,
          updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
        });
        membrosByTarefa.set(row.tarefa_id, list);
      }
    );

    (etapas || []).forEach(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (row: any) => {
        const list = etapasByTarefa.get(row.tarefa_id) || [];
        list.push(mapEtapa(row, nomesByUser));
        etapasByTarefa.set(row.tarefa_id, list);
      }
    );
  }

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tarefas: (data || []).map((row: any) =>
      mapTarefa(
        row,
        membrosByTarefa.get(row.id) || [],
        etapasByTarefa.get(row.id) || []
      )
    ),
    error: null,
  };
}

export async function criarTarefaGeral(
  dados: {
    titulo: string;
    descricao?: string;
    prazo?: Date;
    dataInicio?: Date;
    dataFim?: Date;
    modo?: ModoTarefaGeral;
    paraUserIds: string[];
    metaSemanal?: number;
    statusMeta?: string;
    poloId?: string;
    /** Meta individual por userId (só aplica se > 0). */
    metasIndividuais?: Record<string, number>;
    /**
     * Sequencial: lista de etapas.
     * Cada etapa pode ter vários userIds (trabalham juntos na mesma ordem).
     */
    etapas?: { titulo: string; userIds: string[] }[];
  },
  area: AreaTarefaGeral = "engajamento"
): Promise<{ error: string | null }> {
  const ids = [...new Set(dados.paraUserIds.filter(Boolean))];
  if (ids.length === 0) return { error: "Selecione pelo menos um colaborador." };

  const tab = tabela(area);
  const tabM = tabelaMembros(area);
  const tabE = tabelaEtapas(area);
  const modo: ModoTarefaGeral = dados.modo || "paralelo";
  const dataInicioStr = dados.dataInicio
    ? dados.dataInicio.toISOString().slice(0, 10)
    : null;
  const dataFimStr = dados.dataFim
    ? dados.dataFim.toISOString().slice(0, 10)
    : dados.prazo
      ? dados.prazo.toISOString().slice(0, 10)
      : null;
  const prazoStr = dataFimStr;

  const temAlgumaMetaInd =
    dados.metasIndividuais &&
    ids.some((id) => (dados.metasIndividuais![id] || 0) > 0);
  const temMetaEquipe = !!(dados.metaSemanal && dados.metaSemanal > 0);
  const gravaStatusMeta =
    (temMetaEquipe || temAlgumaMetaInd) && dados.statusMeta
      ? dados.statusMeta
      : null;

  const { data, error } = await supabase
    .from(tab)
    .insert({
      titulo: dados.titulo.trim(),
      descricao: dados.descricao?.trim() || null,
      prazo: prazoStr,
      data_inicio: dataInicioStr,
      data_fim: dataFimStr,
      modo,
      para_user_id: ids[0],
      polo_id: dados.poloId || null,
      meta_semanal: temMetaEquipe ? dados.metaSemanal : null,
      status_meta: gravaStatusMeta,
      ativo: true,
    })
    .select("id, polo_id")
    .single();

  if (error) return { error: error.message };
  if (!data?.id) return { error: "Falha ao criar tarefa." };

  const { error: errM } = await supabase.from(tabM).insert(
    ids.map((userId) => {
      const mi = dados.metasIndividuais?.[userId];
      return {
        tarefa_id: data.id,
        user_id: userId,
        progresso_pct: 0,
        alunos_concluidos: 0,
        meta_individual: mi && mi > 0 ? mi : null,
      };
    })
  );
  if (errM) return { error: errM.message };

  // Etapas (sequencial): 1 linha por (ordem, user_id)
  if (modo === "sequencial" && dados.etapas && dados.etapas.length > 0) {
    const rows: {
      tarefa_id: string;
      ordem: number;
      titulo: string;
      user_id: string;
      polo_id: string | null;
    }[] = [];

    dados.etapas.forEach((et, idx) => {
      const ordem = idx + 1;
      const titulo = et.titulo.trim() || `Etapa ${ordem}`;
      const userIds = [...new Set(et.userIds.filter(Boolean))];
      userIds.forEach((userId) => {
        rows.push({
          tarefa_id: data.id,
          ordem,
          titulo,
          user_id: userId,
          polo_id: data.polo_id || dados.poloId || null,
        });
      });
    });

    if (rows.length > 0) {
      const { error: errE } = await supabase.from(tabE).insert(rows);
      if (errE) return { error: errE.message };
    }
  }

  return { error: null };
}

export async function concluirEtapaTarefa(
  etapaId: string,
  area: AreaTarefaGeral = "engajamento"
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("concluir_etapa_tarefa_geral", {
    p_etapa_id: etapaId,
    p_tabela: isRematriculaArea(area) ? "rematricula" : "engajamento",
  });
  return { error: error?.message ?? null };
}

export async function excluirTarefaGeral(
  id: string,
  area: AreaTarefaGeral = "engajamento"
): Promise<{ error: string | null }> {
  const { error } = await supabase.from(tabela(area)).delete().eq("id", id);
  return { error: error?.message ?? null };
}

export async function atualizarProgressoTarefa(
  membroId: string,
  dados: {
    progressoPct?: number;
    alunosConcluidos?: number;
    observacao?: string;
    metaIndividual?: number | null;
  },
  area: AreaTarefaGeral = "engajamento"
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("atualizar_progresso_tarefa_geral", {
    p_membro_id: membroId,
    p_progresso_pct: dados.progressoPct ?? null,
    p_alunos_concluidos: dados.alunosConcluidos ?? null,
    p_observacao: dados.observacao ?? null,
    p_tabela: isRematriculaArea(area) ? "rematricula" : "engajamento",
  });
  if (error) return { error: error.message };

  // Meta individual: update direto na tabela de membros (admin/membro conforme RLS)
  if (dados.metaIndividual !== undefined) {
    const mi =
      dados.metaIndividual && dados.metaIndividual > 0
        ? dados.metaIndividual
        : null;
    const { error: errMeta } = await supabase
      .from(tabelaMembros(area))
      .update({ meta_individual: mi })
      .eq("id", membroId);
    if (errMeta) return { error: errMeta.message };
  }

  return { error: null };
}

export async function listarComentarios(
  tarefaId: string,
  area: AreaTarefaGeral = "engajamento"
): Promise<{ comentarios: TarefaComentario[]; error: string | null }> {
  const { data, error } = await supabase
    .from(tabelaComentarios(area))
    .select("*, perfil:user_id ( name )")
    .eq("tarefa_id", tarefaId)
    .order("created_at", { ascending: true });

  if (error) return { comentarios: [], error: error.message };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const comentarios: TarefaComentario[] = (data || []).map((row: any) => ({
    id: row.id,
    tarefaId: row.tarefa_id,
    userId: row.user_id,
    userNome: row.perfil?.name,
    texto: row.texto,
    createdAt: new Date(row.created_at),
  }));
  return { comentarios, error: null };
}

export async function adicionarComentario(
  tarefaId: string,
  texto: string,
  area: AreaTarefaGeral = "engajamento"
): Promise<{ error: string | null }> {
  const t = texto.trim();
  if (!t) return { error: "Comentário vazio." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada. Faça login novamente." };

  const { error } = await supabase.from(tabelaComentarios(area)).insert({
    tarefa_id: tarefaId,
    user_id: user.id,
    texto: t,
  });
  return { error: error?.message ?? null };
}

export async function excluirComentario(
  id: string,
  area: AreaTarefaGeral = "engajamento"
): Promise<{ error: string | null }> {
  const { error } = await supabase.from(tabelaComentarios(area)).delete().eq("id", id);
  return { error: error?.message ?? null };
}
