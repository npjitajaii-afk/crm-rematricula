-- =============================================
-- 055 - Isolamento por polo no painel de tarefas
--
-- Rode DEPOIS de 054.
--
-- Regras:
-- - Admin/creator: só veem/criam/excluem tarefas do PRÓPRIO polo
-- - Colaborador: só tarefas em que é membro (já filtrado) e do seu polo
-- - Membros: colaborador só o próprio progresso; admin/creator só membros
--   de tarefas do próprio polo
-- =============================================

-- Helper: tarefa pertence ao polo do usuário logado
CREATE OR REPLACE FUNCTION public.tarefa_geral_do_meu_polo(p_polo_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin()
    AND p_polo_id IS NOT NULL
    AND public.mesmo_polo_do_usuario(p_polo_id);
$$;

GRANT EXECUTE ON FUNCTION public.tarefa_geral_do_meu_polo(UUID) TO authenticated;

-- ========== ENGAGEMENT: tarefas_gerais ==========
DROP POLICY IF EXISTS "Ver tarefas gerais" ON public.tarefas_gerais;
DROP POLICY IF EXISTS "Admin ve todas tarefas gerais" ON public.tarefas_gerais;
DROP POLICY IF EXISTS "Colaborador ve tarefas delegadas" ON public.tarefas_gerais;

CREATE POLICY "Ver tarefas gerais por polo"
  ON public.tarefas_gerais FOR SELECT TO authenticated
  USING (
    (
      public.is_admin()
      AND public.mesmo_polo_do_usuario(polo_id)
    )
    OR para_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.tarefas_gerais_membros m
      WHERE m.tarefa_id = id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admin cria tarefas gerais" ON public.tarefas_gerais;
CREATE POLICY "Admin cria tarefas gerais do polo"
  ON public.tarefas_gerais FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    AND public.mesmo_polo_do_usuario(polo_id)
  );

DROP POLICY IF EXISTS "Admin remove tarefas gerais" ON public.tarefas_gerais;
CREATE POLICY "Admin remove tarefas gerais do polo"
  ON public.tarefas_gerais FOR DELETE TO authenticated
  USING (
    public.is_admin()
    AND public.mesmo_polo_do_usuario(polo_id)
  );

DROP POLICY IF EXISTS "Admin atualiza tarefas gerais" ON public.tarefas_gerais;
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

-- Membros engajamento
DROP POLICY IF EXISTS "Membros ver proprio ou gestor" ON public.tarefas_gerais_membros;
CREATE POLICY "Membros ver proprio ou gestor polo"
  ON public.tarefas_gerais_membros FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      public.is_admin()
      AND EXISTS (
        SELECT 1 FROM public.tarefas_gerais t
        WHERE t.id = tarefa_id
          AND public.mesmo_polo_do_usuario(t.polo_id)
      )
    )
  );

DROP POLICY IF EXISTS "Membro atualiza proprio progresso" ON public.tarefas_gerais_membros;
CREATE POLICY "Membro atualiza proprio progresso"
  ON public.tarefas_gerais_membros FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      public.is_admin()
      AND EXISTS (
        SELECT 1 FROM public.tarefas_gerais t
        WHERE t.id = tarefa_id
          AND public.mesmo_polo_do_usuario(t.polo_id)
      )
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (
      public.is_admin()
      AND EXISTS (
        SELECT 1 FROM public.tarefas_gerais t
        WHERE t.id = tarefa_id
          AND public.mesmo_polo_do_usuario(t.polo_id)
      )
    )
  );

DROP POLICY IF EXISTS "Admin gerencia membros" ON public.tarefas_gerais_membros;
CREATE POLICY "Admin gerencia membros do polo"
  ON public.tarefas_gerais_membros FOR ALL TO authenticated
  USING (
    public.is_admin()
    AND EXISTS (
      SELECT 1 FROM public.tarefas_gerais t
      WHERE t.id = tarefa_id
        AND public.mesmo_polo_do_usuario(t.polo_id)
    )
  )
  WITH CHECK (
    public.is_admin()
    AND EXISTS (
      SELECT 1 FROM public.tarefas_gerais t
      WHERE t.id = tarefa_id
        AND public.mesmo_polo_do_usuario(t.polo_id)
    )
  );

-- ========== REMATRÍCULA ==========
DROP POLICY IF EXISTS "Ver tarefas gerais rematricula" ON public.rematricula_tarefas_gerais;
DROP POLICY IF EXISTS "Admin ve tarefas gerais rematricula" ON public.rematricula_tarefas_gerais;
DROP POLICY IF EXISTS "Colaborador ve tarefas gerais rematricula" ON public.rematricula_tarefas_gerais;

CREATE POLICY "Ver tarefas gerais rematricula por polo"
  ON public.rematricula_tarefas_gerais FOR SELECT TO authenticated
  USING (
    (
      public.is_admin()
      AND public.mesmo_polo_do_usuario(polo_id)
    )
    OR para_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.rematricula_tarefas_gerais_membros m
      WHERE m.tarefa_id = id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admin cria tarefas gerais rematricula" ON public.rematricula_tarefas_gerais;
CREATE POLICY "Admin cria tarefas gerais rematricula polo"
  ON public.rematricula_tarefas_gerais FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    AND public.mesmo_polo_do_usuario(polo_id)
  );

DROP POLICY IF EXISTS "Admin remove tarefas gerais rematricula" ON public.rematricula_tarefas_gerais;
CREATE POLICY "Admin remove tarefas gerais rematricula polo"
  ON public.rematricula_tarefas_gerais FOR DELETE TO authenticated
  USING (
    public.is_admin()
    AND public.mesmo_polo_do_usuario(polo_id)
  );

DROP POLICY IF EXISTS "Admin atualiza tarefas gerais rematricula" ON public.rematricula_tarefas_gerais;
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

DROP POLICY IF EXISTS "Membros ver proprio ou gestor rem" ON public.rematricula_tarefas_gerais_membros;
CREATE POLICY "Membros ver proprio ou gestor rem polo"
  ON public.rematricula_tarefas_gerais_membros FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      public.is_admin()
      AND EXISTS (
        SELECT 1 FROM public.rematricula_tarefas_gerais t
        WHERE t.id = tarefa_id
          AND public.mesmo_polo_do_usuario(t.polo_id)
      )
    )
  );

DROP POLICY IF EXISTS "Membro atualiza proprio progresso rem" ON public.rematricula_tarefas_gerais_membros;
CREATE POLICY "Membro atualiza proprio progresso rem"
  ON public.rematricula_tarefas_gerais_membros FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      public.is_admin()
      AND EXISTS (
        SELECT 1 FROM public.rematricula_tarefas_gerais t
        WHERE t.id = tarefa_id
          AND public.mesmo_polo_do_usuario(t.polo_id)
      )
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (
      public.is_admin()
      AND EXISTS (
        SELECT 1 FROM public.rematricula_tarefas_gerais t
        WHERE t.id = tarefa_id
          AND public.mesmo_polo_do_usuario(t.polo_id)
      )
    )
  );

DROP POLICY IF EXISTS "Admin gerencia membros rem" ON public.rematricula_tarefas_gerais_membros;
CREATE POLICY "Admin gerencia membros rem polo"
  ON public.rematricula_tarefas_gerais_membros FOR ALL TO authenticated
  USING (
    public.is_admin()
    AND EXISTS (
      SELECT 1 FROM public.rematricula_tarefas_gerais t
      WHERE t.id = tarefa_id
        AND public.mesmo_polo_do_usuario(t.polo_id)
    )
  )
  WITH CHECK (
    public.is_admin()
    AND EXISTS (
      SELECT 1 FROM public.rematricula_tarefas_gerais t
      WHERE t.id = tarefa_id
        AND public.mesmo_polo_do_usuario(t.polo_id)
    )
  );

-- Trigger: força polo_id = polo do criador no INSERT (não confiar só no front)
CREATE OR REPLACE FUNCTION public.forca_polo_tarefa_geral()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.polo_id := public.get_user_polo_id();
  IF NEW.polo_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem polo não pode criar tarefa geral.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_forca_polo_tarefa_geral ON public.tarefas_gerais;
CREATE TRIGGER trg_forca_polo_tarefa_geral
  BEFORE INSERT ON public.tarefas_gerais
  FOR EACH ROW EXECUTE FUNCTION public.forca_polo_tarefa_geral();

DROP TRIGGER IF EXISTS trg_forca_polo_tarefa_geral_rem ON public.rematricula_tarefas_gerais;
CREATE TRIGGER trg_forca_polo_tarefa_geral_rem
  BEFORE INSERT ON public.rematricula_tarefas_gerais
  FOR EACH ROW EXECUTE FUNCTION public.forca_polo_tarefa_geral();

-- Contagem de alunos da meta também isolada (já usa mesmo_polo do responsável)
COMMENT ON FUNCTION public.contar_alunos_meta_tarefa IS
  'Conta alunos do colaborador no status, na semana, só do polo dele (mesmo_polo).';
