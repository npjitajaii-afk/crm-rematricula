-- =============================================
-- 058 - Notificação no sininho (tarefa geral) + meta por período da tarefa
--
-- Rode DEPOIS de 057.
--
-- 1) Sininho ao criar tarefa geral (cada membro recebe)
-- 2) Sininho ao liberar próxima etapa (responsável da etapa)
-- 3) Contagem da meta usa data_inicio → data_fim da tarefa
--    (não mais só a semana corrente)
-- =============================================

-- ========== 1. Novos tipos de notificação ==========

ALTER TABLE public.notificacoes DROP CONSTRAINT IF EXISTS valid_tipo_notif;
ALTER TABLE public.notificacoes ADD CONSTRAINT valid_tipo_notif CHECK (
  tipo IN (
    'mudanca_status',
    'nova_interacao',
    'recado_admin',
    'lembrete_boleto',
    'lembrete_boleto_rematricula',
    'compromisso_agenda',
    'lembrete_agenda',
    'tarefa_prazo',
    'lembrete_tarefa',
    -- novos (painel de tarefas gerais)
    'tarefa_geral_nova',
    'tarefa_etapa_liberada'
  )
);

-- Evita notificação duplicada de "nova tarefa" para o mesmo membro + mesmo dia
CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_tarefa_geral_nova_unica
  ON public.notificacoes (para_user_id, tipo, referencia, aluno_id)
  WHERE tipo = 'tarefa_geral_nova';

CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_tarefa_etapa_unica
  ON public.notificacoes (para_user_id, tipo, referencia, aluno_id)
  WHERE tipo = 'tarefa_etapa_liberada';

-- ========== 2. Notificar membro ao ser adicionado na tarefa ==========

CREATE OR REPLACE FUNCTION public.trg_notif_membro_tarefa_geral()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_titulo TEXT;
  v_modo TEXT;
  v_data_inicio DATE;
  v_data_fim DATE;
  v_corpo TEXT;
  v_ref DATE;
BEGIN
  -- Engajamento
  SELECT t.titulo, t.modo, t.data_inicio, t.data_fim
    INTO v_titulo, v_modo, v_data_inicio, v_data_fim
  FROM public.tarefas_gerais t
  WHERE t.id = NEW.tarefa_id;

  IF v_titulo IS NULL THEN
    -- Rematrícula
    SELECT t.titulo, t.modo, t.data_inicio, t.data_fim
      INTO v_titulo, v_modo, v_data_inicio, v_data_fim
    FROM public.rematricula_tarefas_gerais t
    WHERE t.id = NEW.tarefa_id;
  END IF;

  IF v_titulo IS NULL THEN
    RETURN NEW;
  END IF;

  v_ref := COALESCE(v_data_fim, v_data_inicio, CURRENT_DATE);

  v_corpo :=
    CASE
      WHEN v_modo = 'sequencial' THEN 'Modo: etapas (sequencial).'
      ELSE 'Modo: paralelo.'
    END
    || CASE
         WHEN v_data_inicio IS NOT NULL AND v_data_fim IS NOT NULL THEN
           E'\nPeríodo: ' || to_char(v_data_inicio, 'DD/MM/YYYY')
           || ' → ' || to_char(v_data_fim, 'DD/MM/YYYY')
         WHEN v_data_fim IS NOT NULL THEN
           E'\nPrazo: ' || to_char(v_data_fim, 'DD/MM/YYYY')
         ELSE ''
       END;

  PERFORM public.criar_notif_e_email(
    NEW.user_id,
    'tarefa_geral_nova',
    'Nova tarefa: ' || left(v_titulo, 80),
    v_corpo,
    NULL,       -- aluno_id
    v_ref       -- referencia (DATE) — dedupe por dia/prazo
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_membro_tg ON public.tarefas_gerais_membros;
CREATE TRIGGER trg_notif_membro_tg
  AFTER INSERT ON public.tarefas_gerais_membros
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notif_membro_tarefa_geral();

DROP TRIGGER IF EXISTS trg_notif_membro_rtg ON public.rematricula_tarefas_gerais_membros;
CREATE TRIGGER trg_notif_membro_rtg
  AFTER INSERT ON public.rematricula_tarefas_gerais_membros
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notif_membro_tarefa_geral();

-- ========== 3. Notificar responsável quando a etapa é liberada ==========

CREATE OR REPLACE FUNCTION public.notif_etapa_liberada(
  p_user_id UUID,
  p_titulo_tarefa TEXT,
  p_titulo_etapa TEXT,
  p_ordem INTEGER,
  p_referencia DATE DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM public.criar_notif_e_email(
    p_user_id,
    'tarefa_etapa_liberada',
    'Sua etapa foi liberada: ' || left(COALESCE(p_titulo_etapa, 'Etapa'), 60),
    'Tarefa: ' || left(COALESCE(p_titulo_tarefa, '—'), 80)
      || E'\nEtapa ' || COALESCE(p_ordem::TEXT, '?') || ': ' || COALESCE(p_titulo_etapa, '—')
      || E'\nVocê já pode começar.',
    NULL,
    COALESCE(p_referencia, CURRENT_DATE)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.notif_etapa_liberada(UUID, TEXT, TEXT, INTEGER, DATE) TO authenticated;

-- Atualiza concluir_etapa para notificar o dono da próxima etapa
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
  v_titulo_tarefa TEXT;
  v_prox_id UUID;
  v_prox_user UUID;
  v_prox_titulo TEXT;
  v_prox_ordem INTEGER;
  v_data_fim DATE;
BEGIN
  IF p_tabela = 'rematricula' THEN
    SELECT e.user_id, e.tarefa_id, e.ordem, e.status, e.polo_id,
           t.titulo, t.data_fim
      INTO v_user_id, v_tarefa_id, v_ordem, v_status, v_polo,
           v_titulo_tarefa, v_data_fim
    FROM public.rematricula_tarefas_gerais_etapas e
    JOIN public.rematricula_tarefas_gerais t ON t.id = e.tarefa_id
    WHERE e.id = p_etapa_id;

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

    UPDATE public.rematricula_tarefas_gerais_etapas
    SET status = 'pendente',
        updated_at = NOW()
    WHERE tarefa_id = v_tarefa_id
      AND ordem = v_ordem + 1
      AND status = 'bloqueada'
    RETURNING id, user_id, titulo, ordem
      INTO v_prox_id, v_prox_user, v_prox_titulo, v_prox_ordem;

    IF v_prox_user IS NOT NULL THEN
      PERFORM public.notif_etapa_liberada(
        v_prox_user,
        v_titulo_tarefa,
        v_prox_titulo,
        v_prox_ordem,
        COALESCE(v_data_fim, CURRENT_DATE)
      );
    END IF;

  ELSE
    SELECT e.user_id, e.tarefa_id, e.ordem, e.status, e.polo_id,
           t.titulo, t.data_fim
      INTO v_user_id, v_tarefa_id, v_ordem, v_status, v_polo,
           v_titulo_tarefa, v_data_fim
    FROM public.tarefas_gerais_etapas e
    JOIN public.tarefas_gerais t ON t.id = e.tarefa_id
    WHERE e.id = p_etapa_id;

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

    UPDATE public.tarefas_gerais_etapas
    SET status = 'pendente',
        updated_at = NOW()
    WHERE tarefa_id = v_tarefa_id
      AND ordem = v_ordem + 1
      AND status = 'bloqueada'
    RETURNING id, user_id, titulo, ordem
      INTO v_prox_id, v_prox_user, v_prox_titulo, v_prox_ordem;

    IF v_prox_user IS NOT NULL THEN
      PERFORM public.notif_etapa_liberada(
        v_prox_user,
        v_titulo_tarefa,
        v_prox_titulo,
        v_prox_ordem,
        COALESCE(v_data_fim, CURRENT_DATE)
      );
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.concluir_etapa_tarefa_geral(UUID, TEXT) TO authenticated;

-- Na criação de etapas: se for a 1ª (pendente), notifica o responsável
CREATE OR REPLACE FUNCTION public.trg_notif_primeira_etapa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_titulo TEXT;
  v_data_fim DATE;
BEGIN
  IF NEW.ordem <> 1 OR NEW.status NOT IN ('pendente', 'em_andamento') THEN
    RETURN NEW;
  END IF;

  SELECT titulo, data_fim INTO v_titulo, v_data_fim
  FROM public.tarefas_gerais WHERE id = NEW.tarefa_id;

  IF v_titulo IS NULL THEN
    SELECT titulo, data_fim INTO v_titulo, v_data_fim
    FROM public.rematricula_tarefas_gerais WHERE id = NEW.tarefa_id;
  END IF;

  PERFORM public.notif_etapa_liberada(
    NEW.user_id,
    v_titulo,
    NEW.titulo,
    NEW.ordem,
    COALESCE(v_data_fim, CURRENT_DATE)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_primeira_etapa ON public.tarefas_gerais_etapas;
CREATE TRIGGER trg_notif_primeira_etapa
  AFTER INSERT ON public.tarefas_gerais_etapas
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notif_primeira_etapa();

DROP TRIGGER IF EXISTS trg_notif_primeira_etapa_rem ON public.rematricula_tarefas_gerais_etapas;
CREATE TRIGGER trg_notif_primeira_etapa_rem
  AFTER INSERT ON public.rematricula_tarefas_gerais_etapas
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notif_primeira_etapa();

-- ========== 4. Meta: contar no período data_inicio → data_fim ==========

-- Postgres não permite alterar defaults com CREATE OR REPLACE: drop primeiro
DROP FUNCTION IF EXISTS public.contar_alunos_meta_tarefa(UUID, VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS public.contar_alunos_meta_tarefa(UUID, CHARACTER VARYING, CHARACTER VARYING);
DROP FUNCTION IF EXISTS public.contar_alunos_meta_tarefa(UUID, VARCHAR, VARCHAR, DATE, DATE);
DROP FUNCTION IF EXISTS public.contar_alunos_meta_tarefa(UUID, CHARACTER VARYING, CHARACTER VARYING, DATE, DATE);

-- Nova assinatura (3 args antigos continuam válidos via DEFAULT NULL nas datas)
CREATE FUNCTION public.contar_alunos_meta_tarefa(
  p_user_id UUID,
  p_status VARCHAR,
  p_area VARCHAR DEFAULT NULL,
  p_data_inicio DATE DEFAULT NULL,
  p_data_fim DATE DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.alunos a
  WHERE a.responsavel_id = p_user_id
    AND a.status = p_status
    AND (p_area IS NULL OR a.area = p_area)
    AND public.mesmo_polo_do_usuario(a.polo_id, p_user_id)
    AND (
      (
        p_data_inicio IS NOT NULL
        AND p_data_fim IS NOT NULL
        AND a.updated_at >= p_data_inicio::TIMESTAMPTZ
        AND a.updated_at < (p_data_fim + 1)::TIMESTAMPTZ
      )
      OR (
        p_data_inicio IS NOT NULL
        AND p_data_fim IS NULL
        AND a.updated_at >= p_data_inicio::TIMESTAMPTZ
      )
      OR (
        p_data_inicio IS NULL
        AND p_data_fim IS NOT NULL
        AND a.updated_at < (p_data_fim + 1)::TIMESTAMPTZ
      )
      OR (
        p_data_inicio IS NULL
        AND p_data_fim IS NULL
        AND a.updated_at >= date_trunc('week', NOW())
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.contar_alunos_meta_tarefa(UUID, VARCHAR, VARCHAR, DATE, DATE) TO authenticated;

-- ========== 5. RPC de progresso usa o período da tarefa ==========

CREATE OR REPLACE FUNCTION public.atualizar_progresso_tarefa_geral(
  p_membro_id UUID,
  p_progresso_pct INTEGER DEFAULT NULL,
  p_alunos_concluidos INTEGER DEFAULT NULL,
  p_observacao TEXT DEFAULT NULL,
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
  v_status_meta VARCHAR;
  v_area VARCHAR;
  v_count INTEGER;
  v_data_inicio DATE;
  v_data_fim DATE;
BEGIN
  IF p_tabela = 'rematricula' THEN
    SELECT m.user_id, t.status_meta, t.data_inicio, t.data_fim
      INTO v_user_id, v_status_meta, v_data_inicio, v_data_fim
    FROM public.rematricula_tarefas_gerais_membros m
    JOIN public.rematricula_tarefas_gerais t ON t.id = m.tarefa_id
    WHERE m.id = p_membro_id;

    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Membro não encontrado'; END IF;
    IF v_user_id IS DISTINCT FROM v_uid AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Só pode atualizar o próprio progresso';
    END IF;

    IF v_status_meta IS NOT NULL AND p_alunos_concluidos IS NULL THEN
      v_count := public.contar_alunos_meta_tarefa(
        v_user_id, v_status_meta, 'rematricula', v_data_inicio, v_data_fim
      );
    ELSE
      v_count := COALESCE(p_alunos_concluidos, 0);
    END IF;

    UPDATE public.rematricula_tarefas_gerais_membros
    SET
      progresso_pct = COALESCE(p_progresso_pct, progresso_pct),
      alunos_concluidos = CASE
        WHEN p_alunos_concluidos IS NOT NULL THEN p_alunos_concluidos
        WHEN v_status_meta IS NOT NULL THEN v_count
        ELSE alunos_concluidos
      END,
      observacao = COALESCE(NULLIF(trim(p_observacao), ''), observacao),
      updated_at = NOW()
    WHERE id = p_membro_id;

  ELSE
    SELECT m.user_id, t.status_meta, t.data_inicio, t.data_fim
      INTO v_user_id, v_status_meta, v_data_inicio, v_data_fim
    FROM public.tarefas_gerais_membros m
    JOIN public.tarefas_gerais t ON t.id = m.tarefa_id
    WHERE m.id = p_membro_id;

    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Membro não encontrado'; END IF;
    IF v_user_id IS DISTINCT FROM v_uid AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Só pode atualizar o próprio progresso';
    END IF;

    IF v_status_meta IS NOT NULL AND p_alunos_concluidos IS NULL THEN
      v_count := public.contar_alunos_meta_tarefa(
        v_user_id, v_status_meta, 'engajamento', v_data_inicio, v_data_fim
      );
    ELSE
      v_count := COALESCE(p_alunos_concluidos, 0);
    END IF;

    UPDATE public.tarefas_gerais_membros
    SET
      progresso_pct = COALESCE(p_progresso_pct, progresso_pct),
      alunos_concluidos = CASE
        WHEN p_alunos_concluidos IS NOT NULL THEN p_alunos_concluidos
        WHEN v_status_meta IS NOT NULL THEN v_count
        ELSE alunos_concluidos
      END,
      observacao = COALESCE(NULLIF(trim(p_observacao), ''), observacao),
      updated_at = NOW()
    WHERE id = p_membro_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.atualizar_progresso_tarefa_geral(UUID, INTEGER, INTEGER, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.contar_alunos_meta_tarefa(UUID, VARCHAR, VARCHAR, DATE, DATE) IS
  'Conta alunos do colaborador no status, no polo dele, no intervalo data_inicio→data_fim da tarefa (ou semana se datas nulas).';

COMMENT ON FUNCTION public.trg_notif_membro_tarefa_geral IS
  'Sininho para cada membro ao ser incluído em tarefa geral (engajamento/rematrícula).';