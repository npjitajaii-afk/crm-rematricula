-- 024_busca_contatos_polo_colaborador.sql
-- Colaborador passa a CONSEGUIR VER (SELECT) todos os contatos do próprio polo
-- nas áreas em que tem acesso — inclusive os que estão sob responsabilidade
-- de outro colaborador. Assim a busca encontra o contato e evita cadastro duplicado.
--
-- IMPORTANTE: UPDATE e DELETE continuam restritos (só o responsável, ou
-- admin/supervisor do polo, ou contato sem responsável). Ver policy de
-- atualização/exclusão em 020 — não são alteradas aqui.

DROP POLICY IF EXISTS "Selecionar alunos por hierarquia" ON public.alunos;

CREATE POLICY "Selecionar alunos por hierarquia"
  ON public.alunos FOR SELECT TO authenticated
  USING (
    public.tem_acesso_area(area)
    AND polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
  );

COMMENT ON POLICY "Selecionar alunos por hierarquia" ON public.alunos IS
  'SELECT: qualquer usuário autenticado com acesso à área vê os contatos do próprio polo (inclusive de outros responsáveis). Escrita continua restrita.';
