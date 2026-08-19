/**
 * engajamentoAlertaService.ts
 *
 * Busca a view public.alunos_alerta_inatividade (ver
 * database/010_alerta_inatividade_engajamento.sql) e monta um
 * Map<alunoId, AlertaInatividade> para o Kanban de Engajamento consumir.
 *
 * O cálculo (dias sem interação, nível atenção/crítico) é feito 100% no
 * Postgres — mesmo padrão de metricasService.ts. O front só lê o
 * resultado pronto.
 */
import { supabase } from "../lib/supabase";
import { AlertaInatividade, NivelAlertaInatividade } from "../types";

interface AlertaInatividadeRow {
  aluno_id: string;
  dias_sem_interacao: number;
  nivel: NivelAlertaInatividade;
}

export async function getAlertasInatividade(): Promise<{
  data: Map<string, AlertaInatividade>;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("alunos_alerta_inatividade")
    .select("aluno_id, dias_sem_interacao, nivel");

  if (error) {
    console.error("Erro ao buscar alertas de inatividade:", error);
    return { data: new Map(), error: error.message };
  }

  const mapa = new Map<string, AlertaInatividade>();
  for (const row of (data ?? []) as AlertaInatividadeRow[]) {
    mapa.set(row.aluno_id, {
      alunoId: row.aluno_id,
      diasSemInteracao: row.dias_sem_interacao,
      nivel: row.nivel,
    });
  }

  return { data: mapa, error: null };
}