-- =============================================
-- 054 - Painel de tarefas: progresso, meta semanal, multi-colaborador
--
-- Regras:
-- - Admin/creator cria tarefas com 1 ou N colaboradores
-- - Cada membro tem progresso próprio (%, alunos na meta)
-- - Colaborador SÓ vê a própria linha de progresso
-- - Admin/creator vê progresso de todos do polo
-- - Meta semanal: número de alunos em um status (status_meta)
-- =============================================

-- ---- Engajamento: tarefas_gerais ----
ALTER TABLE public.tarefas_gerais
  ADD COLUMN IF NOT EXISTS polo_id UUID REFERENCES public.polos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS meta_semanal INTEGER CHECK (meta_semanal IS NULL OR meta_semanal > 0),
  ADD COLUMN IF NOT EXISTS status_meta VARCHAR(60),
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true;

-- Backfill polo a partir do criador
UPDATE public.tarefas_gerais t
SET polo_id = p.polo_id
FROM public.profiles p
WHERE t.criado_por = p.id AND t.polo_id IS NULL;

CREATE TABLE IF NOT EXISTS public.tarefas_gerais_membros (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tarefa_id UUID NOT NULL REFERENCES public.tarefas_gerais(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  progresso_pct INTEGER NOT NULL DEFAULT 0 CHECK (progresso_pct >= 0 AND progresso_pct <= 100),
  alunos_concluidos INTEGER NOT NULL DEFAULT 0 CHECK (alunos_concluidos >= 0),
  observacao TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tarefa_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tgm_tarefa ON public.tarefas_gerais_membros(tarefa_id);
CREATE INDEX IF NOT EXISTS idx_tgm_user ON public.tarefas_gerais_membros(user_id);

-- Migrar destinatários antigos para membros
INSERT INTO public.tarefas_gerais_membros (tarefa_id, user_id)
SELECT id, para_user_id FROM public.tarefas_gerais
WHERE para_user_id IS NOT NULL
ON CONFLICT (tarefa_id, user_id) DO NOTHING;

ALTER TABLE public.tarefas_gerais_membros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros ver proprio ou gestor" ON public.tarefas_gerais_membros;
CREATE POLICY "Membros ver proprio ou gestor"
  ON public.tarefas_gerais_membros FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Membro atualiza proprio progresso" ON public.tarefas_gerais_membros;
CREATE POLICY "Membro atualiza proprio progresso"
  ON public.tarefas_gerais_membros FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Admin gerencia membros" ON public.tarefas_gerais_membros;
CREATE POLICY "Admin gerencia membros"
  ON public.tarefas_gerais_membros FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Atualizar policies de tarefas_gerais SELECT: admin ou membro
DROP POLICY IF EXISTS "Admin ve todas tarefas gerais" ON public.tarefas_gerais;
DROP POLICY IF EXISTS "Colaborador ve tarefas delegadas" ON public.tarefas_gerais;
CREATE POLICY "Ver tarefas gerais"
  ON public.tarefas_gerais FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR para_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.tarefas_gerais_membros m
      WHERE m.tarefa_id = id AND m.user_id = auth.uid()
    )
  );

-- ---- Rematrícula: espelho ----
ALTER TABLE public.rematricula_tarefas_gerais
  ADD COLUMN IF NOT EXISTS polo_id UUID REFERENCES public.polos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS meta_semanal INTEGER CHECK (meta_semanal IS NULL OR meta_semanal > 0),
  ADD COLUMN IF NOT EXISTS status_meta VARCHAR(60),
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true;

UPDATE public.rematricula_tarefas_gerais t
SET polo_id = p.polo_id
FROM public.profiles p
WHERE t.criado_por = p.id AND t.polo_id IS NULL;

CREATE TABLE IF NOT EXISTS public.rematricula_tarefas_gerais_membros (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tarefa_id UUID NOT NULL REFERENCES public.rematricula_tarefas_gerais(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  progresso_pct INTEGER NOT NULL DEFAULT 0 CHECK (progresso_pct >= 0 AND progresso_pct <= 100),
  alunos_concluidos INTEGER NOT NULL DEFAULT 0 CHECK (alunos_concluidos >= 0),
  observacao TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tarefa_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_rtgm_tarefa ON public.rematricula_tarefas_gerais_membros(tarefa_id);
CREATE INDEX IF NOT EXISTS idx_rtgm_user ON public.rematricula_tarefas_gerais_membros(user_id);

INSERT INTO public.rematricula_tarefas_gerais_membros (tarefa_id, user_id)
SELECT id, para_user_id FROM public.rematricula_tarefas_gerais
WHERE para_user_id IS NOT NULL
ON CONFLICT (tarefa_id, user_id) DO NOTHING;

ALTER TABLE public.rematricula_tarefas_gerais_membros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros ver proprio ou gestor rem" ON public.rematricula_tarefas_gerais_membros;
CREATE POLICY "Membros ver proprio ou gestor rem"
  ON public.rematricula_tarefas_gerais_membros FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Membro atualiza proprio progresso rem" ON public.rematricula_tarefas_gerais_membros;
CREATE POLICY "Membro atualiza proprio progresso rem"
  ON public.rematricula_tarefas_gerais_membros FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Admin gerencia membros rem" ON public.rematricula_tarefas_gerais_membros;
CREATE POLICY "Admin gerencia membros rem"
  ON public.rematricula_tarefas_gerais_membros FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin ve tarefas gerais rematricula" ON public.rematricula_tarefas_gerais;
DROP POLICY IF EXISTS "Colaborador ve tarefas gerais rematricula" ON public.rematricula_tarefas_gerais;
CREATE POLICY "Ver tarefas gerais rematricula"
  ON public.rematricula_tarefas_gerais FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR para_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.rematricula_tarefas_gerais_membros m
      WHERE m.tarefa_id = id AND m.user_id = auth.uid()
    )
  );

-- Conta alunos do colaborador no status da meta (semana atual, próprio polo)
CREATE OR REPLACE FUNCTION public.contar_alunos_meta_tarefa(
  p_user_id UUID,
  p_status VARCHAR,
  p_area VARCHAR DEFAULT NULL
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
    AND a.updated_at >= date_trunc('week', NOW())
    AND public.mesmo_polo_do_usuario(a.polo_id, p_user_id);
$$;

GRANT EXECUTE ON FUNCTION public.contar_alunos_meta_tarefa(UUID, VARCHAR, VARCHAR) TO authenticated;

-- RPC: atualiza progresso do membro logado (e recalcula alunos se tiver status_meta)
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
BEGIN
  IF p_tabela = 'rematricula' THEN
    SELECT m.user_id, t.status_meta INTO v_user_id, v_status_meta
    FROM public.rematricula_tarefas_gerais_membros m
    JOIN public.rematricula_tarefas_gerais t ON t.id = m.tarefa_id
    WHERE m.id = p_membro_id;

    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Membro não encontrado'; END IF;
    IF v_user_id IS DISTINCT FROM v_uid AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Só pode atualizar o próprio progresso';
    END IF;

    IF v_status_meta IS NOT NULL AND p_alunos_concluidos IS NULL THEN
      v_count := public.contar_alunos_meta_tarefa(v_user_id, v_status_meta, 'rematricula');
    ELSE
      v_count := COALESCE(p_alunos_concluidos, 0);
    END IF;

    UPDATE public.rematricula_tarefas_gerais_membros
    SET
      progresso_pct = COALESCE(p_progresso_pct, progresso_pct),
      alunos_concluidos = CASE WHEN p_alunos_concluidos IS NOT NULL THEN p_alunos_concluidos
                               WHEN v_status_meta IS NOT NULL THEN v_count
                               ELSE alunos_concluidos END,
      observacao = COALESCE(NULLIF(trim(p_observacao), ''), observacao),
      updated_at = NOW()
    WHERE id = p_membro_id;
  ELSE
    SELECT m.user_id, t.status_meta INTO v_user_id, v_status_meta
    FROM public.tarefas_gerais_membros m
    JOIN public.tarefas_gerais t ON t.id = m.tarefa_id
    WHERE m.id = p_membro_id;

    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Membro não encontrado'; END IF;
    IF v_user_id IS DISTINCT FROM v_uid AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Só pode atualizar o próprio progresso';
    END IF;

    IF v_status_meta IS NOT NULL AND p_alunos_concluidos IS NULL THEN
      v_count := public.contar_alunos_meta_tarefa(v_user_id, v_status_meta, 'engajamento');
    ELSE
      v_count := COALESCE(p_alunos_concluidos, 0);
    END IF;

    UPDATE public.tarefas_gerais_membros
    SET
      progresso_pct = COALESCE(p_progresso_pct, progresso_pct),
      alunos_concluidos = CASE WHEN p_alunos_concluidos IS NOT NULL THEN p_alunos_concluidos
                               WHEN v_status_meta IS NOT NULL THEN v_count
                               ELSE alunos_concluidos END,
      observacao = COALESCE(NULLIF(trim(p_observacao), ''), observacao),
      updated_at = NOW()
    WHERE id = p_membro_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.atualizar_progresso_tarefa_geral(UUID, INTEGER, INTEGER, TEXT, TEXT) TO authenticated;
