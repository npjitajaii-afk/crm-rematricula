-- =============================================
-- 059 - Recálculo automático da meta das tarefas gerais
--
-- Rode DEPOIS de 058.
--
-- 1) Função que recalcula alunos_concluidos de todos os membros
--    em tarefas com status_meta (período data_inicio → data_fim)
-- 2) Trigger: ao mudar status do aluno, atualiza metas do responsável
-- 3) (Opcional) agendar no pg_cron a cada hora — instrução no final
-- =============================================

-- ========== 1. Recalcula um membro específico ==========

CREATE OR REPLACE FUNCTION public.recalcular_meta_membro_tarefa(
  p_membro_id UUID,
  p_tabela TEXT DEFAULT 'engajamento'  -- 'engajamento' | 'rematricula'
)
RETURNS INTEGER  -- retorna o novo contador
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_status_meta VARCHAR;
  v_data_inicio DATE;
  v_data_fim DATE;
  v_area VARCHAR;
  v_count INTEGER;
BEGIN
  IF p_tabela = 'rematricula' THEN
    SELECT m.user_id, t.status_meta, t.data_inicio, t.data_fim
      INTO v_user_id, v_status_meta, v_data_inicio, v_data_fim
    FROM public.rematricula_tarefas_gerais_membros m
    JOIN public.rematricula_tarefas_gerais t ON t.id = m.tarefa_id
    WHERE m.id = p_membro_id
      AND t.ativo IS DISTINCT FROM false;

    IF v_user_id IS NULL OR v_status_meta IS NULL THEN
      RETURN NULL;
    END IF;

    v_count := public.contar_alunos_meta_tarefa(
      v_user_id, v_status_meta, 'rematricula', v_data_inicio, v_data_fim
    );

    UPDATE public.rematricula_tarefas_gerais_membros
    SET alunos_concluidos = v_count,
        updated_at = NOW()
    WHERE id = p_membro_id;

  ELSE
    SELECT m.user_id, t.status_meta, t.data_inicio, t.data_fim
      INTO v_user_id, v_status_meta, v_data_inicio, v_data_fim
    FROM public.tarefas_gerais_membros m
    JOIN public.tarefas_gerais t ON t.id = m.tarefa_id
    WHERE m.id = p_membro_id
      AND t.ativo IS DISTINCT FROM false;

    IF v_user_id IS NULL OR v_status_meta IS NULL THEN
      RETURN NULL;
    END IF;

    v_count := public.contar_alunos_meta_tarefa(
      v_user_id, v_status_meta, 'engajamento', v_data_inicio, v_data_fim
    );

    UPDATE public.tarefas_gerais_membros
    SET alunos_concluidos = v_count,
        updated_at = NOW()
    WHERE id = p_membro_id;
  END IF;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalcular_meta_membro_tarefa(UUID, TEXT) TO authenticated;

-- ========== 2. Recalcula todas as metas ativas (job / manual) ==========

CREATE OR REPLACE FUNCTION public.recalcular_todas_metas_tarefas_gerais()
RETURNS TABLE (
  area TEXT,
  membros_atualizados INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  n_eng INTEGER := 0;
  n_rem INTEGER := 0;
BEGIN
  -- Engajamento
  FOR r IN
    SELECT m.id
    FROM public.tarefas_gerais_membros m
    JOIN public.tarefas_gerais t ON t.id = m.tarefa_id
    WHERE t.status_meta IS NOT NULL
      AND t.ativo IS DISTINCT FROM false
  LOOP
    PERFORM public.recalcular_meta_membro_tarefa(r.id, 'engajamento');
    n_eng := n_eng + 1;
  END LOOP;

  -- Rematrícula
  FOR r IN
    SELECT m.id
    FROM public.rematricula_tarefas_gerais_membros m
    JOIN public.rematricula_tarefas_gerais t ON t.id = m.tarefa_id
    WHERE t.status_meta IS NOT NULL
      AND t.ativo IS DISTINCT FROM false
  LOOP
    PERFORM public.recalcular_meta_membro_tarefa(r.id, 'rematricula');
    n_rem := n_rem + 1;
  END LOOP;

  area := 'engajamento';
  membros_atualizados := n_eng;
  RETURN NEXT;

  area := 'rematricula';
  membros_atualizados := n_rem;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalcular_todas_metas_tarefas_gerais() TO authenticated;

-- ========== 3. Recalcula metas de um colaborador (usado no trigger) ==========

CREATE OR REPLACE FUNCTION public.recalcular_metas_do_colaborador(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT m.id
    FROM public.tarefas_gerais_membros m
    JOIN public.tarefas_gerais t ON t.id = m.tarefa_id
    WHERE m.user_id = p_user_id
      AND t.status_meta IS NOT NULL
      AND t.ativo IS DISTINCT FROM false
  LOOP
    PERFORM public.recalcular_meta_membro_tarefa(r.id, 'engajamento');
  END LOOP;

  FOR r IN
    SELECT m.id
    FROM public.rematricula_tarefas_gerais_membros m
    JOIN public.rematricula_tarefas_gerais t ON t.id = m.tarefa_id
    WHERE m.user_id = p_user_id
      AND t.status_meta IS NOT NULL
      AND t.ativo IS DISTINCT FROM false
  LOOP
    PERFORM public.recalcular_meta_membro_tarefa(r.id, 'rematricula');
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalcular_metas_do_colaborador(UUID) TO authenticated;

-- ========== 4. Trigger: aluno mudou de status → atualiza metas do responsável ==========

CREATE OR REPLACE FUNCTION public.trg_aluno_recalcula_meta_tarefa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só age se status ou responsável mudou
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IS NOT DISTINCT FROM NEW.status
       AND OLD.responsavel_id IS NOT DISTINCT FROM NEW.responsavel_id THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Recalcula para o responsável novo
  IF NEW.responsavel_id IS NOT NULL THEN
    PERFORM public.recalcular_metas_do_colaborador(NEW.responsavel_id);
  END IF;

  -- Se mudou de responsável, recalcula o antigo também
  IF TG_OP = 'UPDATE'
     AND OLD.responsavel_id IS NOT NULL
     AND OLD.responsavel_id IS DISTINCT FROM NEW.responsavel_id THEN
    PERFORM public.recalcular_metas_do_colaborador(OLD.responsavel_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_aluno_recalcula_meta_tarefa ON public.alunos;
CREATE TRIGGER trg_aluno_recalcula_meta_tarefa
  AFTER UPDATE OF status, responsavel_id ON public.alunos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_aluno_recalcula_meta_tarefa();

-- Também no INSERT (aluno novo já no status da meta)
DROP TRIGGER IF EXISTS trg_aluno_insert_recalcula_meta ON public.alunos;
CREATE TRIGGER trg_aluno_insert_recalcula_meta
  AFTER INSERT ON public.alunos
  FOR EACH ROW
  WHEN (NEW.responsavel_id IS NOT NULL)
  EXECUTE FUNCTION public.trg_aluno_recalcula_meta_tarefa();

COMMENT ON FUNCTION public.recalcular_todas_metas_tarefas_gerais IS
  'Recalcula alunos_concluidos de todos os membros em tarefas com meta. Pode ser chamada manualmente ou via pg_cron.';

COMMENT ON FUNCTION public.trg_aluno_recalcula_meta_tarefa IS
  'Ao mudar status/responsável do aluno, atualiza automaticamente a meta das tarefas gerais do colaborador.';

-- ========== 5. (Opcional) Agendar no pg_cron ==========
-- Descomente se a extensão pg_cron estiver habilitada no projeto:
--
-- SELECT cron.schedule(
--   'recalcular-metas-tarefas-gerais',
--   '0 * * * *',  -- a cada hora
--   $$SELECT public.recalcular_todas_metas_tarefas_gerais()$$
-- );
--
-- Para rodar na mão agora:
--   SELECT * FROM public.recalcular_todas_metas_tarefas_gerais();