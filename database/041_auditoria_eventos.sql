-- =============================================
-- 041 - Auditoria de eventos (Relatório)
--
-- Rode no SQL Editor do Supabase DEPOIS das migrations anteriores
-- (especialmente 019 supervisor/polo e 033 solicitacoes_transferencia).
--
-- O que este script faz:
--   1) Tabela auditoria_eventos (criação, status, transferência)
--   2) Triggers em alunos (INSERT + UPDATE de status)
--   3) Trigger em solicitacoes_transferencia (quando vira aprovada)
--   4) RLS: só admin e supervisor (supervisor só do próprio polo)
--   5) Backfill de criações e transferências já existentes
--   6) Realtime na tabela
--
-- Mudanças de status ANTERIORES a este script NÃO são recuperáveis
-- (não havia trilha de → para). Só passam a ser registradas daqui pra frente.
-- =============================================

-- ---------------------------------------------
-- 1) Tabela
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.auditoria_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id UUID REFERENCES public.alunos(id) ON DELETE SET NULL,
  aluno_nome TEXT,
  polo_id UUID REFERENCES public.polos(id) ON DELETE SET NULL,
  area TEXT CHECK (area IS NULL OR area IN ('rematricula', 'engajamento', 'retencao')),
  tipo TEXT NOT NULL CHECK (tipo IN ('criacao', 'status', 'transferencia')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_nome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_polo_created
  ON public.auditoria_eventos (polo_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auditoria_tipo_created
  ON public.auditoria_eventos (tipo, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auditoria_aluno_created
  ON public.auditoria_eventos (aluno_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auditoria_actor_created
  ON public.auditoria_eventos (actor_id, created_at DESC);

COMMENT ON TABLE public.auditoria_eventos IS
  'Trilha de auditoria: criação de contato, mudança de status e transferência aprovada. Alimenta a aba Relatório (gestores).';

-- ---------------------------------------------
-- 2) Helper: nome do profile
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION public.auditoria_nome_profile(p_uid UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT name FROM public.profiles WHERE id = p_uid LIMIT 1;
$$;

-- ---------------------------------------------
-- 3) Trigger: criação de aluno
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_auditoria_aluno_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_actor_nome TEXT;
BEGIN
  v_actor := COALESCE(NEW.criado_por, auth.uid());
  v_actor_nome := public.auditoria_nome_profile(v_actor);

  INSERT INTO public.auditoria_eventos (
    aluno_id, aluno_nome, polo_id, area, tipo, payload, actor_id, actor_nome, created_at
  ) VALUES (
    NEW.id,
    NEW.nome,
    NEW.polo_id,
    NEW.area::text,
    'criacao',
    jsonb_build_object(
      'status_inicial', NEW.status,
      'ra', NEW.ra,
      'curso', NEW.curso,
      'canal', NEW.canal_contato
    ),
    v_actor,
    v_actor_nome,
    COALESCE(NEW.created_at, NOW())
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auditoria_aluno_insert ON public.alunos;
CREATE TRIGGER trg_auditoria_aluno_insert
  AFTER INSERT ON public.alunos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_auditoria_aluno_insert();

-- ---------------------------------------------
-- 4) Trigger: mudança de status
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_auditoria_aluno_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_actor_nome TEXT;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Quem moveu: sessão autenticada (auth.uid()). Em updates via service
  -- role sem JWT, actor fica null.
  v_actor := auth.uid();
  v_actor_nome := public.auditoria_nome_profile(v_actor);

  INSERT INTO public.auditoria_eventos (
    aluno_id, aluno_nome, polo_id, area, tipo, payload, actor_id, actor_nome, created_at
  ) VALUES (
    NEW.id,
    NEW.nome,
    NEW.polo_id,
    NEW.area::text,
    'status',
    jsonb_build_object(
      'status_de', OLD.status,
      'status_para', NEW.status
    ),
    v_actor,
    v_actor_nome,
    NOW()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auditoria_aluno_status ON public.alunos;
CREATE TRIGGER trg_auditoria_aluno_status
  AFTER UPDATE OF status ON public.alunos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_auditoria_aluno_status();

-- ---------------------------------------------
-- 5) Trigger: transferência aprovada
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_auditoria_transferencia_aprovada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_actor_nome TEXT;
  v_aluno_nome TEXT;
  v_area TEXT;
BEGIN
  IF NOT (NEW.status = 'aprovada' AND OLD.status IS DISTINCT FROM 'aprovada') THEN
    RETURN NEW;
  END IF;

  v_actor := COALESCE(NEW.decidido_por_id, NEW.autorizado_por_id, auth.uid());
  v_actor_nome := public.auditoria_nome_profile(v_actor);

  SELECT a.nome, a.area::text
    INTO v_aluno_nome, v_area
  FROM public.alunos a
  WHERE a.id = NEW.aluno_id;

  INSERT INTO public.auditoria_eventos (
    aluno_id, aluno_nome, polo_id, area, tipo, payload, actor_id, actor_nome, created_at
  ) VALUES (
    NEW.aluno_id,
    v_aluno_nome,
    NEW.polo_id,
    v_area,
    'transferencia',
    jsonb_build_object(
      'solicitacao_id', NEW.id,
      'tipo_solicitacao', NEW.tipo,
      'setor_origem_id', NEW.setor_origem_id,
      'setor_destino_id', NEW.setor_destino_id,
      'responsavel_origem_id', NEW.responsavel_origem_id,
      'colaborador_destino_id', NEW.colaborador_destino_id,
      'solicitante_id', NEW.solicitante_id,
      'decidido_por_id', NEW.decidido_por_id,
      'autorizado_por_id', NEW.autorizado_por_id,
      'motivo', NEW.motivo,
      'observacao_decisao', NEW.observacao_decisao
    ),
    v_actor,
    v_actor_nome,
    COALESCE(NEW.decidido_em, NOW())
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auditoria_transferencia_aprovada ON public.solicitacoes_transferencia;
CREATE TRIGGER trg_auditoria_transferencia_aprovada
  AFTER UPDATE OF status ON public.solicitacoes_transferencia
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_auditoria_transferencia_aprovada();

-- ---------------------------------------------
-- 6) RLS — só admin e supervisor
-- ---------------------------------------------
ALTER TABLE public.auditoria_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gestores leem auditoria" ON public.auditoria_eventos;
CREATE POLICY "Gestores leem auditoria"
  ON public.auditoria_eventos
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR (
      public.is_supervisor()
      AND polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
    )
  );

-- Inserts só via triggers (SECURITY DEFINER). Sem policy de INSERT para
-- authenticated evita gravação manual pela API.

-- ---------------------------------------------
-- 7) Backfill — criações (uma vez)
-- ---------------------------------------------
INSERT INTO public.auditoria_eventos (
  aluno_id, aluno_nome, polo_id, area, tipo, payload, actor_id, actor_nome, created_at
)
SELECT
  a.id,
  a.nome,
  a.polo_id,
  a.area::text,
  'criacao',
  jsonb_build_object(
    'status_inicial', a.status,
    'ra', a.ra,
    'curso', a.curso,
    'canal', a.canal_contato,
    'backfill', true
  ),
  a.criado_por,
  public.auditoria_nome_profile(a.criado_por),
  COALESCE(a.created_at, NOW())
FROM public.alunos a
WHERE NOT EXISTS (
  SELECT 1
  FROM public.auditoria_eventos e
  WHERE e.aluno_id = a.id
    AND e.tipo = 'criacao'
);

-- ---------------------------------------------
-- 8) Backfill — transferências já aprovadas
-- ---------------------------------------------
INSERT INTO public.auditoria_eventos (
  aluno_id, aluno_nome, polo_id, area, tipo, payload, actor_id, actor_nome, created_at
)
SELECT
  s.aluno_id,
  a.nome,
  s.polo_id,
  a.area::text,
  'transferencia',
  jsonb_build_object(
    'solicitacao_id', s.id,
    'tipo_solicitacao', s.tipo,
    'setor_origem_id', s.setor_origem_id,
    'setor_destino_id', s.setor_destino_id,
    'responsavel_origem_id', s.responsavel_origem_id,
    'colaborador_destino_id', s.colaborador_destino_id,
    'solicitante_id', s.solicitante_id,
    'decidido_por_id', s.decidido_por_id,
    'autorizado_por_id', s.autorizado_por_id,
    'motivo', s.motivo,
    'observacao_decisao', s.observacao_decisao,
    'backfill', true
  ),
  COALESCE(s.decidido_por_id, s.autorizado_por_id),
  public.auditoria_nome_profile(COALESCE(s.decidido_por_id, s.autorizado_por_id)),
  COALESCE(s.decidido_em, s.updated_at, s.created_at, NOW())
FROM public.solicitacoes_transferencia s
LEFT JOIN public.alunos a ON a.id = s.aluno_id
WHERE s.status = 'aprovada'
  AND NOT EXISTS (
    SELECT 1
    FROM public.auditoria_eventos e
    WHERE e.tipo = 'transferencia'
      AND (e.payload->>'solicitacao_id') = s.id::text
  );

-- ---------------------------------------------
-- 9) Realtime
-- ---------------------------------------------
-- Idempotente: se já estiver na publication, o ADD pode falhar em algumas
-- versões — ignore o erro ou rode só uma vez.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.auditoria_eventos;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN
    RAISE NOTICE 'Publication supabase_realtime não encontrada — habilite Realtime no painel do Supabase.';
END;
$$;
