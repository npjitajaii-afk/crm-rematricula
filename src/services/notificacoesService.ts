import { supabase } from "../lib/supabase";
import { Notificacao } from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): Notificacao {
  return {
    id: row.id,
    paraUserId: row.para_user_id,
    deUserId: row.de_user_id,
    deUserNome: row.de_user?.name || "",
    tipo: row.tipo,
    titulo: row.titulo,
    corpo: row.corpo,
    alunoId: row.aluno_id,
    lida: row.lida,
    createdAt: row.created_at,
  };
}

export async function getNotificacoes(): Promise<{
  data: Notificacao[];
  error: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from("notificacoes")
      .select(
        `
        *,
        de_user:de_user_id ( name )
      `
      )
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Erro ao buscar notificações:", error);
      return { data: [], error: error.message };
    }

    return { data: (data || []).map(mapRow), error: null };
  } catch {
    return { data: [], error: "Erro ao buscar notificações" };
  }
}

export async function marcarComoLida(id: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase
      .from("notificacoes")
      .update({ lida: true })
      .eq("id", id);

    return { error: error?.message ?? null };
  } catch {
    return { error: "Erro ao marcar notificação como lida" };
  }
}

export async function marcarTodasComoLidas(): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase
      .from("notificacoes")
      .update({ lida: true })
      .eq("lida", false);

    return { error: error?.message ?? null };
  } catch {
    return { error: "Erro ao marcar notificações como lidas" };
  }
}

export async function enviarRecado(
  paraUserId: string,
  titulo: string,
  corpo: string
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.from("notificacoes").insert([
      {
        para_user_id: paraUserId,
        tipo: "recado_admin",
        titulo,
        corpo,
        aluno_id: null,
      },
    ]);

    return { error: error?.message ?? null };
  } catch {
    return { error: "Erro ao enviar recado" };
  }
}

export { mapRow as mapNotificacaoRow };
