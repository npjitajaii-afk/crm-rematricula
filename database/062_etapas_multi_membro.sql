-- =============================================
-- 062 - Etapas com vários colaboradores na mesma ordem
--
-- Antes: UNIQUE (tarefa_id, ordem) → 1 pessoa por etapa.
-- Agora: UNIQUE (tarefa_id, ordem, user_id) → N pessoas na mesma etapa
--        (trabalham em paralelo dentro da etapa).
--
-- A próxima ordem só libera quando TODOS da ordem atual concluírem.
-- =============================================

-- Engajamento
ALTER TABLE public.tarefas_gerais_etapas
  DROP CONSTRAINT IF EXISTS tarefas_gerais_etapas_tarefa_id_ordem_key;

ALTER TABLE public.tarefas_gerais_etapas
  DROP CONSTRAINT IF EXISTS tarefas_gerais_etapas_tarefa_ordem_key;

-- nome padrão do UNIQUE (tarefa_id, ordem) pode variar
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'tarefas_gerais_etapas'
      AND c.contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.tarefas_gerais_etapas DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.tarefas_gerais_etapas
  ADD CONSTRAINT tarefas_gerais_etapas_tarefa_ordem_user_key
  UNIQUE (tarefa_id, ordem, user_id);

CREATE INDEX IF NOT EXISTS idx_tge_tarefa_ordem
  ON public.tarefas_gerais_etapas(tarefa_id, ordem);

-- Rematrícula
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'rematricula_tarefas_gerais_etapas'
      AND c.contype = 'u'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.rematricula_tarefas_gerais_etapas DROP CONSTRAINT IF EXISTS %I',
      r.conname
    );
  END LOOP;
END $$;

ALTER TABLE public.rematricula_tarefas_gerais_etapas
  ADD CONSTRAINT rematricula_tarefas_gerais_etapas_tarefa_ordem_user_key
  UNIQUE (tarefa_id, ordem, user_id);

CREATE INDEX IF NOT EXISTS idx_rtge_tarefa_ordem
  ON public.rematricula_tarefas_gerais_etapas(tarefa_id, ordem);

-- ========== Concluir etapa: libera próxima só se todos da ordem atual terminaram ==========

CREATE OR REPLACE FUNCTION public.concluir_etapa_tarefa_geral(
  p_etapa_id UUID,
  p_tabela TEXT DEFAULT 'engajamento'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_user_id UUID;
  v_tarefa_id UUID;
  v_ordem INTEGER;
  v_status VARCHAR;
  v_polo UUID;
  v_pendentes INTEGER;
BEGIN
  IF p_tabela = 'rematricula' THEN
    SELECT user_id, tarefa_id, ordem, status, polo_id
      INTO v_user_id, v_tarefa_id, v_ordem, v_status, v_polo
    FROM public.rematricula_tarefas_gerais_etapas
    WHERE id = p_etapa_id;

    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'Etapa não encontrada';
    END IF;

    IF v_user_id IS DISTINCT FROM v_uid AND NOT (
      public.is_admin() AND public.mesmo_polo_do_usuario(v_polo)
    ) THEN
      RAISE EXCEPTION 'Só o responsável (ou gestor do polo) pode concluir a etapa';
    END IF;

    IF v_status = 'bloqueada' THEN
      RAISE EXCEPTION 'Etapa ainda bloqueada. Conclua a anterior primeiro.';
    END IF;

    IF v_status = 'concluida' THEN
      RETURN;
    END IF;

    UPDATE public.rematricula_tarefas_gerais_etapas
    SET status = 'concluida',
        progresso_pct = 100,
        concluida_em = NOW(),
        updated_at = NOW()
    WHERE id = p_etapa_id;

    -- Só libera ordem+1 se ninguém da ordem atual ficou pendente/em_andamento
    SELECT COUNT(*) INTO v_pendentes
    FROM public.rematricula_tarefas_gerais_etapas
    WHERE tarefa_id = v_tarefa_id
      AND ordem = v_ordem
      AND status <> 'concluida';

    IF v_pendentes = 0 THEN
      UPDATE public.rematricula_tarefas_gerais_etapas
      SET status = 'pendente',
          updated_at = NOW()
      WHERE tarefa_id = v_tarefa_id
        AND ordem = v_ordem + 1
        AND status = 'bloqueada';
    END IF;

  ELSE
    SELECT user_id, tarefa_id, ordem, status, polo_id
      INTO v_user_id, v_tarefa_id, v_ordem, v_status, v_polo
    FROM public.tarefas_gerais_etapas
    WHERE id = p_etapa_id;

    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'Etapa não encontrada';
    END IF;

    IF v_user_id IS DISTINCT FROM v_uid AND NOT (
      public.is_admin() AND public.mesmo_polo_do_usuario(v_polo)
    ) THEN
      RAISE EXCEPTION 'Só o responsável (ou gestor do polo) pode concluir a etapa';
    END IF;

    IF v_status = 'bloqueada' THEN
      RAISE EXCEPTION 'Etapa ainda bloqueada. Conclua a anterior primeiro.';
    END IF;

    IF v_status = 'concluida' THEN
      RETURN;
    END IF;

    UPDATE public.tarefas_gerais_etapas
    SET status = 'concluida',
        progresso_pct = 100,
        concluida_em = NOW(),
        updated_at = NOW()
    WHERE id = p_etapa_id;

    SELECT COUNT(*) INTO v_pendentes
    FROM public.tarefas_gerais_etapas
    WHERE tarefa_id = v_tarefa_id
      AND ordem = v_ordem
      AND status <> 'concluida';

    IF v_pendentes = 0 THEN
      UPDATE public.tarefas_gerais_etapas
      SET status = 'pendente',
          updated_at = NOW()
      WHERE tarefa_id = v_tarefa_id
        AND ordem = v_ordem + 1
        AND status = 'bloqueada';
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.concluir_etapa_tarefa_geral(UUID, TEXT) TO authenticated;

COMMENT ON CONSTRAINT tarefas_gerais_etapas_tarefa_ordem_user_key
  ON public.tarefas_gerais_etapas IS
  'Permite vários colaboradores na mesma ordem (etapa paralela interna).';
