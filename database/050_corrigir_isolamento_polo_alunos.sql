-- =============================================
-- 050 - Corrige isolamento por polo na lista de alunos
--
-- Problema: a lista de Alunos estava puxando contatos de outros polos.
-- Causas possíveis:
--   1) Policy de SELECT com bypass de admin sem filtro de polo
--      (ex.: migration 048 deixou is_admin() sem mesmo_polo)
--   2) Policy antiga (pré-020) ainda ativa no banco
--
-- Regra correta (desde a 020/028):
--   TODOS os usuários (admin, supervisor e colaborador) só veem alunos
--   do PRÓPRIO polo. Admin continua podendo gerenciar usuários de
--   qualquer polo na tela Usuários; alunos/métricas ficam isolados.
-- =============================================

-- Helper (idempotente): true só se polo do registro = polo do usuário logado
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

GRANT EXECUTE ON FUNCTION public.mesmo_polo_do_usuario(UUID, UUID) TO authenticated;

-- =============================================
-- SELECT: sempre exige mesmo polo (inclusive admin)
-- =============================================
DROP POLICY IF EXISTS "Selecionar alunos por hierarquia" ON public.alunos;
CREATE POLICY "Selecionar alunos por hierarquia"
  ON public.alunos FOR SELECT TO authenticated
  USING (
    public.tem_acesso_area(area)
    AND public.mesmo_polo_do_usuario(polo_id)
    AND (
      -- Admin e supervisor: veem todos os contatos do próprio polo
      public.is_admin()
      OR public.is_supervisor()
      -- Colaborador: seus contatos + sem responsável (no próprio polo)
      OR responsavel_id = auth.uid()
      OR responsavel_id IS NULL
      -- Engajamento: lista do polo (regra da 024/030); escrita continua restrita
      OR area = 'engajamento'
    )
  );

COMMENT ON POLICY "Selecionar alunos por hierarquia" ON public.alunos IS
  'SELECT isolado por polo para todos (admin incluso). Só vê alunos do próprio polo.';

-- =============================================
-- INSERT / UPDATE / DELETE: reforça mesmo polo
-- =============================================
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
      public.is_admin()
      OR public.is_supervisor()
      OR responsavel_id = auth.uid()
    )
  )
  WITH CHECK (
    public.tem_acesso_area(area)
    AND public.mesmo_polo_do_usuario(polo_id)
  );

DROP POLICY IF EXISTS "Deletar alunos por hierarquia" ON public.alunos;
CREATE POLICY "Deletar alunos por hierarquia"
  ON public.alunos FOR DELETE TO authenticated
  USING (
    public.tem_acesso_area(area)
    AND public.mesmo_polo_do_usuario(polo_id)
    AND (
      public.is_admin()
      OR public.is_supervisor()
      OR responsavel_id = auth.uid()
    )
  );

-- =============================================
-- Diagnóstico rápido (rode no SQL Editor se quiser conferir):
--
-- -- Seu polo:
-- SELECT id, name, role, polo_id FROM public.profiles WHERE id = auth.uid();
--
-- -- Quantos alunos por polo (só os que a policy deixa ver):
-- SELECT polo_id, count(*) FROM public.alunos GROUP BY polo_id;
--
-- Se ainda aparecer outro polo_id, o profile do usuário logado está
-- com polo_id errado ou NULL — corrija em Usuários / profiles.
-- =============================================
