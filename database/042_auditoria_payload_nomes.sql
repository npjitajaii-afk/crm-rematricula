-- =============================================
-- 042 - Auditoria: nomes de setor/responsável no payload de transferência
--
-- Rode DEPOIS de 041_auditoria_eventos.sql.
-- Atualiza o trigger de transferência aprovada para gravar nomes legíveis
-- no payload (além dos IDs). Também tenta enriquecer eventos já gravados
-- que ainda não têm nomes.
-- =============================================

CREATE OR REPLACE FUNCTION public.trg_auditoria_transferencia_aprovada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_actor_nome TEXT;
  v_aluno_nome TEXT;
  v_area TEXT;
  v_setor_origem_nome TEXT;
  v_setor_destino_nome TEXT;
  v_resp_origem_nome TEXT;
  v_colab_destino_nome TEXT;
  v_solicitante_nome TEXT;
BEGIN
  IF NOT (NEW.status = 'aprovada' AND OLD.status IS DISTINCT FROM 'aprovada') THEN
    RETURN NEW;
  END IF;

  v_actor := COALESCE(NEW.decidido_por_id, NEW.autorizado_por_id, auth.uid());
  v_actor_nome := public.auditoria_nome_profile(v_actor);

  SELECT a.nome, a.area::text
    INTO v_aluno_nome, v_area
  FROM public.alunos a
  WHERE a.id = NEW.aluno_id;

  SELECT s.nome INTO v_setor_origem_nome
  FROM public.setores s WHERE s.id = NEW.setor_origem_id;

  SELECT s.nome INTO v_setor_destino_nome
  FROM public.setores s WHERE s.id = NEW.setor_destino_id;

  v_resp_origem_nome := public.auditoria_nome_profile(NEW.responsavel_origem_id);
  v_colab_destino_nome := public.auditoria_nome_profile(NEW.colaborador_destino_id);
  v_solicitante_nome := public.auditoria_nome_profile(NEW.solicitante_id);

  INSERT INTO public.auditoria_eventos (
    aluno_id, aluno_nome, polo_id, area, tipo, payload, actor_id, actor_nome, created_at
  ) VALUES (
    NEW.aluno_id,
    v_aluno_nome,
    NEW.polo_id,
    v_area,
    'transferencia',
    jsonb_build_object(
      'solicitacao_id', NEW.id,
      'tipo_solicitacao', NEW.tipo,
      'setor_origem_id', NEW.setor_origem_id,
      'setor_origem_nome', v_setor_origem_nome,
      'setor_destino_id', NEW.setor_destino_id,
      'setor_destino_nome', v_setor_destino_nome,
      'responsavel_origem_id', NEW.responsavel_origem_id,
      'responsavel_origem_nome', v_resp_origem_nome,
      'colaborador_destino_id', NEW.colaborador_destino_id,
      'colaborador_destino_nome', v_colab_destino_nome,
      'solicitante_id', NEW.solicitante_id,
      'solicitante_nome', v_solicitante_nome,
      'decidido_por_id', NEW.decidido_por_id,
      'autorizado_por_id', NEW.autorizado_por_id,
      'motivo', NEW.motivo,
      'observacao_decisao', NEW.observacao_decisao
    ),
    v_actor,
    v_actor_nome,
    COALESCE(NEW.decidido_em, NOW())
  );

  RETURN NEW;
END;
$$;

-- Enriquecer payloads antigos de transferência (nomes de setor/pessoas)
UPDATE public.auditoria_eventos e
SET payload = e.payload || jsonb_strip_nulls(jsonb_build_object(
  'setor_origem_nome', COALESCE(
    e.payload->>'setor_origem_nome',
    (SELECT s.nome FROM public.setores s WHERE s.id = (e.payload->>'setor_origem_id')::uuid)
  ),
  'setor_destino_nome', COALESCE(
    e.payload->>'setor_destino_nome',
    (SELECT s.nome FROM public.setores s WHERE s.id = (e.payload->>'setor_destino_id')::uuid)
  ),
  'responsavel_origem_nome', COALESCE(
    e.payload->>'responsavel_origem_nome',
    public.auditoria_nome_profile(NULLIF(e.payload->>'responsavel_origem_id', '')::uuid)
  ),
  'colaborador_destino_nome', COALESCE(
    e.payload->>'colaborador_destino_nome',
    public.auditoria_nome_profile(NULLIF(e.payload->>'colaborador_destino_id', '')::uuid)
  ),
  'solicitante_nome', COALESCE(
    e.payload->>'solicitante_nome',
    public.auditoria_nome_profile(NULLIF(e.payload->>'solicitante_id', '')::uuid)
  )
))
WHERE e.tipo = 'transferencia';
