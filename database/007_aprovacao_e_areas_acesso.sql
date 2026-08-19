-- =============================================
-- 007 - Aprovação de cadastro + Áreas de acesso por colaborador
-- =============================================
-- Rode este script no SQL Editor do Supabase (depois das migrations
-- 002, 004, 005 e 006).
--
-- O que essa migration resolve:
-- 1) Ninguém consegue logar sem ser aprovado pelo admin (novo cadastro
--    fica com status = 'pendente' até o admin aprovar).
-- 2) Cada colaborador só vê/edita as áreas operacionais (Rematrícula,
--    Retenção, Engajamento) que o admin liberou pra ele em
--    `areas_permitidas`. Admin sempre vê e edita tudo.
-- 3) Fecha um buraco de segurança que já existia: a policy antiga de
--    UPDATE em profiles deixava qualquer colaborador alterar sua própria
--    linha (inclusive campos como role) sem restrição de coluna. Agora um
--    trigger bloqueia colaborador de alterar role/status/areas_permitidas
--    — só admin pode.

-- 1) Novas colunas em profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pendente';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS valid_status_profile;

ALTER TABLE public.profiles
  ADD CONSTRAINT valid_status_profile CHECK (status IN ('pendente', 'aprovado', 'rejeitado'));

COMMENT ON COLUMN public.profiles.status IS
  'pendente = aguardando aprovação do admin (não consegue logar); aprovado = acesso liberado; rejeitado = cadastro recusado (login bloqueado)';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS areas_permitidas TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.profiles.areas_permitidas IS
  'Áreas operacionais que o colaborador pode ver/editar: rematricula, retencao, engajamento. Ignorado para quem tem role = admin (vê tudo).';

-- Sobe todo mundo que já existia (de antes dessa migration) como aprovado,
-- com acesso às 3 áreas — ninguém que já usava o sistema fica travado de
-- uma hora pra outra. Depois disso, o admin ajusta cada colaborador na
-- tela de Usuários.
UPDATE public.profiles
SET status = 'aprovado',
    areas_permitidas = ARRAY['rematricula', 'retencao', 'engajamento']
WHERE status = 'pendente';

-- 2) Funções auxiliares
CREATE OR REPLACE FUNCTION public.is_approved(uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = uid AND status = 'aprovado'
  );
$$;

-- Admin sempre tem acesso a qualquer área; colaborador só se estiver
-- aprovado e a área constar em areas_permitidas.
CREATE OR REPLACE FUNCTION public.tem_acesso_area(area_check VARCHAR, uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin(uid)
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = uid AND status = 'aprovado' AND area_check = ANY(areas_permitidas)
    );
$$;

-- 3) Policies de ALUNOS: agora também exigem acesso à área do aluno
DROP POLICY IF EXISTS "Selecionar alunos por hierarquia" ON public.alunos;
CREATE POLICY "Selecionar alunos por hierarquia"
  ON public.alunos FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (public.tem_acesso_area(area) AND (responsavel_id = auth.uid() OR responsavel_id IS NULL))
  );

DROP POLICY IF EXISTS "Criar alunos" ON public.alunos;
CREATE POLICY "Criar alunos"
  ON public.alunos FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR public.tem_acesso_area(area)
  );

DROP POLICY IF EXISTS "Atualizar alunos por hierarquia" ON public.alunos;
CREATE POLICY "Atualizar alunos por hierarquia"
  ON public.alunos FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR (public.tem_acesso_area(area) AND (responsavel_id = auth.uid() OR responsavel_id IS NULL))
  )
  WITH CHECK (
    public.is_admin()
    OR (public.tem_acesso_area(area) AND responsavel_id = auth.uid())
  );

DROP POLICY IF EXISTS "Deletar alunos por hierarquia" ON public.alunos;
CREATE POLICY "Deletar alunos por hierarquia"
  ON public.alunos FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR (public.tem_acesso_area(area) AND responsavel_id = auth.uid())
  );

-- 4) Policies de INTERAÇÕES: seguem a área do aluno relacionado
DROP POLICY IF EXISTS "Ver interações por hierarquia" ON public.interacoes;
CREATE POLICY "Ver interações por hierarquia"
  ON public.interacoes FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = interacoes.aluno_id
        AND public.tem_acesso_area(a.area)
        AND (a.responsavel_id = auth.uid() OR a.responsavel_id IS NULL)
    )
  );

DROP POLICY IF EXISTS "Criar interações por hierarquia" ON public.interacoes;
CREATE POLICY "Criar interações por hierarquia"
  ON public.interacoes FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = interacoes.aluno_id
        AND public.tem_acesso_area(a.area)
        AND (a.responsavel_id = auth.uid() OR a.responsavel_id IS NULL)
    )
  );

DROP POLICY IF EXISTS "Atualizar interações por hierarquia" ON public.interacoes;
CREATE POLICY "Atualizar interações por hierarquia"
  ON public.interacoes FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = interacoes.aluno_id AND public.tem_acesso_area(a.area) AND a.responsavel_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Deletar interações por hierarquia" ON public.interacoes;
CREATE POLICY "Deletar interações por hierarquia"
  ON public.interacoes FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = interacoes.aluno_id AND public.tem_acesso_area(a.area) AND a.responsavel_id = auth.uid()
    )
  );

-- 5) Policy de PROFILES: admin passa a poder atualizar qualquer colaborador
-- (pra aprovar/reprovar e definir áreas). Colaborador continua podendo
-- editar sua própria linha (ex: nome/avatar), mas o trigger abaixo bloqueia
-- ele de alterar os campos sensíveis.
DROP POLICY IF EXISTS "Usuário pode atualizar seu próprio profile" ON public.profiles;
CREATE POLICY "Atualizar profile por hierarquia"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.is_admin())
  WITH CHECK (auth.uid() = id OR public.is_admin());

CREATE OR REPLACE FUNCTION public.protege_campos_sensiveis_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.areas_permitidas IS DISTINCT FROM OLD.areas_permitidas THEN
      RAISE EXCEPTION 'Apenas administradores podem alterar papel, status de aprovação ou áreas liberadas.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protege_campos_sensiveis_profile ON public.profiles;
CREATE TRIGGER trg_protege_campos_sensiveis_profile
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protege_campos_sensiveis_profile();

-- IMPORTANTE: depois de rodar essa migration, confirme que seu(s) usuário(s)
-- admin estão com role = 'admin' (migration 002) — eles já saem com
-- status = 'aprovado' automaticamente pelo UPDATE acima.
