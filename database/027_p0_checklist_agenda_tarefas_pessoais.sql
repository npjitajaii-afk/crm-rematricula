-- =============================================
-- 027 - P0 Hardening RLS
--   1) Checklist de engajamento isolado por polo + hierarquia
--   2) Agenda e tarefas pessoais: só o dono (user_id = auth.uid())
--
-- Rode no SQL Editor do Supabase DEPOIS de 021 e 026.
--
-- Contexto:
--   - Checklist (009) liberava SELECT/UPDATE só com tem_acesso_area → cross-polo.
--   - Agenda/tarefas (021) liberavam gestor do polo (gestiona_polo_do_usuario)
--     → supervisor via agenda do admin (e vice-versa).
--   - Produto alinhado: agenda/tarefas são PESSOAIS; checklist segue a
--     mesma visibilidade do aluno (polo + responsável/gestor).
-- =============================================

-- =============================================
-- 1) CHECKLIST DE ENGAJAMENTO (engajamento_checklist_itens)
--    Acesso somente se o aluno for visível ao usuário logado.
-- =============================================
DROP POLICY IF EXISTS "Ver checklist de engajamento" ON public.engajamento_checklist_itens;
CREATE POLICY "Ver checklist de engajamento"
  ON public.engajamento_checklist_itens FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.alunos a
      WHERE a.id = engajamento_checklist_itens.aluno_id
        AND a.area = 'engajamento'
        AND public.tem_acesso_area('engajamento')
        AND a.polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
        AND public.get_user_polo_id() IS NOT NULL
        AND (
          public.is_admin()
          OR public.is_supervisor()
          OR a.responsavel_id = auth.uid()
          OR a.responsavel_id IS NULL
        )
    )
  );

DROP POLICY IF EXISTS "Atualizar checklist de engajamento" ON public.engajamento_checklist_itens;
CREATE POLICY "Atualizar checklist de engajamento"
  ON public.engajamento_checklist_itens FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.alunos a
      WHERE a.id = engajamento_checklist_itens.aluno_id
        AND a.area = 'engajamento'
        AND public.tem_acesso_area('engajamento')
        AND a.polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
        AND public.get_user_polo_id() IS NOT NULL
        AND (
          public.is_admin()
          OR public.is_supervisor()
          OR a.responsavel_id = auth.uid()
          OR a.responsavel_id IS NULL
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.alunos a
      WHERE a.id = engajamento_checklist_itens.aluno_id
        AND a.area = 'engajamento'
        AND public.tem_acesso_area('engajamento')
        AND a.polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
        AND public.get_user_polo_id() IS NOT NULL
        AND (
          public.is_admin()
          OR public.is_supervisor()
          OR a.responsavel_id = auth.uid()
          OR a.responsavel_id IS NULL
        )
    )
  );

COMMENT ON POLICY "Ver checklist de engajamento" ON public.engajamento_checklist_itens IS
  'P0: checklist só de alunos do mesmo polo, com área engajamento e hierarquia (próprio/sem dono/gestor).';

-- =============================================
-- 2) AGENDA — Engajamento (só o dono)
-- =============================================
DROP POLICY IF EXISTS "Ver agenda pessoal" ON public.engajamento_agenda;
CREATE POLICY "Ver agenda pessoal"
  ON public.engajamento_agenda FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Criar agenda pessoal" ON public.engajamento_agenda;
CREATE POLICY "Criar agenda pessoal"
  ON public.engajamento_agenda FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.tem_acesso_area('engajamento')
    AND EXISTS (
      SELECT 1
      FROM public.alunos a
      WHERE a.id = aluno_id
        AND a.area = 'engajamento'
        AND a.polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
        AND public.get_user_polo_id() IS NOT NULL
        AND (
          -- Dono do contato, ou gestor do polo (agenda continua sendo do criador)
          public.is_admin()
          OR public.is_supervisor()
          OR a.responsavel_id = auth.uid()
          OR a.responsavel_id IS NULL
        )
    )
  );

DROP POLICY IF EXISTS "Excluir agenda pessoal" ON public.engajamento_agenda;
CREATE POLICY "Excluir agenda pessoal"
  ON public.engajamento_agenda FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- =============================================
-- 3) AGENDA — Rematrícula (só o dono)
-- =============================================
DROP POLICY IF EXISTS "Ver agenda rematricula" ON public.rematricula_agenda;
CREATE POLICY "Ver agenda rematricula"
  ON public.rematricula_agenda FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Criar agenda rematricula" ON public.rematricula_agenda;
CREATE POLICY "Criar agenda rematricula"
  ON public.rematricula_agenda FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.tem_acesso_area('rematricula')
    AND EXISTS (
      SELECT 1
      FROM public.alunos a
      WHERE a.id = aluno_id
        AND a.area = 'rematricula'
        AND a.polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
        AND public.get_user_polo_id() IS NOT NULL
        AND (
          public.is_admin()
          OR public.is_supervisor()
          OR a.responsavel_id = auth.uid()
          OR a.responsavel_id IS NULL
        )
    )
  );

DROP POLICY IF EXISTS "Excluir agenda rematricula" ON public.rematricula_agenda;
CREATE POLICY "Excluir agenda rematricula"
  ON public.rematricula_agenda FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- =============================================
-- 4) TAREFAS PESSOAIS — Engajamento (só o dono)
-- =============================================
DROP POLICY IF EXISTS "Ver tarefas pessoais" ON public.engajamento_tarefas_pessoais;
CREATE POLICY "Ver tarefas pessoais"
  ON public.engajamento_tarefas_pessoais FOR SELECT TO authenticated
  USING (user_id = auth.uid());

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
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Deletar tarefa pessoal" ON public.engajamento_tarefas_pessoais;
CREATE POLICY "Deletar tarefa pessoal"
  ON public.engajamento_tarefas_pessoais FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Sub-itens do checklist da tarefa pessoal (acesso só via tarefa do dono)
DROP POLICY IF EXISTS "Ver checklist de tarefa" ON public.engajamento_tarefas_checklist;
CREATE POLICY "Ver checklist de tarefa"
  ON public.engajamento_tarefas_checklist FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.engajamento_tarefas_pessoais t
      WHERE t.id = tarefa_id AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Criar item checklist" ON public.engajamento_tarefas_checklist;
CREATE POLICY "Criar item checklist"
  ON public.engajamento_tarefas_checklist FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.engajamento_tarefas_pessoais t
      WHERE t.id = tarefa_id AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Atualizar item checklist" ON public.engajamento_tarefas_checklist;
CREATE POLICY "Atualizar item checklist"
  ON public.engajamento_tarefas_checklist FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.engajamento_tarefas_pessoais t
      WHERE t.id = tarefa_id AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.engajamento_tarefas_pessoais t
      WHERE t.id = tarefa_id AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Deletar item checklist" ON public.engajamento_tarefas_checklist;
CREATE POLICY "Deletar item checklist"
  ON public.engajamento_tarefas_checklist FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.engajamento_tarefas_pessoais t
      WHERE t.id = tarefa_id AND t.user_id = auth.uid()
    )
  );

-- =============================================
-- 5) TAREFAS PESSOAIS — Rematrícula (só o dono)
-- =============================================
DROP POLICY IF EXISTS "Ver tarefas pessoais rematricula" ON public.rematricula_tarefas_pessoais;
CREATE POLICY "Ver tarefas pessoais rematricula"
  ON public.rematricula_tarefas_pessoais FOR SELECT TO authenticated
  USING (user_id = auth.uid());

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
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Excluir tarefa pessoal rematricula" ON public.rematricula_tarefas_pessoais;
CREATE POLICY "Excluir tarefa pessoal rematricula"
  ON public.rematricula_tarefas_pessoais FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Ver checklist rematricula" ON public.rematricula_tarefas_checklist;
CREATE POLICY "Ver checklist rematricula"
  ON public.rematricula_tarefas_checklist FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rematricula_tarefas_pessoais t
      WHERE t.id = tarefa_id AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Criar checklist rematricula" ON public.rematricula_tarefas_checklist;
CREATE POLICY "Criar checklist rematricula"
  ON public.rematricula_tarefas_checklist FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.rematricula_tarefas_pessoais t
      WHERE t.id = tarefa_id AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Atualizar checklist rematricula" ON public.rematricula_tarefas_checklist;
CREATE POLICY "Atualizar checklist rematricula"
  ON public.rematricula_tarefas_checklist FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rematricula_tarefas_pessoais t
      WHERE t.id = tarefa_id AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.rematricula_tarefas_pessoais t
      WHERE t.id = tarefa_id AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Excluir checklist rematricula" ON public.rematricula_tarefas_checklist;
CREATE POLICY "Excluir checklist rematricula"
  ON public.rematricula_tarefas_checklist FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rematricula_tarefas_pessoais t
      WHERE t.id = tarefa_id AND t.user_id = auth.uid()
    )
  );

-- =============================================
-- 6) Checklist pós-migration
-- =============================================
-- a) Rode este arquivo no SQL Editor do Supabase.
-- b) Teste com 3 usuários do MESMO polo:
--    - Admin cria compromisso na agenda → supervisor NÃO deve ver na página Agenda
--    - Colaborador A marca checklist de aluno dele → colaborador B de outro
--      aluno/polo não deve ver/alterar
--    - Colaborador de outro polo com área engajamento NÃO deve listar
--      checklist de alunos de fora
-- c) Teste INSERT: gestor pode criar compromisso PRÓPRIO vinculado a aluno
--    do polo (a linha continua com user_id do gestor; só ele vê).
-- d) Front já filtrado por user_id na Agenda (AgendaEngajamentoContext) —
--    agora o banco reforça a mesma regra.
-- e) Próximo P1 (fora deste arquivo): usuários sem polo_id + policies de alunos.
