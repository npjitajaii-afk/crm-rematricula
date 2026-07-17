-- =============================================
-- MIGRATION: Corrige bug de exclusão em massa (admin)
-- Rode este script no SQL Editor do Supabase.
--
-- Contexto: a policy "Deletar alunos por hierarquia" usava a função
-- public.is_admin() (SECURITY DEFINER). Em DELETE ... IN (ids) o Postgres/
-- PostgREST reavalia a policy linha a linha dentro do mesmo statement, e
-- nesse cenário de batch a função eventualmente falhava em confirmar que o
-- usuário logado era admin — o delete em massa retornava 403 ou apagava só
-- parte das linhas, mesmo para administradores.
--
-- Esta migration troca a condição por uma subquery direta em
-- public.profiles, que é avaliada de forma estável linha a linha.
-- Aplica-se também à policy de UPDATE por consistência (mesmo padrão de
-- avaliação em lote é usado, por exemplo, em delegação/mudança de status
-- feitas em conjunto).
-- =============================================

DROP POLICY IF EXISTS "Deletar alunos por hierarquia" ON public.alunos;

CREATE POLICY "Deletar alunos por hierarquia"
  ON public.alunos FOR DELETE TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR responsavel_id = auth.uid()
  );

DROP POLICY IF EXISTS "Atualizar alunos por hierarquia" ON public.alunos;

CREATE POLICY "Atualizar alunos por hierarquia"
  ON public.alunos FOR UPDATE TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR responsavel_id = auth.uid()
    OR responsavel_id IS NULL
  )
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR responsavel_id = auth.uid()
  );
