import { supabase } from "../lib/supabase";
import { MetricasGerais, MetricaColaborador, MetricaCanal } from "../types";

export async function getMetricasGerais(): Promise<{
  data: MetricasGerais | null;
  error: string | null;
}> {
  try {
    const hojeInicio = new Date();
    hojeInicio.setHours(0, 0, 0, 0);

    const [alunosRes, interacoesHojeRes] = await Promise.all([
      supabase
        .from("alunos")
        .select("status, valor_pendente, responsavel_id")
        .eq("area", "rematricula"),
      supabase
        .from("interacoes")
        .select("id", { count: "exact", head: true })
        .gte("created_at", hojeInicio.toISOString()),
    ]);

    if (alunosRes.error) {
      console.error("Erro ao buscar métricas gerais:", alunosRes.error);
      return { data: null, error: alunosRes.error.message };
    }

    const alunos = alunosRes.data || [];
    const total = alunos.length;
    const rematriculados = alunos.filter((a) => a.status === "rematriculado").length;

    return {
      data: {
        totalAlunos: total,
        rematriculados,
        taxaConversao: total > 0 ? Math.round((rematriculados / total) * 1000) / 10 : 0,
        valorRecuperado: alunos
          .filter((a) => a.status === "rematriculado")
          .reduce((sum, a) => sum + (Number(a.valor_pendente) || 0), 0),
        valorTotalCarteira: alunos.reduce(
          (sum, a) => sum + (Number(a.valor_pendente) || 0),
          0
        ),
        interacoesHoje: interacoesHojeRes.count ?? 0,
        alunosSemResponsavel: alunos.filter((a) => !a.responsavel_id).length,
      },
      error: null,
    };
  } catch {
    return { data: null, error: "Erro ao buscar métricas gerais" };
  }
}

export async function getMetricasColaboradores(): Promise<{
  data: MetricaColaborador[];
  error: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from("metricas_colaboradores")
      .select("*")
      .order("rematriculados", { ascending: false });

    if (error) {
      console.error("Erro ao buscar métricas por colaborador:", error);
      return { data: [], error: error.message };
    }

    return {
      data: (data || []).map((row) => {
        const totalAlunos = Number(row.total_alunos) || 0;
        const rematriculados = Number(row.rematriculados) || 0;
        return {
          colaboradorId: row.colaborador_id,
          colaboradorNome: row.colaborador_nome,
          totalAlunos,
          rematriculados,
          desistentes: Number(row.desistentes) || 0,
          confirmados: Number(row.confirmados) || 0,
          pendentes: Number(row.pendentes) || 0,
          valorRecuperado: Number(row.valor_recuperado) || 0,
          valorTotalCarteira: Number(row.valor_total_carteira) || 0,
          totalInteracoes: Number(row.total_interacoes) || 0,
          taxaConversao:
            totalAlunos > 0 ? Math.round((rematriculados / totalAlunos) * 1000) / 10 : 0,
        };
      }),
      error: null,
    };
  } catch {
    return { data: [], error: "Erro ao buscar métricas por colaborador" };
  }
}

export async function getMetricasCanais(): Promise<{
  data: MetricaCanal[];
  error: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from("metricas_canais")
      .select("*")
      .order("total", { ascending: false });

    if (error) {
      console.error("Erro ao buscar métricas por canal:", error);
      return { data: [], error: error.message };
    }

    return {
      data: (data || []).map((row) => ({
        canal: row.canal_contato,
        total: Number(row.total) || 0,
        rematriculados: Number(row.rematriculados) || 0,
        taxaConversao: Number(row.taxa_conversao) || 0,
      })),
      error: null,
    };
  } catch {
    return { data: [], error: "Erro ao buscar métricas por canal" };
  }
}
