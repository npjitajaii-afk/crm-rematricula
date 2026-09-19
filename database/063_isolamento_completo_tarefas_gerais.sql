-- =============================================
-- 063 - Isolamento completo: polo + colaborador
--        (tarefas gerais / membros / etapas)
--
-- Regras:
-- 1) Colaborador: só vê tarefas em que é membro (ou para_user_id)
--    e só a própria linha de progresso / etapas em que é responsável.
-- 2) Admin de polo: só o próprio polo (mesmo_polo).
-- 3) Creator: acesso_ao_polo (todos os polos).
-- 4) Helpers SECURITY DEFINER evitam recursão RLS.
-- 5) Trigger continua forçando polo da tarefa e da etapa.
-- =============================================

-- ========== Helpers (polo + membro) ==========

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

-- Admin do polo da tarefa OU creator (acesso_ao_polo)
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
      AND public.acesso_ao_polo(t.polo_id)
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
      AND public.acesso_ao_polo(t.polo_id)
  );
$$;

-- Etapa no polo do usuário (admin/creator)
CREATE OR REPLACE FUNCTION public.etapa_tarefa_do_meu_polo(p_polo_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin() AND public.acesso_ao_polo(p_polo_id);
$$;

GRANT EXECUTE ON FUNCTION public.sou_membro_tarefa_geral(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sou_membro_tarefa_geral_rem(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tarefa_geral_do_meu_polo_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tarefa_geral_rem_do_meu_polo_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.etapa_tarefa_do_meu_polo(UUID) TO authenticated;

-- ========== ENGAGEMENT: tarefas_gerais ==========

DROP POLICY IF EXISTS "Ver tarefas gerais por polo" ON public.tarefas_gerais;
DROP POLICY IF EXISTS "Ver tarefas gerais" ON public.tarefas_gerais;
DROP POLICY IF EXISTS "Ver tarefas gerais por hierarquia" ON public.tarefas_gerais;

CREATE POLICY "Ver tarefas gerais isolado"
  ON public.tarefas_gerais FOR SELECT TO authenticated
  USING (
    -- Gestor: polo (admin) ou todos (creator via acesso_ao_polo)
    (public.is_admin() AND public.acesso_ao_polo(polo_id))
    -- Destinatário principal
    OR para_user_id = auth.uid()
    -- Membro da tarefa
    OR public.sou_membro_tarefa_geral(id)
  );

DROP POLICY IF EXISTS "Admin cria tarefas gerais do polo" ON public.tarefas_gerais;
DROP POLICY IF EXISTS "Admin cria tarefas gerais" ON public.tarefas_gerais;
CREATE POLICY "Admin cria tarefas gerais do polo"
  ON public.tarefas_gerais FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    AND public.acesso_ao_polo(polo_id)
  );

DROP POLICY IF EXISTS "Admin remove tarefas gerais do polo" ON public.tarefas_gerais;
DROP POLICY IF EXISTS "Admin remove tarefas gerais" ON public.tarefas_gerais;
CREATE POLICY "Admin remove tarefas gerais do polo"
  ON public.tarefas_gerais FOR DELETE TO authenticated
  USING (
    public.is_admin()
    AND public.acesso_ao_polo(polo_id)
  );

DROP POLICY IF EXISTS "Admin atualiza tarefas gerais do polo" ON public.tarefas_gerais;
DROP POLICY IF EXISTS "Admin atualiza tarefas gerais" ON public.tarefas_gerais;
CREATE POLICY "Admin atualiza tarefas gerais do polo"
  ON public.tarefas_gerais FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    AND public.acesso_ao_polo(polo_id)
  )
  WITH CHECK (
    public.is_admin()
    AND public.acesso_ao_polo(polo_id)
  );

-- ========== ENGAGEMENT: membros ==========

DROP POLICY IF EXISTS "Membros ver proprio ou gestor polo" ON public.tarefas_gerais_membros;
DROP POLICY IF EXISTS "Membros ver proprio ou gestor" ON public.tarefas_gerais_membros;
CREATE POLICY "Membros ver proprio ou gestor polo"
  ON public.tarefas_gerais_membros FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.tarefa_geral_do_meu_polo_id(tarefa_id)
  );

DROP POLICY IF EXISTS "Membro atualiza proprio progresso" ON public.tarefas_gerais_membros;
CREATE POLICY "Membro atualiza proprio progresso"
  ON public.tarefas_gerais_membros FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.tarefa_geral_do_meu_polo_id(tarefa_id)
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.tarefa_geral_do_meu_polo_id(tarefa_id)
  );

DROP POLICY IF EXISTS "Admin gerencia membros do polo" ON public.tarefas_gerais_membros;
DROP POLICY IF EXISTS "Admin gerencia membros" ON public.tarefas_gerais_membros;
CREATE POLICY "Admin gerencia membros do polo"
  ON public.tarefas_gerais_membros FOR ALL TO authenticated
  USING (public.tarefa_geral_do_meu_polo_id(tarefa_id))
  WITH CHECK (public.tarefa_geral_do_meu_polo_id(tarefa_id));

-- ========== ENGAGEMENT: etapas ==========

DROP POLICY IF EXISTS "Ver etapas tarefa geral" ON public.tarefas_gerais_etapas;
CREATE POLICY "Ver etapas tarefa geral isolado"
  ON public.tarefas_gerais_etapas FOR SELECT TO authenticated
  USING (
    -- Responsável da linha
    user_id = auth.uid()
    -- Gestor do polo
    OR public.etapa_tarefa_do_meu_polo(polo_id)
    -- Membro da tarefa (vê etapas dos colegas da mesma tarefa)
    OR public.sou_membro_tarefa_geral(tarefa_id)
  );

DROP POLICY IF EXISTS "Admin gerencia etapas" ON public.tarefas_gerais_etapas;
CREATE POLICY "Admin gerencia etapas polo"
  ON public.tarefas_gerais_etapas FOR ALL TO authenticated
  USING (public.etapa_tarefa_do_meu_polo(polo_id))
  WITH CHECK (public.etapa_tarefa_do_meu_polo(polo_id));

DROP POLICY IF EXISTS "Responsavel atualiza propria etapa" ON public.tarefas_gerais_etapas;
CREATE POLICY "Responsavel atualiza propria etapa"
  ON public.tarefas_gerais_etapas FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND status IN ('pendente', 'em_andamento')
  )
  WITH CHECK (user_id = auth.uid());

-- ========== REMATRÍCULA: tarefas ==========

DROP POLICY IF EXISTS "Ver tarefas gerais rematricula por polo" ON public.rematricula_tarefas_gerais;
DROP POLICY IF EXISTS "Ver tarefas gerais rematricula" ON public.rematricula_tarefas_gerais;
DROP POLICY IF EXISTS "Ver tarefas gerais rematricula por hierarquia" ON public.rematricula_tarefas_gerais;

CREATE POLICY "Ver tarefas gerais rematricula isolado"
  ON public.rematricula_tarefas_gerais FOR SELECT TO authenticated
  USING (
    (public.is_admin() AND public.acesso_ao_polo(polo_id))
    OR para_user_id = auth.uid()
    OR public.sou_membro_tarefa_geral_rem(id)
  );

DROP POLICY IF EXISTS "Admin cria tarefas gerais rematricula polo" ON public.rematricula_tarefas_gerais;
DROP POLICY IF EXISTS "Admin cria tarefas gerais rematricula" ON public.rematricula_tarefas_gerais;
CREATE POLICY "Admin cria tarefas gerais rematricula polo"
  ON public.rematricula_tarefas_gerais FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    AND public.acesso_ao_polo(polo_id)
  );

DROP POLICY IF EXISTS "Admin remove tarefas gerais rematricula polo" ON public.rematricula_tarefas_gerais;
DROP POLICY IF EXISTS "Admin remove tarefas gerais rematricula" ON public.rematricula_tarefas_gerais;
CREATE POLICY "Admin remove tarefas gerais rematricula polo"
  ON public.rematricula_tarefas_gerais FOR DELETE TO authenticated
  USING (
    public.is_admin()
    AND public.acesso_ao_polo(polo_id)
  );

DROP POLICY IF EXISTS "Admin atualiza tarefas gerais rematricula polo" ON public.rematricula_tarefas_gerais;
DROP POLICY IF EXISTS "Admin atualiza tarefas gerais rematricula" ON public.rematricula_tarefas_gerais;
CREATE POLICY "Admin atualiza tarefas gerais rematricula polo"
  ON public.rematricula_tarefas_gerais FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    AND public.acesso_ao_polo(polo_id)
  )
  WITH CHECK (
    public.is_admin()
    AND public.acesso_ao_polo(polo_id)
  );

-- ========== REMATRÍCULA: membros ==========

DROP POLICY IF EXISTS "Membros ver proprio ou gestor rem polo" ON public.rematricula_tarefas_gerais_membros;
DROP POLICY IF EXISTS "Membros ver proprio ou gestor rem" ON public.rematricula_tarefas_gerais_membros;
CREATE POLICY "Membros ver proprio ou gestor rem polo"
  ON public.rematricula_tarefas_gerais_membros FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.tarefa_geral_rem_do_meu_polo_id(tarefa_id)
  );

DROP POLICY IF EXISTS "Membro atualiza proprio progresso rem" ON public.rematricula_tarefas_gerais_membros;
CREATE POLICY "Membro atualiza proprio progresso rem"
  ON public.rematricula_tarefas_gerais_membros FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.tarefa_geral_rem_do_meu_polo_id(tarefa_id)
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.tarefa_geral_rem_do_meu_polo_id(tarefa_id)
  );

DROP POLICY IF EXISTS "Admin gerencia membros rem polo" ON public.rematricula_tarefas_gerais_membros;
DROP POLICY IF EXISTS "Admin gerencia membros rem" ON public.rematricula_tarefas_gerais_membros;
CREATE POLICY "Admin gerencia membros rem polo"
  ON public.rematricula_tarefas_gerais_membros FOR ALL TO authenticated
  USING (public.tarefa_geral_rem_do_meu_polo_id(tarefa_id))
  WITH CHECK (public.tarefa_geral_rem_do_meu_polo_id(tarefa_id));

-- ========== REMATRÍCULA: etapas ==========

DROP POLICY IF EXISTS "Ver etapas tarefa geral rem" ON public.rematricula_tarefas_gerais_etapas;
CREATE POLICY "Ver etapas tarefa geral rem isolado"
  ON public.rematricula_tarefas_gerais_etapas FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.etapa_tarefa_do_meu_polo(polo_id)
    OR public.sou_membro_tarefa_geral_rem(tarefa_id)
  );

DROP POLICY IF EXISTS "Admin gerencia etapas rem" ON public.rematricula_tarefas_gerais_etapas;
CREATE POLICY "Admin gerencia etapas rem polo"
  ON public.rematricula_tarefas_gerais_etapas FOR ALL TO authenticated
  USING (public.etapa_tarefa_do_meu_polo(polo_id))
  WITH CHECK (public.etapa_tarefa_do_meu_polo(polo_id));

DROP POLICY IF EXISTS "Responsavel atualiza propria etapa rem" ON public.rematricula_tarefas_gerais_etapas;
CREATE POLICY "Responsavel atualiza propria etapa rem"
  ON public.rematricula_tarefas_gerais_etapas FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND status IN ('pendente', 'em_andamento')
  )
  WITH CHECK (user_id = auth.uid());

-- ========== Trigger: membros só do mesmo polo da tarefa ==========

CREATE OR REPLACE FUNCTION public.valida_membro_mesmo_polo_tarefa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_polo_tarefa UUID;
  v_polo_user UUID;
BEGIN
  SELECT polo_id INTO v_polo_tarefa
  FROM public.tarefas_gerais
  WHERE id = NEW.tarefa_id;

  IF v_polo_tarefa IS NULL THEN
    SELECT polo_id INTO v_polo_tarefa
    FROM public.rematricula_tarefas_gerais
    WHERE id = NEW.tarefa_id;
  END IF;

  IF v_polo_tarefa IS NULL THEN
    RAISE EXCEPTION 'Tarefa sem polo_id.';
  END IF;

  SELECT polo_id INTO v_polo_user
  FROM public.profiles
  WHERE id = NEW.user_id;

  IF v_polo_user IS DISTINCT FROM v_polo_tarefa THEN
    RAISE EXCEPTION 'Colaborador deve ser do mesmo polo da tarefa.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_valida_membro_polo_tg ON public.tarefas_gerais_membros;
CREATE TRIGGER trg_valida_membro_polo_tg
  BEFORE INSERT OR UPDATE OF tarefa_id, user_id
  ON public.tarefas_gerais_membros
  FOR EACH ROW EXECUTE FUNCTION public.valida_membro_mesmo_polo_tarefa();

DROP TRIGGER IF EXISTS trg_valida_membro_polo_rtg ON public.rematricula_tarefas_gerais_membros;
CREATE TRIGGER trg_valida_membro_polo_rtg
  BEFORE INSERT OR UPDATE OF tarefa_id, user_id
  ON public.rematricula_tarefas_gerais_membros
  FOR EACH ROW EXECUTE FUNCTION public.valida_membro_mesmo_polo_tarefa();

COMMENT ON FUNCTION public.valida_membro_mesmo_polo_tarefa IS
  'Impede membro de polo diferente na tarefa geral (engajamento e rematrícula).';
