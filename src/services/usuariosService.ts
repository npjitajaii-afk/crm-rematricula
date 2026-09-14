import { supabase } from '../lib/supabase';
import { Area, Usuario, StatusAprovacao, UserRole } from '../types';

interface ProfileRow {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  areas_permitidas: string[] | null;
  polo_id: string | null;
  setor_id: string | null;
  polos: { nome: string } | { nome: string }[] | null;
  setores: { nome: string } | { nome: string }[] | null;
  created_at: string;
}

function mapRowToUsuario(row: ProfileRow): Usuario {
  const poloJoin = row.polos;
  const poloNome = Array.isArray(poloJoin) ? poloJoin[0]?.nome : poloJoin?.nome;
  const setorJoin = row.setores;
  const setorNome = Array.isArray(setorJoin) ? setorJoin[0]?.nome : setorJoin?.nome;

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role === 'admin' || row.role === 'supervisor' ? row.role : 'colaborador',
    status: (row.status as StatusAprovacao) ?? 'pendente',
    areasPermitidas: (row.areas_permitidas ?? []) as Area[],
    poloId: row.polo_id ?? undefined,
    poloNome,
    setorId: row.setor_id ?? undefined,
    setorNome,
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
      .select(
        'id, name, email, role, status, areas_permitidas, polo_id, setor_id, polos(nome), setores(nome), created_at'
      )
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

/**
 * Altera o papel de acesso (role) de um usuário já aprovado.
 * Regra de negócio: supervisor precisa ter um polo definido — não faz
 * sentido um supervisor "de polo nenhum" (toda a lógica de RLS/métricas/
 * delegação dele depende do polo). Essa checagem é feita aqui no client
 * antes de gravar; o banco não recusa role='supervisor' sem polo_id
 * (não há constraint pra isso hoje), então é importante não pular essa
 * validação ao reusar esta função em outro lugar.
 */
export async function definirRoleUsuario(
  userId: string,
  role: UserRole,
  poloIdAtual: string | null | undefined
): Promise<{ error: string | null }> {
  if (role === 'supervisor' && !poloIdAtual) {
    return { error: 'Defina o polo do usuário antes de torná-lo supervisor.' };
  }

  try {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);

    if (error) {
      return { error: error.message };
    }

    return { error: null };
  } catch {
    return { error: 'Erro ao atualizar papel do usuário' };
  }
}

/**
 * Atribui o polo de um colaborador (admin-only, protegido no banco).
 */
export async function definirPoloUsuario(
  userId: string,
  poloId: string | null
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ polo_id: poloId })
      .eq('id', userId);

    if (error) {
      return { error: error.message };
    }

    return { error: null };
  } catch {
    return { error: 'Erro ao atualizar polo do usuário' };
  }
}
/**
 * Atribui o setor de um colaborador no Engajamento (admin-only, protegido no banco).
 * Obrigatório antes de aprovar colaborador com área engajamento.
 * Admin/supervisor devem ficar com setor_id NULL.
 */
export async function definirSetorUsuario(
  userId: string,
  setorId: string | null
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ setor_id: setorId })
      .eq('id', userId);

    if (error) {
      return { error: error.message };
    }

    return { error: null };
  } catch {
    return { error: 'Erro ao atualizar setor do usuário' };
  }
}
