-- =============================================
-- CRM DE REMATRÍCULA - ESTRUTURA DO BANCO DE DADOS
-- Supabase (PostgreSQL + Auth)
-- =============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- TABELA: profiles
-- Extensão de auth.users com dados do colaborador
-- (atendentes/equipe que faz o acompanhamento de rematrícula)
-- =============================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cria o profile automaticamente quando um novo usuário se registra no Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- TABELA: alunos
-- Alunos em processo de acompanhamento de rematrícula
-- =============================================
CREATE TABLE public.alunos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  telefone VARCHAR(50) NOT NULL,
  ra VARCHAR(50), -- número de matrícula/RA
  curso VARCHAR(255),
  turno VARCHAR(50),
  status VARCHAR(50) NOT NULL DEFAULT 'pendente',
  canal_contato VARCHAR(50) NOT NULL DEFAULT 'outro',
  valor_pendente DECIMAL(10, 2), -- débito/mensalidade em aberto, se houver
  observacoes TEXT,
  tags TEXT[],
  responsavel_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  criado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT valid_status CHECK (status IN ('pendente', 'contatado', 'aguardando_retorno', 'confirmado', 'documentacao', 'rematriculado', 'desistente')),
  CONSTRAINT valid_canal CHECK (canal_contato IN ('telefone', 'whatsapp', 'email', 'presencial', 'ava', 'indicacao', 'outro'))
);

-- =============================================
-- TABELA: interacoes
-- Histórico de interações com cada aluno
-- =============================================
CREATE TABLE public.interacoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  aluno_id UUID NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  tipo VARCHAR(50) NOT NULL,
  descricao TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT valid_tipo CHECK (tipo IN ('email', 'telefone', 'whatsapp', 'presencial', 'nota', 'status', 'outro'))
);

-- =============================================
-- ÍNDICES
-- =============================================
CREATE INDEX idx_alunos_status ON public.alunos(status);
CREATE INDEX idx_alunos_canal ON public.alunos(canal_contato);
CREATE INDEX idx_alunos_responsavel ON public.alunos(responsavel_id);
CREATE INDEX idx_alunos_created_at ON public.alunos(created_at);
CREATE INDEX idx_alunos_email ON public.alunos(email);
CREATE INDEX idx_alunos_ra ON public.alunos(ra);

CREATE INDEX idx_interacoes_aluno_id ON public.interacoes(aluno_id);
CREATE INDEX idx_interacoes_user_id ON public.interacoes(user_id);
CREATE INDEX idx_interacoes_created_at ON public.interacoes(created_at);

-- =============================================
-- updated_at automático
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_alunos_updated_at
  BEFORE UPDATE ON public.alunos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- ROW LEVEL SECURITY
-- Equipe interna: qualquer usuário autenticado pode ver/gerenciar
-- todos os alunos (não é multi-tenant por usuário)
-- =============================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alunos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados podem ver todos os profiles"
  ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Usuário pode atualizar seu próprio profile"
  ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE POLICY "Autenticados podem ver todos os alunos"
  ON public.alunos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Autenticados podem criar alunos"
  ON public.alunos FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Autenticados podem atualizar alunos"
  ON public.alunos FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Autenticados podem deletar alunos"
  ON public.alunos FOR DELETE TO authenticated USING (true);

CREATE POLICY "Autenticados podem ver todas as interações"
  ON public.interacoes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Autenticados podem criar interações"
  ON public.interacoes FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Autenticados podem atualizar interações"
  ON public.interacoes FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Autenticados podem deletar interações"
  ON public.interacoes FOR DELETE TO authenticated USING (true);

-- =============================================
-- VIEWS úteis
-- =============================================
CREATE OR REPLACE VIEW public.alunos_com_responsavel AS
SELECT
  a.*,
  p.name AS responsavel_nome,
  p.email AS responsavel_email,
  (SELECT COUNT(*) FROM public.interacoes WHERE aluno_id = a.id) AS interacoes_count
FROM public.alunos a
LEFT JOIN public.profiles p ON a.responsavel_id = p.id;

CREATE OR REPLACE VIEW public.pipeline_rematricula_resumo AS
SELECT
  status,
  COUNT(*) AS total,
  SUM(valor_pendente) AS total_valor_pendente
FROM public.alunos
GROUP BY status
ORDER BY
  CASE status
    WHEN 'pendente' THEN 1
    WHEN 'contatado' THEN 2
    WHEN 'aguardando_retorno' THEN 3
    WHEN 'confirmado' THEN 4
    WHEN 'documentacao' THEN 5
    WHEN 'rematriculado' THEN 6
    WHEN 'desistente' THEN 7
  END;

COMMENT ON TABLE public.alunos IS 'Alunos em acompanhamento no funil de rematrícula';
COMMENT ON TABLE public.interacoes IS 'Histórico de contatos/interações com cada aluno';
COMMENT ON COLUMN public.alunos.status IS 'Etapa no funil: pendente, contatado, aguardando_retorno, confirmado, documentacao, rematriculado, desistente';
COMMENT ON COLUMN public.alunos.canal_contato IS 'Canal de contato: telefone, whatsapp, email, presencial, ava, indicacao, outro';
