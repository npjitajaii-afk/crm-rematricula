import { supabase } from '../lib/supabase';
import { Setor } from '../types';

/**
 * Lista setores ativos do polo do usuário (ou todos, se admin).
 * Usa a RPC `setores_polo()` criada na migration 030.
 */
export async function getSetoresPolo(): Promise<{
  setores: Setor[];
  error: string | null;
}> {
  try {
    const { data, error } = await supabase.rpc('setores_polo');

    if (error) {
      console.error('Error fetching setores:', error);
      return { setores: [], error: error.message };
    }

    const setores: Setor[] = (data || []).map(
      (row: { id: string; nome: string; polo_id: string; ativo: boolean }) => ({
        id: row.id,
        nome: row.nome,
        poloId: row.polo_id,
        ativo: row.ativo,
      })
    );

    return { setores, error: null };
  } catch {
    return { setores: [], error: 'Erro ao buscar setores' };
  }
}

/** Lista todos os setores de um polo (ativos e inativos) — uso admin. */
export async function getSetoresDoPolo(poloId: string): Promise<{
  setores: Setor[];
  error: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from('setores')
      .select('id, nome, polo_id, ativo')
      .eq('polo_id', poloId)
      .order('nome');

    if (error) {
      return { setores: [], error: error.message };
    }

    const setores: Setor[] = (data || []).map(
      (row: { id: string; nome: string; polo_id: string; ativo: boolean }) => ({
        id: row.id,
        nome: row.nome,
        poloId: row.polo_id,
        ativo: row.ativo,
      })
    );

    return { setores, error: null };
  } catch {
    return { setores: [], error: 'Erro ao buscar setores do polo' };
  }
}

export async function createSetor(
  nome: string,
  poloId: string
): Promise<{ setor: Setor | null; error: string | null }> {
  try {
    const nomeLimpo = nome.trim();
    if (!nomeLimpo) return { setor: null, error: 'Informe o nome do setor.' };
    if (!poloId) return { setor: null, error: 'Polo inválido.' };

    const { data, error } = await supabase
      .from('setores')
      .insert([{ nome: nomeLimpo, polo_id: poloId, ativo: true }])
      .select('id, nome, polo_id, ativo')
      .single();

    if (error) {
      if (error.code === '23505') {
        return { setor: null, error: 'Já existe um setor com esse nome neste polo.' };
      }
      return { setor: null, error: error.message };
    }

    return {
      setor: {
        id: data.id,
        nome: data.nome,
        poloId: data.polo_id,
        ativo: data.ativo,
      },
      error: null,
    };
  } catch {
    return { setor: null, error: 'Erro ao criar setor' };
  }
}

export async function updateSetor(
  id: string,
  dados: { nome?: string; ativo?: boolean }
): Promise<{ error: string | null }> {
  try {
    const patch: Record<string, unknown> = {};
    if (dados.nome !== undefined) {
      const nomeLimpo = dados.nome.trim();
      if (!nomeLimpo) return { error: 'Informe o nome do setor.' };
      patch.nome = nomeLimpo;
    }
    if (dados.ativo !== undefined) patch.ativo = dados.ativo;

    if (Object.keys(patch).length === 0) return { error: null };

    const { error } = await supabase.from('setores').update(patch).eq('id', id);

    if (error) {
      if (error.code === '23505') {
        return { error: 'Já existe um setor com esse nome neste polo.' };
      }
      return { error: error.message };
    }
    return { error: null };
  } catch {
    return { error: 'Erro ao atualizar setor' };
  }
}

export async function deleteSetor(id: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.from('setores').delete().eq('id', id);
    if (error) {
      return {
        error:
          error.message ||
          'Não foi possível excluir. Verifique se há vínculos impedindo a exclusão.',
      };
    }
    return { error: null };
  } catch {
    return { error: 'Erro ao excluir setor' };
  }
}
