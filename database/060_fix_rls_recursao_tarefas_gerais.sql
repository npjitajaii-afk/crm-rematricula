-- =============================================
-- 060 - Corrige "infinite recursion detected in policy for relation tarefas_gerais"
--
-- Causa: policy de tarefas_gerais consulta membros, e policy de membros
-- consulta tarefas_gerais de novo → loop.
--
-- Solução: helpers SECURITY DEFINER (ignoram RLS nas subconsultas).
-- =============================================

-- ========== Helpers (bypass RLS nas verificações cruzadas) ==========

CREATE OR REPLACE FUNCTION public.sou_membro_tarefa_geral(p_tarefa_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tarefas_gerais_membros m
    WHERE m.tarefa_id = p_tarefa_id
      AND m.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.sou_membro_tarefa_geral_rem(p_tarefa_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.rematricula_tarefas_gerais_membros m
    WHERE m.tarefa_id = p_tarefa_id
      AND m.user_id = auth.uid()
  );
$$;

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
      AND public.mesmo_polo_do_usuario(t.polo_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.sou_membro_tarefa_geral(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sou_membro_tarefa_geral_rem(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tarefa_geral_do_meu_polo_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tarefa_geral_rem_do_meu_polo_id(UUID) TO authenticated;

-- ========== ENGAGEMENT: tarefas_gerais ==========

DROP POLICY IF EXISTS "Ver tarefas gerais por polo" ON public.tarefas_gerais;
DROP POLICY IF EXISTS "Ver tarefas gerais" ON public.tarefas_gerais;

CREATE POLICY "Ver tarefas gerais por polo"
  ON public.tarefas_gerais FOR SELECT TO authenticated
  USING (
    (
      public.is_admin()
      AND public.mesmo_polo_do_usuario(polo_id)
    )
    OR para_user_id = auth.uid()
    OR public.sou_membro_tarefa_geral(id)
  );

-- Membros: não consultar tarefas_gerais direto na policy
DROP POLICY IF EXISTS "Membros ver proprio ou gestor polo" ON public.tarefas_gerais_membros;
DROP POLICY IF EXISTS "Membros ver proprio ou gestor" ON public.tarefas_gerais_membros;

CREATE POLICY "Membros ver proprio ou gestor polo"
  ON public.tarefas_gerais_membros FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      public.is_admin()
      AND public.tarefa_geral_do_meu_polo_id(tarefa_id)
    )
  );

DROP POLICY IF EXISTS "Membro atualiza proprio progresso" ON public.tarefas_gerais_membros;
CREATE POLICY "Membro atualiza proprio progresso"
  ON public.tarefas_gerais_membros FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      public.is_admin()
      AND public.tarefa_geral_do_meu_polo_id(tarefa_id)
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (
      public.is_admin()
      AND public.tarefa_geral_do_meu_polo_id(tarefa_id)
    )
  );

DROP POLICY IF EXISTS "Admin gerencia membros do polo" ON public.tarefas_gerais_membros;
DROP POLICY IF EXISTS "Admin gerencia membros" ON public.tarefas_gerais_membros;
CREATE POLICY "Admin gerencia membros do polo"
  ON public.tarefas_gerais_membros FOR ALL TO authenticated
  USING (
    public.is_admin()
    AND public.tarefa_geral_do_meu_polo_id(tarefa_id)
  )
  WITH CHECK (
    public.is_admin()
    AND public.tarefa_geral_do_meu_polo_id(tarefa_id)
  );

-- ========== REMATRÍCULA ==========

DROP POLICY IF EXISTS "Ver tarefas gerais rematricula por polo" ON public.rematricula_tarefas_gerais;
DROP POLICY IF EXISTS "Ver tarefas gerais rematricula" ON public.rematricula_tarefas_gerais;

CREATE POLICY "Ver tarefas gerais rematricula por polo"
  ON public.rematricula_tarefas_gerais FOR SELECT TO authenticated
  USING (
    (
      public.is_admin()
      AND public.mesmo_polo_do_usuario(polo_id)
    )
    OR para_user_id = auth.uid()
    OR public.sou_membro_tarefa_geral_rem(id)
  );

DROP POLICY IF EXISTS "Membros ver proprio ou gestor rem polo" ON public.rematricula_tarefas_gerais_membros;
DROP POLICY IF EXISTS "Membros ver proprio ou gestor rem" ON public.rematricula_tarefas_gerais_membros;

CREATE POLICY "Membros ver proprio ou gestor rem polo"
  ON public.rematricula_tarefas_gerais_membros FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      public.is_admin()
      AND public.tarefa_geral_rem_do_meu_polo_id(tarefa_id)
    )
  );

DROP POLICY IF EXISTS "Membro atualiza proprio progresso rem" ON public.rematricula_tarefas_gerais_membros;
CREATE POLICY "Membro atualiza proprio progresso rem"
  ON public.rematricula_tarefas_gerais_membros FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      public.is_admin()
      AND public.tarefa_geral_rem_do_meu_polo_id(tarefa_id)
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (
      public.is_admin()
      AND public.tarefa_geral_rem_do_meu_polo_id(tarefa_id)
    )
  );

DROP POLICY IF EXISTS "Admin gerencia membros rem polo" ON public.rematricula_tarefas_gerais_membros;
DROP POLICY IF EXISTS "Admin gerencia membros rem" ON public.rematricula_tarefas_gerais_membros;
CREATE POLICY "Admin gerencia membros rem polo"
  ON public.rematricula_tarefas_gerais_membros FOR ALL TO authenticated
  USING (
    public.is_admin()
    AND public.tarefa_geral_rem_do_meu_polo_id(tarefa_id)
  )
  WITH CHECK (
    public.is_admin()
    AND public.tarefa_geral_rem_do_meu_polo_id(tarefa_id)
  );

-- ========== Comentários (mesma lógica, se existirem) ==========

DROP POLICY IF EXISTS "Ver comentarios tarefa geral" ON public.tarefas_gerais_comentarios;
CREATE POLICY "Ver comentarios tarefa geral"
  ON public.tarefas_gerais_comentarios FOR SELECT TO authenticated
  USING (
    public.sou_membro_tarefa_geral(tarefa_id)
    OR (
      public.is_admin()
      AND public.tarefa_geral_do_meu_polo_id(tarefa_id)
    )
  );

DROP POLICY IF EXISTS "Criar comentarios tarefa geral" ON public.tarefas_gerais_comentarios;
CREATE POLICY "Criar comentarios tarefa geral"
  ON public.tarefas_gerais_comentarios FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      public.sou_membro_tarefa_geral(tarefa_id)
      OR (
        public.is_admin()
        AND public.tarefa_geral_do_meu_polo_id(tarefa_id)
      )
    )
  );

DROP POLICY IF EXISTS "Ver comentarios tarefa geral rem" ON public.rematricula_tarefas_gerais_comentarios;
CREATE POLICY "Ver comentarios tarefa geral rem"
  ON public.rematricula_tarefas_gerais_comentarios FOR SELECT TO authenticated
  USING (
    public.sou_membro_tarefa_geral_rem(tarefa_id)
    OR (
      public.is_admin()
      AND public.tarefa_geral_rem_do_meu_polo_id(tarefa_id)
    )
  );

DROP POLICY IF EXISTS "Criar comentarios tarefa geral rem" ON public.rematricula_tarefas_gerais_comentarios;
CREATE POLICY "Criar comentarios tarefa geral rem"
  ON public.rematricula_tarefas_gerais_comentarios FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      public.sou_membro_tarefa_geral_rem(tarefa_id)
      OR (
        public.is_admin()
        AND public.tarefa_geral_rem_do_meu_polo_id(tarefa_id)
      )
    )
  );

COMMENT ON FUNCTION public.sou_membro_tarefa_geral IS
  'SECURITY DEFINER: evita recursão RLS entre tarefas_gerais e membros.';
