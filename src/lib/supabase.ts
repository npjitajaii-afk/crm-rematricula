import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL e Key são obrigatórias. Verifique o arquivo .env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storageKey: 'crm-rematricula-auth',
  },
});

// Tipos do banco de dados
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          name: string;
          email: string;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name: string;
          email: string;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          email?: string;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      alunos: {
        Row: {
          id: string;
          nome: string;
          email: string;
          telefone: string;
          ra: string | null;
          curso: string | null;
          turno: string | null;
          status: string;
          canal_contato: string;
          valor_pendente: number | null;
          observacoes: string | null;
          tags: string[] | null;
          responsavel_id: string | null;
          criado_por: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nome: string;
          email: string;
          telefone: string;
          ra?: string | null;
          curso?: string | null;
          turno?: string | null;
          status?: string;
          canal_contato?: string;
          valor_pendente?: number | null;
          observacoes?: string | null;
          tags?: string[] | null;
          responsavel_id?: string | null;
          criado_por?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          nome?: string;
          email?: string;
          telefone?: string;
          ra?: string | null;
          curso?: string | null;
          turno?: string | null;
          status?: string;
          canal_contato?: string;
          valor_pendente?: number | null;
          observacoes?: string | null;
          tags?: string[] | null;
          responsavel_id?: string | null;
          criado_por?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      interacoes: {
        Row: {
          id: string;
          aluno_id: string;
          user_id: string | null;
          tipo: string;
          descricao: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          aluno_id: string;
          user_id?: string | null;
          tipo: string;
          descricao: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          aluno_id?: string;
          user_id?: string | null;
          tipo?: string;
          descricao?: string;
          created_at?: string;
        };
      };
    };
  };
}
