-- =============================================
-- 021 - Isolamento por polo em tarefas, agendas e tarefas gerais
-- =============================================
-- Rode no SQL Editor do Supabase DEPOIS da 020.
--
-- Objetivo: alinhar tarefas pessoais, checklists, agendas e tarefas
-- gerais ao mesmo modelo da 020:
--
--   - Colaborador: só as próprias tarefas/agendas
--   - Supervisor e Admin: veem tudo do PRÓPRIO polo (não cross-polo)
--   - Tarefas gerais: admin só cria/remove para destinatários do
--     próprio polo; colaborador continua vendo só o que foi delegado
--     a ele; supervisor passa a ver as delegadas do polo
--
-- Tabelas tocadas:
--   engajamento_tarefas_pessoais / rematricula_tarefas_pessoais
--   engajamento_tarefas_checklist / rematricula_tarefas_checklist
--   engajamento_agenda / rematricula_agenda
--   tarefas_gerais / rematricula_tarefas_gerais
--
-- Calendário geral / boleto permanece global de propósito (não mexe).
--
-- Helper reutilizado:
--   public.get_user_polo_id()
--   public.is_admin()
--   public.is_supervisor()
--   public.tem_acesso_area()

-- =============================================
-- 0) Helper: "é gestor do polo do dono desta linha?"
--    (admin ou supervisor cujo polo_id = polo do user_id da tarefa)
-- =============================================
CREATE OR REPLACE FUNCTION public.gestiona_polo_do_usuario(p_user_id UUID, uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p_gestor
    JOIN public.profiles p_dono ON p_dono.id = p_user_id
    WHERE p_gestor.id = uid
      AND p_gestor.role IN ('admin', 'supervisor')
      AND p_gestor.polo_id IS NOT NULL
      AND p_gestor.polo_id IS NOT DISTINCT FROM p_dono.polo_id
  );
$$;

COMMENT ON FUNCTION public.gestiona_polo_do_usuario IS
  'True se o usuário logado é admin ou supervisor do mesmo polo do usuário informado. Usada nas policies de tarefas/agenda para dar visão de equipe sem abrir cross-polo.';

-- =============================================
-- 1) TAREFAS PESSOAIS — Engajamento
-- =============================================
DROP POLICY IF EXISTS "Ver tarefas pessoais" ON public.engajamento_tarefas_pessoais;
CREATE POLICY "Ver tarefas pessoais"
  ON public.engajamento_tarefas_pessoais FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.gestiona_polo_do_usuario(user_id)
  );

DROP POLICY IF EXISTS "Criar tarefa pessoal" ON public.engajamento_tarefas_pessoais;
CREATE POLICY "Criar tarefa pessoal"
  ON public.engajamento_tarefas_pessoais FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.tem_acesso_area('engajamento')
  );

DROP POLICY IF EXISTS "Atualizar tarefa pessoal" ON public.engajamento_tarefas_pessoais;
CREATE POLICY "Atualizar tarefa pessoal"
  ON public.engajamento_tarefas_pessoais FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.gestiona_polo_do_usuario(user_id)
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.gestiona_polo_do_usuario(user_id)
  );

DROP POLICY IF EXISTS "Deletar tarefa pessoal" ON public.engajamento_tarefas_pessoais;
CREATE POLICY "Deletar tarefa pessoal"
  ON public.engajamento_tarefas_pessoais FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.gestiona_polo_do_usuario(user_id)
  );

-- Checklist Engajamento (acesso via tarefa pai)
DROP POLICY IF EXISTS "Ver checklist de tarefa" ON public.engajamento_tarefas_checklist;
CREATE POLICY "Ver checklist de tarefa"
  ON public.engajamento_tarefas_checklist FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.engajamento_tarefas_pessoais t
      WHERE t.id = tarefa_id
        AND (t.user_id = auth.uid() OR public.gestiona_polo_do_usuario(t.user_id))
    )
  );

DROP POLICY IF EXISTS "Criar item checklist" ON public.engajamento_tarefas_checklist;
CREATE POLICY "Criar item checklist"
  ON public.engajamento_tarefas_checklist FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.engajamento_tarefas_pessoais t
      WHERE t.id = tarefa_id
        AND (t.user_id = auth.uid() OR public.gestiona_polo_do_usuario(t.user_id))
    )
  );

DROP POLICY IF EXISTS "Atualizar item checklist" ON public.engajamento_tarefas_checklist;
CREATE POLICY "Atualizar item checklist"
  ON public.engajamento_tarefas_checklist FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.engajamento_tarefas_pessoais t
      WHERE t.id = tarefa_id
        AND (t.user_id = auth.uid() OR public.gestiona_polo_do_usuario(t.user_id))
    )
  );

DROP POLICY IF EXISTS "Deletar item checklist" ON public.engajamento_tarefas_checklist;
CREATE POLICY "Deletar item checklist"
  ON public.engajamento_tarefas_checklist FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.engajamento_tarefas_pessoais t
      WHERE t.id = tarefa_id
        AND (t.user_id = auth.uid() OR public.gestiona_polo_do_usuario(t.user_id))
    )
  );

-- =============================================
-- 2) TAREFAS PESSOAIS — Rematrícula
-- =============================================
DROP POLICY IF EXISTS "Ver tarefas pessoais rematricula" ON public.rematricula_tarefas_pessoais;
CREATE POLICY "Ver tarefas pessoais rematricula"
  ON public.rematricula_tarefas_pessoais FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.gestiona_polo_do_usuario(user_id)
  );

DROP POLICY IF EXISTS "Criar tarefa pessoal rematricula" ON public.rematricula_tarefas_pessoais;
CREATE POLICY "Criar tarefa pessoal rematricula"
  ON public.rematricula_tarefas_pessoais FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.tem_acesso_area('rematricula')
  );

DROP POLICY IF EXISTS "Atualizar tarefa pessoal rematricula" ON public.rematricula_tarefas_pessoais;
CREATE POLICY "Atualizar tarefa pessoal rematricula"
  ON public.rematricula_tarefas_pessoais FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.gestiona_polo_do_usuario(user_id)
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.gestiona_polo_do_usuario(user_id)
  );

DROP POLICY IF EXISTS "Excluir tarefa pessoal rematricula" ON public.rematricula_tarefas_pessoais;
CREATE POLICY "Excluir tarefa pessoal rematricula"
  ON public.rematricula_tarefas_pessoais FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.gestiona_polo_do_usuario(user_id)
  );

DROP POLICY IF EXISTS "Ver checklist rematricula" ON public.rematricula_tarefas_checklist;
CREATE POLICY "Ver checklist rematricula"
  ON public.rematricula_tarefas_checklist FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rematricula_tarefas_pessoais t
      WHERE t.id = tarefa_id
        AND (t.user_id = auth.uid() OR public.gestiona_polo_do_usuario(t.user_id))
    )
  );

DROP POLICY IF EXISTS "Criar checklist rematricula" ON public.rematricula_tarefas_checklist;
CREATE POLICY "Criar checklist rematricula"
  ON public.rematricula_tarefas_checklist FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.rematricula_tarefas_pessoais t
      WHERE t.id = tarefa_id
        AND (t.user_id = auth.uid() OR public.gestiona_polo_do_usuario(t.user_id))
    )
  );

DROP POLICY IF EXISTS "Atualizar checklist rematricula" ON public.rematricula_tarefas_checklist;
CREATE POLICY "Atualizar checklist rematricula"
  ON public.rematricula_tarefas_checklist FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rematricula_tarefas_pessoais t
      WHERE t.id = tarefa_id
        AND (t.user_id = auth.uid() OR public.gestiona_polo_do_usuario(t.user_id))
    )
  );

DROP POLICY IF EXISTS "Excluir checklist rematricula" ON public.rematricula_tarefas_checklist;
CREATE POLICY "Excluir checklist rematricula"
  ON public.rematricula_tarefas_checklist FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rematricula_tarefas_pessoais t
      WHERE t.id = tarefa_id
        AND (t.user_id = auth.uid() OR public.gestiona_polo_do_usuario(t.user_id))
    )
  );

-- =============================================
-- 3) AGENDA — Engajamento
-- =============================================
DROP POLICY IF EXISTS "Ver agenda pessoal" ON public.engajamento_agenda;
CREATE POLICY "Ver agenda pessoal"
  ON public.engajamento_agenda FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.gestiona_polo_do_usuario(user_id)
  );

DROP POLICY IF EXISTS "Criar agenda pessoal" ON public.engajamento_agenda;
CREATE POLICY "Criar agenda pessoal"
  ON public.engajamento_agenda FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.tem_acesso_area('engajamento')
    AND EXISTS (
      SELECT 1 FROM public.alunos
      WHERE id = aluno_id
        AND responsavel_id = auth.uid()
        AND area = 'engajamento'
    )
  );

DROP POLICY IF EXISTS "Excluir agenda pessoal" ON public.engajamento_agenda;
CREATE POLICY "Excluir agenda pessoal"
  ON public.engajamento_agenda FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.gestiona_polo_do_usuario(user_id)
  );

-- =============================================
-- 4) AGENDA — Rematrícula
-- =============================================
DROP POLICY IF EXISTS "Ver agenda rematricula" ON public.rematricula_agenda;
CREATE POLICY "Ver agenda rematricula"
  ON public.rematricula_agenda FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.gestiona_polo_do_usuario(user_id)
  );

DROP POLICY IF EXISTS "Criar agenda rematricula" ON public.rematricula_agenda;
CREATE POLICY "Criar agenda rematricula"
  ON public.rematricula_agenda FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.tem_acesso_area('rematricula')
    AND EXISTS (
      SELECT 1 FROM public.alunos
      WHERE id = aluno_id
        AND responsavel_id = auth.uid()
        AND area = 'rematricula'
    )
  );

DROP POLICY IF EXISTS "Excluir agenda rematricula" ON public.rematricula_agenda;
CREATE POLICY "Excluir agenda rematricula"
  ON public.rematricula_agenda FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.gestiona_polo_do_usuario(user_id)
  );

-- =============================================
-- 5) TAREFAS GERAIS (painel / delegação) — Engajamento
-- =============================================
-- SELECT: destinatário sempre vê a sua; gestor do polo do destinatário também.
DROP POLICY IF EXISTS "Admin ve todas tarefas gerais" ON public.tarefas_gerais;
DROP POLICY IF EXISTS "Colaborador ve tarefas delegadas" ON public.tarefas_gerais;

CREATE POLICY "Ver tarefas gerais por hierarquia"
  ON public.tarefas_gerais FOR SELECT TO authenticated
  USING (
    para_user_id = auth.uid()
    OR public.gestiona_polo_do_usuario(para_user_id)
  );

-- INSERT: só admin, e o destinatário precisa ser do mesmo polo do admin.
DROP POLICY IF EXISTS "Admin cria tarefas gerais" ON public.tarefas_gerais;
CREATE POLICY "Admin cria tarefas gerais"
  ON public.tarefas_gerais FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    AND EXISTS (
      SELECT 1 FROM public.profiles p_dest
      WHERE p_dest.id = para_user_id
        AND p_dest.polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
    )
  );

DROP POLICY IF EXISTS "Admin remove tarefas gerais" ON public.tarefas_gerais;
CREATE POLICY "Admin remove tarefas gerais"
  ON public.tarefas_gerais FOR DELETE TO authenticated
  USING (
    public.is_admin()
    AND public.gestiona_polo_do_usuario(para_user_id)
  );

-- =============================================
-- 6) TAREFAS GERAIS — Rematrícula
-- =============================================
DROP POLICY IF EXISTS "Admin ve tarefas gerais rematricula" ON public.rematricula_tarefas_gerais;
DROP POLICY IF EXISTS "Colaborador ve tarefas gerais rematricula" ON public.rematricula_tarefas_gerais;

CREATE POLICY "Ver tarefas gerais rematricula por hierarquia"
  ON public.rematricula_tarefas_gerais FOR SELECT TO authenticated
  USING (
    para_user_id = auth.uid()
    OR public.gestiona_polo_do_usuario(para_user_id)
  );

DROP POLICY IF EXISTS "Admin cria tarefas gerais rematricula" ON public.rematricula_tarefas_gerais;
CREATE POLICY "Admin cria tarefas gerais rematricula"
  ON public.rematricula_tarefas_gerais FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    AND EXISTS (
      SELECT 1 FROM public.profiles p_dest
      WHERE p_dest.id = para_user_id
        AND p_dest.polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
    )
  );

DROP POLICY IF EXISTS "Admin remove tarefas gerais rematricula" ON public.rematricula_tarefas_gerais;
CREATE POLICY "Admin remove tarefas gerais rematricula"
  ON public.rematricula_tarefas_gerais FOR DELETE TO authenticated
  USING (
    public.is_admin()
    AND public.gestiona_polo_do_usuario(para_user_id)
  );

-- =============================================
-- Notas de aplicação
-- =============================================
-- 1. Frontend NÃO precisa de alteração obrigatória: as queries já filtram
--    pelo que o RLS devolve. Supervisor/admin passam a ver a equipe do polo.
-- 2. Garantir que o admin tem polo_id preenchido (já feito após o 020).
-- 3. Calendário geral e lembrete de boleto continuam globais de propósito.
-- 4. Teste sugerido:
--    - Logado como colaborador: só vê/cria as próprias tarefas e agendas.
--    - Logado como supervisor do polo X: vê tarefas/agendas dos colaboradores
--      do polo X; não vê as de outros polos.
--    - Logado como admin (polo Itajaí): mesma regra do supervisor, só Itajaí.
--    - Criar tarefa geral para alguém de outro polo deve falhar (policy).

-- =============================================
-- 7) Lembrete de boleto — filtrar destinatários por polo
-- =============================================
-- O dia do boleto continua GLOBAL (uma config em calendario_geral /
-- rematricula_calendario_geral). O que muda é o destinatário:
--   - só usuários aprovados
--   - com a área liberada
--   - com polo_id preenchido (alinhado ao isolamento; quem está sem polo
--     não recebe — evita notificar cadastros incompletos)
--   - colaborador OU supervisor (supervisor do polo também precisa do
--     lembrete operacional)
-- Admin não recebe (não opera a fila no dia a dia).

CREATE OR REPLACE FUNCTION public.disparar_notificacoes_boleto()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  config public.calendario_geral%ROWTYPE;
BEGIN
  SELECT * INTO config FROM public.calendario_geral WHERE id = true;
  IF config IS NULL OR EXTRACT(DAY FROM CURRENT_DATE) <> config.dia_boleto THEN
    RETURN;
  END IF;

  INSERT INTO public.notificacoes (para_user_id, tipo, titulo, corpo, referencia)
  SELECT
    p.id,
    'lembrete_boleto',
    config.titulo,
    config.mensagem || CASE
      WHEN config.numeros_suporte <> '' THEN E'\nSuporte: ' || config.numeros_suporte
      ELSE ''
    END,
    CURRENT_DATE
  FROM public.profiles p
  WHERE p.status = 'aprovado'
    AND p.role IN ('colaborador', 'supervisor')
    AND p.polo_id IS NOT NULL
    AND 'engajamento' = ANY(p.areas_permitidas)
  ON CONFLICT (para_user_id, tipo, referencia)
    WHERE tipo = 'lembrete_boleto'
    DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.disparar_notificacoes_boleto() TO authenticated;

CREATE OR REPLACE FUNCTION public.disparar_notificacoes_boleto_rematricula()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  config public.rematricula_calendario_geral%ROWTYPE;
BEGIN
  SELECT * INTO config FROM public.rematricula_calendario_geral WHERE id = true;
  IF config IS NULL OR EXTRACT(DAY FROM CURRENT_DATE) <> config.dia_boleto THEN
    RETURN;
  END IF;

  INSERT INTO public.notificacoes (para_user_id, tipo, titulo, corpo, referencia)
  SELECT
    p.id,
    'lembrete_boleto_rematricula',
    config.titulo,
    config.mensagem || CASE
      WHEN config.numeros_suporte <> '' THEN E'\nSuporte: ' || config.numeros_suporte
      ELSE ''
    END,
    CURRENT_DATE
  FROM public.profiles p
  WHERE p.status = 'aprovado'
    AND p.role IN ('colaborador', 'supervisor')
    AND p.polo_id IS NOT NULL
    AND 'rematricula' = ANY(p.areas_permitidas)
  ON CONFLICT (para_user_id, tipo, referencia)
    WHERE tipo = 'lembrete_boleto_rematricula'
    DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.disparar_notificacoes_boleto_rematricula() TO authenticated;

-- Nota: o dia do boleto ainda é único para todos os polos. Se no futuro
-- cada polo tiver o próprio dia, será preciso:
--   1) tabela de config por polo (ou coluna polo_id no calendario_*)
--   2) o INSERT filtrar p.polo_id = config.polo_id
-- Por enquanto o filtro garante só quem está com polo definido e aprovado.

-- =============================================
-- 8) Notificações operacionais isoladas por polo
-- =============================================
-- Antes: qualquer mudança de status / nova interação notificava TODOS os
-- admins do sistema (cross-polo).
-- Agora: notifica apenas admin e supervisor cujo polo_id é o mesmo do
-- aluno envolvido. Quem fez a ação não recebe notificação de si mesmo.
--
-- Recado manual (tipo 'recado_admin') continua podendo ser enviado pelo
-- admin para qualquer usuário — é o canal de autorização/comunicação
-- administrativa e não passa por esses triggers.

CREATE OR REPLACE FUNCTION public.notificar_mudanca_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gestor_row RECORD;
  colaborador_nome VARCHAR;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT name INTO colaborador_nome FROM public.profiles WHERE id = auth.uid();

    -- Destinatários: admin/supervisor do MESMO polo do aluno.
    -- Se o aluno não tem polo_id, ninguém de gestão é notificado
    -- (evita vazamento para todos os polos).
    FOR gestor_row IN
      SELECT p.id
      FROM public.profiles p
      WHERE p.role IN ('admin', 'supervisor')
        AND p.status = 'aprovado'
        AND p.polo_id IS NOT NULL
        AND p.polo_id IS NOT DISTINCT FROM NEW.polo_id
    LOOP
      IF gestor_row.id IS DISTINCT FROM auth.uid() THEN
        INSERT INTO public.notificacoes (para_user_id, de_user_id, tipo, titulo, corpo, aluno_id)
        VALUES (
          gestor_row.id,
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

CREATE OR REPLACE FUNCTION public.notificar_nova_interacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gestor_row RECORD;
  colaborador_nome VARCHAR;
  aluno_nome VARCHAR;
  aluno_polo UUID;
BEGIN
  SELECT name INTO colaborador_nome FROM public.profiles WHERE id = NEW.user_id;
  SELECT nome, polo_id INTO aluno_nome, aluno_polo FROM public.alunos WHERE id = NEW.aluno_id;

  FOR gestor_row IN
    SELECT p.id
    FROM public.profiles p
    WHERE p.role IN ('admin', 'supervisor')
      AND p.status = 'aprovado'
      AND p.polo_id IS NOT NULL
      AND p.polo_id IS NOT DISTINCT FROM aluno_polo
  LOOP
    IF gestor_row.id IS DISTINCT FROM NEW.user_id THEN
      INSERT INTO public.notificacoes (para_user_id, de_user_id, tipo, titulo, corpo, aluno_id)
      VALUES (
        gestor_row.id,
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
