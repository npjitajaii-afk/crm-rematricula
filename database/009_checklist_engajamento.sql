-- =============================================
-- 009 - Checklist de Engajamento
-- =============================================
-- Reconstrução: esta migration já existia rodada em produção mas não
-- estava versionada no repo. Os 7 itens e os nomes de função/trigger
-- abaixo foram confirmados consultando engajamento_checklist_itens e
-- pg_trigger em produção (2026-09-01) — não são inferidos de comentário.
-- Todo CREATE/ADD usa IF NOT EXISTS / DROP+CREATE, então é seguro
-- rodar de novo em produção sem duplicar nada.
--
-- Nota: existe também um trigger trg_criar_checklist_rematricula
-- (função criar_checklist_rematricula) em public.alunos — é de outra
-- feature (checklist de Rematrícula), não faz parte desta migration.

-- 1) Tabela
CREATE TABLE IF NOT EXISTS public.engajamento_checklist_itens (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  aluno_id       UUID NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  item_key       VARCHAR(50) NOT NULL,
  item_label     VARCHAR(255) NOT NULL,
  ordem          INTEGER NOT NULL,
  concluido      BOOLEAN NOT NULL DEFAULT false,
  concluido_por  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  concluido_em   TIMESTAMP WITH TIME ZONE,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT uq_checklist_aluno_item UNIQUE (aluno_id, item_key)
);

CREATE INDEX IF NOT EXISTS idx_checklist_itens_aluno ON public.engajamento_checklist_itens(aluno_id);

-- 2) Seed automático dos 7 itens quando o aluno entra em Engajamento
-- Nomes de função/trigger conferidos via pg_trigger em produção
-- (2026-09-01): são dois triggers separados (insert / update de area),
-- não um só combinado — mantido assim de propósito aqui.
CREATE OR REPLACE FUNCTION public.trg_fn_criar_checklist_engajamento()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.engajamento_checklist_itens (aluno_id, item_key, item_label, ordem)
  VALUES
    (NEW.id, 'login_leo_app',         'Léo App',                1),
    (NEW.id, 'acessou_teams',         'Acessou o Teams',        2),
    (NEW.id, 'assistiu_aulas',        'Assistiu a aula',        3),
    (NEW.id, 'acessou_livros',        'Acessou materiais',      4),
    (NEW.id, 'fez_av1',               'Fez a AV1',               5),
    (NEW.id, 'fez_av4',               'Fez a AV4',               6),
    (NEW.id, 'pagou_primeiro_boleto', 'Pagou a 1ª mensalidade', 7)
  ON CONFLICT (aluno_id, item_key) DO NOTHING;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_criar_checklist_engajamento_insert ON public.alunos;
CREATE TRIGGER trg_criar_checklist_engajamento_insert
  AFTER INSERT ON public.alunos
  FOR EACH ROW
  WHEN (NEW.area = 'engajamento')
  EXECUTE FUNCTION public.trg_fn_criar_checklist_engajamento();

DROP TRIGGER IF EXISTS trg_criar_checklist_engajamento_update ON public.alunos;
CREATE TRIGGER trg_criar_checklist_engajamento_update
  AFTER UPDATE OF area ON public.alunos
  FOR EACH ROW
  WHEN (NEW.area = 'engajamento' AND OLD.area IS DISTINCT FROM NEW.area)
  EXECUTE FUNCTION public.trg_fn_criar_checklist_engajamento();

-- 3) RLS
ALTER TABLE public.engajamento_checklist_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ver checklist de engajamento" ON public.engajamento_checklist_itens;
CREATE POLICY "Ver checklist de engajamento"
  ON public.engajamento_checklist_itens FOR SELECT TO authenticated
  USING (
    public.tem_acesso_area('engajamento')
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Atualizar checklist de engajamento" ON public.engajamento_checklist_itens;
CREATE POLICY "Atualizar checklist de engajamento"
  ON public.engajamento_checklist_itens FOR UPDATE TO authenticated
  USING (
    public.tem_acesso_area('engajamento')
    OR public.is_admin()
  )
  WITH CHECK (
    public.tem_acesso_area('engajamento')
    OR public.is_admin()
  );

-- 4) Realtime (idempotente — só adiciona se ainda não estiver habilitado)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'engajamento_checklist_itens'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.engajamento_checklist_itens;
  END IF;
END $$;