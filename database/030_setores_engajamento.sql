-- =============================================
-- 030 - Setores no Engajamento (só banco)
--
-- Rode no SQL Editor do Supabase DEPOIS de 027 e 028.
--
-- Regras:
--   - Setor existe por polo (tabela setores).
--   - profiles.setor_id: obrigatório para colaborador com área engajamento.
--     Admin e supervisor NÃO usam setor_id (gerem o polo inteiro).
--   - alunos.setor_id: obrigatório quando area = 'engajamento'.
--   - Colaborador: VÊ todos os contatos de engajamento do polo (todos os
--     setores); SÓ edita/assume os do próprio setor.
--   - Admin/supervisor: veem e editam/delegam qualquer contato do polo,
--     inclusive para colaborador de outro setor.
--   - Rematrícula/retenção: setor_id fica NULL (ignorado).
-- =============================================

-- =============================================
-- 1) Tabela setores
-- =============================================
CREATE TABLE IF NOT EXISTS public.setores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome VARCHAR(120) NOT NULL,
  polo_id UUID NOT NULL REFERENCES public.polos(id) ON DELETE CASCADE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_setor_nome_por_polo UNIQUE (polo_id, nome)
);

CREATE INDEX IF NOT EXISTS idx_setores_polo ON public.setores(polo_id);

COMMENT ON TABLE public.setores IS
  'Setores operacionais do Engajamento, isolados por polo.';

ALTER TABLE public.setores ENABLE ROW LEVEL SECURITY;

-- Leitura: autenticado vê setores do próprio polo (admin vê todos os polos
-- via is_admin para poder cadastrar em qualquer polo na tela de Usuários).
DROP POLICY IF EXISTS "Ver setores do polo" ON public.setores;
CREATE POLICY "Ver setores do polo"
  ON public.setores FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.mesmo_polo_do_usuario(polo_id)
  );

-- Escrita: só admin
DROP POLICY IF EXISTS "Admin gerencia setores" ON public.setores;
CREATE POLICY "Admin gerencia setores"
  ON public.setores FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =============================================
-- 2) Colunas setor_id
-- =============================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS setor_id UUID REFERENCES public.setores(id) ON DELETE SET NULL;

ALTER TABLE public.alunos
  ADD COLUMN IF NOT EXISTS setor_id UUID REFERENCES public.setores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_setor ON public.profiles(setor_id);
CREATE INDEX IF NOT EXISTS idx_alunos_setor ON public.alunos(setor_id)
  WHERE setor_id IS NOT NULL;

COMMENT ON COLUMN public.profiles.setor_id IS
  'Setor do colaborador no Engajamento. NULL para admin/supervisor (gerem o polo).';
COMMENT ON COLUMN public.alunos.setor_id IS
  'Setor do contato no Engajamento. NULL fora de engajamento.';

-- =============================================
-- 3) Helpers
-- =============================================
CREATE OR REPLACE FUNCTION public.get_user_setor_id(uid UUID DEFAULT auth.uid())
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT setor_id FROM public.profiles WHERE id = uid;
$$;

CREATE OR REPLACE FUNCTION public.is_gestor_polo(uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = uid AND role IN ('admin', 'supervisor')
  );
$$;

-- Colaborador pode mutar contato de engajamento do próprio setor
-- (responsável = ele ou sem responsável). Gestor: qualquer do polo.
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
      -- Admin / supervisor: polo inteiro, sem setor
      public.is_gestor_polo(uid)
      OR (
        -- Colaborador em engajamento: só o próprio setor
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
        -- Outras áreas: regra clássica (sem setor)
        p_area IS DISTINCT FROM 'engajamento'
        AND (
          p_responsavel_id = uid
          OR p_responsavel_id IS NULL
        )
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_user_setor_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_gestor_polo(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pode_editar_aluno_engajamento(VARCHAR, UUID, UUID, UUID, UUID) TO authenticated;

-- =============================================
-- 4) Backfill: setor "Geral" por polo + alunos engajamento
-- =============================================
INSERT INTO public.setores (nome, polo_id, ativo)
SELECT 'Geral', p.id, true
FROM public.polos p
WHERE NOT EXISTS (
  SELECT 1 FROM public.setores s
  WHERE s.polo_id = p.id AND s.nome = 'Geral'
);

UPDATE public.alunos a
SET setor_id = s.id
FROM public.setores s
WHERE a.area = 'engajamento'
  AND a.setor_id IS NULL
  AND a.polo_id IS NOT NULL
  AND s.polo_id = a.polo_id
  AND s.nome = 'Geral';

-- =============================================
-- 5) Triggers de integridade
-- =============================================

-- 5.1 Aluno engajamento sempre com setor do mesmo polo
CREATE OR REPLACE FUNCTION public.exige_setor_no_aluno_engajamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_setor_polo UUID;
  v_user_setor UUID;
BEGIN
  IF NEW.area IS DISTINCT FROM 'engajamento' THEN
    -- Fora de engajamento, setor não se aplica
    NEW.setor_id := NULL;
    RETURN NEW;
  END IF;

  -- Se não veio setor, tenta o do usuário (colaborador)
  IF NEW.setor_id IS NULL THEN
    v_user_setor := public.get_user_setor_id();
    IF v_user_setor IS NOT NULL THEN
      NEW.setor_id := v_user_setor;
    END IF;
  END IF;

  IF NEW.setor_id IS NULL THEN
    -- Fallback: setor Geral do polo do aluno
    SELECT s.id INTO NEW.setor_id
    FROM public.setores s
    WHERE s.polo_id = NEW.polo_id AND s.nome = 'Geral' AND s.ativo
    LIMIT 1;
  END IF;

  IF NEW.setor_id IS NULL THEN
    RAISE EXCEPTION 'Contato de engajamento precisa de setor_id.';
  END IF;

  SELECT polo_id INTO v_setor_polo FROM public.setores WHERE id = NEW.setor_id;
  IF v_setor_polo IS DISTINCT FROM NEW.polo_id THEN
    RAISE EXCEPTION 'O setor do contato deve pertencer ao mesmo polo do contato.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_exige_setor_no_aluno_engajamento ON public.alunos;
CREATE TRIGGER trg_exige_setor_no_aluno_engajamento
  BEFORE INSERT OR UPDATE OF area, setor_id, polo_id ON public.alunos
  FOR EACH ROW
  EXECUTE FUNCTION public.exige_setor_no_aluno_engajamento();

-- 5.2 Setor do profile deve ser do mesmo polo do profile
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

  -- Admin/supervisor não devem carregar setor (regra de produto atual)
  IF NEW.role IN ('admin', 'supervisor') THEN
    NEW.setor_id := NULL;
    RETURN NEW;
  END IF;

  SELECT polo_id INTO v_setor_polo FROM public.setores WHERE id = NEW.setor_id;
  IF v_setor_polo IS DISTINCT FROM NEW.polo_id THEN
    RAISE EXCEPTION 'O setor do colaborador deve ser do mesmo polo dele.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_valida_setor_do_profile ON public.profiles;
CREATE TRIGGER trg_valida_setor_do_profile
  BEFORE INSERT OR UPDATE OF setor_id, polo_id, role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.valida_setor_do_profile();

-- 5.3 Aprovação: colaborador com área engajamento precisa de setor
CREATE OR REPLACE FUNCTION public.exige_setor_na_aprovacao_engajamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'aprovado'
     AND NEW.role = 'colaborador'
     AND NEW.areas_permitidas IS NOT NULL
     AND 'engajamento' = ANY (NEW.areas_permitidas)
     AND NEW.setor_id IS NULL THEN
    RAISE EXCEPTION 'Colaborador de Engajamento precisa de setor_id antes da aprovação.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_exige_setor_na_aprovacao_engajamento ON public.profiles;
CREATE TRIGGER trg_exige_setor_na_aprovacao_engajamento
  BEFORE UPDATE OF status, setor_id, areas_permitidas, role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.exige_setor_na_aprovacao_engajamento();

-- 5.4 Só admin altera setor_id de profiles (estende proteção de campos sensíveis)
CREATE OR REPLACE FUNCTION public.protege_campos_sensiveis_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    IF NEW.polo_id IS DISTINCT FROM OLD.polo_id AND OLD.polo_id IS NOT NULL THEN
      RAISE EXCEPTION 'Apenas administradores podem alterar o polo após o cadastro.';
    END IF;

    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.areas_permitidas IS DISTINCT FROM OLD.areas_permitidas THEN
      RAISE EXCEPTION 'Apenas administradores podem alterar papel, status de aprovação ou áreas liberadas.';
    END IF;

    IF NEW.setor_id IS DISTINCT FROM OLD.setor_id THEN
      RAISE EXCEPTION 'Apenas administradores podem alterar o setor do colaborador.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- =============================================
-- 6) RLS alunos — SELECT amplo no engajamento; edição por setor
-- =============================================
DROP POLICY IF EXISTS "Selecionar alunos por hierarquia" ON public.alunos;
CREATE POLICY "Selecionar alunos por hierarquia"
  ON public.alunos FOR SELECT TO authenticated
  USING (
    public.tem_acesso_area(area)
    AND public.mesmo_polo_do_usuario(polo_id)
    AND (
      public.is_gestor_polo()
      OR responsavel_id = auth.uid()
      OR responsavel_id IS NULL
      -- Engajamento: todos os setores do polo veem a lista
      OR area = 'engajamento'
    )
  );

DROP POLICY IF EXISTS "Criar alunos" ON public.alunos;
CREATE POLICY "Criar alunos"
  ON public.alunos FOR INSERT TO authenticated
  WITH CHECK (
    public.tem_acesso_area(area)
    AND public.mesmo_polo_do_usuario(polo_id)
    AND (
      area IS DISTINCT FROM 'engajamento'
      OR public.is_gestor_polo()
      OR (
        -- Colaborador: setor do aluno = setor dele
        setor_id IS NOT NULL
        AND setor_id = public.get_user_setor_id()
      )
      OR (
        -- Gestor já coberto; se colaborador sem setor ainda, trigger tenta Geral
        public.get_user_setor_id() IS NULL AND public.is_gestor_polo()
      )
    )
  );

DROP POLICY IF EXISTS "Atualizar alunos por hierarquia" ON public.alunos;
CREATE POLICY "Atualizar alunos por hierarquia"
  ON public.alunos FOR UPDATE TO authenticated
  USING (
    public.pode_editar_aluno_engajamento(area, polo_id, setor_id, responsavel_id)
  )
  WITH CHECK (
    public.pode_editar_aluno_engajamento(area, polo_id, setor_id, responsavel_id)
  );

DROP POLICY IF EXISTS "Deletar alunos por hierarquia" ON public.alunos;
CREATE POLICY "Deletar alunos por hierarquia"
  ON public.alunos FOR DELETE TO authenticated
  USING (
    public.pode_editar_aluno_engajamento(area, polo_id, setor_id, responsavel_id)
    -- Colaborador só apaga se for o responsável (não apaga “sem dono” de outro)
    AND (
      public.is_gestor_polo()
      OR responsavel_id = auth.uid()
    )
  );

-- =============================================
-- 7) Interações — ver se vê o aluno; mutar se pode editar o aluno
-- =============================================
DROP POLICY IF EXISTS "Ver interações por hierarquia" ON public.interacoes;
CREATE POLICY "Ver interações por hierarquia"
  ON public.interacoes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = interacoes.aluno_id
        AND public.tem_acesso_area(a.area)
        AND public.mesmo_polo_do_usuario(a.polo_id)
        AND (
          public.is_gestor_polo()
          OR a.responsavel_id = auth.uid()
          OR a.responsavel_id IS NULL
          OR a.area = 'engajamento'
        )
    )
  );

DROP POLICY IF EXISTS "Criar interações por hierarquia" ON public.interacoes;
CREATE POLICY "Criar interações por hierarquia"
  ON public.interacoes FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = interacoes.aluno_id
        AND public.pode_editar_aluno_engajamento(
          a.area, a.polo_id, a.setor_id, a.responsavel_id
        )
    )
  );

DROP POLICY IF EXISTS "Atualizar interações por hierarquia" ON public.interacoes;
CREATE POLICY "Atualizar interações por hierarquia"
  ON public.interacoes FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = interacoes.aluno_id
        AND public.pode_editar_aluno_engajamento(
          a.area, a.polo_id, a.setor_id, a.responsavel_id
        )
        AND (
          public.is_gestor_polo()
          OR a.responsavel_id = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS "Deletar interações por hierarquia" ON public.interacoes;
CREATE POLICY "Deletar interações por hierarquia"
  ON public.interacoes FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = interacoes.aluno_id
        AND public.pode_editar_aluno_engajamento(
          a.area, a.polo_id, a.setor_id, a.responsavel_id
        )
        AND (
          public.is_gestor_polo()
          OR a.responsavel_id = auth.uid()
        )
    )
  );

-- =============================================
-- 8) Checklist engajamento — ver amplo; atualizar só quem edita o aluno
-- =============================================
DROP POLICY IF EXISTS "Ver checklist de engajamento" ON public.engajamento_checklist_itens;
CREATE POLICY "Ver checklist de engajamento"
  ON public.engajamento_checklist_itens FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = engajamento_checklist_itens.aluno_id
        AND a.area = 'engajamento'
        AND public.tem_acesso_area('engajamento')
        AND public.mesmo_polo_do_usuario(a.polo_id)
    )
  );

DROP POLICY IF EXISTS "Atualizar checklist de engajamento" ON public.engajamento_checklist_itens;
CREATE POLICY "Atualizar checklist de engajamento"
  ON public.engajamento_checklist_itens FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = engajamento_checklist_itens.aluno_id
        AND public.pode_editar_aluno_engajamento(
          a.area, a.polo_id, a.setor_id, a.responsavel_id
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = engajamento_checklist_itens.aluno_id
        AND public.pode_editar_aluno_engajamento(
          a.area, a.polo_id, a.setor_id, a.responsavel_id
        )
    )
  );

-- =============================================
-- 9) RPC: listar setores do polo do usuário (front)
-- =============================================
CREATE OR REPLACE FUNCTION public.setores_polo()
RETURNS TABLE (
  id UUID,
  nome VARCHAR,
  polo_id UUID,
  ativo BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.nome, s.polo_id, s.ativo
  FROM public.setores s
  WHERE s.ativo = true
    AND (
      public.is_admin()
      OR s.polo_id = public.get_user_polo_id()
    )
  ORDER BY s.nome;
$$;

GRANT EXECUTE ON FUNCTION public.setores_polo() TO authenticated;

-- =============================================
-- 10) Checklist pós-migration
-- =============================================
-- a) Rode 027 e 028 antes.
-- b) Conferir setores criados:
--      SELECT s.nome, p.nome AS polo FROM setores s JOIN polos p ON p.id = s.polo_id;
-- c) Colaboradores de engajamento sem setor (admin precisa atribuir):
--      SELECT id, email, areas_permitidas, setor_id FROM profiles
--      WHERE role = 'colaborador' AND status = 'aprovado'
--        AND 'engajamento' = ANY(areas_permitidas) AND setor_id IS NULL;
-- d) Alunos engajamento sem setor (devem ter sido preenchidos com Geral):
--      SELECT count(*) FROM alunos WHERE area = 'engajamento' AND setor_id IS NULL;
-- e) Teste RLS:
--    - Colab setor A vê aluno setor B → SELECT ok
--    - Colab setor A UPDATE aluno setor B → negado
--    - Supervisor UPDATE qualquer → ok
--    - Admin delega (UPDATE responsavel_id) para colab de outro setor → ok
-- f) UI (próxima etapa): CRUD setores, setor no cadastro/aprovação,
--    filtro setor em Engajamento e Métricas.
