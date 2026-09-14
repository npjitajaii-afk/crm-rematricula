import { supabase } from '../lib/supabase';
import { User } from '../types';

export interface AuthResponse {
  user: User | null;
  error: string | null;
}

function mapProfileToUser(profile: {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  role?: string;
  status?: string;
  areas_permitidas?: string[] | null;
  polo_id?: string | null;
  setor_id?: string | null;
  polos?: { nome: string } | { nome: string }[] | null;
  setores?: { nome: string } | { nome: string }[] | null;
}): User {
  const poloJoin = profile.polos;
  const poloNome = Array.isArray(poloJoin) ? poloJoin[0]?.nome : poloJoin?.nome;
  const setorJoin = profile.setores;
  const setorNome = Array.isArray(setorJoin) ? setorJoin[0]?.nome : setorJoin?.nome;

  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    avatarUrl: profile.avatar_url,
    role: profile.role === "admin" || profile.role === "supervisor" ? profile.role : "colaborador",
    status: profile.status === "aprovado" || profile.status === "rejeitado" ? profile.status : "pendente",
    areasPermitidas: (profile.areas_permitidas ?? []) as User["areasPermitidas"],
    poloId: profile.polo_id ?? undefined,
    poloNome,
    setorId: profile.setor_id ?? undefined,
    setorNome,
  };
}

/**
 * Busca o profile (public.profiles) do usuário autenticado
 */
async function fetchProfile(userId: string): Promise<AuthResponse> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*, polos(nome), setores(nome)')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    return { user: null, error: 'Erro ao carregar dados do usuário' };
  }

  return { user: mapProfileToUser(profile), error: null };
}

/**
 * Realiza login do usuário via Supabase Auth
 */
export async function loginUser(email: string, password: string): Promise<AuthResponse> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      // Supabase retorna "Invalid login credentials" para senha errada E para
      // e-mail não confirmado — diferenciamos pela mensagem do próprio Supabase.
      const msg = error.message?.toLowerCase() ?? "";
      if (msg.includes("email not confirmed")) {
        return {
          user: null,
          error:
            "Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada ou desative a confirmação de e-mail no Supabase.",
        };
      }
      if (msg.includes("invalid login credentials") || msg.includes("invalid email or password")) {
        return { user: null, error: "Email ou senha incorretos" };
      }
      // Outros erros (rate limit, rede etc.) — mostra a mensagem real para facilitar diagnóstico
      return { user: null, error: error.message };
    }

    if (!data.user) {
      return { user: null, error: "Falha ao autenticar usuário" };
    }

    const result = await fetchProfile(data.user.id);

    if (result.user && result.user.status !== 'aprovado') {
      // A sessão já foi criada pelo Supabase Auth nesse ponto — como o
      // cadastro ainda não foi aprovado (ou foi recusado), desfazemos o
      // login antes de devolver o erro pra tela.
      await supabase.auth.signOut();

      const mensagem =
        result.user.status === 'rejeitado'
          ? 'Seu cadastro foi recusado pelo administrador. Fale com ele para mais informações.'
          : 'Seu cadastro ainda não foi aprovado pelo administrador. Aguarde a liberação de acesso.';

      return { user: null, error: mensagem };
    }

    return result;
  } catch {
    return { user: null, error: 'Erro ao fazer login. Tente novamente.' };
  }
}

/**
 * Registra um novo usuário via Supabase Auth.
 * O profile em public.profiles é criado automaticamente por trigger no banco.
 */
export async function registerUser(
  name: string,
  email: string,
  password: string,
  poloId?: string
): Promise<AuthResponse> {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, polo_id: poloId ?? null },
      },
    });

    if (error) {
      return { user: null, error: error.message };
    }

    if (!data.user) {
      return { user: null, error: 'Falha ao criar usuário' };
    }

    // A confirmação de e-mail precisa estar desativada no Supabase para
    // que possamos acompanhar a aprovação automaticamente nesta tela.
    if (!data.session) {
      return {
        user: null,
        error: 'EMAIL_CONFIRMATION_ENABLED',
      };
    }

    // Grava o polo_id no profile criado pelo trigger (que não inclui polo_id)
    if (poloId) {
      await supabase
        .from('profiles')
        .update({ polo_id: poloId })
        .eq('id', data.user.id);
    }

    // O cadastro sempre começa como "pendente". Mantemos a sessão somente
    // enquanto esta página está aberta para consultar o status da aprovação;
    // as rotas privadas continuam bloqueadas até o status ser "aprovado".
    return { user: null, error: 'PENDING_APPROVAL' };
  } catch {
    return { user: null, error: 'Erro ao registrar usuário. Tente novamente.' };
  }
}

/**
 * Faz logout do usuário
 */
export async function logoutUser(): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      return { error: error.message };
    }
    return { error: null };
  } catch {
    return { error: 'Erro ao fazer logout' };
  }
}

/**
 * Verifica se há uma sessão ativa e retorna o usuário
 */
export async function getCurrentUser(): Promise<AuthResponse> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return { user: null, error: null };
    }

    return fetchProfile(session.user.id);
  } catch {
    return { user: null, error: 'Erro ao verificar sessão' };
  }
}

/**
 * Observa mudanças na autenticação (login/logout em outra aba, expiração, etc.)
 */
export function onAuthStateChange(callback: (user: User | null) => void) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    // IMPORTANTE: nunca faça chamadas assíncronas direto aqui dentro.
    // O onAuthStateChange dispara enquanto o client do Supabase ainda
    // segura um lock interno de autenticação; uma query (fetchProfile)
    // executada de forma síncrona nesse callback disputa o mesmo lock
    // e trava o client (deadlock) — sintoma clássico: login parece
    // funcionar, mas nenhuma chamada ao banco depois disso resolve,
    // só voltando ao normal com F5 (que recria o client do zero).
    // Adiar com setTimeout(0) tira a execução de dentro do lock.
    setTimeout(async () => {
      if (session?.user) {
        const { user } = await fetchProfile(session.user.id);
        callback(user);
      } else {
        callback(null);
      }
    }, 0);
  });

  return () => {
    data.subscription.unsubscribe();
  };
}