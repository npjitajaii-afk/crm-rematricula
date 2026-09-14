-- =============================================
-- 1) Setores padrão em todos os polos
-- =============================================
INSERT INTO public.setores (nome, polo_id, ativo)
SELECT nome_setor, p.id, true
FROM public.polos p
CROSS JOIN (VALUES ('Comercial'), ('Contato'), ('Jornada')) AS s(nome_setor)
WHERE NOT EXISTS (
  SELECT 1 FROM public.setores s2
  WHERE s2.polo_id = p.id AND s2.nome = s.nome_setor
);

-- "Geral" vira fallback oculto (não aparece mais pra escolher, mas
-- continua válido pra quem já estiver nele — nenhuma FK quebra).
UPDATE public.setores
SET ativo = false
WHERE nome = 'Geral';

-- =============================================
-- 2) colaboradores_polo() com setor
-- =============================================
DROP FUNCTION IF EXISTS public.colaboradores_polo();

CREATE OR REPLACE FUNCTION public.colaboradores_polo()
RETURNS TABLE (
  id UUID,
  name VARCHAR,
  email VARCHAR,
  polo_id UUID,
  polo_nome VARCHAR,
  setor_id UUID,
  setor_nome VARCHAR
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name, p.email, p.polo_id, pol.nome, p.setor_id, s.nome
  FROM public.profiles p
  LEFT JOIN public.polos pol ON pol.id = p.polo_id
  LEFT JOIN public.setores s ON s.id = p.setor_id
  WHERE public.get_user_polo_id() IS NOT NULL
    AND p.polo_id IS NOT NULL
    AND p.polo_id = public.get_user_polo_id()
  ORDER BY p.name;
$$;

GRANT EXECUTE ON FUNCTION public.colaboradores_polo() TO authenticated;

-- =============================================
-- 3) Sincroniza setor do aluno ao delegar (mudar responsavel_id)
-- =============================================
CREATE OR REPLACE FUNCTION public.sincroniza_setor_ao_delegar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_setor_destino UUID;
BEGIN
  IF NEW.area = 'engajamento'
     AND NEW.responsavel_id IS NOT NULL
     AND NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id THEN

    SELECT setor_id INTO v_setor_destino
    FROM public.profiles
    WHERE id = NEW.responsavel_id;

    IF v_setor_destino IS NOT NULL THEN
      NEW.setor_id := v_setor_destino;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sincroniza_setor_ao_delegar ON public.alunos;
CREATE TRIGGER trg_sincroniza_setor_ao_delegar
  BEFORE UPDATE OF responsavel_id ON public.alunos
  FOR EACH ROW
  EXECUTE FUNCTION public.sincroniza_setor_ao_delegar();