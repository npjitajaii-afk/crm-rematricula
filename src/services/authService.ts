import { supabase } from '../lib/supabase';
import { User } from '../types';

export interface AuthResponse {
  user: User | null;
  error: string | null;
}

function mapProfileToUser(profile: { id: string; name: string; email: string; avatar_url: string | null; role?: string }): User {
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    avatarUrl: profile.avatar_url,
    role: profile.role === "admin" ? "admin" : "colaborador",
  };
}

/**
 * Busca o profile (public.profiles) do usuário autenticado
 */
async function fetchProfile(userId: string): Promise<AuthResponse> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
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
      return { user: null, error: 'Email ou senha incorretos' };
    }

    if (!data.user) {
      return { user: null, error: 'Falha ao autenticar usuário' };
    }

    return fetchProfile(data.user.id);
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
  password: string
): Promise<AuthResponse> {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
      },
    });

    if (error) {
      return { user: null, error: error.message };
    }

    if (!data.user) {
      return { user: null, error: 'Falha ao criar usuário' };
    }

    // Se a confirmação de e-mail estiver ativada no projeto, ainda não há sessão aqui
    if (!data.session) {
      return {
        user: null,
        error: 'CONFIRM_EMAIL',
      };
    }

    return fetchProfile(data.user.id);
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
  const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user) {
      const { user } = await fetchProfile(session.user.id);
      callback(user);
    } else {
      callback(null);
    }
  });

  return () => {
    data.subscription.unsubscribe();
  };
}
