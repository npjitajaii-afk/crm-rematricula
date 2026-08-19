import { supabase } from "../lib/supabase";
import { WhatsappMensagem, WhatsappResumo } from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapMensagemRow(row: any): WhatsappMensagem {
  return {
    id: row.id,
    alunoId: row.aluno_id,
    telefone: row.telefone,
    direcao: row.direcao,
    tipoMensagem: row.tipo_mensagem,
    mensagem: row.mensagem,
    lida: row.lida,
    createdAt: new Date(row.created_at),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapResumoRow(row: any): WhatsappResumo {
  return {
    naoLidas: row.nao_lidas ?? 0,
    ultimaMensagem: row.ultima_mensagem ?? null,
    ultimaDirecao: row.ultima_direcao ?? null,
    ultimaMensagemEm: row.ultima_mensagem_em ? new Date(row.ultima_mensagem_em) : null,
  };
}

/**
 * Busca o resumo de WhatsApp (não lidas + última mensagem) de todos os
 * alunos que já têm alguma mensagem, via a view agregada
 * `whatsapp_resumo_por_aluno` (ver database/010_whatsapp_evolution.sql).
 * Usado para popular o badge no card do Kanban sem carregar o histórico
 * completo de mensagens de cada aluno.
 */
export async function getResumoWhatsappTodosAlunos(): Promise<{
  resumoPorAluno: Record<string, WhatsappResumo>;
  error: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from("whatsapp_resumo_por_aluno")
      .select("*");

    if (error) {
      console.error("Erro ao buscar resumo de whatsapp:", error);
      return { resumoPorAluno: {}, error: error.message };
    }

    const resumoPorAluno: Record<string, WhatsappResumo> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data || []).forEach((row: any) => {
      resumoPorAluno[row.aluno_id] = mapResumoRow(row);
    });

    return { resumoPorAluno, error: null };
  } catch {
    return { resumoPorAluno: {}, error: "Erro ao buscar resumo de whatsapp" };
  }
}

/** Re-sincroniza o resumo de UM aluno (usado após evento de realtime). */
export async function getResumoWhatsappPorAluno(
  alunoId: string
): Promise<{ resumo: WhatsappResumo | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from("whatsapp_resumo_por_aluno")
      .select("*")
      .eq("aluno_id", alunoId)
      .maybeSingle();

    if (error) {
      return { resumo: null, error: error.message };
    }

    return { resumo: data ? mapResumoRow(data) : null, error: null };
  } catch {
    return { resumo: null, error: "Erro ao buscar resumo de whatsapp do aluno" };
  }
}

/** Histórico completo de mensagens de um aluno, mais antiga primeiro (uso na tela de detalhes). */
export async function getMensagensPorAluno(
  alunoId: string
): Promise<{ mensagens: WhatsappMensagem[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from("whatsapp_mensagens")
      .select("*")
      .eq("aluno_id", alunoId)
      .order("created_at", { ascending: true });

    if (error) {
      return { mensagens: [], error: error.message };
    }

    return { mensagens: (data || []).map(mapMensagemRow), error: null };
  } catch {
    return { mensagens: [], error: "Erro ao buscar mensagens de whatsapp" };
  }
}

/** Marca todas as mensagens recebidas de um aluno como lidas (chamado ao abrir o card/detalhes). */
export async function marcarMensagensComoLidas(
  alunoId: string
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase
      .from("whatsapp_mensagens")
      .update({ lida: true })
      .eq("aluno_id", alunoId)
      .eq("direcao", "recebida")
      .eq("lida", false);

    return { error: error?.message ?? null };
  } catch {
    return { error: "Erro ao marcar mensagens como lidas" };
  }
}

export { mapMensagemRow, mapResumoRow };
