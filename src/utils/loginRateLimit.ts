/**
 * Rate limit de login por e-mail — validado no BANCO (Supabase RPC).
 * Não depende de localStorage: limpar o browser não zera o bloqueio.
 *
 * Regras (migration 037_login_rate_limit.sql):
 * 1) Até 3 falhas em 1 minuto
 * 2) 3ª falha → bloqueio 5 minutos
 * 3) Após 5 min → 1 tentativa extra
 * 4) Extra falhou → bloqueio 24 horas
 * 5) Sucesso → zera histórico
 */

import { supabase } from "../lib/supabase";

export type LoginBlockResult =
  | { blocked: false; attemptsLeft?: number | null }
  | { blocked: true; message: string; remainingMs: number };

type RpcPayload = {
  allowed?: boolean;
  message?: string | null;
  remaining_ms?: number | null;
  attempts_left?: number | null;
};

function mapRpc(data: unknown): LoginBlockResult & { attemptsLeft?: number | null } {
  const p = (data ?? {}) as RpcPayload;
  if (p.allowed === false) {
    return {
      blocked: true,
      message: p.message || "Login temporariamente bloqueado. Tente mais tarde.",
      remainingMs: typeof p.remaining_ms === "number" ? p.remaining_ms : 0,
      attemptsLeft: 0,
    };
  }
  return {
    blocked: false,
    attemptsLeft: typeof p.attempts_left === "number" ? p.attempts_left : null,
  };
}

/** Verifica no servidor se o e-mail pode tentar login agora. */
export async function checkLoginAllowed(email: string): Promise<LoginBlockResult> {
  const { data, error } = await supabase.rpc("check_login_allowed", {
    p_email: email.trim(),
  });

  if (error) {
    // Se a migration ainda não rodou, não impede o login (só loga).
    console.warn("check_login_allowed:", error.message);
    return { blocked: false };
  }

  return mapRpc(data);
}

/** Registra falha de login no servidor e devolve o novo estado. */
export async function recordLoginFailure(email: string): Promise<LoginBlockResult> {
  const { data, error } = await supabase.rpc("record_login_failure", {
    p_email: email.trim(),
  });

  if (error) {
    console.warn("record_login_failure:", error.message);
    return {
      blocked: false,
    };
  }

  return mapRpc(data);
}

/** Limpa o histórico após login bem-sucedido. */
export async function clearLoginFailures(email: string): Promise<void> {
  const { error } = await supabase.rpc("clear_login_failures", {
    p_email: email.trim(),
  });
  if (error) {
    console.warn("clear_login_failures:", error.message);
  }
}

/** Texto de dica com tentativas restantes (quando ainda não bloqueou). */
export function formatAttemptsHint(attemptsLeft: number | null | undefined): string | null {
  if (attemptsLeft == null || attemptsLeft >= 3) return null;
  if (attemptsLeft <= 0) return null;
  return attemptsLeft === 1
    ? "Resta 1 tentativa antes do bloqueio temporário."
    : `Restam ${attemptsLeft} tentativas antes do bloqueio temporário.`;
}
