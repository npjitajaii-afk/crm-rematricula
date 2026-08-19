import { supabase } from "../lib/supabase";
import { TarefaChecklistItem, TarefaPessoal } from "../types";

export type TarefasArea = "engajamento" | "rematricula";
const tables = (area: TarefasArea) => ({
  tarefas: `${area}_tarefas_pessoais`,
  checklist: `${area}_tarefas_checklist`,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapChecklist = (row: any): TarefaChecklistItem => ({ id: row.id, tarefaId: row.tarefa_id, texto: row.texto, concluido: row.concluido, ordem: row.ordem });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapTarefa = (row: any): TarefaPessoal => ({
  id: row.id, userId: row.user_id, userName: row.user_profile?.name || undefined,
  alunoId: row.aluno_id || undefined, alunoNome: row.aluno?.nome || undefined,
  titulo: row.titulo, anotacoes: row.anotacoes || undefined, status: row.status,
  prazo: row.prazo ? new Date(`${row.prazo}T12:00:00`) : undefined,
  checklist: (row.checklist || []).map(mapChecklist).sort((a: TarefaChecklistItem, b: TarefaChecklistItem) => a.ordem - b.ordem),
  createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at),
});
const select = (area: TarefasArea) => `*, user_profile:user_id ( name ), aluno:aluno_id ( nome ), checklist:${tables(area).checklist} ( * )`;

export async function getTarefasPessoais(area: TarefasArea = "engajamento") {
  const { data, error } = await supabase.from(tables(area).tarefas).select(select(area)).order("updated_at", { ascending: false });
  return { tarefas: (data || []).map(mapTarefa), error: error?.message ?? null };
}
export async function criarTarefaPessoal(userId: string, dados: { titulo: string; anotacoes?: string; alunoId?: string; prazo?: Date; checklist?: { texto: string }[] }, area: TarefasArea = "engajamento") {
  const { data: criada, error } = await supabase.from(tables(area).tarefas).insert({
    user_id: userId, titulo: dados.titulo.trim(), anotacoes: dados.anotacoes?.trim() || null,
    aluno_id: dados.alunoId || null, prazo: dados.prazo?.toISOString().slice(0, 10) || null,
  }).select("id").single();
  if (error || !criada) return { tarefa: null, error: error?.message ?? "Erro ao criar tarefa" };
  const itens = (dados.checklist || []).filter((item) => item.texto.trim()).map((item, ordem) => ({ tarefa_id: criada.id, texto: item.texto.trim(), ordem }));
  if (itens.length) {
    const { error: checklistError } = await supabase.from(tables(area).checklist).insert(itens);
    if (checklistError) return { tarefa: null, error: checklistError.message };
  }
  return getTarefaPorId(criada.id, area);
}
export async function atualizarTarefaPessoal(id: string, dados: Partial<{ titulo: string; anotacoes: string; alunoId: string | null; prazo: Date | null; status: "em_andamento" | "concluido" }>, area: TarefasArea = "engajamento") {
  const payload: Record<string, unknown> = {};
  if (dados.titulo !== undefined) payload.titulo = dados.titulo.trim();
  if (dados.anotacoes !== undefined) payload.anotacoes = dados.anotacoes.trim() || null;
  if (dados.alunoId !== undefined) payload.aluno_id = dados.alunoId;
  if (dados.prazo !== undefined) payload.prazo = dados.prazo?.toISOString().slice(0, 10) || null;
  if (dados.status !== undefined) payload.status = dados.status;
  const { error } = await supabase.from(tables(area).tarefas).update(payload).eq("id", id);
  return { error: error?.message ?? null };
}
export async function excluirTarefaPessoal(id: string, area: TarefasArea = "engajamento") {
  const { error } = await supabase.from(tables(area).tarefas).delete().eq("id", id);
  return { error: error?.message ?? null };
}
export async function toggleTarefaChecklistItem(itemId: string, concluido: boolean, area: TarefasArea = "engajamento") {
  const { error } = await supabase.from(tables(area).checklist).update({ concluido }).eq("id", itemId);
  return { error: error?.message ?? null };
}
export async function adicionarTarefaChecklistItem(tarefaId: string, texto: string, ordem: number, area: TarefasArea = "engajamento") {
  const { data, error } = await supabase.from(tables(area).checklist).insert({ tarefa_id: tarefaId, texto: texto.trim(), ordem }).select("*").single();
  return { item: data ? mapChecklist(data) : null, error: error?.message ?? null };
}
export async function removerTarefaChecklistItem(itemId: string, area: TarefasArea = "engajamento") {
  const { error } = await supabase.from(tables(area).checklist).delete().eq("id", itemId);
  return { error: error?.message ?? null };
}
export async function getTarefaPorId(id: string, area: TarefasArea = "engajamento") {
  const { data, error } = await supabase.from(tables(area).tarefas).select(select(area)).eq("id", id).single();
  return { tarefa: data ? mapTarefa(data) : null, error: error?.message ?? null };
}
