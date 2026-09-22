-- =============================================
-- 066 - Corrige visibilidade de alunos no polo, restaura "assumir aluno
--        sem responsável" e inclui para_user_id nos comentários de
--        tarefas gerais.
--
-- Contexto / causas:
--   1) A 050 removeu "OR responsavel_id IS NULL" do USING da policy de
--      UPDATE de alunos. Isso impede assumirAluno() (colaborador se
--      autoatribuir um contato sem dono) de funcionar: o RLS barra o
--      UPDATE antes mesmo de checar o novo valor.
--   2) A 050 também restringiu o SELECT de alunos (fora da área
--      'engajamento') a "responsavel_id = auth.uid() OR IS NULL", então
--      colaboradores não veem contatos de colegas em rematricula/retencao.
--      Ajuste de regra de negócio: liberar a leitura de qualquer aluno
--      do próprio polo/área permitida; escrita continua restrita.
--   3) A 060 trocou a condição de comentários em tarefas_gerais de
--      "membro OU para_user_id" para só "membro", deixando destinatários
--      diretos sem acesso a comentar caso não estejam em
--      tarefas_gerais_membros.
-- =============================================

-- =============================================
-- 1) ALUNOS — SELECT liberado para todo o polo (área permitida)
-- =============================================
DROP POLICY IF EXISTS "Selecionar alunos por hierarquia" ON public.alunos;
CREATE POLICY "Selecionar alunos por hierarquia"
  ON public.alunos FOR SELECT TO authenticated
  USING (
    public.tem_acesso_area(area)
    AND public.mesmo_polo_do_usuario(polo_id)
  );

COMMENT ON POLICY "Selecionar alunos por hierarquia" ON public.alunos IS
  'SELECT liberado para todo o polo (área permitida). Edição/exclusão seguem restritas por responsável nas policies de UPDATE/DELETE.';

-- =============================================
-- 2) ALUNOS — UPDATE: restaura "responsavel_id IS NULL" no USING
--    (permite assumir contato sem dono). WITH CHECK inalterado — já
--    exige que o novo responsavel_id seja auth.uid(), então não reabre
--    a brecha corrigida na 052 (colaborador não rouba aluno de colega).
-- =============================================
DROP POLICY IF EXISTS "Atualizar alunos por hierarquia" ON public.alunos;
CREATE POLICY "Atualizar alunos por hierarquia"
  ON public.alunos FOR UPDATE TO authenticated
  USING (
    public.tem_acesso_area(area)
    AND public.mesmo_polo_do_usuario(polo_id)
    AND (
      public.is_admin()
      OR public.is_supervisor()
      OR responsavel_id = auth.uid()
      OR responsavel_id IS NULL
    )
  )
  WITH CHECK (
    public.tem_acesso_area(area)
    AND public.mesmo_polo_do_usuario(polo_id)
    AND (
      public.is_admin()
      OR public.is_supervisor()
      OR responsavel_id = auth.uid()
    )
  );

COMMENT ON POLICY "Atualizar alunos por hierarquia" ON public.alunos IS
  'UPDATE: admin/supervisor qualquer contato do polo; colaborador só o próprio OU sem responsável (permite assumir). WITH CHECK impede reatribuir para outro colega fora do fluxo de transferência.';

-- =============================================
-- 3) TAREFAS GERAIS — comentários também liberados para o destinatário
--    direto (para_user_id), não só para membros.
-- =============================================
DROP POLICY IF EXISTS "Ver comentarios tarefa geral" ON public.tarefas_gerais_comentarios;
CREATE POLICY "Ver comentarios tarefa geral"
  ON public.tarefas_gerais_comentarios FOR SELECT TO authenticated
  USING (
    public.sou_membro_tarefa_geral(tarefa_id)
    OR EXISTS (
      SELECT 1 FROM public.tarefas_gerais t
      WHERE t.id = tarefa_id AND t.para_user_id = auth.uid()
    )
    OR (public.is_admin() AND public.tarefa_geral_do_meu_polo_id(tarefa_id))
  );

DROP POLICY IF EXISTS "Criar comentarios tarefa geral" ON public.tarefas_gerais_comentarios;
CREATE POLICY "Criar comentarios tarefa geral"
  ON public.tarefas_gerais_comentarios FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      public.sou_membro_tarefa_geral(tarefa_id)
      OR EXISTS (
        SELECT 1 FROM public.tarefas_gerais t
        WHERE t.id = tarefa_id AND t.para_user_id = auth.uid()
      )
      OR (public.is_admin() AND public.tarefa_geral_do_meu_polo_id(tarefa_id))
    )
  );

-- Espelho rematrícula (mesma correção, para paridade total)
DROP POLICY IF EXISTS "Ver comentarios tarefa geral rem" ON public.rematricula_tarefas_gerais_comentarios;
CREATE POLICY "Ver comentarios tarefa geral rem"
  ON public.rematricula_tarefas_gerais_comentarios FOR SELECT TO authenticated
  USING (
    public.sou_membro_tarefa_geral_rem(tarefa_id)
    OR EXISTS (
      SELECT 1 FROM public.rematricula_tarefas_gerais t
      WHERE t.id = tarefa_id AND t.para_user_id = auth.uid()
    )
    OR (public.is_admin() AND public.tarefa_geral_rem_do_meu_polo_id(tarefa_id))
  );

DROP POLICY IF EXISTS "Criar comentarios tarefa geral rem" ON public.rematricula_tarefas_gerais_comentarios;
CREATE POLICY "Criar comentarios tarefa geral rem"
  ON public.rematricula_tarefas_gerais_comentarios FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      public.sou_membro_tarefa_geral_rem(tarefa_id)
      OR EXISTS (
        SELECT 1 FROM public.rematricula_tarefas_gerais t
        WHERE t.id = tarefa_id AND t.para_user_id = auth.uid()
      )
      OR (public.is_admin() AND public.tarefa_geral_rem_do_meu_polo_id(tarefa_id))
    )
  );

-- =============================================
-- Checklist pós-migration (frontend):
--   - src/services/tarefasGeraisService.ts: adicionarComentario() precisa
--     passar a enviar user_id (auth.uid()) no INSERT — ver arquivo
--     atualizado enviado junto com esta migration. Sem isso, o INSERT
--     continua falhando por violar a coluna NOT NULL / o WITH CHECK acima.
--   - Teste com um colaborador comum: (1) listar alunos de rematrícula/
--     retenção — deve aparecer nome de colega; (2) "assumir" um aluno sem
--     responsável; (3) comentar numa tarefa onde ele é para_user_id mas
--     não está em tarefas_gerais_membros.
-- =============================================
