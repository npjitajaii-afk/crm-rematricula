-- =============================================
-- 029 - P2 Auditoria de RLS (somente leitura)
--
-- Rode no SQL Editor do Supabase DEPOIS de 027 e 028.
-- Não altera dados nem policies — só inspeciona.
--
-- Como usar:
--   1) Execute cada bloco separadamente (ou o arquivo inteiro).
--   2) Compare o resultado com a seção "Resultado esperado"
--      no final deste arquivo.
-- =============================================

-- ---------------------------------------------
-- A) Policies ativas por tabela (visão geral)
-- ---------------------------------------------
SELECT
  tablename,
  policyname,
  cmd AS operacao,
  roles,
  permissive,
  qual AS using_expr,
  with_check AS with_check_expr
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd, policyname;

-- ---------------------------------------------
-- B) Tabelas com RLS DESLIGADO (risco)
-- ---------------------------------------------
SELECT
  c.relname AS tabela,
  c.relrowsecurity AS rls_ligado,
  c.relforcerowsecurity AS rls_forcado
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'alunos',
    'interacoes',
    'profiles',
    'polos',
    'engajamento_checklist_itens',
    'engajamento_agenda',
    'rematricula_agenda',
    'engajamento_tarefas_pessoais',
    'rematricula_tarefas_pessoais',
    'engajamento_tarefas_checklist',
    'rematricula_tarefas_checklist',
    'tarefas_gerais',
    'rematricula_tarefas_gerais',
    'notificacoes'
  )
ORDER BY c.relname;

-- ---------------------------------------------
-- C) Policies PERIGOSAS: USING (true) ou muito abertas
-- ---------------------------------------------
SELECT
  tablename,
  policyname,
  cmd,
  qual AS using_expr,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    qual IS NULL
    OR qual = 'true'
    OR with_check = 'true'
    OR qual ILIKE '%true%'
  )
ORDER BY tablename, policyname;

-- ---------------------------------------------
-- D) Conferir se helpers P0/P1 existem
-- ---------------------------------------------
SELECT
  p.proname AS funcao,
  pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'is_admin',
    'is_supervisor',
    'is_approved',
    'tem_acesso_area',
    'get_user_polo_id',
    'mesmo_polo_do_usuario',
    'gestiona_polo_do_usuario',
    'colaboradores_polo'
  )
ORDER BY p.proname;

-- ---------------------------------------------
-- E) Profiles aprovados SEM polo (devem ser 0 após correção manual)
-- ---------------------------------------------
SELECT id, email, role, status, polo_id
FROM public.profiles
WHERE status = 'aprovado' AND polo_id IS NULL;

-- ---------------------------------------------
-- F) Alunos SEM polo (devem ser 0 ou raríssimos legados)
-- ---------------------------------------------
SELECT id, nome, area, polo_id, responsavel_id, created_at
FROM public.alunos
WHERE polo_id IS NULL
ORDER BY created_at DESC
LIMIT 50;

-- ---------------------------------------------
-- G) Policies esperadas nas tabelas P0/P1 (checklist)
-- ---------------------------------------------
SELECT
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'alunos',
    'interacoes',
    'engajamento_checklist_itens',
    'engajamento_agenda',
    'rematricula_agenda',
    'engajamento_tarefas_pessoais',
    'rematricula_tarefas_pessoais'
  )
ORDER BY tablename, cmd, policyname;

-- ---------------------------------------------
-- H) Triggers de proteção (polo / aprovação)
-- ---------------------------------------------
SELECT
  tgname AS trigger_name,
  relname AS tabela,
  pg_get_triggerdef(t.oid) AS definicao
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND NOT t.tgisinternal
  AND tgname IN (
    'trg_exige_polo_no_aluno',
    'trg_exige_polo_na_aprovacao',
    'on_auth_user_created'
  )
ORDER BY relname, tgname;

-- =============================================
-- Resultado esperado (resumo)
-- =============================================
-- B) Todas as tabelas listadas com rls_ligado = true
-- C) Poucas policies com true:
--      - polos SELECT (anon/authenticated) pode ser true de propósito
--      - NÃO deve existir "Autenticados podem ver todos os alunos"
-- D) Todas as funções listadas devem existir (mesmo_polo_do_usuario = 028)
-- E) 0 linhas (senão atribua polo_id manualmente)
-- F) 0 linhas ideais; se houver, corrigir ou apagar legados
-- G) Agenda SELECT/DELETE só com user_id = auth.uid() (sem gestiona_polo)
--    Checklist engajamento com EXISTS em alunos + mesmo_polo
-- H) trg_exige_polo_no_aluno e trg_exige_polo_na_aprovacao presentes
--
-- Teste manual com 3 logins (mesmo polo + 1 de outro polo):
--   1. Admin cria item na Agenda → supervisor NÃO vê
--   2. Colaborador A marca checklist → B de outro aluno ok;
--      user de OUTRO polo não vê checklist
--   3. User sem polo_id → alunos vazios
--   4. Aprovar user sem polo → erro do trigger
-- =============================================
