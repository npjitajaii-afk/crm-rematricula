-- 022_indices_performance_lista.sql
-- Índices compostos para a listagem leve de alunos (Fase 3 do plano de performance).
-- Queries típicas após a Fase 1:
--   SELECT ... FROM alunos WHERE polo_id = $1 AND area = $2 ORDER BY created_at DESC
--   SELECT ... FROM alunos WHERE polo_id = $1 AND responsavel_id = $2
--   SELECT ... FROM interacoes WHERE aluno_id = $1 ORDER BY created_at DESC  (modal/detalhe)

-- Lista por polo + área (Kanban / Meus Contatos / etc.)
CREATE INDEX IF NOT EXISTS idx_alunos_polo_area_created
  ON public.alunos (polo_id, area, created_at DESC);

-- Lista por polo + responsável (visão do colaborador / filtro "meus")
CREATE INDEX IF NOT EXISTS idx_alunos_polo_responsavel
  ON public.alunos (polo_id, responsavel_id);

-- Histórico de interações no modal/detalhe (ordenado do mais recente)
CREATE INDEX IF NOT EXISTS idx_interacoes_aluno_created
  ON public.interacoes (aluno_id, created_at DESC);

-- Comentário: os índices single-column antigos (idx_alunos_created_at,
-- idx_interacoes_aluno_id, idx_alunos_polo_id, idx_alunos_area, etc.)
-- podem permanecer; o planner do Postgres escolhe o composto quando o
-- predicado bate. Não removemos nada aqui para evitar regressão em queries
-- legadas.
