-- ============================================================
-- 046 — Admin pode apagar usuários (exceto a si mesmo e outros admins)
-- ============================================================

-- Policy de DELETE em profiles: somente admin
DROP POLICY IF EXISTS "Admin pode deletar profiles" ON public.profiles;
CREATE POLICY "Admin pode deletar profiles"
  ON public.profiles
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    AND role IS DISTINCT FROM 'admin'
    AND id IS DISTINCT FROM auth.uid()
  );

-- RPC: apaga profile e, se possível, o usuário em auth.users
CREATE OR REPLACE FUNCTION public.admin_apagar_usuario(target_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_role TEXT;
BEGIN
  IF target_id IS NULL THEN
    RAISE EXCEPTION 'ID do usuário é obrigatório';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem apagar usuários';
  END IF;

  IF target_id = auth.uid() THEN
    RAISE EXCEPTION 'Você não pode apagar a si mesmo';
  END IF;

  SELECT role INTO target_role FROM public.profiles WHERE id = target_id;
  IF target_role IS NULL THEN
    RAISE EXCEPTION 'Usuário não encontrado';
  END IF;

  IF target_role = 'admin' THEN
    RAISE EXCEPTION 'Não é permitido apagar um administrador';
  END IF;

  -- Remove o profile (FKs usam ON DELETE SET NULL / CASCADE onde aplicável)
  DELETE FROM public.profiles WHERE id = target_id;

  -- Tenta remover também o login (auth.users). Em projetos Supabase o
  -- owner SECURITY DEFINER costuma ter permissão; se falhar, o profile
  -- já foi removido e o usuário deixa de aparecer na lista.
  BEGIN
    DELETE FROM auth.users WHERE id = target_id;
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
    WHEN OTHERS THEN
      NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_apagar_usuario(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_apagar_usuario(UUID) TO authenticated;
