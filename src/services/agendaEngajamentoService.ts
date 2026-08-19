import { supabase } from "../lib/supabase";
import { AgendaCompromisso } from "../types";
export type AgendaArea = "engajamento" | "rematricula";
const table = (area: AgendaArea) => `${area}_agenda`;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapRow = (row: any): AgendaCompromisso => ({ id: row.id, userId: row.user_id, alunoId: row.aluno_id, alunoNome: row.aluno?.nome, data: new Date(`${row.data}T12:00:00`), ticket: row.ticket || undefined, comentario: row.comentario, createdAt: new Date(row.created_at) });
const SELECT = "*, aluno:aluno_id ( nome )";
export async function getCompromissosAgenda(area: AgendaArea = "engajamento") {
  const { data, error } = await supabase.from(table(area)).select(SELECT).order("data", { ascending: true });
  return { compromissos: (data || []).map(mapRow), error: error?.message ?? null };
}
export async function criarCompromissoAgenda(userId: string, dados: { alunoId: string; data: Date; ticket?: string; comentario: string }, area: AgendaArea = "engajamento") {
  const { data, error } = await supabase.from(table(area)).insert({ user_id: userId, aluno_id: dados.alunoId, data: dados.data.toISOString().slice(0, 10), ticket: dados.ticket?.trim() || null, comentario: dados.comentario.trim() }).select(SELECT).single();
  return { compromisso: data ? mapRow(data) : null, error: error?.message ?? null };
}
export async function excluirCompromissoAgenda(id: string, area: AgendaArea = "engajamento") {
  const { error } = await supabase.from(table(area)).delete().eq("id", id);
  return { error: error?.message ?? null };
}
