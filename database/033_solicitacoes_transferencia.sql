-- =============================================
-- 033 - Solicitações de Transferência (aprovação)
--
-- Rode no SQL Editor do Supabase DEPOIS de 032.
--
-- Fluxos:
--   A) Colaborador dono do contato solicita mudar setor (e opcionalmente
--      colaborador). Status inicial: aguardando_gestor.
--   B) Colaborador de OUTRO setor vê o contato e solicita assumir a
--      responsabilidade. Status inicial: aguardando_responsavel.
--      O responsável atual autoriza → vira aguardando_gestor.
--      Supervisor/admin aprova → aplica setor_id + responsavel_id no aluno.
-- =============================================

-- =============================================
-- 1) Tabela
-- =============================================
CREATE TABLE IF NOT EXISTS public.solicitacoes_transferencia (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  aluno_id UUID NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  polo_id UUID NOT NULL REFERENCES public.polos(id) ON DELETE CASCADE,

  -- Quem pediu
  solicitante_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Tipo: mudar setor do próprio contato | assumir contato de outro
  tipo VARCHAR(40) NOT NULL
    CHECK (tipo IN ('mudanca_setor', 'assumir_responsabilidade')),

  -- Destino pedido
  setor_destino_id UUID NOT NULL REFERENCES public.setores(id),
  colaborador_destino_id UUID REFERENCES public.profiles(id),

  -- Snapshot do estado atual no momento do pedido (auditoria)
  setor_origem_id UUID REFERENCES public.setores(id),
  responsavel_origem_id UUID REFERENCES public.profiles(id),

  -- Fluxo de aprovação
  -- aguardando_responsavel → (só tipo assumir) dono atual precisa autorizar
  -- aguardando_gestor      → supervisor/admin decide
  -- aprovada | recusada | cancelada
  status VARCHAR(40) NOT NULL DEFAULT 'aguardando_gestor'
    CHECK (status IN (
      'aguardando_responsavel',
      'aguardando_gestor',
      'aprovada',
      'recusada',
      'cancelada'
    )),

  -- Autorização do responsável atual (tipo assumir)
  autorizado_por_id UUID REFERENCES public.profiles(id),
  autorizado_em TIMESTAMPTZ,

  -- Decisão final do gestor
  decidido_por_id UUID REFERENCES public.profiles(id),
  decidido_em TIMESTAMPTZ,

  motivo TEXT,
  observacao_decisao TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sol_transf_aluno ON public.solicitacoes_transferencia(aluno_id);
CREATE INDEX IF NOT EXISTS idx_sol_transf_polo_status ON public.solicitacoes_transferencia(polo_id, status);
CREATE INDEX IF NOT EXISTS idx_sol_transf_solicitante ON public.solicitacoes_transferencia(solicitante_id);
CREATE INDEX IF NOT EXISTS idx_sol_transf_resp_origem ON public.solicitacoes_transferencia(responsavel_origem_id);

COMMENT ON TABLE public.solicitacoes_transferencia IS
  'Pedidos de transferência de setor/responsável com aprovação em etapas.';

-- updated_at automático
CREATE OR REPLACE FUNCTION public.touch_solicitacao_transferencia()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_solicitacao_transferencia ON public.solicitacoes_transferencia;
CREATE TRIGGER trg_touch_solicitacao_transferencia
  BEFORE UPDATE ON public.solicitacoes_transferencia
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_solicitacao_transferencia();

-- =============================================
-- 2) RLS
-- =============================================
ALTER TABLE public.solicitacoes_transferencia ENABLE ROW LEVEL SECURITY;

-- Leitura: admin; supervisor do polo; solicitante; responsável de origem;
-- colaborador destino (quando já definido)
DROP POLICY IF EXISTS "Ler solicitacoes transferencia" ON public.solicitacoes_transferencia;
CREATE POLICY "Ler solicitacoes transferencia"
  ON public.solicitacoes_transferencia FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.supervisiona_polo(polo_id)
    OR solicitante_id = auth.uid()
    OR responsavel_origem_id = auth.uid()
    OR colaborador_destino_id = auth.uid()
    OR public.mesmo_polo_do_usuario(polo_id)
  );

-- Criar: autenticado do mesmo polo (regras de negócio na RPC)
DROP POLICY IF EXISTS "Criar solicitacoes transferencia" ON public.solicitacoes_transferencia;
CREATE POLICY "Criar solicitacoes transferencia"
  ON public.solicitacoes_transferencia FOR INSERT TO authenticated
  WITH CHECK (
    solicitante_id = auth.uid()
    AND public.mesmo_polo_do_usuario(polo_id)
  );

-- Update: envolvidos + gestores (a aplicação real do aluno só via RPC)
DROP POLICY IF EXISTS "Atualizar solicitacoes transferencia" ON public.solicitacoes_transferencia;
CREATE POLICY "Atualizar solicitacoes transferencia"
  ON public.solicitacoes_transferencia FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR public.supervisiona_polo(polo_id)
    OR solicitante_id = auth.uid()
    OR responsavel_origem_id = auth.uid()
  )
  WITH CHECK (
    public.is_admin()
    OR public.supervisiona_polo(polo_id)
    OR solicitante_id = auth.uid()
    OR responsavel_origem_id = auth.uid()
  );

-- =============================================
-- 3) RPC: criar solicitação
-- =============================================
CREATE OR REPLACE FUNCTION public.criar_solicitacao_transferencia(
  p_aluno_id UUID,
  p_setor_destino_id UUID,
  p_colaborador_destino_id UUID DEFAULT NULL,
  p_motivo TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_aluno RECORD;
  v_setor_dest RECORD;
  v_tipo VARCHAR(40);
  v_status VARCHAR(40);
  v_id UUID;
  v_pendente INT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT a.id, a.polo_id, a.setor_id, a.responsavel_id, a.area
    INTO v_aluno
  FROM public.alunos a
  WHERE a.id = p_aluno_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aluno não encontrado';
  END IF;

  IF v_aluno.area IS DISTINCT FROM 'engajamento' THEN
    RAISE EXCEPTION 'Transferência por solicitação só vale para Engajamento';
  END IF;

  IF NOT public.mesmo_polo_do_usuario(v_aluno.polo_id) AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Aluno fora do seu polo';
  END IF;

  SELECT s.id, s.polo_id, s.ativo INTO v_setor_dest
  FROM public.setores s
  WHERE s.id = p_setor_destino_id;

  IF NOT FOUND OR v_setor_dest.ativo IS NOT TRUE THEN
    RAISE EXCEPTION 'Setor de destino inválido';
  END IF;

  IF v_setor_dest.polo_id IS DISTINCT FROM v_aluno.polo_id THEN
    RAISE EXCEPTION 'Setor de destino deve ser do mesmo polo do aluno';
  END IF;

  -- Já existe pedido aberto para este aluno?
  SELECT count(*) INTO v_pendente
  FROM public.solicitacoes_transferencia
  WHERE aluno_id = p_aluno_id
    AND status IN ('aguardando_responsavel', 'aguardando_gestor');

  IF v_pendente > 0 THEN
    RAISE EXCEPTION 'Já existe uma solicitação de transferência em andamento para este contato';
  END IF;

  -- Define tipo / status inicial
  IF v_aluno.responsavel_id IS NOT NULL AND v_aluno.responsavel_id = v_uid THEN
    -- Dono pede mudança de setor/colaborador
    v_tipo := 'mudanca_setor';
    v_status := 'aguardando_gestor';
  ELSIF v_aluno.responsavel_id IS NOT NULL AND v_aluno.responsavel_id IS DISTINCT FROM v_uid THEN
    -- Outro colaborador pede para assumir
    v_tipo := 'assumir_responsabilidade';
    v_status := 'aguardando_responsavel';
    -- Destino de colaborador é sempre o solicitante neste caso
    p_colaborador_destino_id := v_uid;
  ELSIF v_aluno.responsavel_id IS NULL THEN
    -- Sem responsável: trata como assumir (vai direto pro gestor se quem pede for colab)
    v_tipo := 'assumir_responsabilidade';
    v_status := 'aguardando_gestor';
    p_colaborador_destino_id := COALESCE(p_colaborador_destino_id, v_uid);
  ELSE
    RAISE EXCEPTION 'Não foi possível determinar o tipo de solicitação';
  END IF;

  -- Admin/supervisor podem criar já em aguardando_gestor (atalho)
  IF public.is_admin() OR public.supervisiona_polo(v_aluno.polo_id) THEN
    IF v_tipo = 'assumir_responsabilidade' AND v_status = 'aguardando_responsavel' THEN
      -- Gestor não precisa da autorização do responsável
      v_status := 'aguardando_gestor';
    END IF;
  END IF;

  INSERT INTO public.solicitacoes_transferencia (
    aluno_id, polo_id, solicitante_id, tipo,
    setor_destino_id, colaborador_destino_id,
    setor_origem_id, responsavel_origem_id,
    status, motivo
  ) VALUES (
    p_aluno_id, v_aluno.polo_id, v_uid, v_tipo,
    p_setor_destino_id, p_colaborador_destino_id,
    v_aluno.setor_id, v_aluno.responsavel_id,
    v_status, NULLIF(trim(p_motivo), '')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.criar_solicitacao_transferencia(UUID, UUID, UUID, TEXT) TO authenticated;

-- =============================================
-- 4) RPC: responsável atual autoriza (ou recusa) o pedido de assumir
-- =============================================
CREATE OR REPLACE FUNCTION public.autorizar_solicitacao_transferencia(
  p_solicitacao_id UUID,
  p_aprovar BOOLEAN,
  p_observacao TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_sol RECORD;
BEGIN
  SELECT * INTO v_sol
  FROM public.solicitacoes_transferencia
  WHERE id = p_solicitacao_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada';
  END IF;

  IF v_sol.status IS DISTINCT FROM 'aguardando_responsavel' THEN
    RAISE EXCEPTION 'Esta solicitação não está aguardando o responsável';
  END IF;

  IF v_sol.responsavel_origem_id IS DISTINCT FROM v_uid
     AND NOT public.is_admin()
     AND NOT public.supervisiona_polo(v_sol.polo_id) THEN
    RAISE EXCEPTION 'Só o responsável atual pode autorizar este pedido';
  END IF;

  IF p_aprovar THEN
    UPDATE public.solicitacoes_transferencia
    SET status = 'aguardando_gestor',
        autorizado_por_id = v_uid,
        autorizado_em = NOW(),
        observacao_decisao = NULLIF(trim(p_observacao), '')
    WHERE id = p_solicitacao_id;
  ELSE
    UPDATE public.solicitacoes_transferencia
    SET status = 'recusada',
        autorizado_por_id = v_uid,
        autorizado_em = NOW(),
        decidido_por_id = v_uid,
        decidido_em = NOW(),
        observacao_decisao = NULLIF(trim(p_observacao), '')
    WHERE id = p_solicitacao_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.autorizar_solicitacao_transferencia(UUID, BOOLEAN, TEXT) TO authenticated;

-- =============================================
-- 5) RPC: supervisor/admin decide (aprova aplica no aluno)
-- =============================================
CREATE OR REPLACE FUNCTION public.decidir_solicitacao_transferencia(
  p_solicitacao_id UUID,
  p_aprovar BOOLEAN,
  p_observacao TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_sol RECORD;
BEGIN
  SELECT * INTO v_sol
  FROM public.solicitacoes_transferencia
  WHERE id = p_solicitacao_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada';
  END IF;

  IF v_sol.status IS DISTINCT FROM 'aguardando_gestor' THEN
    RAISE EXCEPTION 'Esta solicitação não está aguardando gestor';
  END IF;

  IF NOT public.is_admin() AND NOT public.supervisiona_polo(v_sol.polo_id) THEN
    RAISE EXCEPTION 'Apenas supervisor ou admin podem decidir';
  END IF;

  IF p_aprovar THEN
    -- Aplica no aluno
    UPDATE public.alunos
    SET setor_id = v_sol.setor_destino_id,
        responsavel_id = v_sol.colaborador_destino_id
    WHERE id = v_sol.aluno_id;

    UPDATE public.solicitacoes_transferencia
    SET status = 'aprovada',
        decidido_por_id = v_uid,
        decidido_em = NOW(),
        observacao_decisao = NULLIF(trim(p_observacao), '')
    WHERE id = p_solicitacao_id;
  ELSE
    UPDATE public.solicitacoes_transferencia
    SET status = 'recusada',
        decidido_por_id = v_uid,
        decidido_em = NOW(),
        observacao_decisao = NULLIF(trim(p_observacao), '')
    WHERE id = p_solicitacao_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.decidir_solicitacao_transferencia(UUID, BOOLEAN, TEXT) TO authenticated;

-- =============================================
-- 6) RPC: solicitante cancela
-- =============================================
CREATE OR REPLACE FUNCTION public.cancelar_solicitacao_transferencia(
  p_solicitacao_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_sol RECORD;
BEGIN
  SELECT * INTO v_sol
  FROM public.solicitacoes_transferencia
  WHERE id = p_solicitacao_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada';
  END IF;

  IF v_sol.status NOT IN ('aguardando_responsavel', 'aguardando_gestor') THEN
    RAISE EXCEPTION 'Só é possível cancelar solicitações em andamento';
  END IF;

  IF v_sol.solicitante_id IS DISTINCT FROM v_uid
     AND NOT public.is_admin()
     AND NOT public.supervisiona_polo(v_sol.polo_id) THEN
    RAISE EXCEPTION 'Só o solicitante (ou gestor) pode cancelar';
  END IF;

  UPDATE public.solicitacoes_transferencia
  SET status = 'cancelada',
      decidido_por_id = v_uid,
      decidido_em = NOW()
  WHERE id = p_solicitacao_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancelar_solicitacao_transferencia(UUID) TO authenticated;

-- =============================================
-- 7) RPC: listar solicitações do polo (com nomes)
-- =============================================
CREATE OR REPLACE FUNCTION public.listar_solicitacoes_transferencia(
  p_apenas_pendentes BOOLEAN DEFAULT true
)
RETURNS TABLE (
  id UUID,
  aluno_id UUID,
  aluno_nome VARCHAR,
  polo_id UUID,
  solicitante_id UUID,
  solicitante_nome VARCHAR,
  tipo VARCHAR,
  setor_destino_id UUID,
  setor_destino_nome VARCHAR,
  colaborador_destino_id UUID,
  colaborador_destino_nome VARCHAR,
  setor_origem_id UUID,
  setor_origem_nome VARCHAR,
  responsavel_origem_id UUID,
  responsavel_origem_nome VARCHAR,
  status VARCHAR,
  motivo TEXT,
  observacao_decisao TEXT,
  autorizado_em TIMESTAMPTZ,
  decidido_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.aluno_id,
    a.nome,
    s.polo_id,
    s.solicitante_id,
    sol.name,
    s.tipo,
    s.setor_destino_id,
    sd.nome,
    s.colaborador_destino_id,
    dest.name,
    s.setor_origem_id,
    so.nome,
    s.responsavel_origem_id,
    orig.name,
    s.status,
    s.motivo,
    s.observacao_decisao,
    s.autorizado_em,
    s.decidido_em,
    s.created_at
  FROM public.solicitacoes_transferencia s
  JOIN public.alunos a ON a.id = s.aluno_id
  LEFT JOIN public.profiles sol ON sol.id = s.solicitante_id
  LEFT JOIN public.profiles dest ON dest.id = s.colaborador_destino_id
  LEFT JOIN public.profiles orig ON orig.id = s.responsavel_origem_id
  LEFT JOIN public.setores sd ON sd.id = s.setor_destino_id
  LEFT JOIN public.setores so ON so.id = s.setor_origem_id
  WHERE (
      public.is_admin()
      OR public.supervisiona_polo(s.polo_id)
      OR s.solicitante_id = auth.uid()
      OR s.responsavel_origem_id = auth.uid()
      OR s.colaborador_destino_id = auth.uid()
    )
    AND (
      NOT p_apenas_pendentes
      OR s.status IN ('aguardando_responsavel', 'aguardando_gestor')
    )
  ORDER BY s.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.listar_solicitacoes_transferencia(BOOLEAN) TO authenticated;

-- =============================================
-- 8) RPC: solicitações abertas de um aluno (pro card)
-- =============================================
CREATE OR REPLACE FUNCTION public.solicitacoes_do_aluno(p_aluno_id UUID)
RETURNS TABLE (
  id UUID,
  aluno_id UUID,
  solicitante_id UUID,
  solicitante_nome VARCHAR,
  tipo VARCHAR,
  setor_destino_id UUID,
  setor_destino_nome VARCHAR,
  colaborador_destino_id UUID,
  colaborador_destino_nome VARCHAR,
  setor_origem_id UUID,
  setor_origem_nome VARCHAR,
  responsavel_origem_id UUID,
  responsavel_origem_nome VARCHAR,
  status VARCHAR,
  motivo TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.aluno_id,
    s.solicitante_id,
    sol.name,
    s.tipo,
    s.setor_destino_id,
    sd.nome,
    s.colaborador_destino_id,
    dest.name,
    s.setor_origem_id,
    so.nome,
    s.responsavel_origem_id,
    orig.name,
    s.status,
    s.motivo,
    s.created_at
  FROM public.solicitacoes_transferencia s
  LEFT JOIN public.profiles sol ON sol.id = s.solicitante_id
  LEFT JOIN public.profiles dest ON dest.id = s.colaborador_destino_id
  LEFT JOIN public.profiles orig ON orig.id = s.responsavel_origem_id
  LEFT JOIN public.setores sd ON sd.id = s.setor_destino_id
  LEFT JOIN public.setores so ON so.id = s.setor_origem_id
  WHERE s.aluno_id = p_aluno_id
    AND s.status IN ('aguardando_responsavel', 'aguardando_gestor')
  ORDER BY s.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.solicitacoes_do_aluno(UUID) TO authenticated;
