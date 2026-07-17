-- =============================================
-- MIGRATION: Views de métricas (Dashboard de Métricas)
-- Rode este script no SQL Editor do Supabase.
-- =============================================

-- View: métricas agregadas por colaborador
CREATE OR REPLACE VIEW public.metricas_colaboradores AS
SELECT
  p.id         AS colaborador_id,
  p.name       AS colaborador_nome,
  COUNT(a.id)  AS total_alunos,
  COUNT(a.id) FILTER (WHERE a.status = 'rematriculado') AS rematriculados,
  COUNT(a.id) FILTER (WHERE a.status = 'desistente')    AS desistentes,
  COUNT(a.id) FILTER (WHERE a.status = 'confirmado')    AS confirmados,
  COUNT(a.id) FILTER (WHERE a.status = 'pendente')      AS pendentes,
  COALESCE(SUM(a.valor_pendente) FILTER (WHERE a.status = 'rematriculado'), 0) AS valor_recuperado,
  COALESCE(SUM(a.valor_pendente), 0) AS valor_total_carteira,
  COUNT(i.id)  AS total_interacoes
FROM public.profiles p
LEFT JOIN public.alunos a ON a.responsavel_id = p.id
LEFT JOIN public.interacoes i ON i.aluno_id = a.id
GROUP BY p.id, p.name;

GRANT SELECT ON public.metricas_colaboradores TO authenticated;

-- View: conversão por canal de contato
CREATE OR REPLACE VIEW public.metricas_canais AS
SELECT
  canal_contato,
  COUNT(*)                                                          AS total,
  COUNT(*) FILTER (WHERE status = 'rematriculado')                 AS rematriculados,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'rematriculado') * 100.0 / NULLIF(COUNT(*), 0), 1
  ) AS taxa_conversao
FROM public.alunos
GROUP BY canal_contato;

GRANT SELECT ON public.metricas_canais TO authenticated;

-- NOTA: essas views herdam a segurança de linha das tabelas base
-- (RLS de public.alunos definida em 002_hierarquia_acessos.sql), então um
-- colaborador comum só enxerga os próprios números quando consulta
-- diretamente public.alunos por trás dessas views. Como o Dashboard de
-- Métricas usa GRANT SELECT direto na view (sem RLS própria na view), o
-- ranking de colaboradores deve ser exibido apenas para admin no frontend
-- (ver MetricasDashboard.tsx), pois a view em si expõe todos os colaboradores.
