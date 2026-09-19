-- =============================================
-- 064 - Creator e Admin: tarefas gerais SÓ do próprio polo
--
-- Antes (063): acesso_ao_polo → creator via todos os polos.
-- Agora: mesmo_polo_do_usuario → admin E creator só o polo deles.
-- =============================================

-- ========== Helpers: gestor só do próprio polo ==========

CREATE OR REPLACE FUNCTION public.tarefa_geral_do_meu_polo_id(p_tarefa_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tarefas_gerais t
    WHERE t.id = p_tarefa_id
      AND public.is_admin()
      AND public.mesmo_polo_do_usuario(t.polo_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.tarefa_geral_rem_do_meu_polo_id(p_tarefa_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.rematricula_tarefas_gerais t
    WHERE t.id = p_tarefa_id
      AND public.is_admin()
      AND public.mesmo_polo_do_usuario(t.polo_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.etapa_tarefa_do_meu_polo(p_polo_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin() AND public.mesmo_polo_do_usuario(p_polo_id);
$$;

GRANT EXECUTE ON FUNCTION public.tarefa_geral_do_meu_polo_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tarefa_geral_rem_do_meu_polo_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.etapa_tarefa_do_meu_polo(UUID) TO authenticated;

-- ========== ENGAGEMENT: tarefas ==========

DROP POLICY IF EXISTS "Ver tarefas gerais isolado" ON public.tarefas_gerais;
DROP POLICY IF EXISTS "Ver tarefas gerais por polo" ON public.tarefas_gerais;

CREATE POLICY "Ver tarefas gerais isolado"
  ON public.tarefas_gerais FOR SELECT TO authenticated
  USING (
    (public.is_admin() AND public.mesmo_polo_do_usuario(polo_id))
    OR para_user_id = auth.uid()
    OR public.sou_membro_tarefa_geral(id)
  );

DROP POLICY IF EXISTS "Admin cria tarefas gerais do polo" ON public.tarefas_gerais;
CREATE POLICY "Admin cria tarefas gerais do polo"
  ON public.tarefas_gerais FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    AND public.mesmo_polo_do_usuario(polo_id)
  );

DROP POLICY IF EXISTS "Admin remove tarefas gerais do polo" ON public.tarefas_gerais;
CREATE POLICY "Admin remove tarefas gerais do polo"
  ON public.tarefas_gerais FOR DELETE TO authenticated
  USING (
    public.is_admin()
    AND public.mesmo_polo_do_usuario(polo_id)
  );

DROP POLICY IF EXISTS "Admin atualiza tarefas gerais do polo" ON public.tarefas_gerais;
CREATE POLICY "Admin atualiza tarefas gerais do polo"
  ON public.tarefas_gerais FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    AND public.mesmo_polo_do_usuario(polo_id)
  )
  WITH CHECK (
    public.is_admin()
    AND public.mesmo_polo_do_usuario(polo_id)
  );

-- ========== REMATRÍCULA: tarefas ==========

DROP POLICY IF EXISTS "Ver tarefas gerais rematricula isolado" ON public.rematricula_tarefas_gerais;
DROP POLICY IF EXISTS "Ver tarefas gerais rematricula por polo" ON public.rematricula_tarefas_gerais;
DROP POLICY IF EXISTS "Ver tarefas gerais rematricula por hierarquia" ON public.rematricula_tarefas_gerais;

CREATE POLICY "Ver tarefas gerais rematricula isolado"
  ON public.rematricula_tarefas_gerais FOR SELECT TO authenticated
  USING (
    (public.is_admin() AND public.mesmo_polo_do_usuario(polo_id))
    OR para_user_id = auth.uid()
    OR public.sou_membro_tarefa_geral_rem(id)
  );

DROP POLICY IF EXISTS "Admin cria tarefas gerais rematricula polo" ON public.rematricula_tarefas_gerais;
CREATE POLICY "Admin cria tarefas gerais rematricula polo"
  ON public.rematricula_tarefas_gerais FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    AND public.mesmo_polo_do_usuario(polo_id)
  );

DROP POLICY IF EXISTS "Admin remove tarefas gerais rematricula polo" ON public.rematricula_tarefas_gerais;
CREATE POLICY "Admin remove tarefas gerais rematricula polo"
  ON public.rematricula_tarefas_gerais FOR DELETE TO authenticated
  USING (
    public.is_admin()
    AND public.mesmo_polo_do_usuario(polo_id)
  );

DROP POLICY IF EXISTS "Admin atualiza tarefas gerais rematricula polo" ON public.rematricula_tarefas_gerais;
CREATE POLICY "Admin atualiza tarefas gerais rematricula polo"
  ON public.rematricula_tarefas_gerais FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    AND public.mesmo_polo_do_usuario(polo_id)
  )
  WITH CHECK (
    public.is_admin()
    AND public.mesmo_polo_do_usuario(polo_id)
  );

COMMENT ON POLICY "Ver tarefas gerais isolado" ON public.tarefas_gerais IS
  'Admin e creator: só próprio polo. Colaborador: membro ou para_user_id.';
COMMENT ON POLICY "Ver tarefas gerais rematricula isolado" ON public.rematricula_tarefas_gerais IS
  'Admin e creator: só próprio polo. Colaborador: membro ou para_user_id.';
