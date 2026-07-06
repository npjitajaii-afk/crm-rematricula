-- =============================================
-- MIGRATION: Hierarquia de Acessos (admin / colaborador)
-- Rode este script no SQL Editor do Supabase
-- =============================================

-- 1) Campo de papel (role) no profile
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'colaborador';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS valid_role;

ALTER TABLE public.profiles
  ADD CONSTRAINT valid_role CHECK (role IN ('admin', 'colaborador'));

COMMENT ON COLUMN public.profiles.role IS 'Papel do colaborador: admin (vê e delega tudo) ou colaborador (só edita/exclui seus contatos)';

-- IMPORTANTE: promova manualmente o(s) admin(s) depois de rodar a migration:
-- UPDATE public.profiles SET role = 'admin' WHERE email = 'seu-email@uniasselvi.com';

-- 2) Função auxiliar para checar se o usuário logado é admin.
-- SECURITY DEFINER pra poder ler profiles independente das policies de quem chama.
CREATE OR REPLACE FUNCTION public.is_admin(uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = uid AND role = 'admin'
  );
$$;

-- 3) Policies de ALUNOS
-- Regra: admin vê/edita/apaga tudo (inclusive em massa).
-- Colaborador: vê e edita só os seus contatos (responsavel_id = auth.uid())
-- e os contatos ainda sem dono (responsavel_id IS NULL, pra poder se auto-atribuir).
-- Contatos de outros colaboradores ficam fora do SELECT (o front usa a view de
-- resumo por status pra mostrar só a contagem, sem detalhe, pros demais).

DROP POLICY IF EXISTS "Autenticados podem ver todos os alunos" ON public.alunos;
DROP POLICY IF EXISTS "Autenticados podem criar alunos" ON public.alunos;
DROP POLICY IF EXISTS "Autenticados podem atualizar alunos" ON public.alunos;
DROP POLICY IF EXISTS "Autenticados podem deletar alunos" ON public.alunos;

CREATE POLICY "Selecionar alunos por hierarquia"
  ON public.alunos FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR responsavel_id = auth.uid()
    OR responsavel_id IS NULL
  );

CREATE POLICY "Criar alunos"
  ON public.alunos FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Atualizar alunos por hierarquia"
  ON public.alunos FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR responsavel_id = auth.uid()
    OR responsavel_id IS NULL
  )
  WITH CHECK (
    public.is_admin()
    OR responsavel_id = auth.uid()
  );

CREATE POLICY "Deletar alunos por hierarquia"
  ON public.alunos FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR responsavel_id = auth.uid()
  );

-- 4) Policies de INTERAÇÕES (seguem o mesmo dono do aluno)
DROP POLICY IF EXISTS "Autenticados podem ver todas as interações" ON public.interacoes;
DROP POLICY IF EXISTS "Autenticados podem criar interações" ON public.interacoes;
DROP POLICY IF EXISTS "Autenticados podem atualizar interações" ON public.interacoes;
DROP POLICY IF EXISTS "Autenticados podem deletar interações" ON public.interacoes;

CREATE POLICY "Ver interações por hierarquia"
  ON public.interacoes FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = interacoes.aluno_id
        AND (a.responsavel_id = auth.uid() OR a.responsavel_id IS NULL)
    )
  );

CREATE POLICY "Criar interações por hierarquia"
  ON public.interacoes FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = interacoes.aluno_id
        AND (a.responsavel_id = auth.uid() OR a.responsavel_id IS NULL)
    )
  );

CREATE POLICY "Atualizar interações por hierarquia"
  ON public.interacoes FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = interacoes.aluno_id AND a.responsavel_id = auth.uid()
    )
  );

CREATE POLICY "Deletar interações por hierarquia"
  ON public.interacoes FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = interacoes.aluno_id AND a.responsavel_id = auth.uid()
    )
  );

-- 5) Garante que colaboradores enxerguem a view de resumo por status
-- (sem PII: só status + total + soma de valor pendente). É por essa view que
-- o colaborador normal vê "quantos alunos tem em cada coluna", mesmo sem ver
-- o detalhe de quem não é dele.
GRANT SELECT ON public.pipeline_rematricula_resumo TO authenticated;

-- 6) Permite listar colaboradores (id/nome/email) pra tela de delegação do admin.
-- A policy de SELECT em profiles já é "true" pra authenticated, então não precisa
-- de mudança ali.
