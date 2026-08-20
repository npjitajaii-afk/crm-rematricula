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
    area: (data.area || 'rematricula') as Aluno['area'],
    status: data.status as AlunoStatus,
    source: data.canal_contato as CanalContato,
    value: data.valor_pendente ?? undefined,
    observations: data.observacoes || undefined,
    tags: data.tags || [],
    assignedTo: data.responsavel_id || undefined,
    createdBy: data.criado_por,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
statusAtualizadoEm: data.status_atualizado_em
      ? new Date(data.status_atualizado_em)
      : new Date(data.updated_at),
    interactions: (data.interacoes || []).map(      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
 * Tamanho de cada lote buscado do Supabase. Antes disso a query trazia
 * TODOS os alunos + interações numa única chamada sem `.range()`, o que
 * cresce sem teto conforme a base aumenta (ver README.md, Bloco B).
 */
const PAGE_SIZE = 500;

export interface GetAlunosOptions {
  /**
   * Área que deve ser buscada primeiro (ex: a aba/funil que o usuário está
   * abrindo agora). Chega mais rápido pra tela, o resto é buscado em
   * seguida sem bloquear a primeira renderização.
   */
  areaPrioritaria?: Aluno['area'];
  /**
   * Chamado a cada lote buscado (tanto da área prioritária quanto do
   * restante), com a lista acumulada até aquele ponto. Permite ao chamador
   * já exibir dados parciais em vez de esperar tudo terminar.
   */
  onPage?: (alunosParciais: Aluno[], pagina: number) => void;
}

/**
 * Busca todos os alunos em lotes (paginação via `.range()`), opcionalmente
 * priorizando uma área específica primeiro. Antes esta função trazia tudo
 * numa única query sem limite, o que deixava a tela lenta para abrir logo
 * após o login e crescia sem controle conforme a base aumentava.
 */
export async function getAlunos(options: GetAlunosOptions = {}): Promise<AlunosResponse> {
  const { areaPrioritaria, onPage } = options;
  const todos: Aluno[] = [];

  // Busca um lote por vez (com o filtro passado em `aplicarFiltro`) até a
  // página voltar com menos itens que PAGE_SIZE, sinal de que acabou.
  const buscarEmLotes = async (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    aplicarFiltro: (query: any) => any
  ): Promise<string | null> => {
    let pagina = 0;

    while (true) {
      const from = pagina * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const query = aplicarFiltro(
        supabase
          .from('alunos')
          .select(SELECT_WITH_INTERACOES)
          .order('created_at', { ascending: false })
      ).range(from, to);

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching alunos (lote):', error);
        return error.message;
      }

      const lote = ((data || []) as unknown[]).map(mapDatabaseToAluno);
      todos.push(...lote);
      onPage?.(todos.slice(), pagina);

      pagina += 1;
      if (lote.length < PAGE_SIZE) break;
    }

    return null;
  };

  try {
    if (areaPrioritaria) {
      // 1) área ativa primeiro, em lotes pequenos — libera a tela rápido.
      const erroArea = await buscarEmLotes((q) => q.eq('area', areaPrioritaria));
      if (erroArea) return { alunos: todos, error: erroArea };

      // 2) o restante (outras áreas) em seguida, sem travar quem já está vendo a tela.
      const erroResto = await buscarEmLotes((q) => q.neq('area', areaPrioritaria));
      if (erroResto) return { alunos: todos, error: erroResto };
    } else {
      const erro = await buscarEmLotes((q) => q);
      if (erro) return { alunos: todos, error: erro };
    }

    return { alunos: todos, error: null };
  } catch {
    return { alunos: todos, error: 'Erro ao buscar alunos' };
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
 * Normalização usada tanto aqui quanto no banco (ver migration
 * 016_bloqueio_duplicados.sql, mesma lógica) pra checar duplicados antes
 * de gravar. Mantém as duas em sincronia caso uma delas mude.
 */
function normalizarNome(nome: string): string {
  return nome.trim().toLowerCase().replace(/\s+/g, ' ');
}
function normalizarTelefone(telefone: string): string {
  return (telefone || '').replace(/\D/g, '');
}
function normalizarRa(ra: string): string {
  return ra.trim().toUpperCase();
}

const AREA_LABEL: Record<string, string> = {
  rematricula: 'Rematrícula',
  retencao: 'Retenção',
  engajamento: 'Engajamento',
};

export interface AlunoDuplicado {
  id: string;
  nome: string;
  area: string;
  motivo: 'ra' | 'nome_telefone';
}

function mensagemDuplicado(d: AlunoDuplicado): string {
  const motivoLabel = d.motivo === 'ra' ? 'o mesmo RA' : 'o mesmo nome e telefone';
  return `Já existe um contato com ${motivoLabel}: "${d.nome}" (funil: ${
    AREA_LABEL[d.area] || d.area
  }). Cadastro bloqueado para evitar duplicidade.`;
}

/**
 * Verifica se já existe um aluno com o mesmo RA, ou o mesmo nome+telefone,
 * em qualquer área/funil. Usado antes de criar (formulário e importação)
 * pra dar um erro claro em vez de deixar estourar a constraint do banco.
 * `excludeId` serve pra edição: não considerar o próprio aluno como
 * duplicado dele mesmo.
 */
export async function verificarAlunoDuplicado(
  dados: { nome: string; ra?: string; telefone: string },
  excludeId?: string
): Promise<AlunoDuplicado | null> {
  const raNormalizado = dados.ra ? normalizarRa(dados.ra) : '';

  if (raNormalizado) {
    let query = supabase
      .from('alunos')
      .select('id, nome, area')
      .eq('ra_normalizado', raNormalizado)
      .limit(1);
    if (excludeId) query = query.neq('id', excludeId);
    const { data } = await query;
    if (data && data[0]) {
      return { id: data[0].id, nome: data[0].nome, area: data[0].area, motivo: 'ra' };
    }
  }

  const nomeNormalizado = normalizarNome(dados.nome);
  const telefoneNormalizado = normalizarTelefone(dados.telefone);
  if (nomeNormalizado && telefoneNormalizado) {
    let query = supabase
      .from('alunos')
      .select('id, nome, area')
      .eq('nome_normalizado', nomeNormalizado)
      .eq('telefone_normalizado', telefoneNormalizado)
      .limit(1);
    if (excludeId) query = query.neq('id', excludeId);
    const { data } = await query;
    if (data && data[0]) {
      return { id: data[0].id, nome: data[0].nome, area: data[0].area, motivo: 'nome_telefone' };
    }
  }

  return null;
}

/**
 * Cria um novo aluno
 */
export async function createAluno(
  aluno: Omit<Aluno, 'id' | 'createdAt' | 'updatedAt' | 'interactions'>
): Promise<AlunoResponse> {
  try {
    const duplicado = await verificarAlunoDuplicado({
      nome: aluno.name,
      ra: aluno.ra,
      telefone: aluno.phone,
    });
    if (duplicado) {
      return { aluno: null, error: mensagemDuplicado(duplicado) };
    }

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
          area: aluno.area,
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
      // Rede de segurança final (ex: corrida entre duas criações
      // simultâneas com o mesmo RA) — a constraint do banco (migration
      // 016) barrou, mesmo já tendo passado pela checagem acima.
      if (error.code === '23505') {
        return {
          aluno: null,
          error: 'Já existe um contato com este RA, ou com este nome e telefone, cadastrado no CRM.',
        };
      }
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
 *
 * Antes de inserir, filtra duplicados (por RA, ou por nome+telefone) tanto
 * contra o que já existe no banco quanto entre as próprias linhas da
 * planilha (ex: a mesma pessoa aparecendo duas vezes no arquivo). Linhas
 * duplicadas são apenas ignoradas — não travam a importação inteira — e
 * contadas em `duplicados` pra o chamador avisar o usuário.
 */
export async function createAlunosBulk(
  alunosData: Omit<Aluno, 'id' | 'createdAt' | 'updatedAt' | 'interactions'>[],
  batchSize = 200,
  onProgress?: (done: number, total: number) => void
): Promise<{ alunos: Aluno[]; errors: string[]; duplicados: number }> {
  // 1) Descobre, em poucas consultas, quais RAs e combinações
  //    nome+telefone da planilha já existem no banco.
  const rasDaPlanilha = Array.from(
    new Set(alunosData.map((a) => (a.ra ? normalizarRa(a.ra) : '')).filter(Boolean))
  );
  const nomesDaPlanilha = Array.from(
    new Set(alunosData.map((a) => normalizarNome(a.name)).filter(Boolean))
  );

  const rasExistentes = new Set<string>();
  const nomeTelefoneExistentes = new Set<string>();

  const CHUNK = 300;
  for (let i = 0; i < rasDaPlanilha.length; i += CHUNK) {
    const chunk = rasDaPlanilha.slice(i, i + CHUNK);
    const { data } = await supabase
      .from('alunos')
      .select('ra_normalizado')
      .in('ra_normalizado', chunk);
    (data || []).forEach((row) => row.ra_normalizado && rasExistentes.add(row.ra_normalizado));
  }
  for (let i = 0; i < nomesDaPlanilha.length; i += CHUNK) {
    const chunk = nomesDaPlanilha.slice(i, i + CHUNK);
    const { data } = await supabase
      .from('alunos')
      .select('nome_normalizado, telefone_normalizado')
      .in('nome_normalizado', chunk)
      .not('telefone_normalizado', 'is', null);
    (data || []).forEach((row) => {
      if (row.nome_normalizado && row.telefone_normalizado) {
        nomeTelefoneExistentes.add(`${row.nome_normalizado}::${row.telefone_normalizado}`);
      }
    });
  }

  // 2) Filtra a planilha: fora duplicados contra o banco E duplicados
  //    entre si mesma (mantém só a primeira ocorrência de cada RA / de
  //    cada nome+telefone dentro do próprio arquivo).
  const rasVistosNoLote = new Set<string>();
  const nomeTelefoneVistosNoLote = new Set<string>();
  let duplicados = 0;

  const alunosFiltrados = alunosData.filter((aluno) => {
    const ra = aluno.ra ? normalizarRa(aluno.ra) : '';
    const chaveNomeTelefone = `${normalizarNome(aluno.name)}::${normalizarTelefone(aluno.phone)}`;
    const temNomeTelefone = normalizarNome(aluno.name) && normalizarTelefone(aluno.phone);

    if (ra && (rasExistentes.has(ra) || rasVistosNoLote.has(ra))) {
      duplicados += 1;
      return false;
    }
    if (
      temNomeTelefone &&
      (nomeTelefoneExistentes.has(chaveNomeTelefone) || nomeTelefoneVistosNoLote.has(chaveNomeTelefone))
    ) {
      duplicados += 1;
      return false;
    }

    if (ra) rasVistosNoLote.add(ra);
    if (temNomeTelefone) nomeTelefoneVistosNoLote.add(chaveNomeTelefone);
    return true;
  });

  const rows = alunosFiltrados.map((aluno) => ({
    nome: aluno.name,
    email: aluno.email,
    telefone: aluno.phone,
    ra: aluno.ra || null,
    curso: aluno.curso || null,
    turno: aluno.turno || null,
    area: aluno.area,
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

  const alunos: Aluno[] = [];
  const errors: string[] = [];
  let done = 0;
  const total = rows.length;
  onProgress?.(0, total);

  for (const batch of batches) {
    const { data, error } = await supabase.from('alunos').insert(batch).select('*');

    if (error) {
      console.error('Error bulk creating alunos:', error);
      // Se mesmo assim algum duplicado passou (corrida com outra
      // importação/cadastro rodando ao mesmo tempo), a constraint do
      // banco barra o lote inteiro — reportamos como erro em vez de
      // fingir sucesso, já que aqui não dá pra saber qual linha foi.
      errors.push(error.message);
    } else {
      alunos.push(...(data || []).map(mapDatabaseToAluno));
    }

    done += batch.length;
    onProgress?.(Math.min(done, total), total);
  }

  return { alunos, errors, duplicados };
}

/**
 * Atualiza um aluno existente
 */
export async function updateAluno(
  id: string,
  updates: Partial<Omit<Aluno, 'id' | 'createdAt' | 'updatedAt' | 'interactions'>>
): Promise<AlunoResponse> {
  try {
    // Só vale a pena checar duplicidade se um dos campos usados no
    // dedup (nome, RA, telefone) está sendo alterado — evita uma
    // consulta extra em updates que não mexem nisso (ex: só status/tags).
    if (updates.name !== undefined || updates.ra !== undefined || updates.phone !== undefined) {
      const { data: atual } = await supabase
        .from('alunos')
        .select('nome, ra, telefone')
        .eq('id', id)
        .single();

      if (atual) {
        const duplicado = await verificarAlunoDuplicado(
          {
            nome: updates.name ?? atual.nome,
            ra: updates.ra !== undefined ? updates.ra : atual.ra || undefined,
            telefone: updates.phone ?? atual.telefone,
          },
          id
        );
        if (duplicado) {
          return { aluno: null, error: mensagemDuplicado(duplicado) };
        }
      }
    }

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
      if (error.code === '23505') {
        return {
          aluno: null,
          error: 'Já existe um contato com este RA, ou com este nome e telefone, cadastrado no CRM.',
        };
      }
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
export async function deleteAlunosBulk(
  ids: string[]
): Promise<{ error: string | null; deletedCount: number }> {
  try {
    const { data, error } = await supabase
      .from('alunos')
      .delete()
      .in('id', ids)
      .select('id'); // força avaliação row-a-row e retorna o que foi deletado

    if (error) {
      console.error('Error bulk deleting alunos:', error);
      return { error: error.message, deletedCount: 0 };
    }

    return { error: null, deletedCount: data?.length ?? 0 };
  } catch {
    return { error: 'Erro ao excluir alunos selecionados', deletedCount: 0 };
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