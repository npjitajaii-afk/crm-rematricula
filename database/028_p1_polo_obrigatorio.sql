-- =============================================
-- 028 - P1 Isolamento com polo obrigatório
--
-- Rode no SQL Editor do Supabase DEPOIS da 027.
--
-- Problema:
--   A expressão `polo_id IS NOT DISTINCT FROM get_user_polo_id()`
--   trata NULL = NULL como verdadeiro. Usuário sem polo_id (ou aluno
--   sem polo) podia enxergar/editar registros também sem polo.
--
-- Correções:
--   1) Helper `mesmo_polo_do_usuario(polo)` exige os dois lados NÃO nulos
--      e iguais.
--   2) Policies de alunos e interações usam esse helper.
--   3) Trigger: não aprova profile sem polo_id.
--   4) Trigger: não grava aluno sem polo_id.
--   5) RPC colaboradores_polo ignora profiles sem polo.
-- =============================================

-- =============================================
-- 1) Helper: mesmo polo, ambos obrigatórios
-- =============================================
CREATE OR REPLACE FUNCTION public.mesmo_polo_do_usuario(
  p_polo_id UUID,
  uid UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_polo_id IS NOT NULL
    AND public.get_user_polo_id(uid) IS NOT NULL
    AND p_polo_id = public.get_user_polo_id(uid);
$$;

COMMENT ON FUNCTION public.mesmo_polo_do_usuario IS
  'True só se o polo informado e o polo do usuário logado existem e são iguais. NULL nunca casa com NULL.';

GRANT EXECUTE ON FUNCTION public.mesmo_polo_do_usuario(UUID, UUID) TO authenticated;

-- =============================================
-- 2) ALUNOS — SELECT / INSERT / UPDATE / DELETE
-- =============================================
DROP POLICY IF EXISTS "Selecionar alunos por hierarquia" ON public.alunos;
CREATE POLICY "Selecionar alunos por hierarquia"
  ON public.alunos FOR SELECT TO authenticated
  USING (
    public.tem_acesso_area(area)
    AND public.mesmo_polo_do_usuario(polo_id)
    AND (
      public.is_admin()
      OR public.is_supervisor()
      OR responsavel_id = auth.uid()
      OR responsavel_id IS NULL
    )
  );

DROP POLICY IF EXISTS "Criar alunos" ON public.alunos;
CREATE POLICY "Criar alunos"
  ON public.alunos FOR INSERT TO authenticated
  WITH CHECK (
    public.tem_acesso_area(area)
    AND public.mesmo_polo_do_usuario(polo_id)
  );

DROP POLICY IF EXISTS "Atualizar alunos por hierarquia" ON public.alunos;
CREATE POLICY "Atualizar alunos por hierarquia"
  ON public.alunos FOR UPDATE TO authenticated
  USING (
    public.tem_acesso_area(area)
    AND public.mesmo_polo_do_usuario(polo_id)
    AND (
      (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'supervisor')
      OR responsavel_id = auth.uid()
      OR responsavel_id IS NULL
    )
  )
  WITH CHECK (
    public.tem_acesso_area(area)
    AND public.mesmo_polo_do_usuario(polo_id)
    AND (
      (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'supervisor')
      OR responsavel_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Deletar alunos por hierarquia" ON public.alunos;
CREATE POLICY "Deletar alunos por hierarquia"
  ON public.alunos FOR DELETE TO authenticated
  USING (
    public.tem_acesso_area(area)
    AND public.mesmo_polo_do_usuario(polo_id)
    AND (
      (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'supervisor')
      OR responsavel_id = auth.uid()
    )
  );

COMMENT ON POLICY "Selecionar alunos por hierarquia" ON public.alunos IS
  'P1: exige polo do usuário e do aluno não nulos e iguais (sem match NULL=NULL).';

-- =============================================
-- 3) INTERAÇÕES — via aluno do mesmo polo
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
          public.is_admin()
          OR public.is_supervisor()
          OR a.responsavel_id = auth.uid()
          OR a.responsavel_id IS NULL
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
        AND public.tem_acesso_area(a.area)
        AND public.mesmo_polo_do_usuario(a.polo_id)
        AND (
          public.is_admin()
          OR public.is_supervisor()
          OR a.responsavel_id = auth.uid()
          OR a.responsavel_id IS NULL
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
        AND public.tem_acesso_area(a.area)
        AND public.mesmo_polo_do_usuario(a.polo_id)
        AND (
          public.is_admin()
          OR public.is_supervisor()
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
        AND public.tem_acesso_area(a.area)
        AND public.mesmo_polo_do_usuario(a.polo_id)
        AND (
          public.is_admin()
          OR public.is_supervisor()
          OR a.responsavel_id = auth.uid()
        )
    )
  );

-- =============================================
-- 4) CHECKLIST engajamento — alinhado ao helper P1
--    (027 já isolava; troca IS NOT DISTINCT pelo helper)
-- =============================================
DROP POLICY IF EXISTS "Ver checklist de engajamento" ON public.engajamento_checklist_itens;
CREATE POLICY "Ver checklist de engajamento"
  ON public.engajamento_checklist_itens FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.alunos a
      WHERE a.id = engajamento_checklist_itens.aluno_id
        AND a.area = 'engajamento'
        AND public.tem_acesso_area('engajamento')
        AND public.mesmo_polo_do_usuario(a.polo_id)
        AND (
          public.is_admin()
          OR public.is_supervisor()
          OR a.responsavel_id = auth.uid()
          OR a.responsavel_id IS NULL
        )
    )
  );

DROP POLICY IF EXISTS "Atualizar checklist de engajamento" ON public.engajamento_checklist_itens;
CREATE POLICY "Atualizar checklist de engajamento"
  ON public.engajamento_checklist_itens FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.alunos a
      WHERE a.id = engajamento_checklist_itens.aluno_id
        AND a.area = 'engajamento'
        AND public.tem_acesso_area('engajamento')
        AND public.mesmo_polo_do_usuario(a.polo_id)
        AND (
          public.is_admin()
          OR public.is_supervisor()
          OR a.responsavel_id = auth.uid()
          OR a.responsavel_id IS NULL
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.alunos a
      WHERE a.id = engajamento_checklist_itens.aluno_id
        AND a.area = 'engajamento'
        AND public.tem_acesso_area('engajamento')
        AND public.mesmo_polo_do_usuario(a.polo_id)
        AND (
          public.is_admin()
          OR public.is_supervisor()
          OR a.responsavel_id = auth.uid()
          OR a.responsavel_id IS NULL
        )
    )
  );

-- =============================================
-- 5) AGENDA INSERT — aluno com polo válido (SELECT/DELETE já são só dono na 027)
-- =============================================
DROP POLICY IF EXISTS "Criar agenda pessoal" ON public.engajamento_agenda;
CREATE POLICY "Criar agenda pessoal"
  ON public.engajamento_agenda FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.tem_acesso_area('engajamento')
    AND EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = aluno_id
        AND a.area = 'engajamento'
        AND public.mesmo_polo_do_usuario(a.polo_id)
        AND (
          public.is_admin()
          OR public.is_supervisor()
          OR a.responsavel_id = auth.uid()
          OR a.responsavel_id IS NULL
        )
    )
  );

DROP POLICY IF EXISTS "Criar agenda rematricula" ON public.rematricula_agenda;
CREATE POLICY "Criar agenda rematricula"
  ON public.rematricula_agenda FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.tem_acesso_area('rematricula')
    AND EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = aluno_id
        AND a.area = 'rematricula'
        AND public.mesmo_polo_do_usuario(a.polo_id)
        AND (
          public.is_admin()
          OR public.is_supervisor()
          OR a.responsavel_id = auth.uid()
          OR a.responsavel_id IS NULL
        )
    )
  );

-- =============================================
-- 6) Trigger: aluno sempre com polo_id
-- =============================================
CREATE OR REPLACE FUNCTION public.exige_polo_no_aluno()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.polo_id IS NULL THEN
    -- Fallback: usa o polo do usuário logado (cadastro legítimo)
    NEW.polo_id := public.get_user_polo_id();
  END IF;

  IF NEW.polo_id IS NULL THEN
    RAISE EXCEPTION 'Contato precisa de polo. Defina polo_id ou vincule um polo ao seu usuário.';
  END IF;

  -- Garante que o polo do aluno é o do usuário (exceto se de algum modo
  -- o admin estiver corrigindo dados já no mesmo fluxo de policy).
  IF NOT public.mesmo_polo_do_usuario(NEW.polo_id) THEN
    RAISE EXCEPTION 'O polo do contato deve ser o mesmo polo do usuário logado.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_exige_polo_no_aluno ON public.alunos;
CREATE TRIGGER trg_exige_polo_no_aluno
  BEFORE INSERT OR UPDATE OF polo_id ON public.alunos
  FOR EACH ROW
  EXECUTE FUNCTION public.exige_polo_no_aluno();

-- =============================================
-- 7) Trigger: não aprovar usuário sem polo
-- =============================================
CREATE OR REPLACE FUNCTION public.exige_polo_na_aprovacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só valida transição para aprovado (ou já aprovado com polo removido)
  IF NEW.status = 'aprovado' AND NEW.polo_id IS NULL THEN
    RAISE EXCEPTION 'Não é possível aprovar (nem manter aprovado) um usuário sem polo_id.';
  END IF;

  -- Impede remover o polo de quem já está aprovado
  IF OLD.status = 'aprovado'
     AND NEW.polo_id IS NULL
     AND OLD.polo_id IS NOT NULL THEN
    RAISE EXCEPTION 'Não é possível remover o polo de um usuário aprovado.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_exige_polo_na_aprovacao ON public.profiles;
CREATE TRIGGER trg_exige_polo_na_aprovacao
  BEFORE UPDATE OF status, polo_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.exige_polo_na_aprovacao();

-- =============================================
-- 8) RPC colaboradores_polo — só quem tem polo
-- =============================================
CREATE OR REPLACE FUNCTION public.colaboradores_polo()
RETURNS TABLE (
  id UUID,
  name VARCHAR,
  email VARCHAR,
  polo_id UUID,
  polo_nome VARCHAR
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name, p.email, p.polo_id, pol.nome
  FROM public.profiles p
  LEFT JOIN public.polos pol ON pol.id = p.polo_id
  WHERE public.get_user_polo_id() IS NOT NULL
    AND p.polo_id IS NOT NULL
    AND p.polo_id = public.get_user_polo_id()
  ORDER BY p.name;
$$;

GRANT EXECUTE ON FUNCTION public.colaboradores_polo() TO authenticated;

-- =============================================
-- 9) Checklist pós-migration
-- =============================================
-- a) Rode 027 antes desta 028.
-- b) No Supabase, confira usuários aprovados sem polo:
--      SELECT id, email, role, status, polo_id
--      FROM public.profiles
--      WHERE status = 'aprovado' AND polo_id IS NULL;
--    Se houver linhas, atribua polo_id ANTES de depender do app
--    (senão esses usuários ficam sem ver alunos — comportamento desejado
--    até corrigir o cadastro).
-- c) Teste:
--    - Usuário sem polo_id → SELECT em alunos deve retornar 0 linhas
--    - Aprovar user sem polo → deve falhar com a exception da seção 7
--    - Criar aluno sem polo_id → trigger preenche com o polo do user
--      ou falha se o user também não tiver polo
-- d) Próximo (P2): auditoria de policies antigas no ambiente real.
