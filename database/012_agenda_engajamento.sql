-- Agenda pessoal do colaborador no Engajamento.
CREATE TABLE public.engajamento_agenda (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  aluno_id UUID NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  ticket VARCHAR(100),
  comentario TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_engajamento_agenda_user_data ON public.engajamento_agenda(user_id, data);
CREATE INDEX idx_engajamento_agenda_aluno_data ON public.engajamento_agenda(aluno_id, data);
ALTER TABLE public.engajamento_agenda ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver agenda pessoal" ON public.engajamento_agenda FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "Criar agenda pessoal" ON public.engajamento_agenda FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid()
  AND public.tem_acesso_area('engajamento')
  AND EXISTS (
    SELECT 1 FROM public.alunos
    WHERE id = aluno_id AND responsavel_id = auth.uid() AND area = 'engajamento'
  )
);
CREATE POLICY "Excluir agenda pessoal" ON public.engajamento_agenda FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.is_admin());
ALTER PUBLICATION supabase_realtime ADD TABLE public.engajamento_agenda;
