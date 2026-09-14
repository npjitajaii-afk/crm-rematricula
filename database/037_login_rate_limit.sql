-- =============================================
-- 037 - Rate limit de login (servidor / banco)
--
-- Regras (por e-mail, normalizado em minúsculas):
--   1) Até 3 falhas em janela de 1 minuto
--   2) Na 3ª falha → bloqueio de 5 minutos
--   3) Após os 5 min → 1 tentativa extra
--   4) Se a extra falhar → bloqueio de 24 horas
--   5) Login com sucesso → zera o histórico
--
-- Rode no SQL Editor do Supabase DEPOIS de 036.
-- Funções SECURITY DEFINER + GRANT para anon,
-- para funcionar na tela de login (sem sessão).
-- =============================================

CREATE TABLE IF NOT EXISTS public.login_rate_limits (
  email_norm text PRIMARY KEY,
  fail_timestamps timestamptz[] NOT NULL DEFAULT '{}',
  lock_until timestamptz NULL,
  extra_attempt_used boolean NOT NULL DEFAULT false,
  hard_lock boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.login_rate_limits IS
  'Controle de tentativas de login falhas por e-mail (rate limit).';

ALTER TABLE public.login_rate_limits ENABLE ROW LEVEL SECURITY;

-- Ninguém acessa a tabela direto pelo client; só via RPCs.
DROP POLICY IF EXISTS login_rate_limits_no_direct ON public.login_rate_limits;
CREATE POLICY login_rate_limits_no_direct
  ON public.login_rate_limits
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

-- ---------------------------------------------
-- Helper: normaliza e-mail
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_login_email(p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(coalesce(p_email, '')));
$$;

-- ---------------------------------------------
-- check_login_allowed(email) → json
-- { allowed: bool, message: text|null, remaining_ms: number|null, attempts_left: number|null }
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION public.check_login_allowed(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := public.normalize_login_email(p_email);
  v_row public.login_rate_limits%ROWTYPE;
  v_now timestamptz := now();
  v_remaining_ms bigint;
  v_fails timestamptz[];
  v_attempts_left int;
BEGIN
  IF v_email = '' THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'message', 'Informe um e-mail válido.',
      'remaining_ms', null,
      'attempts_left', null
    );
  END IF;

  SELECT * INTO v_row
  FROM public.login_rate_limits
  WHERE email_norm = v_email;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'message', null,
      'remaining_ms', null,
      'attempts_left', 3
    );
  END IF;

  -- Hard lock (24h) ou bloqueio de 5 min ainda ativo
  IF v_row.lock_until IS NOT NULL AND v_row.lock_until > v_now THEN
    v_remaining_ms := GREATEST(0, (EXTRACT(EPOCH FROM (v_row.lock_until - v_now)) * 1000)::bigint);
    IF v_row.hard_lock THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'message', format(
          'Muitas tentativas incorretas. Tente novamente em %s.',
          CASE
            WHEN v_remaining_ms >= 3600000 THEN
              (v_remaining_ms / 3600000)::text || 'h'
            WHEN v_remaining_ms >= 60000 THEN
              ((v_remaining_ms + 59999) / 60000)::text || ' minuto(s)'
            ELSE
              ((v_remaining_ms + 999) / 1000)::text || ' segundo(s)'
          END
        ),
        'remaining_ms', v_remaining_ms,
        'attempts_left', 0
      );
    END IF;

    RETURN jsonb_build_object(
      'allowed', false,
      'message', format(
        'Muitas tentativas. Aguarde %s para tentar de novo.',
        CASE
          WHEN v_remaining_ms >= 60000 THEN
            ((v_remaining_ms + 59999) / 60000)::text || ' minuto(s)'
          ELSE
            ((v_remaining_ms + 999) / 1000)::text || ' segundo(s)'
        END
      ),
      'remaining_ms', v_remaining_ms,
      'attempts_left', 0
    );
  END IF;

  -- Lock expirou: se era hard lock, limpa linha
  IF v_row.lock_until IS NOT NULL AND v_row.lock_until <= v_now AND v_row.hard_lock THEN
    DELETE FROM public.login_rate_limits WHERE email_norm = v_email;
    RETURN jsonb_build_object(
      'allowed', true,
      'message', null,
      'remaining_ms', null,
      'attempts_left', 3
    );
  END IF;

  -- Janela de 1 min: conta falhas recentes
  v_fails := ARRAY(
    SELECT ts
    FROM unnest(coalesce(v_row.fail_timestamps, '{}'::timestamptz[])) AS ts
    WHERE ts > v_now - interval '1 minute'
  );
  v_attempts_left := GREATEST(0, 3 - coalesce(array_length(v_fails, 1), 0));

  -- Após bloqueio de 5 min expirado e ainda não usou a extra → 1 tentativa
  IF v_row.lock_until IS NOT NULL
     AND v_row.lock_until <= v_now
     AND v_row.extra_attempt_used = false
     AND v_row.hard_lock = false THEN
    v_attempts_left := 1;
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'message', null,
    'remaining_ms', null,
    'attempts_left', v_attempts_left
  );
END;
$$;

-- ---------------------------------------------
-- record_login_failure(email) → json (mesmo formato)
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION public.record_login_failure(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := public.normalize_login_email(p_email);
  v_row public.login_rate_limits%ROWTYPE;
  v_now timestamptz := now();
  v_fails timestamptz[];
  v_remaining_ms bigint;
BEGIN
  IF v_email = '' THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'message', 'Informe um e-mail válido.',
      'remaining_ms', null,
      'attempts_left', 0
    );
  END IF;

  SELECT * INTO v_row
  FROM public.login_rate_limits
  WHERE email_norm = v_email;

  IF NOT FOUND THEN
    v_row.email_norm := v_email;
    v_row.fail_timestamps := ARRAY[]::timestamptz[];
    v_row.lock_until := NULL;
    v_row.extra_attempt_used := false;
    v_row.hard_lock := false;
  END IF;

  -- Ainda bloqueado → só devolve o estado
  IF v_row.lock_until IS NOT NULL AND v_row.lock_until > v_now THEN
    v_remaining_ms := GREATEST(0, (EXTRACT(EPOCH FROM (v_row.lock_until - v_now)) * 1000)::bigint);
    RETURN jsonb_build_object(
      'allowed', false,
      'message', CASE
        WHEN v_row.hard_lock THEN
          format('Muitas tentativas incorretas. Tente novamente em %s.',
            CASE WHEN v_remaining_ms >= 3600000 THEN (v_remaining_ms / 3600000)::text || 'h'
                 WHEN v_remaining_ms >= 60000 THEN ((v_remaining_ms + 59999) / 60000)::text || ' minuto(s)'
                 ELSE ((v_remaining_ms + 999) / 1000)::text || ' segundo(s)' END)
        ELSE
          format('Muitas tentativas. Aguarde %s para tentar de novo.',
            CASE WHEN v_remaining_ms >= 60000 THEN ((v_remaining_ms + 59999) / 60000)::text || ' minuto(s)'
                 ELSE ((v_remaining_ms + 999) / 1000)::text || ' segundo(s)' END)
      END,
      'remaining_ms', v_remaining_ms,
      'attempts_left', 0
    );
  END IF;

  -- Hard lock expirado → recomeça
  IF v_row.hard_lock AND v_row.lock_until IS NOT NULL AND v_row.lock_until <= v_now THEN
    v_row.fail_timestamps := ARRAY[]::timestamptz[];
    v_row.lock_until := NULL;
    v_row.extra_attempt_used := false;
    v_row.hard_lock := false;
  END IF;

  -- Tentativa extra (pós bloqueio 5 min) que falhou → 24 h
  IF v_row.lock_until IS NOT NULL
     AND v_row.lock_until <= v_now
     AND v_row.extra_attempt_used = false
     AND v_row.hard_lock = false THEN
    INSERT INTO public.login_rate_limits AS t (
      email_norm, fail_timestamps, lock_until, extra_attempt_used, hard_lock, updated_at
    ) VALUES (
      v_email, '{}', v_now + interval '24 hours', true, true, v_now
    )
    ON CONFLICT (email_norm) DO UPDATE SET
      fail_timestamps = '{}',
      lock_until = excluded.lock_until,
      extra_attempt_used = true,
      hard_lock = true,
      updated_at = excluded.updated_at;

    RETURN jsonb_build_object(
      'allowed', false,
      'message', 'Tentativa extra falhou. Acesso bloqueado por 24 horas.',
      'remaining_ms', 24 * 60 * 60 * 1000,
      'attempts_left', 0
    );
  END IF;

  -- Falha normal na janela de 1 minuto
  v_fails := ARRAY(
    SELECT ts
    FROM unnest(coalesce(v_row.fail_timestamps, '{}'::timestamptz[])) AS ts
    WHERE ts > v_now - interval '1 minute'
  );
  v_fails := array_append(v_fails, v_now);

  IF coalesce(array_length(v_fails, 1), 0) >= 3 THEN
    INSERT INTO public.login_rate_limits AS t (
      email_norm, fail_timestamps, lock_until, extra_attempt_used, hard_lock, updated_at
    ) VALUES (
      v_email, '{}', v_now + interval '5 minutes', false, false, v_now
    )
    ON CONFLICT (email_norm) DO UPDATE SET
      fail_timestamps = '{}',
      lock_until = excluded.lock_until,
      extra_attempt_used = false,
      hard_lock = false,
      updated_at = excluded.updated_at;

    RETURN jsonb_build_object(
      'allowed', false,
      'message', '3 tentativas incorretas. Aguarde 5 minutos para tentar novamente.',
      'remaining_ms', 5 * 60 * 1000,
      'attempts_left', 0
    );
  END IF;

  INSERT INTO public.login_rate_limits AS t (
    email_norm, fail_timestamps, lock_until, extra_attempt_used, hard_lock, updated_at
  ) VALUES (
    v_email, v_fails, NULL, false, false, v_now
  )
  ON CONFLICT (email_norm) DO UPDATE SET
    fail_timestamps = excluded.fail_timestamps,
    lock_until = NULL,
    extra_attempt_used = false,
    hard_lock = false,
    updated_at = excluded.updated_at;

  RETURN jsonb_build_object(
    'allowed', true,
    'message', null,
    'remaining_ms', null,
    'attempts_left', GREATEST(0, 3 - coalesce(array_length(v_fails, 1), 0))
  );
END;
$$;

-- ---------------------------------------------
-- clear_login_failures(email) — após login OK
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION public.clear_login_failures(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := public.normalize_login_email(p_email);
BEGIN
  IF v_email = '' THEN
    RETURN;
  END IF;
  DELETE FROM public.login_rate_limits WHERE email_norm = v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.normalize_login_email(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_login_allowed(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_login_failure(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_login_failures(text) TO anon, authenticated;
