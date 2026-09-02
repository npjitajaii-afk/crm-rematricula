-- =============================================
-- 017 - Polos (unidades) + vínculo com colaboradores e alunos
-- =============================================
-- Rode este script no SQL Editor do Supabase (depois das migrations anteriores).
--
-- Regras de negócio:
-- 1) Cada colaborador pertence a um único polo (profiles.polo_id).
-- 2) Polos são cadastrados pelo admin na tabela public.polos.
-- 3) Alunos existentes sem polo assumem Itajaí como padrão.
-- 4) Colaborador só enxerga alunos do seu polo (admin vê todos).

CREATE TABLE IF NOT EXISTS public.polos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_polos_updated_at
  BEFORE UPDATE ON public.polos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.polos IS 'Unidades/polos da instituição. Cadastrados pelo admin.';

INSERT INTO public.polos (nome)
VALUES ('Itajaí')
ON CONFLICT (nome) DO NOTHING;

CREATE OR REPLACE FUNCTION public.default_polo_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.polos WHERE nome = 'Itajaí' LIMIT 1;
$$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS polo_id UUID REFERENCES public.polos(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.polo_id IS
  'Polo do colaborador. Admin pode ficar sem polo (vê todos). Colaborador precisa ter um polo atribuído.';

ALTER TABLE public.alunos
  ADD COLUMN IF NOT EXISTS polo_id UUID REFERENCES public.polos(id) ON DELETE RESTRICT;

UPDATE public.alunos
SET polo_id = public.default_polo_id()
WHERE polo_id IS NULL;

ALTER TABLE public.alunos
  ALTER COLUMN polo_id SET DEFAULT public.default_polo_id();

ALTER TABLE public.alunos
  ALTER COLUMN polo_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_alunos_polo_id ON public.alunos(polo_id);
CREATE INDEX IF NOT EXISTS idx_profiles_polo_id ON public.profiles(polo_id);

-- Colaboradores já existentes: assume Itajaí pra não perder acesso de uma hora pra outra.
UPDATE public.profiles
SET polo_id = public.default_polo_id()
WHERE role = 'colaborador' AND polo_id IS NULL;

CREATE OR REPLACE FUNCTION public.get_user_polo_id(uid UUID DEFAULT auth.uid())
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT polo_id FROM public.profiles WHERE id = uid;
$$;

-- ---- RLS: polos ----
ALTER TABLE public.polos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticados podem ver polos" ON public.polos;
CREATE POLICY "Autenticados podem ver polos"
  ON public.polos FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admin gerencia polos" ON public.polos;
CREATE POLICY "Admin gerencia polos"
  ON public.polos FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---- RLS: alunos (recria policies da 007 com filtro de polo) ----
DROP POLICY IF EXISTS "Selecionar alunos por hierarquia" ON public.alunos;
CREATE POLICY "Selecionar alunos por hierarquia"
  ON public.alunos FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (
      public.tem_acesso_area(area)
      AND (responsavel_id = auth.uid() OR responsavel_id IS NULL)
      AND polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
    )
  );

DROP POLICY IF EXISTS "Criar alunos" ON public.alunos;
CREATE POLICY "Criar alunos"
  ON public.alunos FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      public.tem_acesso_area(area)
      AND polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
    )
  );

DROP POLICY IF EXISTS "Atualizar alunos por hierarquia" ON public.alunos;
CREATE POLICY "Atualizar alunos por hierarquia"
  ON public.alunos FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR (
      public.tem_acesso_area(area)
      AND (responsavel_id = auth.uid() OR responsavel_id IS NULL)
      AND polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
    )
  )
  WITH CHECK (
    public.is_admin()
    OR (
      public.tem_acesso_area(area)
      AND responsavel_id = auth.uid()
      AND polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
    )
  );

DROP POLICY IF EXISTS "Deletar alunos por hierarquia" ON public.alunos;
CREATE POLICY "Deletar alunos por hierarquia"
  ON public.alunos FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR (
      public.tem_acesso_area(area)
      AND responsavel_id = auth.uid()
      AND polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
    )
  );

-- ---- Protege polo_id em profiles (só admin altera) ----
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
       OR NEW.areas_permitidas IS DISTINCT FROM OLD.areas_permitidas
       OR NEW.polo_id IS DISTINCT FROM OLD.polo_id THEN
      RAISE EXCEPTION 'Apenas administradores podem alterar papel, status de aprovação, áreas liberadas ou polo.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
