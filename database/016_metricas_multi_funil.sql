-- =============================================
-- 016 - Métricas multi-funil (Rematrícula / Retenção / Engajamento)
-- =============================================
-- Rode este script no SQL Editor do Supabase (depois da migration 015).
--
-- Contexto: as views de métricas de 004_metricas.sql (metricas_colaboradores
-- e metricas_canais) e o pipeline_rematricula_resumo de 006 nasceram
-- pensadas só para o funil de Rematrícula — misturam todas as áreas numa
-- mesma linha e usam o status 'rematriculado' fixo como "sucesso". Isso
-- nunca deu problema porque só Rematrícula tinha dado real, mas agora que
-- Retenção e Engajamento também vão ter dashboard próprio, isso precisa
-- virar área-consciente. Este script substitui as views antigas por
-- versões com a coluna `area` e um `sucesso` calculado por área (cada
-- funil tem seu próprio conceito de "conversão", ver README.md).
--
-- As views antigas continuam existindo (não foram dropadas) só por
-- compatibilidade caso algo externo dependa delas — o frontend passa a
-- consumir exclusivamente as novas.

-- =============================================
-- 1) Pipeline por área + status (substitui pipeline_rematricula_resumo)
-- =============================================
CREATE OR REPLACE VIEW public.pipeline_area_resumo AS
SELECT
  area,
  status,
  COUNT(*)                    AS total,
  COALESCE(SUM(valor_pendente), 0) AS total_valor_pendente
FROM public.alunos
GROUP BY area, status;

GRANT SELECT ON public.pipeline_area_resumo TO authenticated;

-- =============================================
-- 2) Colaboradores por área
-- =============================================
-- "Sucesso" varia por área:
--   rematricula: status = 'rematriculado'
--   retencao:    status = 'recuperado'
--   engajamento: status IN ('engajado', 'estabilizado')
CREATE OR REPLACE VIEW public.metricas_colaboradores_area AS
SELECT
  p.id        AS colaborador_id,
  p.name      AS colaborador_nome,
  a.area      AS area,
  COUNT(a.id) AS total_alunos,
  COUNT(a.id) FILTER (
    WHERE (a.area = 'rematricula' AND a.status = 'rematriculado')
       OR (a.area = 'retencao'    AND a.status = 'recuperado')
       OR (a.area = 'engajamento' AND a.status IN ('engajado', 'estabilizado'))
  ) AS sucesso,
  COUNT(a.id) FILTER (
    WHERE a.status IN ('desistente', 'perdido')
  ) AS encerrados_sem_sucesso,
  COALESCE(SUM(a.valor_pendente) FILTER (
    WHERE (a.area = 'rematricula' AND a.status = 'rematriculado')
       OR (a.area = 'retencao'    AND a.status = 'recuperado')
  ), 0) AS valor_recuperado,
  COALESCE(SUM(a.valor_pendente), 0) AS valor_total_carteira,
  COUNT(i.id) AS total_interacoes
FROM public.profiles p
JOIN public.alunos a ON a.responsavel_id = p.id
LEFT JOIN public.interacoes i ON i.aluno_id = a.id
GROUP BY p.id, p.name, a.area;

GRANT SELECT ON public.metricas_colaboradores_area TO authenticated;

-- =============================================
-- 3) Canal de contato por área
-- =============================================
CREATE OR REPLACE VIEW public.metricas_canais_area AS
SELECT
  canal_contato,
  area,
  COUNT(*) AS total,
  COUNT(*) FILTER (
    WHERE (area = 'rematricula' AND status = 'rematriculado')
       OR (area = 'retencao'    AND status = 'recuperado')
       OR (area = 'engajamento' AND status IN ('engajado', 'estabilizado'))
  ) AS sucesso,
  ROUND(
    COUNT(*) FILTER (
      WHERE (area = 'rematricula' AND status = 'rematriculado')
         OR (area = 'retencao'    AND status = 'recuperado')
         OR (area = 'engajamento' AND status IN ('engajado', 'estabilizado'))
    ) * 100.0 / NULLIF(COUNT(*), 0), 1
  ) AS taxa_conversao
FROM public.alunos
GROUP BY canal_contato, area;

GRANT SELECT ON public.metricas_canais_area TO authenticated;

-- =============================================
-- 4) Alertas operacionais — alunos "travados" há mais de 14 dias no
--    status atual, por área, excluindo quem já está em status terminal.
-- =============================================
CREATE OR REPLACE VIEW public.alertas_operacao_resumo AS
SELECT
  area,
  COUNT(*) FILTER (
    WHERE status_atualizado_em < NOW() - INTERVAL '14 days'
      AND NOT (
        (area = 'rematricula' AND status IN ('rematriculado', 'desistente'))
        OR (area = 'retencao'    AND status IN ('recuperado', 'perdido'))
        OR (area = 'engajamento' AND status IN ('estabilizado', 'desistente'))
      )
  ) AS travados
FROM public.alunos
GROUP BY area;

GRANT SELECT ON public.alertas_operacao_resumo TO authenticated;

-- =============================================
-- 5) Visão geral do sistema (usada no cabeçalho fixo da tela de Métricas)
-- =============================================
CREATE OR REPLACE VIEW public.metricas_overview_geral AS
SELECT
  area,
  COUNT(*) AS total
FROM public.alunos
GROUP BY area;

GRANT SELECT ON public.metricas_overview_geral TO authenticated;

-- =============================================
-- 6) Tempo médio no status atual, por área + status — alimenta a métrica
--    de "velocidade" de cada funil (só considera quem ainda está no status,
--    não é o tempo total do ciclo completo).
-- =============================================
CREATE OR REPLACE VIEW public.metricas_tempo_status_area AS
SELECT
  area,
  status,
  ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - status_atualizado_em)) / 86400)::numeric, 1) AS dias_medio_no_status,
  COUNT(*) AS total
FROM public.alunos
GROUP BY area, status;

GRANT SELECT ON public.metricas_tempo_status_area TO authenticated;

-- =============================================
-- 7) Jornada entre áreas (cruzado) — quantos alunos já passaram por mais
--    de uma área. Não existe FK explícita de "aluno anterior": o mesmo
--    registro é atualizado in-place pelos triggers de 006_areas_operacionais
--    (mover_para_retencao / mover_para_rematricula), que sempre gravam uma
--    interação tipo 'status' com um texto fixo nessa transição. Detectamos
--    a jornada por esse rastro, não por uma coluna dedicada.
-- =============================================
CREATE OR REPLACE VIEW public.metricas_jornada_multi_area AS
SELECT
  COUNT(DISTINCT aluno_id) AS total_alunos_multi_area,
  COUNT(DISTINCT aluno_id) FILTER (
    WHERE descricao LIKE 'Recuperado pela Retenção%'
  ) AS total_retornados_para_rematricula
FROM public.interacoes
WHERE tipo = 'status'
  AND (
    descricao LIKE 'Movido automaticamente%'
    OR descricao LIKE 'Recuperado pela Retenção%'
  );

GRANT SELECT ON public.metricas_jornada_multi_area TO authenticated;

-- NOTA DE SEGURANÇA: assim como as views antigas de 004_metricas.sql, estas
-- não têm RLS própria (herdam GRANT direto), então metricas_colaboradores_area
-- expõe todos os colaboradores para quem tiver SELECT na view. Mantenha a
-- mesma regra do frontend: ranking de colaboradores só aparece pra admin
-- (ver MetricasDashboard.tsx).
