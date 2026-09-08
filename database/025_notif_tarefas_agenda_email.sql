-- 025_notif_tarefas_agenda_email.sql
-- Notificações no sininho para o colaborador que marcou:
--   - compromisso na agenda (ao criar + lembrete no dia)
--   - tarefa com prazo (ao criar com prazo + lembrete no dia)
-- Opcional: e-mail via Edge Function (configure a URL/chave abaixo).
--
-- Rode no SQL Editor do Supabase.

-- ---------------------------------------------------------------------------
-- 1) Novos tipos de notificação
-- ---------------------------------------------------------------------------
ALTER TABLE public.notificacoes DROP CONSTRAINT IF EXISTS valid_tipo_notif;
ALTER TABLE public.notificacoes ADD CONSTRAINT valid_tipo_notif CHECK (
  tipo IN (
    'mudanca_status',
    'nova_interacao',
    'recado_admin',
    'lembrete_boleto',
    'lembrete_boleto_rematricula',
    'compromisso_agenda',   -- ao criar o compromisso
    'lembrete_agenda',      -- no dia do compromisso
    'tarefa_prazo',         -- ao criar tarefa com prazo
    'lembrete_tarefa'       -- no dia do prazo da tarefa
  )
);

-- Evita lembrete diário duplicado por item (usa aluno_id + data quando possível)
CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_lembrete_agenda_unica
  ON public.notificacoes (para_user_id, tipo, referencia, aluno_id)
  WHERE tipo = 'lembrete_agenda';

CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_lembrete_tarefa_unica
  ON public.notificacoes (para_user_id, tipo, referencia, aluno_id)
  WHERE tipo = 'lembrete_tarefa';

-- ---------------------------------------------------------------------------
-- 2) Helper: cria notificação + tenta e-mail (se configurado)
-- ---------------------------------------------------------------------------
-- Ajuste estes dois valores para habilitar e-mail (Edge Function).
-- Deixe v_email_url vazio ('') para só usar o sininho.
CREATE OR REPLACE FUNCTION public._config_email_lembrete()
RETURNS TABLE (url text, service_key text)
LANGUAGE sql
STABLE
AS $$
  SELECT
    -- Ex.: 'https://SEU_REF.supabase.co/functions/v1/enviar-email-lembrete'
    ''::text AS url,
    -- Service role (depois de rotacionar a chave que vazou no trigger antigo)
    ''::text AS service_key;
$$;

CREATE OR REPLACE FUNCTION public.criar_notif_e_email(
  p_para_user_id UUID,
  p_tipo TEXT,
  p_titulo TEXT,
  p_corpo TEXT,
  p_aluno_id UUID DEFAULT NULL,
  p_referencia DATE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_email TEXT;
  v_nome TEXT;
  v_url TEXT;
  v_key TEXT;
BEGIN
  INSERT INTO public.notificacoes (
    para_user_id, tipo, titulo, corpo, aluno_id, referencia
  ) VALUES (
    p_para_user_id, p_tipo, p_titulo, p_corpo, p_aluno_id, p_referencia
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  -- Se deu conflito no índice único (lembrete já existia), não reenvia
  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT c.url, c.service_key INTO v_url, v_key
  FROM public._config_email_lembrete() c;

  IF v_url IS NULL OR btrim(v_url) = '' OR v_key IS NULL OR btrim(v_key) = '' THEN
    RETURN v_id; -- só sininho
  END IF;

  SELECT email, name INTO v_email, v_nome
  FROM public.profiles
  WHERE id = p_para_user_id;

  IF v_email IS NULL OR btrim(v_email) = '' THEN
    RETURN v_id;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body := jsonb_build_object(
        'to', v_email,
        'nome', v_nome,
        'tipo', p_tipo,
        'titulo', p_titulo,
        'corpo', p_corpo,
        'aluno_id', p_aluno_id
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Não quebra o fluxo da agenda/tarefa se o e-mail falhar
    RAISE WARNING 'Falha ao enfileirar e-mail de lembrete: %', SQLERRM;
  END;

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) Triggers: ao CRIAR compromisso na agenda → sininho do dono
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_notif_agenda_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aluno_nome TEXT;
  v_titulo TEXT;
  v_corpo TEXT;
BEGIN
  SELECT nome INTO v_aluno_nome FROM public.alunos WHERE id = NEW.aluno_id;

  v_titulo := 'Compromisso agendado';
  v_corpo :=
    'Data: ' || to_char(NEW.data, 'DD/MM/YYYY') ||
    COALESCE(' · Aluno: ' || v_aluno_nome, '') ||
    CASE
      WHEN NEW.comentario IS NOT NULL AND btrim(NEW.comentario) <> ''
      THEN E'\n' || left(NEW.comentario, 200)
      ELSE ''
    END ||
    CASE
      WHEN NEW.ticket IS NOT NULL AND btrim(NEW.ticket) <> ''
      THEN E'\nTicket: ' || NEW.ticket
      ELSE ''
    END;

  PERFORM public.criar_notif_e_email(
    NEW.user_id,
    'compromisso_agenda',
    v_titulo,
    v_corpo,
    NEW.aluno_id,
    NEW.data
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_engajamento_agenda_insert ON public.engajamento_agenda;
CREATE TRIGGER trg_notif_engajamento_agenda_insert
  AFTER INSERT ON public.engajamento_agenda
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notif_agenda_insert();

DROP TRIGGER IF EXISTS trg_notif_rematricula_agenda_insert ON public.rematricula_agenda;
CREATE TRIGGER trg_notif_rematricula_agenda_insert
  AFTER INSERT ON public.rematricula_agenda
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notif_agenda_insert();

-- ---------------------------------------------------------------------------
-- 4) Triggers: ao CRIAR tarefa COM prazo → sininho do dono
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_notif_tarefa_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aluno_nome TEXT;
  v_corpo TEXT;
BEGIN
  IF NEW.prazo IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.aluno_id IS NOT NULL THEN
    SELECT nome INTO v_aluno_nome FROM public.alunos WHERE id = NEW.aluno_id;
  END IF;

  v_corpo :=
    'Prazo: ' || to_char(NEW.prazo, 'DD/MM/YYYY') ||
    COALESCE(' · Aluno: ' || v_aluno_nome, '');

  PERFORM public.criar_notif_e_email(
    NEW.user_id,
    'tarefa_prazo',
    'Tarefa com prazo: ' || left(NEW.titulo, 80),
    v_corpo,
    NEW.aluno_id,
    NEW.prazo
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_engajamento_tarefa_insert ON public.engajamento_tarefas_pessoais;
CREATE TRIGGER trg_notif_engajamento_tarefa_insert
  AFTER INSERT ON public.engajamento_tarefas_pessoais
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notif_tarefa_insert();

DROP TRIGGER IF EXISTS trg_notif_rematricula_tarefa_insert ON public.rematricula_tarefas_pessoais;
CREATE TRIGGER trg_notif_rematricula_tarefa_insert
  AFTER INSERT ON public.rematricula_tarefas_pessoais
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notif_tarefa_insert();

-- ---------------------------------------------------------------------------
-- 5) Lembrete no DIA do compromisso / prazo (rodar via pg_cron 1x/dia)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.disparar_lembretes_agenda_tarefas()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_aluno_nome TEXT;
BEGIN
  -- Agenda engajamento (hoje)
  FOR r IN
    SELECT a.*
    FROM public.engajamento_agenda a
    WHERE a.data = CURRENT_DATE
  LOOP
    SELECT nome INTO v_aluno_nome FROM public.alunos WHERE id = r.aluno_id;
    PERFORM public.criar_notif_e_email(
      r.user_id,
      'lembrete_agenda',
      'Lembrete: compromisso hoje',
      'Hoje · ' || COALESCE(v_aluno_nome, 'aluno') ||
        CASE WHEN r.comentario IS NOT NULL THEN E'\n' || left(r.comentario, 200) ELSE '' END,
      r.aluno_id,
      r.data
    );
  END LOOP;

  -- Agenda rematrícula (hoje)
  FOR r IN
    SELECT a.*
    FROM public.rematricula_agenda a
    WHERE a.data = CURRENT_DATE
  LOOP
    SELECT nome INTO v_aluno_nome FROM public.alunos WHERE id = r.aluno_id;
    PERFORM public.criar_notif_e_email(
      r.user_id,
      'lembrete_agenda',
      'Lembrete: compromisso hoje',
      'Hoje · ' || COALESCE(v_aluno_nome, 'aluno') ||
        CASE WHEN r.comentario IS NOT NULL THEN E'\n' || left(r.comentario, 200) ELSE '' END,
      r.aluno_id,
      r.data
    );
  END LOOP;

  -- Tarefas engajamento com prazo hoje (em andamento)
  FOR r IN
    SELECT t.*
    FROM public.engajamento_tarefas_pessoais t
    WHERE t.prazo = CURRENT_DATE AND t.status = 'em_andamento'
  LOOP
    v_aluno_nome := NULL;
    IF r.aluno_id IS NOT NULL THEN
      SELECT nome INTO v_aluno_nome FROM public.alunos WHERE id = r.aluno_id;
    END IF;
    PERFORM public.criar_notif_e_email(
      r.user_id,
      'lembrete_tarefa',
      'Lembrete: tarefa vence hoje',
      left(r.titulo, 120) || COALESCE(' · ' || v_aluno_nome, ''),
      r.aluno_id,
      r.prazo
    );
  END LOOP;

  -- Tarefas rematrícula com prazo hoje
  FOR r IN
    SELECT t.*
    FROM public.rematricula_tarefas_pessoais t
    WHERE t.prazo = CURRENT_DATE AND t.status = 'em_andamento'
  LOOP
    v_aluno_nome := NULL;
    IF r.aluno_id IS NOT NULL THEN
      SELECT nome INTO v_aluno_nome FROM public.alunos WHERE id = r.aluno_id;
    END IF;
    PERFORM public.criar_notif_e_email(
      r.user_id,
      'lembrete_tarefa',
      'Lembrete: tarefa vence hoje',
      left(r.titulo, 120) || COALESCE(' · ' || v_aluno_nome, ''),
      r.aluno_id,
      r.prazo
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.disparar_lembretes_agenda_tarefas() TO authenticated;

-- Agendar no Supabase (pg_cron) — rode UMA vez no SQL Editor se ainda não existir:
-- SELECT cron.schedule(
--   'lembretes-agenda-tarefas-diario',
--   '0 8 * * *',  -- 08:00 todos os dias (horário do servidor; ajuste se precisar)
--   $$SELECT public.disparar_lembretes_agenda_tarefas();$$
-- );
