-- =============================================
-- 018 - Permite leitura de polos sem autenticação
--       e permite gravar polo_id no próprio profile
--       no momento do cadastro (antes da aprovação)
-- =============================================

-- 1) Leitura pública de polos (necessário na tela de cadastro)
DROP POLICY IF EXISTS "Anônimos podem ver polos" ON public.polos;
CREATE POLICY "Anônimos podem ver polos"
  ON public.polos FOR SELECT TO anon
  USING (true);

-- 2) Permite o próprio usuário gravar seu polo_id APENAS
--    quando o campo ainda está NULL (único momento: logo após o signUp)
--    Admin continua podendo alterar livremente via policy existente.
CREATE OR REPLACE FUNCTION public.protege_campos_sensiveis_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    -- Permite o próprio usuário gravar polo_id uma única vez (cadastro inicial)
    IF NEW.polo_id IS DISTINCT FROM OLD.polo_id AND OLD.polo_id IS NOT NULL THEN
      RAISE EXCEPTION 'Apenas administradores podem alterar o polo após o cadastro.';
    END IF;

    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.areas_permitidas IS DISTINCT FROM OLD.areas_permitidas THEN
      RAISE EXCEPTION 'Apenas administradores podem alterar papel, status de aprovação ou áreas liberadas.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;