-- =============================================
-- 047 - Views de exportação por polo
-- =============================================
-- Objetivo: expor um polo_id "calculado" para tabelas que não têm essa
-- coluna direto (só chegam ao polo via aluno_id ou user_id). Isso permite
-- filtrar QUALQUER uma delas do mesmo jeito na API REST do Supabase:
--   .../v_interacoes_polo?polo_id=eq.<UUID_DO_POLO>
--
-- Tabelas que JÁ têm polo_id direto (não precisam de view, filtre nelas
-- mesmo): alunos, profiles, setores, solicitacoes_transferencia.
--
-- IMPORTANTE: estas views devem ser lidas com a service_role key
-- (não a anon key). Elas não têm RLS própria — quem decide o que pode
-- ver é o script que você controla, filtrando por polo_id explícito.
-- Não exponha estas views para o app dos colaboradores.

-- ---- interações (via aluno_id) ----
CREATE OR REPLACE VIEW public.v_interacoes_polo WITH (security_invoker = true) AS
SELECT i.*, a.polo_id
FROM public.interacoes i
JOIN public.alunos a ON a.id = i.aluno_id;

-- ---- checklist de engajamento (via aluno_id) ----
CREATE OR REPLACE VIEW public.v_engajamento_checklist_polo WITH (security_invoker = true) AS
SELECT c.*, a.polo_id
FROM public.engajamento_checklist_itens c
JOIN public.alunos a ON a.id = c.aluno_id;

-- ---- agenda de engajamento (aluno_id NOT NULL) ----
CREATE OR REPLACE VIEW public.v_engajamento_agenda_polo WITH (security_invoker = true) AS
SELECT ag.*, a.polo_id
FROM public.engajamento_agenda ag
JOIN public.alunos a ON a.id = ag.aluno_id;

-- ---- agenda de rematrícula (aluno_id NOT NULL) ----
CREATE OR REPLACE VIEW public.v_rematricula_agenda_polo WITH (security_invoker = true) AS
SELECT ag.*, a.polo_id
FROM public.rematricula_agenda ag
JOIN public.alunos a ON a.id = ag.aluno_id;

-- ---- tarefas pessoais de engajamento (aluno_id pode ser nulo) ----
CREATE OR REPLACE VIEW public.v_engajamento_tarefas_pessoais_polo WITH (security_invoker = true) AS
SELECT t.*, COALESCE(a.polo_id, p.polo_id) AS polo_id
FROM public.engajamento_tarefas_pessoais t
LEFT JOIN public.alunos a ON a.id = t.aluno_id
JOIN public.profiles p ON p.id = t.user_id;

-- ---- tarefas pessoais de rematrícula (aluno_id pode ser nulo) ----
CREATE OR REPLACE VIEW public.v_rematricula_tarefas_pessoais_polo WITH (security_invoker = true) AS
SELECT t.*, COALESCE(a.polo_id, p.polo_id) AS polo_id
FROM public.rematricula_tarefas_pessoais t
LEFT JOIN public.alunos a ON a.id = t.aluno_id
JOIN public.profiles p ON p.id = t.user_id;

-- ---- checklist interno das tarefas de engajamento (via tarefa pai) ----
CREATE OR REPLACE VIEW public.v_engajamento_tarefas_checklist_polo WITH (security_invoker = true) AS
SELECT c.*, COALESCE(a.polo_id, p.polo_id) AS polo_id
FROM public.engajamento_tarefas_checklist c
JOIN public.engajamento_tarefas_pessoais t ON t.id = c.tarefa_id
LEFT JOIN public.alunos a ON a.id = t.aluno_id
JOIN public.profiles p ON p.id = t.user_id;

-- ---- checklist interno das tarefas de rematrícula (via tarefa pai) ----
CREATE OR REPLACE VIEW public.v_rematricula_tarefas_checklist_polo WITH (security_invoker = true) AS
SELECT c.*, COALESCE(a.polo_id, p.polo_id) AS polo_id
FROM public.rematricula_tarefas_checklist c
JOIN public.rematricula_tarefas_pessoais t ON t.id = c.tarefa_id
LEFT JOIN public.alunos a ON a.id = t.aluno_id
JOIN public.profiles p ON p.id = t.user_id;

-- ---- tarefas gerais (painel admin -> colaborador, via para_user_id) ----
CREATE OR REPLACE VIEW public.v_tarefas_gerais_polo WITH (security_invoker = true) AS
SELECT tg.*, p.polo_id
FROM public.tarefas_gerais tg
JOIN public.profiles p ON p.id = tg.para_user_id;

CREATE OR REPLACE VIEW public.v_rematricula_tarefas_gerais_polo WITH (security_invoker = true) AS
SELECT tg.*, p.polo_id
FROM public.rematricula_tarefas_gerais tg
JOIN public.profiles p ON p.id = tg.para_user_id;

-- ---- notificações (aluno_id pode ser nulo, sempre tem para_user_id) ----
CREATE OR REPLACE VIEW public.v_notificacoes_polo WITH (security_invoker = true) AS
SELECT n.*, COALESCE(a.polo_id, p.polo_id) AS polo_id
FROM public.notificacoes n
LEFT JOIN public.alunos a ON a.id = n.aluno_id
JOIN public.profiles p ON p.id = n.para_user_id;

-- Faz o PostgREST recarregar o cache de schema e enxergar as views novas
NOTIFY pgrst, 'reload schema';

COMMENT ON VIEW public.v_interacoes_polo IS 'Export: interações com polo_id resolvido via aluno. Uso interno (service_role), não expor ao app.';
