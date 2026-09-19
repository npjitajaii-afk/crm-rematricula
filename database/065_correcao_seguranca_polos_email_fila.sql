-- 065 - Correção de segurança crítica:
--   1) polos.senha_app e polos.email_remetente (credenciais SMTP/Gmail) estavam
--      legíveis por QUALQUER usuário (inclusive anônimo, policy da 018) porque
--      RLS só filtra LINHAS, não colunas — a policy de SELECT em "polos" libera
--      a tabela inteira. Basta um GET direto na REST API do Supabase
--      (?select=id,nome,email_remetente,senha_app) usando a anon key pública
--      (a mesma exposta no bundle do front-end) para vazar a senha de app do
--      Gmail de cada polo.
--   2) email_fila nunca teve RLS habilitada. Sem ENABLE ROW LEVEL SECURITY,
--      qualquer role com grant de tabela (anon/authenticated, que o Supabase
--      concede por padrão em tabelas novas do schema public) pode ler, inserir
--      ou apagar livremente os e-mails da fila — inclusive inserir um item
--      malicioso (destinatário + HTML arbitrários) que o cron do
--      process-email-queue depois envia usando o Gmail oficial do polo.
--
-- Rode esta migration antes de reexpor o projeto publicamente.

-- ---------------------------------------------------------------------------
-- 1) polos: restringe por COLUNA quem pode ler email_remetente/senha_app.
--    A policy de SELECT (017/018) continua valendo para leitura de id/nome
--    pela tela de cadastro; aqui só retiramos o acesso às colunas sensíveis.
-- ---------------------------------------------------------------------------
REVOKE SELECT ON public.polos FROM anon, authenticated;

GRANT SELECT (id, nome, created_at, updated_at)
  ON public.polos TO anon, authenticated;

-- As funções que precisam de email_remetente/senha_app (email_envios_hoje,
-- trg_notif_polo_novo_aluno, email_fila_proximo_lote etc.) são SECURITY
-- DEFINER e continuam funcionando normalmente: rodam com o privilégio do
-- dono da função, não do caller, então o REVOKE acima não as afeta.

-- Colaborador/admin que hoje edita email_remetente/senha_app pela tela de
-- Polos precisa de uma função SECURITY DEFINER dedicada para UPDATE dessas
-- duas colunas (o front-end nunca deve fazer supabase.from('polos').update()
-- direto nelas). Ver services/polosService.ts.

-- ---------------------------------------------------------------------------
-- 2) email_fila: habilita RLS com política padrão de negar tudo para
--    anon/authenticated. A tabela só deve ser tocada por:
--      - triggers SECURITY DEFINER (enfileiram);
--      - a Edge Function process-email-queue, que usa a service_role key
--        (service_role tem BYPASSRLS e ignora estas policies).
-- ---------------------------------------------------------------------------
ALTER TABLE public.email_fila ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.email_fila FROM anon, authenticated;

-- Nenhuma policy criada de propósito: sem policy, com RLS habilitada,
-- anon/authenticated não enxergam nenhuma linha. Se no futuro alguma tela
-- precisar mostrar o status da fila para o admin, crie uma policy explícita
-- de SELECT restrita a public.is_admin() em vez de liberar a tabela toda.
