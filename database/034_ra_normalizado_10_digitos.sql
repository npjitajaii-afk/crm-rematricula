-- =============================================
-- 034 - RA normalizado: só dígitos, 10 posições
--
-- Alinha o banco com a função normalizarRa() do front:
--   regexp_replace(ra, '[^0-9]', '', 'g') → últimos 10 → pad left com 0
--
-- Rode no SQL Editor do Supabase DEPOIS de 033.
-- =============================================

-- Função de normalização (mesma regra do front)
CREATE OR REPLACE FUNCTION public.normalizar_ra(p_ra TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_ra IS NULL OR btrim(p_ra) = '' THEN NULL
    WHEN regexp_replace(p_ra, '[^0-9]', '', 'g') = '' THEN NULL
    ELSE lpad(right(regexp_replace(p_ra, '[^0-9]', '', 'g'), 10), 10, '0')
  END;
$$;

-- Se a coluna gerada/existente já existir, recria a expressão.
-- Caso seja coluna simples preenchida por trigger, atualiza os valores.

DO $$
BEGIN
  -- Tenta dropar generated column antiga e recriar
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'alunos' AND column_name = 'ra_normalizado'
  ) THEN
    BEGIN
      ALTER TABLE public.alunos DROP COLUMN ra_normalizado;
    EXCEPTION WHEN OTHERS THEN
      -- se não puder dropar (dependências), só atualiza valores abaixo
      NULL;
    END;
  END IF;
END $$;

-- Coluna generada (Postgres 12+)
ALTER TABLE public.alunos
  ADD COLUMN IF NOT EXISTS ra_normalizado TEXT
  GENERATED ALWAYS AS (public.normalizar_ra(ra)) STORED;

CREATE INDEX IF NOT EXISTS idx_alunos_ra_normalizado
  ON public.alunos (ra_normalizado)
  WHERE ra_normalizado IS NOT NULL;

-- Unicidade por RA normalizado (permite vários NULL)
CREATE UNIQUE INDEX IF NOT EXISTS uq_alunos_ra_normalizado
  ON public.alunos (ra_normalizado)
  WHERE ra_normalizado IS NOT NULL;

COMMENT ON COLUMN public.alunos.ra_normalizado IS
  'RA só com dígitos, 10 posições (pad left 0). Base do bloqueio de duplicidade.';
