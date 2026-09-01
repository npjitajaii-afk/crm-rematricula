import { supabase } from "../lib/supabase";
import {
  MetricasGerais,
  MetricaColaborador,
  MetricaCanal,
  MetricasOverviewGeral,
  PipelineStatusResumo,
  Area,
  AlunoStatus,
  METRICA_STATUS_SUCESSO,
  METRICA_STATUS_TERMINAL,
} from "../types";

const AREAS: Area[] = ["rematricula", "retencao", "engajamento"];

// ---------------------------------------------------------------------
// Pipeline por status — usado no gráfico de funil de cada área.
// ---------------------------------------------------------------------
export async function getPipelineResumo(
  area: Area
): Promise<{ data: PipelineStatusResumo[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from("pipeline_area_resumo")
      .select("status, total, total_valor_pendente")
      .eq("area", area);

    if (error) {
      console.error("Erro ao buscar pipeline por área:", error);
      return { data: [], error: error.message };
    }

    return {
      data: (data || []).map((row) => ({
        status: row.status as AlunoStatus,
        total: Number(row.total) || 0,
        totalValorPendente: Number(row.total_valor_pendente) || 0,
      })),
      error: null,
    };
  } catch {
    return { data: [], error: "Erro ao buscar pipeline por área" };
  }
}

// ---------------------------------------------------------------------
// KPIs gerais de uma área — busca as linhas brutas de `alunos` e calcula
// tudo em JS. O conceito de "sucesso" (rematriculado/recuperado/engajado)
// vem de METRICA_STATUS_SUCESSO, então não precisa duplicar status
// hardcoded aqui — ver src/types/index.ts.
// ---------------------------------------------------------------------
export async function getMetricasGerais(
  area: Area
): Promise<{ data: MetricasGerais | null; error: string | null }> {
  try {
    const hojeInicio = new Date();
    hojeInicio.setHours(0, 0, 0, 0);

    const [alunosRes, interacoesHojeRes] = await Promise.all([
      supabase
        .from("alunos")
        .select("status, valor_pendente, responsavel_id, created_at, status_atualizado_em")
        .eq("area", area),
      supabase
        .from("interacoes")
        .select("id, alunos!inner(area)", { count: "exact", head: true })
        .eq("alunos.area", area)
        .gte("created_at", hojeInicio.toISOString()),
    ]);

    if (alunosRes.error) {
      console.error("Erro ao buscar métricas gerais:", alunosRes.error);
      return { data: null, error: alunosRes.error.message };
    }

    const alunos = alunosRes.data || [];
    const statusSucesso = METRICA_STATUS_SUCESSO[area];
    const total = alunos.length;

    const emSucesso = alunos.filter((a) => statusSucesso.includes(a.status as AlunoStatus));
    const sucesso = emSucesso.length;

    const tempos = emSucesso
      .map((a) => {
        if (!a.created_at || !a.status_atualizado_em) return null;
        const dias =
          (new Date(a.status_atualizado_em).getTime() - new Date(a.created_at).getTime()) /
          (1000 * 60 * 60 * 24);
        return dias >= 0 ? dias : null;
      })
      .filter((d): d is number => d !== null);

    const tempoMedioCicloDias =
      tempos.length > 0
        ? Math.round((tempos.reduce((s, d) => s + d, 0) / tempos.length) * 10) / 10
        : null;

    return {
      data: {
        area,
        totalAlunos: total,
        sucesso,
        taxaConversao: total > 0 ? Math.round((sucesso / total) * 1000) / 10 : 0,
        valorPrincipal: emSucesso.reduce((sum, a) => sum + (Number(a.valor_pendente) || 0), 0),
        valorTotalCarteira: alunos.reduce((sum, a) => sum + (Number(a.valor_pendente) || 0), 0),
        interacoesHoje: interacoesHojeRes.count ?? 0,
        alunosSemResponsavel: alunos.filter((a) => !a.responsavel_id).length,
        tempoMedioCicloDias,
      },
      error: null,
    };
  } catch {
    return { data: null, error: "Erro ao buscar métricas gerais" };
  }
}

// ---------------------------------------------------------------------
// Ranking de colaboradores de uma área.
// ---------------------------------------------------------------------
export async function getMetricasColaboradores(
  area: Area
): Promise<{ data: MetricaColaborador[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from("metricas_colaboradores_area")
      .select("*")
      .eq("area", area)
      .order("sucesso", { ascending: false });

    if (error) {
      console.error("Erro ao buscar métricas por colaborador:", error);
      return { data: [], error: error.message };
    }

    return {
      data: (data || []).map((row) => {
        const totalAlunos = Number(row.total_alunos) || 0;
        const sucesso = Number(row.sucesso) || 0;
        return {
          colaboradorId: row.colaborador_id,
          colaboradorNome: row.colaborador_nome,
          totalAlunos,
          sucesso,
          encerradosSemSucesso: Number(row.encerrados_sem_sucesso) || 0,
          valorRecuperado: Number(row.valor_recuperado) || 0,
          valorTotalCarteira: Number(row.valor_total_carteira) || 0,
          totalInteracoes: Number(row.total_interacoes) || 0,
          taxaConversao: totalAlunos > 0 ? Math.round((sucesso / totalAlunos) * 1000) / 10 : 0,
        };
      }),
      error: null,
    };
  } catch {
    return { data: [], error: "Erro ao buscar métricas por colaborador" };
  }
}

// ---------------------------------------------------------------------
// Conversão por canal de contato de uma área.
// ---------------------------------------------------------------------
export async function getMetricasCanais(
  area: Area
): Promise<{ data: MetricaCanal[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from("metricas_canais_area")
      .select("*")
      .eq("area", area)
      .order("total", { ascending: false });

    if (error) {
      console.error("Erro ao buscar métricas por canal:", error);
      return { data: [], error: error.message };
    }

    return {
      data: (data || []).map((row) => ({
        canal: row.canal_contato,
        total: Number(row.total) || 0,
        sucesso: Number(row.sucesso) || 0,
        taxaConversao: Number(row.taxa_conversao) || 0,
      })),
      error: null,
    };
  } catch {
    return { data: [], error: "Erro ao buscar métricas por canal" };
  }
}

// ---------------------------------------------------------------------
// Canal de contato cruzado entre as 3 áreas — usado no bloco de métricas
// cruzadas (comparativo de canal). Reaproveita a mesma view, só que sem
// filtrar por área.
// ---------------------------------------------------------------------
export async function getMetricasCanaisCruzado(): Promise<{
  data: Record<Area, MetricaCanal[]>;
  error: string | null;
}> {
  try {
    const { data, error } = await supabase.from("metricas_canais_area").select("*");

    if (error) {
      console.error("Erro ao buscar métricas de canal cruzadas:", error);
      return { data: { rematricula: [], retencao: [], engajamento: [] }, error: error.message };
    }

    const resultado: Record<Area, MetricaCanal[]> = {
      rematricula: [],
      retencao: [],
      engajamento: [],
    };

    for (const row of data || []) {
      const area = row.area as Area;
      if (!resultado[area]) continue;
      resultado[area].push({
        canal: row.canal_contato,
        total: Number(row.total) || 0,
        sucesso: Number(row.sucesso) || 0,
        taxaConversao: Number(row.taxa_conversao) || 0,
      });
    }

    return { data: resultado, error: null };
  } catch {
    return {
      data: { rematricula: [], retencao: [], engajamento: [] },
      error: "Erro ao buscar métricas de canal cruzadas",
    };
  }
}

// ---------------------------------------------------------------------
// Cabeçalho geral fixo — total do sistema, quebra por área e alertas
// operacionais (alunos travados há mais de 14 dias no status atual).
// ---------------------------------------------------------------------
export async function getOverviewGeral(): Promise<{
  data: MetricasOverviewGeral | null;
  error: string | null;
}> {
  try {
    const [overviewRes, alertasRes] = await Promise.all([
      supabase.from("metricas_overview_geral").select("area, total"),
      supabase.from("alertas_operacao_resumo").select("area, travados"),
    ]);

    if (overviewRes.error) {
      console.error("Erro ao buscar visão geral:", overviewRes.error);
      return { data: null, error: overviewRes.error.message };
    }

    const porArea: Record<Area, number> = { rematricula: 0, retencao: 0, engajamento: 0 };
    let totalGeral = 0;
    for (const row of overviewRes.data || []) {
      const area = row.area as Area;
      const total = Number(row.total) || 0;
      if (AREAS.includes(area)) porArea[area] = total;
      totalGeral += total;
    }

    const alertasPorArea: Record<Area, number> = { rematricula: 0, retencao: 0, engajamento: 0 };
    let totalAlertas = 0;
    if (!alertasRes.error) {
      for (const row of alertasRes.data || []) {
        const area = row.area as Area;
        const travados = Number(row.travados) || 0;
        if (AREAS.includes(area)) alertasPorArea[area] = travados;
        totalAlertas += travados;
      }
    }

    return {
      data: { totalGeral, porArea, alertasPorArea, totalAlertas },
      error: null,
    };
  } catch {
    return { data: null, error: "Erro ao buscar visão geral" };
  }
}

// Também exportado: status terminal por área, útil pra UI decidir o que já
// "encerrou" (independente de sucesso ou não) sem precisar ir ao banco.
export function isStatusTerminal(area: Area, status: AlunoStatus): boolean {
  return METRICA_STATUS_TERMINAL[area].includes(status);
}
