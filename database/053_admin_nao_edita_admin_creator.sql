-- =============================================
-- Admin não altera outro admin nem creator
-- (reforço no trigger protege_campos_sensiveis_profile)
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

  -- Creator: pode alterar qualquer profile (exceto regras de negócio extras se quiser)
  IF v_meu_role = 'creator' THEN
    -- Creator não rebaixa outro creator por engano via UI comum (opcional: permitir)
    RETURN NEW;
  END IF;

  -- Admin de polo
  IF v_meu_role = 'admin' THEN
    -- Não mexe em creator
    IF OLD.role = 'creator' OR NEW.role = 'creator' THEN
      RAISE EXCEPTION 'Admin não pode alterar o creator.';
    END IF;
    -- Não mexe em outro admin
    IF OLD.role = 'admin' THEN
      RAISE EXCEPTION 'Admin não pode alterar outro administrador.';
    END IF;
    IF NEW.role = 'admin' AND OLD.role IS DISTINCT FROM 'admin' THEN
      -- pode promover colaborador/supervisor a admin do próprio polo
      NULL;
    END IF;
    -- Só profiles do próprio polo
    IF OLD.polo_id IS DISTINCT FROM v_meu_polo THEN
      RAISE EXCEPTION 'Admin só pode alterar usuários do próprio polo.';
    END IF;
    RETURN NEW;
  END IF;

  -- Demais: não alteram campos sensíveis
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

DROP TRIGGER IF EXISTS trg_protege_campos_sensiveis_profile ON public.profiles;
CREATE TRIGGER trg_protege_campos_sensiveis_profile
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protege_campos_sensiveis_profile();
