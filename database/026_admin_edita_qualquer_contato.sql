-- =============================================
-- 026 - Admin/supervisor editam qualquer contato do polo
-- =============================================
-- Rode este script no SQL Editor do Supabase (depois de 020/024).
--
-- OBJETIVO: deixar explícito na policy de UPDATE que admin e supervisor
-- podem corrigir informações de QUALQUER contato do próprio polo, mesmo
-- quando o responsável (responsavel_id) é outro colaborador.
--
-- Isso cobre o caso prático: contato cadastrado com dados errados por um
-- colaborador — o admin corrige sem precisar assumir/reatribuir o contato.
--
-- Isolamento por polo (regra da 020) permanece: admin/supervisor só
-- enxergam e editam o próprio polo.

DROP POLICY IF EXISTS "Atualizar alunos por hierarquia" ON public.alunos;
CREATE POLICY "Atualizar alunos por hierarquia"
  ON public.alunos FOR UPDATE TO authenticated
  USING (
    public.tem_acesso_area(area)
    AND polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
    AND (
      -- Admin e supervisor: qualquer contato do polo
      (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'supervisor')
      -- Colaborador: só os seus ou sem responsável
      OR responsavel_id = auth.uid()
      OR responsavel_id IS NULL
    )
  )
  WITH CHECK (
    public.tem_acesso_area(area)
    AND polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
    AND (
      (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'supervisor')
      OR responsavel_id = auth.uid()
    )
  );

COMMENT ON POLICY "Atualizar alunos por hierarquia" ON public.alunos IS
  'UPDATE: admin/supervisor corrigem qualquer contato do polo; colaborador só o próprio (ou sem responsável no USING). Isolamento por polo mantido.';
