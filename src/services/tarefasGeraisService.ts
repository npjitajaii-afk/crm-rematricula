import { supabase } from "../lib/supabase";

export interface TarefaGeral { id: string; titulo: string; descricao?: string; prazo?: Date; paraUserId: string; paraUserNome?: string; createdAt: Date; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapRow = (row: any): TarefaGeral => ({ id: row.id, titulo: row.titulo, descricao: row.descricao || undefined, prazo: row.prazo ? new Date(`${row.prazo}T12:00:00`) : undefined, paraUserId: row.para_user_id, paraUserNome: row.destinatario?.name, createdAt: new Date(row.created_at) });
const SELECT = "*, destinatario:para_user_id ( name )";
const tabela = (area: "engajamento" | "rematricula") => (area === "rematricula" || window.location.pathname.startsWith("/rematricula/")) ? "rematricula_tarefas_gerais" : "tarefas_gerais";
export async function getTarefasGerais(area: "engajamento" | "rematricula" = "engajamento") { const { data, error } = await supabase.from(tabela(area)).select(SELECT).order("created_at", { ascending: false }); return { tarefas: (data || []).map(mapRow), error: error?.message ?? null }; }
export async function criarTarefaGeral(dados: { titulo: string; descricao?: string; prazo?: Date; paraUserId: string }, area: "engajamento" | "rematricula" = "engajamento") { const { error } = await supabase.from(tabela(area)).insert({ titulo: dados.titulo.trim(), descricao: dados.descricao?.trim() || null, prazo: dados.prazo ? dados.prazo.toISOString().slice(0, 10) : null, para_user_id: dados.paraUserId }); return { error: error?.message ?? null }; }
export async function excluirTarefaGeral(id: string, area: "engajamento" | "rematricula" = "engajamento") { const { error } = await supabase.from(tabela(area)).delete().eq("id", id); return { error: error?.message ?? null }; }
