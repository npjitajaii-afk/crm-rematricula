-- =============================================
-- 044 - Renomeia setor "Geral" para "Pendente"
--
-- Contatos de engajamento importados sem setor operacional
-- usavam o setor "Geral". A tipagem passa a se chamar "Pendente".
-- Rode no SQL Editor do Supabase DEPOIS de 036/043.
-- =============================================

-- Renomeia em todos os polos (respeita UNIQUE polo_id + nome)
UPDATE public.setores
SET nome = 'Pendente'
WHERE nome = 'Geral'
  AND NOT EXISTS (
    SELECT 1
    FROM public.setores s2
    WHERE s2.polo_id = setores.polo_id
      AND s2.nome = 'Pendente'
      AND s2.id IS DISTINCT FROM setores.id
  );

-- Se já existir "Pendente" no mesmo polo, desativa o "Geral" residual
-- e move alunos/profiles ainda ligados ao Geral para o Pendente do polo.
DO $$
DECLARE
  r RECORD;
  v_pendente UUID;
BEGIN
  FOR r IN
    SELECT s.id AS geral_id, s.polo_id
    FROM public.setores s
    WHERE s.nome = 'Geral'
  LOOP
    SELECT id INTO v_pendente
    FROM public.setores
    WHERE polo_id = r.polo_id AND nome = 'Pendente'
    LIMIT 1;

    IF v_pendente IS NOT NULL THEN
      UPDATE public.alunos
      SET setor_id = v_pendente, updated_at = NOW()
      WHERE setor_id = r.geral_id;

      UPDATE public.profiles
      SET setor_id = v_pendente
      WHERE setor_id = r.geral_id;

      UPDATE public.setores
      SET ativo = false
      WHERE id = r.geral_id;
    END IF;
  END LOOP;
END;
$$;

-- Triggers / funções que ainda citam 'Geral' devem tratar também 'Pendente'
-- como setor sintético (não operacional). Atualiza o helper do trigger de aluno.
CREATE OR REPLACE FUNCTION public.exige_setor_no_aluno_engajamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_setor_polo UUID;
  v_user_setor UUID;
  v_resp_setor UUID;
BEGIN
  IF NEW.area IS DISTINCT FROM 'engajamento' THEN
    NEW.setor_id := NULL;
    RETURN NEW;
  END IF;

  -- Setor inativo / Geral / Pendente → limpa para reatribuir ou ficar sem setor
  IF NEW.setor_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.setores s
      WHERE s.id = NEW.setor_id
        AND (
          s.ativo IS NOT TRUE
          OR s.nome IN ('Geral', 'Pendente')
        )
    ) THEN
      NEW.setor_id := NULL;
    END IF;
  END IF;

  -- 1) Setor do responsável (só setores operacionais)
  IF NEW.setor_id IS NULL AND NEW.responsavel_id IS NOT NULL THEN
    SELECT p.setor_id INTO v_resp_setor
    FROM public.profiles p
    JOIN public.setores s
      ON s.id = p.setor_id
     AND s.ativo = true
     AND s.nome NOT IN ('Geral', 'Pendente')
    WHERE p.id = NEW.responsavel_id;
    IF v_resp_setor IS NOT NULL THEN
      NEW.setor_id := v_resp_setor;
    END IF;
  END IF;

  -- Sem setor operacional é permitido (fica NULL = pendente de classificação)
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

COMMENT ON FUNCTION public.exige_setor_no_aluno_engajamento() IS
  'Engajamento: setor opcional. Setores sintéticos Geral/Pendente não são atribuídos automaticamente.';
