import { supabase } from "../lib/supabase";
import {
  SolicitacaoTransferencia,
  SolicitacaoTransferenciaStatus,
  SolicitacaoTransferenciaTipo,
} from "../types";

function mapRow(row: Record<string, unknown>): SolicitacaoTransferencia {
  return {
    id: row.id as string,
    alunoId: row.aluno_id as string,
    alunoNome: (row.aluno_nome as string) || undefined,
    poloId: (row.polo_id as string) || undefined,
    solicitanteId: row.solicitante_id as string,
    solicitanteNome: (row.solicitante_nome as string) || undefined,
    tipo: row.tipo as SolicitacaoTransferenciaTipo,
    setorDestinoId: row.setor_destino_id as string,
    setorDestinoNome: (row.setor_destino_nome as string) || undefined,
    colaboradorDestinoId: (row.colaborador_destino_id as string) || undefined,
    colaboradorDestinoNome: (row.colaborador_destino_nome as string) || undefined,
    setorOrigemId: (row.setor_origem_id as string) || undefined,
    setorOrigemNome: (row.setor_origem_nome as string) || undefined,
    responsavelOrigemId: (row.responsavel_origem_id as string) || undefined,
    responsavelOrigemNome: (row.responsavel_origem_nome as string) || undefined,
    status: row.status as SolicitacaoTransferenciaStatus,
    motivo: (row.motivo as string) || undefined,
    observacaoDecisao: (row.observacao_decisao as string) || undefined,
    autorizadoEm: (row.autorizado_em as string) || undefined,
    decididoEm: (row.decidido_em as string) || undefined,
    createdAt: row.created_at as string,
  };
}

export async function criarSolicitacaoTransferencia(params: {
  alunoId: string;
  setorDestinoId: string;
  colaboradorDestinoId?: string | null;
  motivo?: string;
}): Promise<{ id: string | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc("criar_solicitacao_transferencia", {
      p_aluno_id: params.alunoId,
      p_setor_destino_id: params.setorDestinoId,
      p_colaborador_destino_id: params.colaboradorDestinoId || null,
      p_motivo: params.motivo || null,
    });
    if (error) return { id: null, error: error.message };
    return { id: data as string, error: null };
  } catch {
    return { id: null, error: "Erro ao criar solicitação de transferência" };
  }
}

export async function autorizarSolicitacaoTransferencia(
  solicitacaoId: string,
  aprovar: boolean,
  observacao?: string
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.rpc("autorizar_solicitacao_transferencia", {
      p_solicitacao_id: solicitacaoId,
      p_aprovar: aprovar,
      p_observacao: observacao || null,
    });
    if (error) return { error: error.message };
    return { error: null };
  } catch {
    return { error: "Erro ao autorizar solicitação" };
  }
}

export async function decidirSolicitacaoTransferencia(
  solicitacaoId: string,
  aprovar: boolean,
  observacao?: string
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.rpc("decidir_solicitacao_transferencia", {
      p_solicitacao_id: solicitacaoId,
      p_aprovar: aprovar,
      p_observacao: observacao || null,
    });
    if (error) return { error: error.message };
    return { error: null };
  } catch {
    return { error: "Erro ao decidir solicitação" };
  }
}

export async function cancelarSolicitacaoTransferencia(
  solicitacaoId: string
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.rpc("cancelar_solicitacao_transferencia", {
      p_solicitacao_id: solicitacaoId,
    });
    if (error) return { error: error.message };
    return { error: null };
  } catch {
    return { error: "Erro ao cancelar solicitação" };
  }
}

export async function listarSolicitacoesTransferencia(
  apenasPendentes = true
): Promise<{ solicitacoes: SolicitacaoTransferencia[]; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc("listar_solicitacoes_transferencia", {
      p_apenas_pendentes: apenasPendentes,
    });
    if (error) return { solicitacoes: [], error: error.message };
    return {
      solicitacoes: (data || []).map((r: Record<string, unknown>) => mapRow(r)),
      error: null,
    };
  } catch {
    return { solicitacoes: [], error: "Erro ao listar solicitações" };
  }
}

export async function solicitacoesDoAluno(
  alunoId: string
): Promise<{ solicitacoes: SolicitacaoTransferencia[]; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc("solicitacoes_do_aluno", {
      p_aluno_id: alunoId,
    });
    if (error) return { solicitacoes: [], error: error.message };
    return {
      solicitacoes: (data || []).map((r: Record<string, unknown>) => mapRow(r)),
      error: null,
    };
  } catch {
    return { solicitacoes: [], error: "Erro ao buscar solicitações do aluno" };
  }
}
