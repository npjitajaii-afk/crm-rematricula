import { supabase } from "../lib/supabase";
import { AgendaCompromisso } from "../types";
export type AgendaArea = "engajamento" | "rematricula";
const table = (area: AgendaArea) => `${area}_agenda`;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapRow = (row: any): AgendaCompromisso => ({
  id: row.id,
  userId: row.user_id,
  alunoId: row.aluno_id,
  alunoNome: row.aluno?.nome,
  data: new Date(`${row.data}T12:00:00`),
  ticket: row.ticket || undefined,
  comentario: row.comentario,
  createdAt: new Date(row.created_at),
});
const SELECT = "*, aluno:aluno_id ( nome )";

/**
 * Agenda pessoal do usuário logado.
 * SEMPRE filtra por user_id — cada colaborador/supervisor/admin vê
 * apenas os compromissos que ele mesmo criou.
 * Isso evita vazamento entre usuários (ex.: admin agenda e supervisor vê).
 */
export async function getCompromissosAgenda(
  area: AgendaArea = "engajamento",
  userId: string
) {
  if (!userId) {
    return { compromissos: [], error: "userId obrigatório" };
  }
  const { data, error } = await supabase
    .from(table(area))
    .select(SELECT)
    .eq("user_id", userId)
    .order("data", { ascending: true });
  return {
    compromissos: (data || []).map(mapRow),
    error: error?.message ?? null,
  };
}

export async function criarCompromissoAgenda(
  userId: string,
  dados: { alunoId: string; data: Date; ticket?: string; comentario: string },
  area: AgendaArea = "engajamento"
) {
  const { data, error } = await supabase
    .from(table(area))
    .insert({
      user_id: userId,
      aluno_id: dados.alunoId,
      data: dados.data.toISOString().slice(0, 10),
      ticket: dados.ticket?.trim() || null,
      comentario: dados.comentario.trim(),
    })
    .select(SELECT)
    .single();
  return {
    compromisso: data ? mapRow(data) : null,
    error: error?.message ?? null,
  };
}

/**
 * Exclui compromisso. Quando userId é passado, só apaga se pertencer
 * a esse usuário (proteção extra além do RLS do banco).
 */
export async function excluirCompromissoAgenda(
  id: string,
  area: AgendaArea = "engajamento",
  userId?: string
) {
  let query = supabase.from(table(area)).delete().eq("id", id);
  if (userId) {
    query = query.eq("user_id", userId);
  }
  const { error } = await query;
  return { error: error?.message ?? null };
}

/**
 * Compromissos vinculados a um aluno (aba Agenda do card).
 * Quem já tem acesso ao card do aluno pode ver os compromissos ligados
 * a ele. O isolamento de polo/funil é garantido pela visibilidade do aluno.
 */
export async function getCompromissosPorAluno(
  alunoId: string,
  area: AgendaArea = "engajamento"
) {
  const { data, error } = await supabase
    .from(table(area))
    .select(SELECT)
    .eq("aluno_id", alunoId)
    .order("data", { ascending: true });
  return {
    compromissos: (data || []).map(mapRow),
    error: error?.message ?? null,
  };
}
