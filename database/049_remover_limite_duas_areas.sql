-- =============================================
-- 049 - Remove o limite de 2 áreas por colaborador
--
-- Rode no SQL Editor do Supabase DEPOIS de 048.
--
-- Antes: no máximo 2 áreas operacionais (rematrícula / retenção /
--         engajamento) por colaborador (constraint max_duas_areas_permitidas).
-- Depois: colaborador pode ter as 3 áreas liberadas ao mesmo tempo.
--         Admin continua ignorando areas_permitidas.
-- =============================================

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS max_duas_areas_permitidas;

COMMENT ON COLUMN public.profiles.areas_permitidas IS
  'Áreas operacionais liberadas ao colaborador/supervisor (rematricula, retencao, engajamento). Pode ter 1, 2 ou as 3. Ignorado quando role = admin.';
