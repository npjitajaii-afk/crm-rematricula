-- =============================================
-- 036 - Setor opcional no Engajamento (importação)
--
-- Permite contato de engajamento SEM setor_id (ex.: importação
-- com opção "sem setor"). Só preenche automaticamente a partir
-- do responsável, quando houver.
--
-- Rode no SQL Editor do Supabase DEPOIS de 035.
-- =============================================

CREATE OR REPLACE FUNCTION public.exige_setor_no_aluno_engajamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_setor_polo UUID;
  v_resp_setor UUID;
BEGIN
  IF NEW.area IS DISTINCT FROM 'engajamento' THEN
    NEW.setor_id := NULL;
    RETURN NEW;
  END IF;

  -- Setor inativo/Geral → limpa
  IF NEW.setor_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.setores s
      WHERE s.id = NEW.setor_id
        AND (s.ativo IS NOT TRUE OR s.nome = 'Geral')
    ) THEN
      NEW.setor_id := NULL;
    END IF;
  END IF;

  -- Só herda setor do responsável (não do usuário logado),
  -- para a opção "importar sem setor" funcionar de verdade.
  IF NEW.setor_id IS NULL AND NEW.responsavel_id IS NOT NULL THEN
    SELECT p.setor_id INTO v_resp_setor
    FROM public.profiles p
    JOIN public.setores s
      ON s.id = p.setor_id AND s.ativo = true AND s.nome IS DISTINCT FROM 'Geral'
    WHERE p.id = NEW.responsavel_id;
    IF v_resp_setor IS NOT NULL THEN
      NEW.setor_id := v_resp_setor;
    END IF;
  END IF;

  -- Sem setor é permitido
  IF NEW.setor_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT polo_id INTO v_setor_polo FROM public.setores WHERE id = NEW.setor_id;
  IF NEW.polo_id IS NOT NULL AND v_setor_polo IS DISTINCT FROM NEW.polo_id THEN
    RAISE EXCEPTION 'O setor do contato deve pertencer ao mesmo polo do contato.';
  END IF;

  RETURN NEW;
END;
$$;
