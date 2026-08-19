-- =============================================
-- 008 - Limite de 2 áreas simultâneas por colaborador
-- =============================================
-- Rode este script no SQL Editor do Supabase (depois da migration 007).
--
-- O que essa migration resolve:
-- Regra de negócio confirmada: um colaborador pode ter no máximo 2 áreas
-- operacionais liberadas ao mesmo tempo (rematrícula/retenção/engajamento)
-- — nem todos têm acesso a duas, pode ser só uma. O front-end
-- (src/pages/Usuarios.tsx) já bloqueia isso na UI, mas isso sozinho não
-- impede alguém de mandar um UPDATE direto pra tabela `profiles` (via API,
-- outra ferramenta admin do Supabase, etc.) com 3 áreas. Esta migration
-- fecha esse buraco com uma CHECK constraint no banco — a garantia real
-- fica no schema, a validação da UI é só pra dar feedback rápido.
--
-- Observação: a constraint vale pra todo mundo, mas na prática só afeta
-- colaboradores — `areas_permitidas` já é ignorado para quem tem
-- role = 'admin' (comentário da coluna, migration 007).
--
-- ATENÇÃO: a migration 007 concedeu as 3 áreas de uma vez pra quem já
-- usava o sistema antes dela existir. Se isso não tiver sido revisado
-- manualmente na tela de Usuários, existem colaboradores com 3 áreas
-- hoje — e a constraint abaixo não sobe com dado existente violando ela.
-- Por isso, antes de criar a constraint, este script corta pra 2 quem
-- estiver com mais. Revise depois na tela de Usuários quem foi afetado
-- (a ordem cortada é a que já estava salva no array, sem critério de
-- prioridade de área).

UPDATE public.profiles
SET areas_permitidas = areas_permitidas[1:2]
WHERE array_length(areas_permitidas, 1) > 2;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS max_duas_areas_permitidas;

ALTER TABLE public.profiles
  ADD CONSTRAINT max_duas_areas_permitidas
  CHECK (
    array_length(areas_permitidas, 1) IS NULL
    OR array_length(areas_permitidas, 1) <= 2
  );

COMMENT ON CONSTRAINT max_duas_areas_permitidas ON public.profiles IS
  'Um colaborador pode ter no máximo 2 áreas operacionais liberadas simultaneamente. Não vale para admin (areas_permitidas é ignorado nesse caso).';
