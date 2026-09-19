-- =============================================
-- 061 - Meta individual por membro (tarefas gerais)
--
-- Cada membro pode ter meta_individual (nº de alunos).
-- status_meta continua na tarefa (status compartilhado do funil).
-- meta_semanal na tarefa continua como meta da equipe (opcional).
-- =============================================

ALTER TABLE public.tarefas_gerais_membros
  ADD COLUMN IF NOT EXISTS meta_individual INTEGER
  CHECK (meta_individual IS NULL OR meta_individual > 0);

ALTER TABLE public.rematricula_tarefas_gerais_membros
  ADD COLUMN IF NOT EXISTS meta_individual INTEGER
  CHECK (meta_individual IS NULL OR meta_individual > 0);

COMMENT ON COLUMN public.tarefas_gerais_membros.meta_individual IS
  'Meta de alunos deste membro (individual). NULL = sem meta individual.';
COMMENT ON COLUMN public.rematricula_tarefas_gerais_membros.meta_individual IS
  'Meta de alunos deste membro (individual). NULL = sem meta individual.';
