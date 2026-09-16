-- =============================================
-- 043 - Auditoria: sempre isolada pelo polo do usuário logado
--
-- Admin e supervisor só enxergam eventos do próprio polo
-- (get_user_polo_id). Não há filtro de polo na UI do Relatório.
-- =============================================

DROP POLICY IF EXISTS "Gestores leem auditoria" ON public.auditoria_eventos;

CREATE POLICY "Gestores leem auditoria"
  ON public.auditoria_eventos
  FOR SELECT
  TO authenticated
  USING (
    (public.is_admin() OR public.is_supervisor())
    AND polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
  );

COMMENT ON POLICY "Gestores leem auditoria" ON public.auditoria_eventos IS
  'Admin e supervisor leem só eventos do polo vinculado ao perfil (mesmo isolamento).';
