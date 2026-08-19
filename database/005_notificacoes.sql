-- =============================================
-- MIGRATION: Notificações (sininho) + Recados do Admin
-- Rode este script no SQL Editor do Supabase.
-- =============================================

-- Tabela de notificações
CREATE TABLE public.notificacoes (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  para_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  de_user_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  tipo         VARCHAR(50) NOT NULL,
  -- tipos: 'mudanca_status' | 'nova_interacao' | 'recado_admin'
  titulo       VARCHAR(255) NOT NULL,
  corpo        TEXT,
  aluno_id     UUID REFERENCES public.alunos(id) ON DELETE CASCADE,
  lida         BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT valid_tipo_notif CHECK (
    tipo IN ('mudanca_status', 'nova_interacao', 'recado_admin')
  )
);

CREATE INDEX idx_notif_para_user ON public.notificacoes(para_user_id);
CREATE INDEX idx_notif_lida      ON public.notificacoes(para_user_id, lida);
CREATE INDEX idx_notif_created   ON public.notificacoes(created_at DESC);

ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;

-- Cada usuário só vê as próprias notificações
CREATE POLICY "Ver próprias notificações"
  ON public.notificacoes FOR SELECT TO authenticated
  USING (para_user_id = auth.uid());

-- Qualquer autenticado pode criar notificação (o disparo manual é o
-- "recado do admin"; mudança de status e nova interação são criadas
-- pelos triggers abaixo, que rodam como SECURITY DEFINER).
-- Restringe o recado manual: só admin pode inserir 'recado_admin' via
-- client direto (mudança de status / nova interação não passam por aqui,
-- pois os triggers têm SECURITY DEFINER e ignoram RLS).
CREATE POLICY "Criar notificações"
  ON public.notificacoes FOR INSERT TO authenticated
  WITH CHECK (
    tipo <> 'recado_admin'
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- Só o destinatário pode marcar como lida
CREATE POLICY "Marcar como lida"
  ON public.notificacoes FOR UPDATE TO authenticated
  USING (para_user_id = auth.uid())
  WITH CHECK (para_user_id = auth.uid());

-- Habilita Realtime para a tabela (INSERT), usado pelo sininho no frontend
ALTER PUBLICATION supabase_realtime ADD TABLE public.notificacoes;

-- =============================================
-- Trigger: ao alterar status de um aluno, notifica todos os admins
-- =============================================
CREATE OR REPLACE FUNCTION public.notificar_mudanca_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  admin_row RECORD;
  colaborador_nome VARCHAR;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT name INTO colaborador_nome FROM public.profiles WHERE id = auth.uid();

    FOR admin_row IN
      SELECT id FROM public.profiles WHERE role = 'admin'
    LOOP
      -- não notifica o admin se ele mesmo fez a mudança
      IF admin_row.id != auth.uid() THEN
        INSERT INTO public.notificacoes (para_user_id, de_user_id, tipo, titulo, corpo, aluno_id)
        VALUES (
          admin_row.id,
          auth.uid(),
          'mudanca_status',
          'Status alterado: ' || NEW.status,
          COALESCE(colaborador_nome, 'Alguém') || ' moveu ' ||
            NEW.nome ||
            ' de "' || OLD.status || '" para "' || NEW.status || '"',
          NEW.id
        );
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_aluno_status_changed ON public.alunos;
CREATE TRIGGER on_aluno_status_changed
  AFTER UPDATE ON public.alunos
  FOR EACH ROW EXECUTE FUNCTION public.notificar_mudanca_status();

-- =============================================
-- Trigger: ao inserir interação, notifica todos os admins
-- =============================================
CREATE OR REPLACE FUNCTION public.notificar_nova_interacao()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  admin_row RECORD;
  colaborador_nome VARCHAR;
  aluno_nome VARCHAR;
BEGIN
  SELECT name INTO colaborador_nome FROM public.profiles WHERE id = NEW.user_id;
  SELECT nome INTO aluno_nome FROM public.alunos WHERE id = NEW.aluno_id;

  FOR admin_row IN
    SELECT id FROM public.profiles WHERE role = 'admin'
  LOOP
    -- Não notifica o admin se ele mesmo fez a interação
    IF admin_row.id != NEW.user_id THEN
      INSERT INTO public.notificacoes (para_user_id, de_user_id, tipo, titulo, corpo, aluno_id)
      VALUES (
        admin_row.id,
        NEW.user_id,
        'nova_interacao',
        'Nova interação em: ' || COALESCE(aluno_nome, 'aluno'),
        COALESCE(colaborador_nome, 'Alguém') || ' registrou uma interação (' || NEW.tipo ||
          ') em ' || COALESCE(aluno_nome, 'aluno') || ': "' || LEFT(NEW.descricao, 100) || '"',
        NEW.aluno_id
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_interacao_criada ON public.interacoes;
CREATE TRIGGER on_interacao_criada
  AFTER INSERT ON public.interacoes
  FOR EACH ROW EXECUTE FUNCTION public.notificar_nova_interacao();
