-- =============================================
-- MIGRATION: Tarefas pessoais do Engajamento
-- Rode este script no SQL Editor do Supabase.
-- =============================================
-- Cada colaborador cria tarefas privadas (com ou sem data, com ou sem
-- aluno vinculado). Só o dono vê as suas; admin vê todas.
-- Tarefas podem ter anotações e checklist interno.
-- Status: em_andamento | concluido

CREATE TABLE public.engajamento_tarefas_pessoais (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  aluno_id    UUID REFERENCES public.alunos(id) ON DELETE SET NULL,
  titulo      VARCHAR(255) NOT NULL,
  anotacoes   TEXT,
  status      VARCHAR(20) NOT NULL DEFAULT 'em_andamento',
  prazo       DATE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT valid_tarefa_status CHECK (status IN ('em_andamento', 'concluido'))
);

CREATE INDEX idx_tarefas_pessoais_user   ON public.engajamento_tarefas_pessoais(user_id);
CREATE INDEX idx_tarefas_pessoais_aluno  ON public.engajamento_tarefas_pessoais(aluno_id);
CREATE INDEX idx_tarefas_pessoais_status ON public.engajamento_tarefas_pessoais(status);
CREATE INDEX idx_tarefas_pessoais_prazo  ON public.engajamento_tarefas_pessoais(prazo);

CREATE TABLE public.engajamento_tarefas_checklist (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tarefa_id  UUID NOT NULL REFERENCES public.engajamento_tarefas_pessoais(id) ON DELETE CASCADE,
  texto      VARCHAR(500) NOT NULL,
  concluido  BOOLEAN NOT NULL DEFAULT false,
  ordem      INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_tarefas_checklist_tarefa ON public.engajamento_tarefas_checklist(tarefa_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_tarefa_pessoal_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tarefa_pessoal_updated_at
  BEFORE UPDATE ON public.engajamento_tarefas_pessoais
  FOR EACH ROW EXECUTE FUNCTION public.set_tarefa_pessoal_updated_at();

-- RLS
ALTER TABLE public.engajamento_tarefas_pessoais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engajamento_tarefas_checklist ENABLE ROW LEVEL SECURITY;

-- Tarefas: colaborador vê só as suas; admin vê todas
CREATE POLICY "Ver tarefas pessoais"
  ON public.engajamento_tarefas_pessoais FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin()
  );

CREATE POLICY "Criar tarefa pessoal"
  ON public.engajamento_tarefas_pessoais FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.tem_acesso_area('engajamento')
  );

CREATE POLICY "Atualizar tarefa pessoal"
  ON public.engajamento_tarefas_pessoais FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin()
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_admin()
  );

CREATE POLICY "Deletar tarefa pessoal"
  ON public.engajamento_tarefas_pessoais FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin()
  );

-- Checklist: acesso via tarefa pai
CREATE POLICY "Ver checklist de tarefa"
  ON public.engajamento_tarefas_checklist FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.engajamento_tarefas_pessoais t
      WHERE t.id = tarefa_id
        AND (t.user_id = auth.uid() OR public.is_admin())
    )
  );

CREATE POLICY "Criar item checklist"
  ON public.engajamento_tarefas_checklist FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.engajamento_tarefas_pessoais t
      WHERE t.id = tarefa_id
        AND (t.user_id = auth.uid() OR public.is_admin())
    )
  );

CREATE POLICY "Atualizar item checklist"
  ON public.engajamento_tarefas_checklist FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.engajamento_tarefas_pessoais t
      WHERE t.id = tarefa_id
        AND (t.user_id = auth.uid() OR public.is_admin())
    )
  );

CREATE POLICY "Deletar item checklist"
  ON public.engajamento_tarefas_checklist FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.engajamento_tarefas_pessoais t
      WHERE t.id = tarefa_id
        AND (t.user_id = auth.uid() OR public.is_admin())
    )
  );

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.engajamento_tarefas_pessoais;
ALTER PUBLICATION supabase_realtime ADD TABLE public.engajamento_tarefas_checklist;
