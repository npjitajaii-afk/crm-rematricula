-- =============================================
-- 057 - Datas (início/fim), modo paralelo/sequencial e etapas
--
-- Rode DEPOIS de 054, 055 e 056.
--
-- O que faz:
-- 1. data_inicio, data_fim, modo nas tarefas gerais (engajamento + rematrícula)
-- 2. Tabelas de etapas com dependência (ordem)
-- 3. Isolamento por polo_id (tarefa e responsável da etapa no mesmo polo)
-- 4. RPC para concluir etapa e desbloquear a próxima
-- =============================================

-- ========== 1. CAMPOS NAS TAREFAS ==========

ALTER TABLE public.tarefas_gerais
  ADD COLUMN IF NOT EXISTS data_inicio DATE,
  ADD COLUMN IF NOT EXISTS data_fim DATE,
  ADD COLUMN IF NOT EXISTS modo VARCHAR(20) NOT NULL DEFAULT 'paralelo'
    CHECK (modo IN ('paralelo', 'sequencial'));

-- Backfill: data_fim = prazo; data_inicio = created_at (dia)
UPDATE public.tarefas_gerais
SET data_fim = prazo
WHERE data_fim IS NULL AND prazo IS NOT NULL;

UPDATE public.tarefas_gerais
SET data_inicio = (created_at AT TIME ZONE 'America/Sao_Paulo')::DATE
WHERE data_inicio IS NULL;

-- Se ainda não tem fim, usa início + 7 dias
UPDATE public.tarefas_gerais
SET data_fim = data_inicio + 7
WHERE data_fim IS NULL AND data_inicio IS NOT NULL;

ALTER TABLE public.rematricula_tarefas_gerais
  ADD COLUMN IF NOT EXISTS data_inicio DATE,
  ADD COLUMN IF NOT EXISTS data_fim DATE,
  ADD COLUMN IF NOT EXISTS modo VARCHAR(20) NOT NULL DEFAULT 'paralelo'
    CHECK (modo IN ('paralelo', 'sequencial'));

UPDATE public.rematricula_tarefas_gerais
SET data_fim = prazo
WHERE data_fim IS NULL AND prazo IS NOT NULL;

UPDATE public.rematricula_tarefas_gerais
SET data_inicio = (created_at AT TIME ZONE 'America/Sao_Paulo')::DATE
WHERE data_inicio IS NULL;

UPDATE public.rematricula_tarefas_gerais
SET data_fim = data_inicio + 7
WHERE data_fim IS NULL AND data_inicio IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tg_datas ON public.tarefas_gerais(polo_id, data_inicio, data_fim);
CREATE INDEX IF NOT EXISTS idx_rtg_datas ON public.rematricula_tarefas_gerais(polo_id, data_inicio, data_fim);

-- ========== 2. TABELAS DE ETAPAS ==========

CREATE TABLE IF NOT EXISTS public.tarefas_gerais_etapas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tarefa_id UUID NOT NULL REFERENCES public.tarefas_gerais(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL CHECK (ordem >= 1),
  titulo VARCHAR(255) NOT NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- polo_id espelhado da tarefa (isolamento / filtro rápido)
  polo_id UUID NOT NULL REFERENCES public.polos(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'bloqueada'
    CHECK (status IN ('pendente', 'em_andamento', 'concluida', 'bloqueada')),
  progresso_pct INTEGER NOT NULL DEFAULT 0
    CHECK (progresso_pct >= 0 AND progresso_pct <= 100),
  data_inicio DATE,
  data_fim DATE,
  concluida_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tarefa_id, ordem)
);

CREATE INDEX IF NOT EXISTS idx_tge_tarefa ON public.tarefas_gerais_etapas(tarefa_id, ordem);
CREATE INDEX IF NOT EXISTS idx_tge_user ON public.tarefas_gerais_etapas(user_id);
CREATE INDEX IF NOT EXISTS idx_tge_polo ON public.tarefas_gerais_etapas(polo_id);

CREATE TABLE IF NOT EXISTS public.rematricula_tarefas_gerais_etapas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tarefa_id UUID NOT NULL REFERENCES public.rematricula_tarefas_gerais(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL CHECK (ordem >= 1),
  titulo VARCHAR(255) NOT NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  polo_id UUID NOT NULL REFERENCES public.polos(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'bloqueada'
    CHECK (status IN ('pendente', 'em_andamento', 'concluida', 'bloqueada')),
  progresso_pct INTEGER NOT NULL DEFAULT 0
    CHECK (progresso_pct >= 0 AND progresso_pct <= 100),
  data_inicio DATE,
  data_fim DATE,
  concluida_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tarefa_id, ordem)
);

CREATE INDEX IF NOT EXISTS idx_rtge_tarefa ON public.rematricula_tarefas_gerais_etapas(tarefa_id, ordem);
CREATE INDEX IF NOT EXISTS idx_rtge_user ON public.rematricula_tarefas_gerais_etapas(user_id);
CREATE INDEX IF NOT EXISTS idx_rtge_polo ON public.rematricula_tarefas_gerais_etapas(polo_id);

-- ========== 3. RLS ETAPAS — ENGAGEMENT ==========

ALTER TABLE public.tarefas_gerais_etapas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ver etapas tarefa geral" ON public.tarefas_gerais_etapas;
CREATE POLICY "Ver etapas tarefa geral"
  ON public.tarefas_gerais_etapas FOR SELECT TO authenticated
  USING (
    -- responsável da etapa
    user_id = auth.uid()
    -- ou admin/creator do mesmo polo
    OR (
      public.is_admin()
      AND public.mesmo_polo_do_usuario(polo_id)
    )
    -- ou membro da tarefa (mesmo polo implícito pela tarefa)
    OR EXISTS (
      SELECT 1 FROM public.tarefas_gerais_membros m
      WHERE m.tarefa_id = tarefa_id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admin gerencia etapas" ON public.tarefas_gerais_etapas;
CREATE POLICY "Admin gerencia etapas"
  ON public.tarefas_gerais_etapas FOR ALL TO authenticated
  USING (
    public.is_admin()
    AND public.mesmo_polo_do_usuario(polo_id)
  )
  WITH CHECK (
    public.is_admin()
    AND public.mesmo_polo_do_usuario(polo_id)
  );

-- Responsável atualiza progresso da própria etapa (só se não estiver bloqueada)
DROP POLICY IF EXISTS "Responsavel atualiza propria etapa" ON public.tarefas_gerais_etapas;
CREATE POLICY "Responsavel atualiza propria etapa"
  ON public.tarefas_gerais_etapas FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND status IN ('pendente', 'em_andamento')
  )
  WITH CHECK (
    user_id = auth.uid()
  );

-- ========== 4. RLS ETAPAS — REMATRÍCULA ==========

ALTER TABLE public.rematricula_tarefas_gerais_etapas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ver etapas tarefa geral rem" ON public.rematricula_tarefas_gerais_etapas;
CREATE POLICY "Ver etapas tarefa geral rem"
  ON public.rematricula_tarefas_gerais_etapas FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      public.is_admin()
      AND public.mesmo_polo_do_usuario(polo_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.rematricula_tarefas_gerais_membros m
      WHERE m.tarefa_id = tarefa_id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admin gerencia etapas rem" ON public.rematricula_tarefas_gerais_etapas;
CREATE POLICY "Admin gerencia etapas rem"
  ON public.rematricula_tarefas_gerais_etapas FOR ALL TO authenticated
  USING (
    public.is_admin()
    AND public.mesmo_polo_do_usuario(polo_id)
  )
  WITH CHECK (
    public.is_admin()
    AND public.mesmo_polo_do_usuario(polo_id)
  );

DROP POLICY IF EXISTS "Responsavel atualiza propria etapa rem" ON public.rematricula_tarefas_gerais_etapas;
CREATE POLICY "Responsavel atualiza propria etapa rem"
  ON public.rematricula_tarefas_gerais_etapas FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND status IN ('pendente', 'em_andamento')
  )
  WITH CHECK (
    user_id = auth.uid()
  );

-- ========== 5. TRIGGER: força polo_id da etapa = polo da tarefa ==========
-- Garante isolamento: etapa sempre no mesmo polo da tarefa

CREATE OR REPLACE FUNCTION public.forca_polo_etapa_tarefa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_polo UUID;
  v_user_polo UUID;
BEGIN
  -- Descobre polo da tarefa (engajamento ou rematrícula)
  SELECT polo_id INTO v_polo
  FROM public.tarefas_gerais
  WHERE id = NEW.tarefa_id;

  IF v_polo IS NULL THEN
    SELECT polo_id INTO v_polo
    FROM public.rematricula_tarefas_gerais
    WHERE id = NEW.tarefa_id;
  END IF;

  IF v_polo IS NULL THEN
    RAISE EXCEPTION 'Tarefa sem polo_id. Não é possível criar etapa.';
  END IF;

  NEW.polo_id := v_polo;

  -- Responsável deve ser do mesmo polo
  SELECT polo_id INTO v_user_polo
  FROM public.profiles
  WHERE id = NEW.user_id;

  IF v_user_polo IS DISTINCT FROM v_polo THEN
    RAISE EXCEPTION 'Responsável da etapa deve pertencer ao mesmo polo da tarefa (polo_id).';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_forca_polo_etapa ON public.tarefas_gerais_etapas;
CREATE TRIGGER trg_forca_polo_etapa
  BEFORE INSERT OR UPDATE OF tarefa_id, user_id ON public.tarefas_gerais_etapas
  FOR EACH ROW EXECUTE FUNCTION public.forca_polo_etapa_tarefa();

DROP TRIGGER IF EXISTS trg_forca_polo_etapa_rem ON public.rematricula_tarefas_gerais_etapas;
CREATE TRIGGER trg_forca_polo_etapa_rem
  BEFORE INSERT OR UPDATE OF tarefa_id, user_id ON public.rematricula_tarefas_gerais_etapas
  FOR EACH ROW EXECUTE FUNCTION public.forca_polo_etapa_tarefa();

-- ========== 6. Ao criar etapas: 1ª fica pendente, demais bloqueadas ==========

CREATE OR REPLACE FUNCTION public.init_status_etapas_tarefa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.ordem = 1 THEN
    NEW.status := 'pendente';
  ELSE
    NEW.status := 'bloqueada';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_init_status_etapa ON public.tarefas_gerais_etapas;
CREATE TRIGGER trg_init_status_etapa
  BEFORE INSERT ON public.tarefas_gerais_etapas
  FOR EACH ROW EXECUTE FUNCTION public.init_status_etapas_tarefa();

DROP TRIGGER IF EXISTS trg_init_status_etapa_rem ON public.rematricula_tarefas_gerais_etapas;
CREATE TRIGGER trg_init_status_etapa_rem
  BEFORE INSERT ON public.rematricula_tarefas_gerais_etapas
  FOR EACH ROW EXECUTE FUNCTION public.init_status_etapas_tarefa();

-- ========== 7. RPC: concluir etapa e liberar a próxima ==========

CREATE OR REPLACE FUNCTION public.concluir_etapa_tarefa_geral(
  p_etapa_id UUID,
  p_tabela TEXT DEFAULT 'engajamento'  -- 'engajamento' | 'rematricula'
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
      RETURN; -- idempotente
    END IF;

    UPDATE public.rematricula_tarefas_gerais_etapas
    SET status = 'concluida',
        progresso_pct = 100,
        concluida_em = NOW(),
        updated_at = NOW()
    WHERE id = p_etapa_id;

    -- Libera próxima etapa
    UPDATE public.rematricula_tarefas_gerais_etapas
    SET status = 'pendente',
        updated_at = NOW()
    WHERE tarefa_id = v_tarefa_id
      AND ordem = v_ordem + 1
      AND status = 'bloqueada';

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

    UPDATE public.tarefas_gerais_etapas
    SET status = 'pendente',
        updated_at = NOW()
    WHERE tarefa_id = v_tarefa_id
      AND ordem = v_ordem + 1
      AND status = 'bloqueada';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.concluir_etapa_tarefa_geral(UUID, TEXT) TO authenticated;

-- ========== 8. RPC: atualizar progresso de uma etapa ==========

CREATE OR REPLACE FUNCTION public.atualizar_progresso_etapa_tarefa(
  p_etapa_id UUID,
  p_progresso_pct INTEGER,
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
  v_status VARCHAR;
  v_polo UUID;
BEGIN
  IF p_progresso_pct < 0 OR p_progresso_pct > 100 THEN
    RAISE EXCEPTION 'progresso_pct deve estar entre 0 e 100';
  END IF;

  IF p_tabela = 'rematricula' THEN
    SELECT user_id, status, polo_id
      INTO v_user_id, v_status, v_polo
    FROM public.rematricula_tarefas_gerais_etapas
    WHERE id = p_etapa_id;

    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Etapa não encontrada'; END IF;

    IF v_user_id IS DISTINCT FROM v_uid AND NOT (
      public.is_admin() AND public.mesmo_polo_do_usuario(v_polo)
    ) THEN
      RAISE EXCEPTION 'Sem permissão para atualizar esta etapa';
    END IF;

    IF v_status = 'bloqueada' THEN
      RAISE EXCEPTION 'Etapa bloqueada';
    END IF;

    IF v_status = 'concluida' THEN
      RAISE EXCEPTION 'Etapa já concluída';
    END IF;

    UPDATE public.rematricula_tarefas_gerais_etapas
    SET progresso_pct = p_progresso_pct,
        status = CASE
          WHEN p_progresso_pct >= 100 THEN 'concluida'
          WHEN p_progresso_pct > 0 THEN 'em_andamento'
          ELSE 'pendente'
        END,
        concluida_em = CASE WHEN p_progresso_pct >= 100 THEN NOW() ELSE concluida_em END,
        updated_at = NOW()
    WHERE id = p_etapa_id;

    -- Se chegou a 100, libera próxima
    IF p_progresso_pct >= 100 THEN
      PERFORM public.concluir_etapa_tarefa_geral(p_etapa_id, 'rematricula');
    END IF;

  ELSE
    SELECT user_id, status, polo_id
      INTO v_user_id, v_status, v_polo
    FROM public.tarefas_gerais_etapas
    WHERE id = p_etapa_id;

    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Etapa não encontrada'; END IF;

    IF v_user_id IS DISTINCT FROM v_uid AND NOT (
      public.is_admin() AND public.mesmo_polo_do_usuario(v_polo)
    ) THEN
      RAISE EXCEPTION 'Sem permissão para atualizar esta etapa';
    END IF;

    IF v_status = 'bloqueada' THEN
      RAISE EXCEPTION 'Etapa bloqueada';
    END IF;

    IF v_status = 'concluida' THEN
      RAISE EXCEPTION 'Etapa já concluída';
    END IF;

    UPDATE public.tarefas_gerais_etapas
    SET progresso_pct = p_progresso_pct,
        status = CASE
          WHEN p_progresso_pct >= 100 THEN 'concluida'
          WHEN p_progresso_pct > 0 THEN 'em_andamento'
          ELSE 'pendente'
        END,
        concluida_em = CASE WHEN p_progresso_pct >= 100 THEN NOW() ELSE concluida_em END,
        updated_at = NOW()
    WHERE id = p_etapa_id;

    IF p_progresso_pct >= 100 THEN
      PERFORM public.concluir_etapa_tarefa_geral(p_etapa_id, 'engajamento');
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.atualizar_progresso_etapa_tarefa(UUID, INTEGER, TEXT) TO authenticated;

-- ========== 9. Validação: membros/etapas só de colaboradores do mesmo polo ==========
-- Ao inserir membro, confere polo do user vs polo da tarefa

CREATE OR REPLACE FUNCTION public.valida_membro_mesmo_polo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_polo_tarefa UUID;
  v_polo_user UUID;
BEGIN
  SELECT polo_id INTO v_polo_tarefa
  FROM public.tarefas_gerais WHERE id = NEW.tarefa_id;

  IF v_polo_tarefa IS NULL THEN
    SELECT polo_id INTO v_polo_tarefa
    FROM public.rematricula_tarefas_gerais WHERE id = NEW.tarefa_id;
  END IF;

  SELECT polo_id INTO v_polo_user
  FROM public.profiles WHERE id = NEW.user_id;

  IF v_polo_tarefa IS NOT NULL
     AND v_polo_user IS NOT NULL
     AND v_polo_tarefa IS DISTINCT FROM v_polo_user THEN
    RAISE EXCEPTION 'Colaborador deve pertencer ao mesmo polo da tarefa (polo_id).';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_valida_membro_polo ON public.tarefas_gerais_membros;
CREATE TRIGGER trg_valida_membro_polo
  BEFORE INSERT OR UPDATE OF user_id, tarefa_id ON public.tarefas_gerais_membros
  FOR EACH ROW EXECUTE FUNCTION public.valida_membro_mesmo_polo();

DROP TRIGGER IF EXISTS trg_valida_membro_polo_rem ON public.rematricula_tarefas_gerais_membros;
CREATE TRIGGER trg_valida_membro_polo_rem
  BEFORE INSERT OR UPDATE OF user_id, tarefa_id ON public.rematricula_tarefas_gerais_membros
  FOR EACH ROW EXECUTE FUNCTION public.valida_membro_mesmo_polo();

COMMENT ON COLUMN public.tarefas_gerais.data_inicio IS 'Início da tarefa (timeline/calendário)';
COMMENT ON COLUMN public.tarefas_gerais.data_fim IS 'Fim da tarefa (timeline/calendário)';
COMMENT ON COLUMN public.tarefas_gerais.modo IS 'paralelo = todos juntos; sequencial = etapas com dependência';
COMMENT ON TABLE public.tarefas_gerais_etapas IS 'Etapas ordenadas; polo_id isolado; ordem 1 libera a 2 ao concluir, etc.';
COMMENT ON FUNCTION public.concluir_etapa_tarefa_geral IS 'Marca etapa concluída e libera a próxima (mesmo polo).';
