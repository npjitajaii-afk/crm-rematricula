import { supabase } from "../lib/supabase";
import { ChecklistItem } from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): ChecklistItem {
  return {
    id: row.id,
    alunoId: row.aluno_id,
    itemKey: row.item_key,
    label: row.item_label,
    ordem: row.ordem,
    concluido: row.concluido,
    concluidoPor: row.concluido_por || undefined,
    concluidoPorNome: row.concluido_por_profile?.name || undefined,
    concluidoEm: row.concluido_em ? new Date(row.concluido_em) : undefined,
  };
}

/**
 * Busca todos os itens de checklist de todos os alunos da área
 * "engajamento" numa única query (a lista é criada automaticamente pelo
 * banco quando o aluno entra em engajamento — ver
 * database/009_checklist_engajamento.sql). O agrupamento por aluno fica
 * a cargo do ChecklistContext.
 */
export async function getTodosItensChecklist(): Promise<{
  itens: ChecklistItem[];
  error: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from("engajamento_checklist_itens")
      .select(
        `
        *,
        concluido_por_profile:concluido_por ( name )
      `
      )
      .order("ordem", { ascending: true });

    if (error) {
      console.error("Erro ao buscar checklist de engajamento:", error);
      return { itens: [], error: error.message };
    }

    return { itens: (data || []).map(mapRow), error: null };
  } catch {
    return { itens: [], error: "Erro ao buscar checklist de engajamento" };
  }
}

/**
 * Busca (ou re-sincroniza) os itens de checklist de UM único aluno —
 * usado após um evento de realtime pra trazer a linha atualizada com o
 * nome de quem concluiu.
 */
export async function getItensChecklistPorAluno(
  alunoId: string
): Promise<{ itens: ChecklistItem[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from("engajamento_checklist_itens")
      .select(
        `
        *,
        concluido_por_profile:concluido_por ( name )
      `
      )
      .eq("aluno_id", alunoId)
      .order("ordem", { ascending: true });

    if (error) {
      return { itens: [], error: error.message };
    }

    return { itens: (data || []).map(mapRow), error: null };
  } catch {
    return { itens: [], error: "Erro ao buscar checklist do aluno" };
  }
}

/**
 * Marca/desmarca um item da checklist. `userId` é gravado em
 * `concluido_por` só quando o item está sendo marcado como concluído
 * (ao desmarcar, o histórico de quem concluiu é limpo — evita mostrar
 * "concluído por Fulano" num item que na verdade está pendente).
 */
export async function toggleChecklistItem(
  itemId: string,
  concluido: boolean,
  userId: string
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase
      .from("engajamento_checklist_itens")
      .update({
        concluido,
        concluido_por: concluido ? userId : null,
        concluido_em: concluido ? new Date().toISOString() : null,
      })
      .eq("id", itemId);

    return { error: error?.message ?? null };
  } catch {
    return { error: "Erro ao atualizar item da checklist" };
  }
}
