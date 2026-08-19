-- Abas operacionais próprias do funil de Rematrícula.
-- Execute no SQL Editor do Supabase após as migrations 011 a 014.

CREATE TABLE public.rematricula_tarefas_pessoais (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  aluno_id UUID REFERENCES public.alunos(id) ON DELETE SET NULL,
  titulo VARCHAR(255) NOT NULL, anotacoes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento', 'concluido')),
  prazo DATE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE public.rematricula_tarefas_checklist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tarefa_id UUID NOT NULL REFERENCES public.rematricula_tarefas_pessoais(id) ON DELETE CASCADE,
  texto VARCHAR(500) NOT NULL, concluido BOOLEAN NOT NULL DEFAULT false, ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_rematricula_tarefa_updated_at BEFORE UPDATE ON public.rematricula_tarefas_pessoais
  FOR EACH ROW EXECUTE FUNCTION public.set_tarefa_pessoal_updated_at();
ALTER TABLE public.rematricula_tarefas_pessoais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rematricula_tarefas_checklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver tarefas pessoais rematricula" ON public.rematricula_tarefas_pessoais FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "Criar tarefa pessoal rematricula" ON public.rematricula_tarefas_pessoais FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.tem_acesso_area('rematricula'));
CREATE POLICY "Atualizar tarefa pessoal rematricula" ON public.rematricula_tarefas_pessoais FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.is_admin()) WITH CHECK (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "Excluir tarefa pessoal rematricula" ON public.rematricula_tarefas_pessoais FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "Ver checklist rematricula" ON public.rematricula_tarefas_checklist FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.rematricula_tarefas_pessoais t WHERE t.id = tarefa_id AND (t.user_id = auth.uid() OR public.is_admin())));
CREATE POLICY "Criar checklist rematricula" ON public.rematricula_tarefas_checklist FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.rematricula_tarefas_pessoais t WHERE t.id = tarefa_id AND (t.user_id = auth.uid() OR public.is_admin())));
CREATE POLICY "Atualizar checklist rematricula" ON public.rematricula_tarefas_checklist FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.rematricula_tarefas_pessoais t WHERE t.id = tarefa_id AND (t.user_id = auth.uid() OR public.is_admin())));
CREATE POLICY "Excluir checklist rematricula" ON public.rematricula_tarefas_checklist FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.rematricula_tarefas_pessoais t WHERE t.id = tarefa_id AND (t.user_id = auth.uid() OR public.is_admin())));

CREATE TABLE public.rematricula_agenda (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  aluno_id UUID NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE, data DATE NOT NULL,
  ticket VARCHAR(100), comentario TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.rematricula_agenda ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver agenda rematricula" ON public.rematricula_agenda FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "Criar agenda rematricula" ON public.rematricula_agenda FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.tem_acesso_area('rematricula') AND EXISTS (SELECT 1 FROM public.alunos WHERE id = aluno_id AND responsavel_id = auth.uid() AND area = 'rematricula'));
CREATE POLICY "Excluir agenda rematricula" ON public.rematricula_agenda FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.is_admin());

CREATE TABLE public.rematricula_calendario_geral (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id), dia_boleto SMALLINT NOT NULL DEFAULT 10 CHECK (dia_boleto BETWEEN 1 AND 28),
  titulo VARCHAR(255) NOT NULL DEFAULT 'Vencimento de boleto',
  mensagem TEXT NOT NULL DEFAULT 'Hoje é o dia de vencimento do boleto. Direcione o aluno para os canais de suporte, se necessário.',
  numeros_suporte TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO public.rematricula_calendario_geral (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.rematricula_calendario_geral ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver calendario rematricula" ON public.rematricula_calendario_geral FOR SELECT TO authenticated USING (public.tem_acesso_area('rematricula') OR public.is_admin());
CREATE POLICY "Atualizar calendario rematricula" ON public.rematricula_calendario_geral FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.notificacoes DROP CONSTRAINT IF EXISTS valid_tipo_notif;
ALTER TABLE public.notificacoes ADD CONSTRAINT valid_tipo_notif CHECK (tipo IN ('mudanca_status', 'nova_interacao', 'recado_admin', 'lembrete_boleto', 'lembrete_boleto_rematricula'));
CREATE UNIQUE INDEX IF NOT EXISTS idx_notificacao_boleto_rematricula_unica ON public.notificacoes (para_user_id, tipo, referencia) WHERE tipo = 'lembrete_boleto_rematricula';

CREATE OR REPLACE FUNCTION public.disparar_notificacoes_boleto_rematricula()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE config public.rematricula_calendario_geral%ROWTYPE;
BEGIN
  SELECT * INTO config FROM public.rematricula_calendario_geral WHERE id = true;
  IF config IS NULL OR EXTRACT(DAY FROM CURRENT_DATE) <> config.dia_boleto THEN RETURN; END IF;
  INSERT INTO public.notificacoes (para_user_id, tipo, titulo, corpo, referencia)
  SELECT p.id, 'lembrete_boleto_rematricula', config.titulo,
    config.mensagem || CASE WHEN config.numeros_suporte <> '' THEN E'\nSuporte: ' || config.numeros_suporte ELSE '' END,
    CURRENT_DATE
  FROM public.profiles p
  WHERE p.role = 'colaborador' AND 'rematricula' = ANY(p.areas_permitidas)
  ON CONFLICT (para_user_id, tipo, referencia) WHERE tipo = 'lembrete_boleto_rematricula' DO NOTHING;
END;
$$;
GRANT EXECUTE ON FUNCTION public.disparar_notificacoes_boleto_rematricula() TO authenticated;

CREATE TABLE public.rematricula_tarefas_gerais (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), titulo VARCHAR(255) NOT NULL, descricao TEXT, prazo DATE,
  para_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  criado_por UUID NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.rematricula_tarefas_gerais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin ve tarefas gerais rematricula" ON public.rematricula_tarefas_gerais FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Colaborador ve tarefas gerais rematricula" ON public.rematricula_tarefas_gerais FOR SELECT TO authenticated USING (para_user_id = auth.uid());
CREATE POLICY "Admin cria tarefas gerais rematricula" ON public.rematricula_tarefas_gerais FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admin remove tarefas gerais rematricula" ON public.rematricula_tarefas_gerais FOR DELETE TO authenticated USING (public.is_admin());

ALTER PUBLICATION supabase_realtime ADD TABLE public.rematricula_tarefas_pessoais;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rematricula_tarefas_checklist;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rematricula_agenda;
