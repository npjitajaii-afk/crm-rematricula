import { supabase } from '../lib/supabase';
import { Area, Usuario, StatusAprovacao } from '../types';

interface ProfileRow {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  areas_permitidas: string[] | null;
  created_at: string;
}

function mapRowToUsuario(row: ProfileRow): Usuario {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role === 'admin' ? 'admin' : 'colaborador',
    status: (row.status as StatusAprovacao) ?? 'pendente',
    areasPermitidas: (row.areas_permitidas ?? []) as Area[],
    createdAt: new Date(row.created_at),
  };
}

/**
 * Lista todos os usuários (admin e colaboradores), do mais recente pro mais
 * antigo. Só admin consegue de fato ler isso — a policy de SELECT em
 * profiles é aberta pra authenticated, mas as ações de update abaixo são
 * bloqueadas pra quem não é admin.
 */
export async function getUsuarios(): Promise<{ usuarios: Usuario[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email, role, status, areas_permitidas, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      return { usuarios: [], error: error.message };
    }

    return { usuarios: (data || []).map(mapRowToUsuario), error: null };
  } catch {
    return { usuarios: [], error: 'Erro ao buscar usuários' };
  }
}

/**
 * Aprova ou reprova um cadastro. Ao aprovar, opcionalmente já define as
 * áreas liberadas nesse mesmo update.
 */
export async function definirStatusUsuario(
  userId: string,
  status: StatusAprovacao,
  areasPermitidas?: Area[]
): Promise<{ error: string | null }> {
  try {
    const payload: { status: StatusAprovacao; areas_permitidas?: Area[] } = { status };
    if (areasPermitidas) {
      payload.areas_permitidas = areasPermitidas;
    }

    const { error } = await supabase.from('profiles').update(payload).eq('id', userId);

    if (error) {
      return { error: error.message };
    }

    return { error: null };
  } catch {
    return { error: 'Erro ao atualizar status do usuário' };
  }
}

/**
 * Atualiza só as áreas liberadas pra um colaborador já aprovado.
 */
export async function definirAreasUsuario(
  userId: string,
  areasPermitidas: Area[]
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ areas_permitidas: areasPermitidas })
      .eq('id', userId);

    if (error) {
      return { error: error.message };
    }

    return { error: null };
  } catch {
    return { error: 'Erro ao atualizar áreas do usuário' };
  }
}
