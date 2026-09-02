import { supabase } from '../lib/supabase';
import { Polo } from '../types';

interface PoloRow {
  id: string;
  nome: string;
  created_at: string;
}

function mapRow(row: PoloRow): Polo {
  return {
    id: row.id,
    nome: row.nome,
    createdAt: new Date(row.created_at),
  };
}

export async function getPolos(): Promise<{ polos: Polo[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('polos')
      .select('id, nome, created_at')
      .order('nome');

    if (error) {
      return { polos: [], error: error.message };
    }

    return { polos: (data || []).map(mapRow), error: null };
  } catch {
    return { polos: [], error: 'Erro ao buscar polos' };
  }
}

export async function createPolo(nome: string): Promise<{ polo: Polo | null; error: string | null }> {
  try {
    const trimmed = nome.trim();
    if (!trimmed) {
      return { polo: null, error: 'Informe o nome do polo' };
    }

    const { data, error } = await supabase
      .from('polos')
      .insert([{ nome: trimmed }])
      .select('id, nome, created_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        return { polo: null, error: 'Já existe um polo com esse nome' };
      }
      return { polo: null, error: error.message };
    }

    return { polo: data ? mapRow(data) : null, error: null };
  } catch {
    return { polo: null, error: 'Erro ao criar polo' };
  }
}

export async function updatePolo(
  id: string,
  nome: string
): Promise<{ error: string | null }> {
  try {
    const trimmed = nome.trim();
    if (!trimmed) {
      return { error: 'Informe o nome do polo' };
    }

    const { error } = await supabase.from('polos').update({ nome: trimmed }).eq('id', id);

    if (error) {
      if (error.code === '23505') {
        return { error: 'Já existe um polo com esse nome' };
      }
      return { error: error.message };
    }

    return { error: null };
  } catch {
    return { error: 'Erro ao atualizar polo' };
  }
}

export async function deletePolo(id: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.from('polos').delete().eq('id', id);

    if (error) {
      if (error.code === '23503') {
        return { error: 'Não é possível excluir: existem alunos ou colaboradores vinculados a este polo' };
      }
      return { error: error.message };
    }

    return { error: null };
  } catch {
    return { error: 'Erro ao excluir polo' };
  }
}
