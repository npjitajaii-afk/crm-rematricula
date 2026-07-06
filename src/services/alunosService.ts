import { supabase } from '../lib/supabase';
import { Aluno, AlunoStatus, CanalContato, PipelineStatusResumo } from '../types';

export interface AlunoResponse {
  aluno: Aluno | null;
  error: string | null;
}

export interface AlunosResponse {
  alunos: Aluno[];
  error: string | null;
}

const SELECT_WITH_INTERACOES = `
  *,
  interacoes (
    id,
    tipo,
    descricao,
    created_at,
    user:user_id (
      id,
      name,
      email
    )
  )
`;

/**
 * Converte dados do banco para o tipo Aluno
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDatabaseToAluno(data: any): Aluno {
  return {
    id: data.id,
    name: data.nome,
    email: data.email,
    phone: data.telefone,
    ra: data.ra || undefined,
    curso: data.curso || undefined,
    turno: data.turno || undefined,
    status: data.status as AlunoStatus,
    source: data.canal_contato as CanalContato,
    value: data.valor_pendente ?? undefined,
    observations: data.observacoes || undefined,
    tags: data.tags || [],
    assignedTo: data.responsavel_id || undefined,
    createdBy: data.criado_por,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    interactions: (data.interacoes || []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (i: any) => ({
        id: i.id,
        alunoId: data.id,
        type: i.tipo,
        description: i.descricao,
        date: i.created_at,
        userId: i.user?.id || '',
        userName: i.user?.name || '',
      })
    ),
  };
}

/**
 * Busca todos os alunos
 */
export async function getAlunos(): Promise<AlunosResponse> {
  try {
    const { data, error } = await supabase
      .from('alunos')
      .select(SELECT_WITH_INTERACOES)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching alunos:', error);
      return { alunos: [], error: error.message };
    }

    const alunos = (data || []).map(mapDatabaseToAluno);
    return { alunos, error: null };
  } catch {
    return { alunos: [], error: 'Erro ao buscar alunos' };
  }
}

/**
 * Busca um aluno específico por ID
 */
export async function getAlunoById(id: string): Promise<AlunoResponse> {
  try {
    const { data, error } = await supabase
      .from('alunos')
      .select(SELECT_WITH_INTERACOES)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching aluno:', error);
      return { aluno: null, error: error.message };
    }

    if (!data) {
      return { aluno: null, error: 'Aluno não encontrado' };
    }

    return { aluno: mapDatabaseToAluno(data), error: null };
  } catch {
    return { aluno: null, error: 'Erro ao buscar aluno' };
  }
}

/**
 * Cria um novo aluno
 */
export async function createAluno(
  aluno: Omit<Aluno, 'id' | 'createdAt' | 'updatedAt' | 'interactions'>
): Promise<AlunoResponse> {
  try {
    const { data, error } = await supabase
      .from('alunos')
      .insert([
        {
          nome: aluno.name,
          email: aluno.email,
          telefone: aluno.phone,
          ra: aluno.ra || null,
          curso: aluno.curso || null,
          turno: aluno.turno || null,
          status: aluno.status,
          canal_contato: aluno.source,
          valor_pendente: aluno.value ?? null,
          observacoes: aluno.observations || null,
          tags: aluno.tags || [],
          responsavel_id: aluno.assignedTo || null,
          criado_por: aluno.createdBy,
        },
      ])
      .select(SELECT_WITH_INTERACOES)
      .single();

    if (error) {
      console.error('Error creating aluno:', error);
      return { aluno: null, error: error.message };
    }

    if (!data) {
      return { aluno: null, error: 'Erro ao criar aluno' };
    }

    return { aluno: mapDatabaseToAluno(data), error: null };
  } catch {
    return { aluno: null, error: 'Erro ao criar aluno' };
  }
}

/**
 * Cria vários alunos de uma vez (usado na importação de planilhas).
 *
 * Em vez de disparar um INSERT por aluno (o que gera centenas de
 * requisições simultâneas e trava o navegador em importações grandes),
 * agrupamos os registros em lotes e fazemos poucos INSERTs, cada um já
 * inserindo várias linhas de uma vez. Também evitamos o select aninhado de
 * `interacoes`: alunos recém-importados nunca têm interações, então esse
 * join só deixaria a resposta mais pesada sem necessidade.
 */
export async function createAlunosBulk(
  alunosData: Omit<Aluno, 'id' | 'createdAt' | 'updatedAt' | 'interactions'>[],
  batchSize = 200
): Promise<{ alunos: Aluno[]; errors: string[] }> {
  const rows = alunosData.map((aluno) => ({
    nome: aluno.name,
    email: aluno.email,
    telefone: aluno.phone,
    ra: aluno.ra || null,
    curso: aluno.curso || null,
    turno: aluno.turno || null,
    status: aluno.status,
    canal_contato: aluno.source,
    valor_pendente: aluno.value ?? null,
    observacoes: aluno.observations || null,
    tags: aluno.tags || [],
    responsavel_id: aluno.assignedTo || null,
    criado_por: aluno.createdBy,
  }));

  const batches: (typeof rows)[] = [];
  for (let i = 0; i < rows.length; i += batchSize) {
    batches.push(rows.slice(i, i + batchSize));
  }

  const results = await Promise.all(
    batches.map(async (batch) => {
      const { data, error } = await supabase
        .from('alunos')
        .insert(batch)
        .select('*');

      if (error) {
        console.error('Error bulk creating alunos:', error);
        return { alunos: [] as Aluno[], error: error.message };
      }

      return { alunos: (data || []).map(mapDatabaseToAluno), error: null };
    })
  );

  const alunos = results.flatMap((r) => r.alunos);
  const errors = results.map((r) => r.error).filter((e): e is string => !!e);

  return { alunos, errors };
}

/**
 * Atualiza um aluno existente
 */
export async function updateAluno(
  id: string,
  updates: Partial<Omit<Aluno, 'id' | 'createdAt' | 'updatedAt' | 'interactions'>>
): Promise<AlunoResponse> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};

    if (updates.name !== undefined) updateData.nome = updates.name;
    if (updates.email !== undefined) updateData.email = updates.email;
    if (updates.phone !== undefined) updateData.telefone = updates.phone;
    if (updates.ra !== undefined) updateData.ra = updates.ra || null;
    if (updates.curso !== undefined) updateData.curso = updates.curso || null;
    if (updates.turno !== undefined) updateData.turno = updates.turno || null;
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.source !== undefined) updateData.canal_contato = updates.source;
    if (updates.value !== undefined) updateData.valor_pendente = updates.value ?? null;
    if (updates.observations !== undefined) updateData.observacoes = updates.observations || null;
    if (updates.tags !== undefined) updateData.tags = updates.tags || [];
    if (updates.assignedTo !== undefined) updateData.responsavel_id = updates.assignedTo || null;

    const { data, error } = await supabase
      .from('alunos')
      .update(updateData)
      .eq('id', id)
      .select(SELECT_WITH_INTERACOES)
      .single();

    if (error) {
      console.error('Error updating aluno:', error);
      return { aluno: null, error: error.message };
    }

    if (!data) {
      return { aluno: null, error: 'Aluno não encontrado' };
    }

    return { aluno: mapDatabaseToAluno(data), error: null };
  } catch {
    return { aluno: null, error: 'Erro ao atualizar aluno' };
  }
}

/**
 * Deleta um aluno
 */
export async function deleteAluno(id: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.from('alunos').delete().eq('id', id);

    if (error) {
      console.error('Error deleting aluno:', error);
      return { error: error.message };
    }

    return { error: null };
  } catch {
    return { error: 'Erro ao deletar aluno' };
  }
}

/**
 * Deleta múltiplos alunos de uma vez (uso: admin apagando em massa).
 * RLS garante que colaborador só consegue apagar o que é dele mesmo
 * passando vários ids aqui.
 */
export async function deleteAlunosBulk(ids: string[]): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.from('alunos').delete().in('id', ids);

    if (error) {
      console.error('Error bulk deleting alunos:', error);
      return { error: error.message };
    }

    return { error: null };
  } catch {
    return { error: 'Erro ao excluir alunos selecionados' };
  }
}

/**
 * Colaborador assume um contato sem responsável (auto-atribuição).
 */
export async function assumirAluno(id: string, userId: string): Promise<AlunoResponse> {
  try {
    const { data, error } = await supabase
      .from('alunos')
      .update({ responsavel_id: userId })
      .eq('id', id)
      .select(SELECT_WITH_INTERACOES)
      .single();

    if (error) {
      console.error('Error assuming aluno:', error);
      return { aluno: null, error: error.message };
    }

    return { aluno: data ? mapDatabaseToAluno(data) : null, error: null };
  } catch {
    return { aluno: null, error: 'Erro ao assumir contato' };
  }
}

/**
 * Admin delega um contato para um colaborador específico.
 */
export async function delegarAluno(id: string, colaboradorId: string): Promise<AlunoResponse> {
  try {
    const { data, error } = await supabase
      .from('alunos')
      .update({ responsavel_id: colaboradorId })
      .eq('id', id)
      .select(SELECT_WITH_INTERACOES)
      .single();

    if (error) {
      console.error('Error delegating aluno:', error);
      return { aluno: null, error: error.message };
    }

    return { aluno: data ? mapDatabaseToAluno(data) : null, error: null };
  } catch {
    return { aluno: null, error: 'Erro ao delegar contato' };
  }
}

/**
 * Resumo de quantidade de alunos por status, sem detalhes/PII.
 * É essa view que dá pro colaborador normal enxergar o board inteiro
 * (contagem por coluna) mesmo sem ver o conteúdo dos contatos de outros.
 */
export async function getPipelineResumo(): Promise<{ resumo: PipelineStatusResumo[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('pipeline_rematricula_resumo')
      .select('*');

    if (error) {
      console.error('Error fetching pipeline resumo:', error);
      return { resumo: [], error: error.message };
    }

    const resumo = (data || []).map((row: { status: string; total: number; total_valor_pendente: number | null }) => ({
      status: row.status as AlunoStatus,
      total: Number(row.total) || 0,
      totalValorPendente: Number(row.total_valor_pendente) || 0,
    }));

    return { resumo, error: null };
  } catch {
    return { resumo: [], error: 'Erro ao buscar resumo do pipeline' };
  }
}

/**
 * Lista colaboradores (id/nome/email) pra tela de delegação do admin.
 */
export async function getColaboradores(): Promise<{ colaboradores: { id: string; name: string; email: string }[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email')
      .order('name');

    if (error) {
      console.error('Error fetching colaboradores:', error);
      return { colaboradores: [], error: error.message };
    }

    return { colaboradores: data || [], error: null };
  } catch {
    return { colaboradores: [], error: 'Erro ao buscar colaboradores' };
  }
}

/**
 * Adiciona uma interação a um aluno
 */
export async function addInteraction(
  alunoId: string,
  userId: string,
  type: string,
  description: string
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.from('interacoes').insert([
      {
        aluno_id: alunoId,
        user_id: userId,
        tipo: type,
        descricao: description,
      },
    ]);

    if (error) {
      console.error('Error adding interacao:', error);
      return { error: error.message };
    }

    return { error: null };
  } catch {
    return { error: 'Erro ao adicionar interação' };
  }
}

/**
 * Atualiza o status de um aluno e registra uma interação
 */
export async function updateAlunoStatus(
  alunoId: string,
  userId: string,
  newStatus: AlunoStatus
): Promise<{ error: string | null }> {
  try {
    const { error: updateError } = await supabase
      .from('alunos')
      .update({ status: newStatus })
      .eq('id', alunoId);

    if (updateError) {
      console.error('Error updating status:', updateError);
      return { error: updateError.message };
    }

    await addInteraction(alunoId, userId, 'status', `Status alterado para: ${newStatus}`);

    return { error: null };
  } catch {
    return { error: 'Erro ao atualizar status' };
  }
}
