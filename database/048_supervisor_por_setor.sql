-- =============================================
-- 048 - Supervisor vinculado a um setor (Engajamento)
--
-- Rode no SQL Editor do Supabase DEPOIS de 047.
--
-- Mudança de regra de negócio:
--
-- ANTES:
--   Supervisor gerencia o polo inteiro (todos os setores do Engajamento).
--   Pode delegar/reatribuir contatos para qualquer colaborador do polo
--   e aprovar transferências de qualquer setor do polo.
--
-- DEPOIS:
--   Supervisor passa a ser de um setor (profiles.setor_id obrigatório
--   quando role = 'supervisor' e tem área engajamento).
--   Mantém os mesmos poderes que já tinha (ver todos do setor, editar,
--   excluir, delegar, aprovar transferências), porém SOMENTE dentro
--   do seu setor.
--   Admin continua vendo/aprovando tudo de todos os polos/setores.
--
-- Impacto:
--   1) Helpers de permissão (pode_editar, supervisiona_setor, etc.)
--   2) Policies de alunos / interações (SELECT/UPDATE/DELETE)
--   3) Trigger de integridade na delegação (mesmo setor)
--   4) RPC de decisão de transferência
--   5) Comentários de role
-- =============================================

-- =============================================
-- 1) Comentário e documentação do role
-- =============================================
COMMENT ON COLUMN public.profiles.role IS
  'Papel: admin (vê/autoriza tudo, todos os polos) | supervisor (vê/exclui/delega contatos e métricas do próprio setor no Engajamento; polo inteiro nas demais áreas; não autoriza usuários) | colaborador (só seus próprios contatos, dentro do polo/setor)';

COMMENT ON COLUMN public.profiles.setor_id IS
  'Setor do usuário no Engajamento. Obrigatório para colaborador e supervisor com área engajamento. NULL para admin (gerencia tudo).';

-- =============================================
-- 2) Helper: supervisor do mesmo setor do contato
-- =============================================
CREATE OR REPLACE FUNCTION public.supervisiona_setor(
  p_setor_id UUID,
  uid UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = uid
      AND role = 'supervisor'
      AND setor_id IS NOT NULL
      AND setor_id IS NOT DISTINCT FROM p_setor_id
  );
$$;

COMMENT ON FUNCTION public.supervisiona_setor IS
  'True se o usuário logado é supervisor do setor informado. Usada para limitar acesso de supervisor ao próprio setor no Engajamento.';

GRANT EXECUTE ON FUNCTION public.supervisiona_setor(UUID, UUID) TO authenticated;

-- =============================================
-- 3) Atualiza pode_editar_aluno_engajamento
--    Supervisor só edita se for do mesmo setor (não mais polo inteiro)
-- =============================================
CREATE OR REPLACE FUNCTION public.pode_editar_aluno_engajamento(
  p_area VARCHAR,
  p_polo_id UUID,
  p_setor_id UUID,
  p_responsavel_id UUID,
  uid UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.tem_acesso_area(p_area, uid)
    AND public.mesmo_polo_do_usuario(p_polo_id, uid)
    AND (
      -- Admin: polo inteiro, qualquer setor
      public.is_admin(uid)
      OR (
        -- Supervisor: só o próprio setor no Engajamento
        p_area = 'engajamento'
        AND public.supervisiona_setor(p_setor_id, uid)
      )
      OR (
        -- Supervisor em outras áreas: continua com visão de polo
        -- (setores só existem no Engajamento)
        p_area IS DISTINCT FROM 'engajamento'
        AND public.supervisiona_polo(p_polo_id, uid)
      )
      OR (
        -- Colaborador em engajamento: só o próprio setor + seus contatos ou sem dono
        p_area = 'engajamento'
        AND p_setor_id IS NOT NULL
        AND public.get_user_setor_id(uid) IS NOT NULL
        AND p_setor_id = public.get_user_setor_id(uid)
        AND (
          p_responsavel_id = uid
          OR p_responsavel_id IS NULL
        )
      )
      OR (
        -- Outras áreas (colaborador): regra clássica
        p_area IS DISTINCT FROM 'engajamento'
        AND (
          p_responsavel_id = uid
          OR p_responsavel_id IS NULL
        )
      )
    );
$$;

-- =============================================
-- 4) Atualiza is_gestor_polo (mantém para admin + supervisor de polo
--    em contextos não-setor, mas o uso principal no engajamento passa
--    a ser supervisiona_setor)
-- =============================================
-- Mantemos is_gestor_polo como estava (admin ou qualquer supervisor),
-- pois algumas telas de métricas/polo ainda usam. O isolamento fino
-- fica em pode_editar e nas policies.

-- =============================================
-- 5) Policies de ALUNOS — SELECT / UPDATE / DELETE
--    Supervisor só enxerga/muta contatos do próprio setor no Engajamento
-- =============================================
DROP POLICY IF EXISTS "Selecionar alunos por hierarquia" ON public.alunos;
CREATE POLICY "Selecionar alunos por hierarquia"
  ON public.alunos FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (
      public.tem_acesso_area(area)
      AND polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
      AND (
        -- Supervisor: no engajamento só o próprio setor; outras áreas polo inteiro
        (
          area = 'engajamento'
          AND public.supervisiona_setor(setor_id)
        )
        OR (
          area IS DISTINCT FROM 'engajamento'
          AND public.supervisiona_polo(polo_id)
        )
        OR responsavel_id = auth.uid()
        OR responsavel_id IS NULL
      )
    )
  );

DROP POLICY IF EXISTS "Atualizar alunos por hierarquia" ON public.alunos;
CREATE POLICY "Atualizar alunos por hierarquia"
  ON public.alunos FOR UPDATE TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (
      public.tem_acesso_area(area)
      AND polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
      AND (
        (
          area = 'engajamento'
          AND public.supervisiona_setor(setor_id)
        )
        OR (
          area IS DISTINCT FROM 'engajamento'
          AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'supervisor'
        )
        OR responsavel_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (
      public.tem_acesso_area(area)
      AND polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
      AND (
        (
          area = 'engajamento'
          AND public.supervisiona_setor(setor_id)
        )
        OR (
          area IS DISTINCT FROM 'engajamento'
          AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'supervisor'
        )
        OR responsavel_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Deletar alunos por hierarquia" ON public.alunos;
CREATE POLICY "Deletar alunos por hierarquia"
  ON public.alunos FOR DELETE TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (
      public.tem_acesso_area(area)
      AND polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
      AND (
        (
          area = 'engajamento'
          AND public.supervisiona_setor(setor_id)
        )
        OR (
          area IS DISTINCT FROM 'engajamento'
          AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'supervisor'
        )
        OR responsavel_id = auth.uid()
      )
    )
  );

-- =============================================
-- 6) Integridade da delegação: no Engajamento o responsável precisa
--    ser do mesmo setor do contato (exceto admin).
-- =============================================
CREATE OR REPLACE FUNCTION public.valida_responsavel_mesmo_polo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  polo_responsavel UUID;
  setor_responsavel UUID;
BEGIN
  IF NEW.responsavel_id IS NOT NULL THEN
    SELECT polo_id, setor_id INTO polo_responsavel, setor_responsavel
    FROM public.profiles WHERE id = NEW.responsavel_id;

    -- Mesmo polo (regra antiga)
    IF polo_responsavel IS DISTINCT FROM NEW.polo_id THEN
      IF public.is_admin() THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'O responsável precisa pertencer ao mesmo polo do contato.';
    END IF;

    -- No Engajamento: mesmo setor (supervisor e colaborador não podem
    -- mais atribuir para outro setor)
    IF NEW.area = 'engajamento'
       AND NEW.setor_id IS NOT NULL
       AND setor_responsavel IS DISTINCT FROM NEW.setor_id THEN
      IF public.is_admin() THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'O responsável precisa pertencer ao mesmo setor do contato.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger já existe; só recriamos a função.

-- =============================================
-- 7) Decisão de transferência: supervisor só pode decidir se o
--    setor de origem OU de destino for o seu setor.
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
  v_meu_setor UUID;
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

  -- Admin: sempre pode
  IF public.is_admin() THEN
    NULL; -- ok
  ELSIF public.supervisiona_polo(v_sol.polo_id) THEN
    -- Supervisor: só se o setor de origem ou destino for o dele
    v_meu_setor := public.get_user_setor_id(v_uid);
    IF v_meu_setor IS NULL THEN
      RAISE EXCEPTION 'Supervisor sem setor vinculado não pode decidir transferências. Defina o setor do supervisor.';
    END IF;
    IF v_sol.setor_origem_id IS DISTINCT FROM v_meu_setor
       AND v_sol.setor_destino_id IS DISTINCT FROM v_meu_setor THEN
      RAISE EXCEPTION 'Você só pode aprovar/recusar transferências do seu setor.';
    END IF;
  ELSE
    RAISE EXCEPTION 'Apenas supervisor ou admin podem decidir';
  END IF;

  IF p_aprovar THEN
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
-- 8) Ajuste na listagem de solicitações (opcional reforço):
--    supervisor só vê as do seu setor na RPC de listagem se houver
--    filtro. A policy de SELECT já filtra por supervisiona_polo;
--    para reforçar, atualizamos a policy de SELECT da tabela.
-- =============================================
DROP POLICY IF EXISTS "Ver solicitacoes transferencia" ON public.solicitacoes_transferencia;
CREATE POLICY "Ver solicitacoes transferencia"
  ON public.solicitacoes_transferencia FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (
      public.supervisiona_polo(polo_id)
      AND (
        -- Supervisor com setor: só vê se origem ou destino for o seu
        public.get_user_setor_id() IS NULL
        OR setor_origem_id IS NOT DISTINCT FROM public.get_user_setor_id()
        OR setor_destino_id IS NOT DISTINCT FROM public.get_user_setor_id()
      )
    )
    OR solicitante_id = auth.uid()
    OR responsavel_origem_id = auth.uid()
  );

-- =============================================
-- 9) Nota para o admin:
--    Após rodar esta migration, atribua setor_id aos supervisores
--    existentes que atuam no Engajamento:
--
--    UPDATE public.profiles
--    SET setor_id = '<uuid-do-setor>'
--    WHERE role = 'supervisor' AND setor_id IS NULL;
--
--    Sem setor_id o supervisor NÃO conseguirá ver/editar contatos de
--    engajamento nem decidir transferências.
-- =============================================

-- =============================================
-- 10) Atualiza trigger: supervisor PODE ter setor_id
--     (só admin continua sem setor)
-- =============================================
CREATE OR REPLACE FUNCTION public.valida_setor_do_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_setor_polo UUID;
BEGIN
  IF NEW.setor_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Só admin não carrega setor
  IF NEW.role = 'admin' THEN
    NEW.setor_id := NULL;
    RETURN NEW;
  END IF;

  SELECT polo_id INTO v_setor_polo FROM public.setores WHERE id = NEW.setor_id;
  IF v_setor_polo IS DISTINCT FROM NEW.polo_id THEN
    RAISE EXCEPTION 'O setor do usuário deve ser do mesmo polo dele.';
  END IF;

  RETURN NEW;
END;
$$;

-- Supervisor com área engajamento também precisa de setor
CREATE OR REPLACE FUNCTION public.exige_setor_na_aprovacao_engajamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'aprovado'
     AND NEW.role IN ('colaborador', 'supervisor')
     AND NEW.areas_permitidas IS NOT NULL
     AND 'engajamento' = ANY (NEW.areas_permitidas)
     AND NEW.setor_id IS NULL THEN
    RAISE EXCEPTION 'Usuário de Engajamento (colaborador ou supervisor) precisa de setor_id.';
  END IF;
  RETURN NEW;
END;
$$;
