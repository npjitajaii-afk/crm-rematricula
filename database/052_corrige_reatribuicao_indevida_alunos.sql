-- =============================================
-- 052 - Corrige brecha de reatribuição indevida de responsavel_id em alunos
--
-- Problema (achado em auditoria de segurança):
--   A policy de UPDATE criada na 050 tem USING() exigindo posse
--   (is_admin/is_supervisor/responsavel_id = auth.uid()), mas o
--   WITH CHECK() só revalida área + polo — não revalida posse.
--   Resultado: um colaborador dono de um contato consegue, via UPDATE
--   direto (fora da UI), trocar o responsavel_id do próprio contato para
--   si mesmo (roubando de outro colega, se o contato estivesse sem dono)
--   ou para qualquer outro colaborador, pulando por completo o fluxo
--   oficial de solicitacoes_transferencia (033).
--
-- Correção: repetir no WITH CHECK a mesma condição de posse que já
-- existe no USING, para que o resultado final do UPDATE também exija
-- ser admin, supervisor ou já ser o responsável.
-- =============================================

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
    AND (
      public.is_admin()
      OR public.is_supervisor()
      OR responsavel_id = auth.uid()
    )
  );

COMMENT ON POLICY "Atualizar alunos por hierarquia" ON public.alunos IS
  'UPDATE isolado por polo/área. WITH CHECK repete a condição de posse do USING (admin/supervisor/responsável) para impedir que um colaborador comum reatribua responsavel_id fora do fluxo oficial de solicitacoes_transferencia.';

-- =============================================
-- Efeito colateral esperado (correto): a partir de agora, um colaborador
-- comum NÃO consegue mais alterar responsavel_id do próprio contato via
-- UPDATE direto. Se a UI hoje deixa o colaborador "passar" um contato pra
-- outro colega diretamente (sem abrir solicitação), esse botão vai passar
-- a falhar com 403/RLS — o que é o comportamento desejado. Veja o
-- checklist de UI abaixo.
--
-- Checklist pós-migration (frontend):
--   - Conferir em alunosService.ts se existe alguma função de "delegar"
--     que faz supabase.from('alunos').update({ responsavel_id: ... })
--     chamada por um colaborador comum (não admin/supervisor). Se existir
--     e for uma ação que colaborador comum deve poder fazer, ela precisa
--     passar a criar uma solicitacao_transferencia em vez de fazer o
--     UPDATE direto.
--   - Admin/supervisor continuam podendo reatribuir livremente (sem
--     mudança de comportamento pra eles).
-- =============================================