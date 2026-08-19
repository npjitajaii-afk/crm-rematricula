-- Painel geral: somente administradores criam/delegam; colaboradores veem as prÃ³prias tarefas.
CREATE TABLE public.tarefas_gerais (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  titulo VARCHAR(255) NOT NULL,
  descricao TEXT,
  prazo DATE,
  para_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  criado_por UUID NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tarefas_gerais_destinatario ON public.tarefas_gerais(para_user_id, created_at DESC);
ALTER TABLE public.tarefas_gerais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin ve todas tarefas gerais" ON public.tarefas_gerais FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Colaborador ve tarefas delegadas" ON public.tarefas_gerais FOR SELECT TO authenticated USING (para_user_id = auth.uid());
CREATE POLICY "Admin cria tarefas gerais" ON public.tarefas_gerais FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admin remove tarefas gerais" ON public.tarefas_gerais FOR DELETE TO authenticated USING (public.is_admin());
