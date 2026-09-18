-- =============================================
-- SCRIPT ÚNICO: Creator + Admin por polo + Setores
-- (equivale a 051 + 052 numa tacada só)
--
-- Rode UMA vez no SQL Editor do Supabase.
-- Não precisa rodar 051 e 052 em separado depois.
--
-- O que faz:
-- 1) Cria o papel "creator" e converte admins atuais → creator
-- 2) Admin fica com poderes só no próprio polo
-- 3) Creator: cria polos + aprova usuários de todos os polos (controle)
-- 4) Creator e admin: setores/alunos/operação só no PRÓPRIO polo
-- 5) Admin do polo aprova usuários do polo (não exige creator)
-- =============================================

-- =============================================
-- 051 - Papel "creator" (global) + admin só no próprio polo
--
-- Rode no SQL Editor do Supabase DEPOIS de 050.
--
-- Mudança de regra:
--
-- CREATOR (novo — recebe o que o admin tinha de acesso global):
--   - Vê alunos, métricas, colaboradores de TODOS os polos
--   - Autoriza usuários de qualquer polo (role, status, áreas, polo)
--   - Cadastra e gerencia polos
--   - Aprova transferências de qualquer polo
--
-- ADMIN (agora isolado por polo, mesmos poderes operacionais):
--   - Vê/edita/exclui/delega alunos só do PRÓPRIO polo
--   - Métricas e colaboradores só do próprio polo
--   - Pode gerenciar usuários do próprio polo (aprovar, áreas, role
--     colaborador/supervisor — não promove a creator)
--   - NÃO gerencia a tabela de polos (só creator)
--
-- SUPERVISOR / COLABORADOR: sem mudança nesta migration.
--
-- Migração de dados: todo profile com role = 'admin' vira 'creator'.
-- Depois você pode criar novos "admin" de polo na tela Usuários.
-- =============================================

-- =============================================
-- 1) Constraint de role + migração dos admins atuais
-- =============================================
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS valid_role;

-- Temporário amplo para poder migrar
ALTER TABLE public.profiles
  ADD CONSTRAINT valid_role CHECK (role IN ('creator', 'admin', 'supervisor', 'colaborador'));

-- Admins atuais passam a ser creator (acesso global)
UPDATE public.profiles
SET role = 'creator'
WHERE role = 'admin';

COMMENT ON COLUMN public.profiles.role IS
  'Papel: creator (acesso global, todos os polos) | admin (mesmos poderes operacionais só no próprio polo) | supervisor (setor/polo conforme 048) | colaborador';

-- =============================================
-- 2) Funções de papel
-- =============================================
CREATE OR REPLACE FUNCTION public.is_creator(uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = uid AND role = 'creator'
  );
$$;

-- is_admin = admin de polo OU creator (poderes elevados).
-- Isolamento por polo fica nas policies com is_creator() OR mesmo_polo.
CREATE OR REPLACE FUNCTION public.is_admin(uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = uid AND role IN ('admin', 'creator')
  );
$$;

-- True se o usuário pode enxergar o polo informado (creator = todos)
CREATE OR REPLACE FUNCTION public.acesso_ao_polo(
  p_polo_id UUID,
  uid UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_creator(uid)
    OR public.mesmo_polo_do_usuario(p_polo_id, uid);
$$;

GRANT EXECUTE ON FUNCTION public.is_creator(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.acesso_ao_polo(UUID, UUID) TO authenticated;

-- is_gestor_polo: elevated no polo (admin ou supervisor ou creator)
CREATE OR REPLACE FUNCTION public.is_gestor_polo(uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = uid AND role IN ('creator', 'admin', 'supervisor')
  );
$$;

-- =============================================
-- 3) PROFILES — leitura
--    creator: todos | admin: próprio polo + si mesmo | demais: polo
-- =============================================
DROP POLICY IF EXISTS "Ver profiles por polo (exceto admin)" ON public.profiles;
DROP POLICY IF EXISTS "Autenticados podem ver todos os profiles" ON public.profiles;
CREATE POLICY "Ver profiles por hierarquia"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR public.is_creator()
    OR (
      public.is_admin()
      AND polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
    )
    OR polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
  );

-- =============================================
-- 4) ALUNOS — SELECT/INSERT/UPDATE/DELETE
--    creator: todos os polos | admin/supervisor/colab: próprio polo
-- =============================================
DROP POLICY IF EXISTS "Selecionar alunos por hierarquia" ON public.alunos;
CREATE POLICY "Selecionar alunos por hierarquia"
  ON public.alunos FOR SELECT TO authenticated
  USING (
    public.tem_acesso_area(area)
    AND public.acesso_ao_polo(polo_id)
    AND (
      public.is_admin()
      OR public.is_supervisor()
      OR responsavel_id = auth.uid()
      OR responsavel_id IS NULL
      OR area = 'engajamento'
    )
  );

DROP POLICY IF EXISTS "Criar alunos" ON public.alunos;
CREATE POLICY "Criar alunos"
  ON public.alunos FOR INSERT TO authenticated
  WITH CHECK (
    public.tem_acesso_area(area)
    AND public.acesso_ao_polo(polo_id)
  );

DROP POLICY IF EXISTS "Atualizar alunos por hierarquia" ON public.alunos;
CREATE POLICY "Atualizar alunos por hierarquia"
  ON public.alunos FOR UPDATE TO authenticated
  USING (
    public.tem_acesso_area(area)
    AND public.acesso_ao_polo(polo_id)
    AND (
      public.is_admin()
      OR public.is_supervisor()
      OR responsavel_id = auth.uid()
    )
  )
  WITH CHECK (
    public.tem_acesso_area(area)
    AND public.acesso_ao_polo(polo_id)
  );

DROP POLICY IF EXISTS "Deletar alunos por hierarquia" ON public.alunos;
CREATE POLICY "Deletar alunos por hierarquia"
  ON public.alunos FOR DELETE TO authenticated
  USING (
    public.tem_acesso_area(area)
    AND public.acesso_ao_polo(polo_id)
    AND (
      public.is_admin()
      OR public.is_supervisor()
      OR responsavel_id = auth.uid()
    )
  );

-- =============================================
-- 5) POLOS — só creator gerencia; leitura liberada
-- =============================================
DROP POLICY IF EXISTS "Admin gerencia polos" ON public.polos;
CREATE POLICY "Creator gerencia polos"
  ON public.polos FOR ALL TO authenticated
  USING (public.is_creator())
  WITH CHECK (public.is_creator());

-- =============================================
-- 6) Proteção de campos sensíveis em profiles
--    Creator: tudo | Admin: só usuários do próprio polo, sem promover a creator
-- =============================================
CREATE OR REPLACE FUNCTION public.protege_campos_sensiveis_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meu_polo UUID;
  v_meu_role VARCHAR;
BEGIN
  SELECT role, polo_id INTO v_meu_role, v_meu_polo
  FROM public.profiles WHERE id = auth.uid();

  -- Creator: pode alterar qualquer profile
  IF v_meu_role = 'creator' THEN
    RETURN NEW;
  END IF;

  -- Admin de polo: só profiles do mesmo polo; não pode criar/promover creator
  IF v_meu_role = 'admin' THEN
    IF NEW.role = 'creator' OR (OLD.role IS DISTINCT FROM NEW.role AND NEW.role = 'creator') THEN
      RAISE EXCEPTION 'Apenas o creator pode definir o papel creator.';
    END IF;
    IF OLD.polo_id IS DISTINCT FROM v_meu_polo AND NEW.polo_id IS DISTINCT FROM v_meu_polo THEN
      -- alvo não é do polo do admin
      IF OLD.polo_id IS DISTINCT FROM v_meu_polo THEN
        RAISE EXCEPTION 'Admin só pode alterar usuários do próprio polo.';
      END IF;
    END IF;
    IF OLD.polo_id IS DISTINCT FROM v_meu_polo THEN
      RAISE EXCEPTION 'Admin só pode alterar usuários do próprio polo.';
    END IF;
    RETURN NEW;
  END IF;

  -- Demais: não alteram role/status/áreas
  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.areas_permitidas IS DISTINCT FROM OLD.areas_permitidas
     OR NEW.polo_id IS DISTINCT FROM OLD.polo_id
     OR NEW.setor_id IS DISTINCT FROM OLD.setor_id THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar papel, status, áreas, polo ou setor.';
  END IF;

  RETURN NEW;
END;
$$;

-- =============================================
-- 7) Transferências — decisão: creator qualquer polo; admin só o seu
-- =============================================
CREATE OR REPLACE FUNCTION public.decidir_solicitacao_transferencia(
  p_solicitacao_id UUID,
  p_aprovar BOOLEAN,
  p_observacao TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_sol RECORD;
  v_meu_setor UUID;
BEGIN
  SELECT * INTO v_sol
  FROM public.solicitacoes_transferencia
  WHERE id = p_solicitacao_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada';
  END IF;

  IF v_sol.status IS DISTINCT FROM 'aguardando_gestor' THEN
    RAISE EXCEPTION 'Esta solicitação não está aguardando gestor';
  END IF;

  IF public.is_creator() THEN
    NULL; -- ok, qualquer polo
  ELSIF public.is_admin() AND public.mesmo_polo_do_usuario(v_sol.polo_id) THEN
    NULL; -- admin do polo
  ELSIF public.supervisiona_polo(v_sol.polo_id) THEN
    v_meu_setor := public.get_user_setor_id(v_uid);
    IF v_meu_setor IS NULL THEN
      RAISE EXCEPTION 'Supervisor sem setor vinculado não pode decidir transferências.';
    END IF;
    IF v_sol.setor_origem_id IS DISTINCT FROM v_meu_setor
       AND v_sol.setor_destino_id IS DISTINCT FROM v_meu_setor THEN
      RAISE EXCEPTION 'Você só pode aprovar/recusar transferências do seu setor.';
    END IF;
  ELSE
    RAISE EXCEPTION 'Sem permissão para decidir esta solicitação';
  END IF;

  IF p_aprovar THEN
    UPDATE public.alunos
    SET setor_id = v_sol.setor_destino_id,
        responsavel_id = v_sol.colaborador_destino_id
    WHERE id = v_sol.aluno_id;

    UPDATE public.solicitacoes_transferencia
    SET status = 'aprovada',
        decidido_por_id = v_uid,
        decidido_em = NOW(),
        observacao_decisao = NULLIF(trim(p_observacao), '')
    WHERE id = p_solicitacao_id;
  ELSE
    UPDATE public.solicitacoes_transferencia
    SET status = 'recusada',
        decidido_por_id = v_uid,
        decidido_em = NOW(),
        observacao_decisao = NULLIF(trim(p_observacao), '')
    WHERE id = p_solicitacao_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.decidir_solicitacao_transferencia(UUID, BOOLEAN, TEXT) TO authenticated;

-- =============================================
-- 8) valida_setor_do_profile: só creator (e admin legado) sem forçar limpar
--    Creator e admin podem ter setor NULL
-- =============================================
CREATE OR REPLACE FUNCTION public.valida_setor_do_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_setor_polo UUID;
BEGIN
  IF NEW.setor_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Creator não usa setor (acesso global)
  IF NEW.role = 'creator' THEN
    NEW.setor_id := NULL;
    RETURN NEW;
  END IF;

  SELECT polo_id INTO v_setor_polo FROM public.setores WHERE id = NEW.setor_id;
  IF v_setor_polo IS DISTINCT FROM NEW.polo_id THEN
    RAISE EXCEPTION 'O setor do usuário deve ser do mesmo polo dele.';
  END IF;

  RETURN NEW;
END;
$$;

-- =============================================
-- Nota: após rodar, o(s) antigo(s) admin já são creator.
-- Crie novos usuários role = 'admin' com polo_id definido
-- para ter administradores só daquele polo.
-- =============================================
-- =============================================
-- 052 - Setores só no próprio polo + escopo do creator
--
-- Rode DEPOIS de 051.
--
-- Regras confirmadas:
--
-- SETORES (Engajamento):
--   - Admin e creator: criar / editar / excluir SOMENTE setores do PRÓPRIO polo
--   - Creator NÃO gerencia setores de outros polos
--   - Supervisor/colaborador: só leitura dos setores do polo
--
-- CREATOR (controle / estrutura):
--   - Cria e gerencia POLOS (estrutura)
--   - Vê e aprova/gerencia USUÁRIOS de TODOS os polos (verificação)
--   - NÃO é obrigatório o creator aprovar todo cadastro: o admin do polo
--     também aprova os usuários do próprio polo
--   - No PRÓPRIO polo: mesmos poderes operacionais do admin
--     (alunos, setores, métricas, transferências do polo)
--
-- ADMIN (por polo):
--   - Aprova usuários do próprio polo
--   - Cria/edita/exclui setores do próprio polo
--   - Alunos/métricas/transferências só do próprio polo
-- =============================================

-- =============================================
-- 1) SETORES — escrita só no próprio polo (admin ou creator)
-- =============================================
DROP POLICY IF EXISTS "Admin gerencia setores" ON public.setores;
DROP POLICY IF EXISTS "Gestor gerencia setores do polo" ON public.setores;

CREATE POLICY "Gestor gerencia setores do polo"
  ON public.setores FOR ALL TO authenticated
  USING (
    public.is_admin()  -- admin ou creator
    AND public.mesmo_polo_do_usuario(polo_id)
  )
  WITH CHECK (
    public.is_admin()
    AND public.mesmo_polo_do_usuario(polo_id)
  );

COMMENT ON POLICY "Gestor gerencia setores do polo" ON public.setores IS
  'Admin e creator só criam/editam/excluem setores do próprio polo.';

-- Leitura: creator vê setores de todos os polos (útil na tela de usuários);
-- admin/supervisor/colab só do próprio polo.
DROP POLICY IF EXISTS "Ver setores do polo" ON public.setores;
CREATE POLICY "Ver setores do polo"
  ON public.setores FOR SELECT TO authenticated
  USING (
    public.is_creator()
    OR public.mesmo_polo_do_usuario(polo_id)
  );

-- =============================================
-- 2) ALUNOS — creator operacional só no próprio polo
--    (acesso global do creator fica em usuários + polos)
-- =============================================
CREATE OR REPLACE FUNCTION public.acesso_ao_polo(
  p_polo_id UUID,
  uid UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Dados operacionais (alunos etc.): todos isolados por polo,
  -- inclusive creator. Creator não “invade” operação de outro polo.
  SELECT public.mesmo_polo_do_usuario(p_polo_id, uid);
$$;

-- Policies de alunos já usam acesso_ao_polo(); recriar SELECT para
-- ficar explícito (tem_acesso + mesmo polo + papel).
DROP POLICY IF EXISTS "Selecionar alunos por hierarquia" ON public.alunos;
CREATE POLICY "Selecionar alunos por hierarquia"
  ON public.alunos FOR SELECT TO authenticated
  USING (
    public.tem_acesso_area(area)
    AND public.mesmo_polo_do_usuario(polo_id)
    AND (
      public.is_admin()
      OR public.is_supervisor()
      OR responsavel_id = auth.uid()
      OR responsavel_id IS NULL
      OR area = 'engajamento'
    )
  );

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
-- 3) PROFILES — creator vê/gerencia todos; admin só o polo
--    (já na 051; reforça SELECT)
-- =============================================
DROP POLICY IF EXISTS "Ver profiles por hierarquia" ON public.profiles;
CREATE POLICY "Ver profiles por hierarquia"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR public.is_creator()
    OR polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
  );

-- protege_campos: creator altera qualquer um; admin só do polo;
-- admin do polo também aprova (não exige creator).
-- Função já definida na 051 — reafirma comentário de negócio.
COMMENT ON FUNCTION public.protege_campos_sensiveis_profile() IS
  'Creator altera qualquer profile. Admin só do próprio polo (pode aprovar usuários do polo). Demais não alteram role/status/áreas/polo/setor.';

-- =============================================
-- 4) POLOS — só creator cria/edita estrutura de polos
-- =============================================
DROP POLICY IF EXISTS "Creator gerencia polos" ON public.polos;
DROP POLICY IF EXISTS "Admin gerencia polos" ON public.polos;
CREATE POLICY "Creator gerencia polos"
  ON public.polos FOR ALL TO authenticated
  USING (public.is_creator())
  WITH CHECK (public.is_creator());

-- Leitura de polos: autenticados (já existia USING true em 017)
DROP POLICY IF EXISTS "Autenticados podem ver polos" ON public.polos;
CREATE POLICY "Autenticados podem ver polos"
  ON public.polos FOR SELECT TO authenticated
  USING (true);

-- =============================================
-- 5) Transferências — creator e admin só no próprio polo
--    (creator não decide transferência de outro polo)
-- =============================================
CREATE OR REPLACE FUNCTION public.decidir_solicitacao_transferencia(
  p_solicitacao_id UUID,
  p_aprovar BOOLEAN,
  p_observacao TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_sol RECORD;
  v_meu_setor UUID;
BEGIN
  SELECT * INTO v_sol
  FROM public.solicitacoes_transferencia
  WHERE id = p_solicitacao_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada';
  END IF;

  IF v_sol.status IS DISTINCT FROM 'aguardando_gestor' THEN
    RAISE EXCEPTION 'Esta solicitação não está aguardando gestor';
  END IF;

  -- Creator e admin: só transferências do próprio polo
  IF public.is_admin() AND public.mesmo_polo_do_usuario(v_sol.polo_id) THEN
    NULL;
  ELSIF public.supervisiona_polo(v_sol.polo_id) THEN
    v_meu_setor := public.get_user_setor_id(v_uid);
    IF v_meu_setor IS NULL THEN
      RAISE EXCEPTION 'Supervisor sem setor vinculado não pode decidir transferências.';
    END IF;
    IF v_sol.setor_origem_id IS DISTINCT FROM v_meu_setor
       AND v_sol.setor_destino_id IS DISTINCT FROM v_meu_setor THEN
      RAISE EXCEPTION 'Você só pode aprovar/recusar transferências do seu setor.';
    END IF;
  ELSE
    RAISE EXCEPTION 'Sem permissão para decidir esta solicitação';
  END IF;

  IF p_aprovar THEN
    UPDATE public.alunos
    SET setor_id = v_sol.setor_destino_id,
        responsavel_id = v_sol.colaborador_destino_id
    WHERE id = v_sol.aluno_id;

    UPDATE public.solicitacoes_transferencia
    SET status = 'aprovada',
        decidido_por_id = v_uid,
        decidido_em = NOW(),
        observacao_decisao = NULLIF(trim(p_observacao), '')
    WHERE id = p_solicitacao_id;
  ELSE
    UPDATE public.solicitacoes_transferencia
    SET status = 'recusada',
        decidido_por_id = v_uid,
        decidido_em = NOW(),
        observacao_decisao = NULLIF(trim(p_observacao), '')
    WHERE id = p_solicitacao_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.decidir_solicitacao_transferencia(UUID, BOOLEAN, TEXT) TO authenticated;
