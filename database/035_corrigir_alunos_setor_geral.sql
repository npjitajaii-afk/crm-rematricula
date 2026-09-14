-- =============================================
-- 035 - Corrige contatos ainda no setor "Geral"
--
-- Contatos de engajamento com responsável que já tem setor real
-- (Comercial / Contato / Jornada) herdam o setor do responsável.
-- Também atualiza o trigger para NÃO cair mais em "Geral".
--
-- Rode no SQL Editor do Supabase DEPOIS de 034.
-- =============================================

-- 1) Backfill: aluno em "Geral" (ou setor inativo) + tem responsável com setor
UPDATE public.alunos a
SET setor_id = p.setor_id,
    updated_at = now()
FROM public.profiles p
JOIN public.setores s_resp ON s_resp.id = p.setor_id
WHERE a.area = 'engajamento'
  AND a.responsavel_id IS NOT NULL
  AND a.responsavel_id = p.id
  AND p.setor_id IS NOT NULL
  AND s_resp.ativo = true
  AND (
    a.setor_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.setores s_atual
      WHERE s_atual.id = a.setor_id
        AND (s_atual.nome = 'Geral' OR s_atual.ativo = false)
    )
  )
  -- Mesmo polo
  AND (a.polo_id IS NULL OR s_resp.polo_id = a.polo_id);

-- 2) Trigger: prioriza setor do responsável; sem fallback em "Geral"
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

  -- Se já tem setor, valida se está ativo; se for "Geral"/inativo, limpa pra reatribuir
  IF NEW.setor_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.setores s
      WHERE s.id = NEW.setor_id
        AND (s.ativo IS NOT TRUE OR s.nome = 'Geral')
    ) THEN
      NEW.setor_id := NULL;
    END IF;
  END IF;

  -- 1) Setor do responsável do contato
  IF NEW.setor_id IS NULL AND NEW.responsavel_id IS NOT NULL THEN
    SELECT p.setor_id INTO v_resp_setor
    FROM public.profiles p
    JOIN public.setores s ON s.id = p.setor_id AND s.ativo = true AND s.nome IS DISTINCT FROM 'Geral'
    WHERE p.id = NEW.responsavel_id;
    IF v_resp_setor IS NOT NULL THEN
      NEW.setor_id := v_resp_setor;
    END IF;
  END IF;

  -- 2) Setor de quem está logado (colaborador criando)
  IF NEW.setor_id IS NULL THEN
    v_user_setor := public.get_user_setor_id();
    IF v_user_setor IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.setores s
      WHERE s.id = v_user_setor AND s.ativo = true AND s.nome IS DISTINCT FROM 'Geral'
    ) THEN
      NEW.setor_id := v_user_setor;
    END IF;
  END IF;

  IF NEW.setor_id IS NULL THEN
    RAISE EXCEPTION 'Contato de engajamento precisa de um setor ativo (Comercial, Contato ou Jornada).';
  END IF;

  SELECT polo_id INTO v_setor_polo FROM public.setores WHERE id = NEW.setor_id;
  IF v_setor_polo IS DISTINCT FROM NEW.polo_id THEN
    RAISE EXCEPTION 'O setor do contato deve pertencer ao mesmo polo do contato.';
  END IF;

  RETURN NEW;
END;
$$;

-- Garante o trigger
DROP TRIGGER IF EXISTS trg_exige_setor_no_aluno_engajamento ON public.alunos;
CREATE TRIGGER trg_exige_setor_no_aluno_engajamento
  BEFORE INSERT OR UPDATE OF area, setor_id, polo_id, responsavel_id ON public.alunos
  FOR EACH ROW
  EXECUTE FUNCTION public.exige_setor_no_aluno_engajamento();

-- 3) Relatório rápido (opcional — só SELECT)
-- Contatos que ainda ficaram em Geral sem responsável com setor:
-- SELECT a.id, a.nome, a.responsavel_id, s.nome AS setor
-- FROM public.alunos a
-- LEFT JOIN public.setores s ON s.id = a.setor_id
-- WHERE a.area = 'engajamento' AND (s.nome = 'Geral' OR a.setor_id IS NULL);
