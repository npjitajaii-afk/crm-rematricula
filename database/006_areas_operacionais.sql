-- =============================================
-- 006 - Áreas operacionais (Rematrícula / Retenção / Engajamento)
-- =============================================
-- Ver README.md seção 2 para o racional completo.

-- 1) Nova coluna `area`
ALTER TABLE public.alunos
  ADD COLUMN area VARCHAR(50) NOT NULL DEFAULT 'rematricula';

CREATE INDEX idx_alunos_area ON public.alunos(area);

-- 2) Constraint composta (área + status): troca a antiga `valid_status`
--    (que só validava o status isolado) por uma que amarra o status
--    permitido à área do aluno.
ALTER TABLE public.alunos DROP CONSTRAINT valid_status;

ALTER TABLE public.alunos ADD CONSTRAINT valid_status_area CHECK (
  (area = 'rematricula' AND status IN (
    'cadastrado', 'pendente', 'contatado', 'aguardando_retorno', 'confirmado',
    'documentacao', 'aguardando_matricula', 'matricula_confirmada',
    'rematriculado', 'desistente', 'retido'
  ))
  OR (area = 'retencao' AND status IN (
    'recebido', 'tentativa_contato', 'contato_realizado', 'diagnostico',
    'proposta_enviada', 'aguardando_decisao', 'recuperado', 'perdido'
  ))
  OR (area = 'engajamento' AND status IN (
    'novo_cadastro', 'boas_vindas', 'primeiro_contato', 'ambientacao',
    'acompanhamento', 'engajado', 'alerta_risco', 'estabilizado'
  ))
);

ALTER TABLE public.alunos ADD CONSTRAINT valid_area CHECK (
  area IN ('rematricula', 'retencao', 'engajamento')
);

-- 3) Triggers de transição automática entre áreas
CREATE OR REPLACE FUNCTION public.mover_para_retencao()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.alunos
  SET area = 'retencao', status = 'recebido', responsavel_id = NULL
  WHERE id = NEW.id;

  INSERT INTO public.interacoes (aluno_id, user_id, tipo, descricao)
  VALUES (NEW.id, auth.uid(), 'status', 'Movido automaticamente para Retenção (desistência na Rematrícula)');

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_mover_para_retencao
  AFTER UPDATE OF status ON public.alunos
  FOR EACH ROW
  WHEN (NEW.area = 'rematricula' AND NEW.status = 'desistente' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.mover_para_retencao();

CREATE OR REPLACE FUNCTION public.mover_para_rematricula()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.alunos
  SET area = 'rematricula', status = 'retido', responsavel_id = NULL
  WHERE id = NEW.id;

  INSERT INTO public.interacoes (aluno_id, user_id, tipo, descricao)
  VALUES (NEW.id, auth.uid(), 'status', 'Recuperado pela Retenção — voltou para a Rematrícula como retido');

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_mover_para_rematricula
  AFTER UPDATE OF status ON public.alunos
  FOR EACH ROW
  WHEN (NEW.area = 'retencao' AND NEW.status = 'recuperado' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.mover_para_rematricula();

-- 4) Views de pipeline/métricas passam a considerar só a Rematrícula.
--    (métricas e score de risco de evasão continuam existindo só para
--    esse funil nesta primeira etapa — ver README.md seção 1)

CREATE OR REPLACE VIEW public.pipeline_rematricula_resumo AS
SELECT
  status,
  COUNT(*) AS total,
  SUM(valor_pendente) AS total_valor_pendente
FROM public.alunos
WHERE area = 'rematricula'
GROUP BY status
ORDER BY
  CASE status
    WHEN 'cadastrado' THEN 1
    WHEN 'pendente' THEN 2
    WHEN 'contatado' THEN 3
    WHEN 'aguardando_retorno' THEN 4
    WHEN 'confirmado' THEN 5
    WHEN 'documentacao' THEN 6
    WHEN 'aguardando_matricula' THEN 7
    WHEN 'matricula_confirmada' THEN 8
    WHEN 'rematriculado' THEN 9
    WHEN 'desistente' THEN 10
    WHEN 'retido' THEN 11
    ELSE 12
  END;

CREATE OR REPLACE VIEW public.metricas_colaboradores AS
SELECT
  p.id         AS colaborador_id,
  p.name       AS colaborador_nome,
  COUNT(a.id) FILTER (WHERE a.area = 'rematricula')                                   AS total_alunos,
  COUNT(a.id) FILTER (WHERE a.area = 'rematricula' AND a.status = 'rematriculado')     AS rematriculados,
  COUNT(a.id) FILTER (WHERE a.area = 'rematricula' AND a.status = 'desistente')        AS desistentes,
  COUNT(a.id) FILTER (WHERE a.area = 'rematricula' AND a.status = 'confirmado')        AS confirmados,
  COUNT(a.id) FILTER (WHERE a.area = 'rematricula' AND a.status = 'pendente')          AS pendentes,
  COALESCE(SUM(a.valor_pendente) FILTER (
    WHERE a.area = 'rematricula' AND a.status = 'rematriculado'
  ), 0) AS valor_recuperado,
  COALESCE(SUM(a.valor_pendente) FILTER (WHERE a.area = 'rematricula'), 0) AS valor_total_carteira,
  COUNT(i.id) FILTER (WHERE a.area = 'rematricula') AS total_interacoes
FROM public.profiles p
LEFT JOIN public.alunos a ON a.responsavel_id = p.id
LEFT JOIN public.interacoes i ON i.aluno_id = a.id
GROUP BY p.id, p.name;

GRANT SELECT ON public.metricas_colaboradores TO authenticated;

CREATE OR REPLACE VIEW public.metricas_canais AS
SELECT
  canal_contato,
  COUNT(*)                                                          AS total,
  COUNT(*) FILTER (WHERE status = 'rematriculado')                  AS rematriculados,
  ROUND(
    (COUNT(*) FILTER (WHERE status = 'rematriculado')::numeric / NULLIF(COUNT(*), 0)) * 100,
    1
  ) AS taxa_conversao
FROM public.alunos
WHERE area = 'rematricula'
GROUP BY canal_contato;

GRANT SELECT ON public.metricas_canais TO authenticated;

-- NOTA: essas views herdam a segurança de linha das tabelas base
-- (RLS de public.alunos definida em 002_hierarquia_acessos.sql).
