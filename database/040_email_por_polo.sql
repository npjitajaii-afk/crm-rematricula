-- =============================================
-- 040 - E-mail de boas-vindas POR POLO
--        Cada polo tem: e-mail + senha de app + WhatsApp
-- =============================================
-- Rode este script inteiro no SQL Editor do Supabase.
-- Idempotente: pode rodar mais de uma vez sem problema.
--
-- Depois de rodar:
-- 1) Preencha os dados de cada polo (UPDATE no final)
-- 2) Atualize a Edge Function send-email (código no final deste arquivo)
-- 3) Faça o deploy da Edge Function

-- ---------------------------------------------------------------------------
-- 1) Colunas de contato e SMTP por polo
-- ---------------------------------------------------------------------------
ALTER TABLE public.polos
  ADD COLUMN IF NOT EXISTS email_remetente   VARCHAR(255),
  ADD COLUMN IF NOT EXISTS senha_app         VARCHAR(255),
  ADD COLUMN IF NOT EXISTS whatsapp_numero   VARCHAR(30),
  ADD COLUMN IF NOT EXISTS whatsapp_link     VARCHAR(120);

COMMENT ON COLUMN public.polos.email_remetente IS
  'Gmail (ou outro) usado como remetente dos e-mails deste polo.';
COMMENT ON COLUMN public.polos.senha_app IS
  'Senha de app do Gmail deste polo (nunca a senha normal da conta).';
COMMENT ON COLUMN public.polos.whatsapp_numero IS
  'Número formatado que aparece no e-mail, ex: (47) 9293-1650';
COMMENT ON COLUMN public.polos.whatsapp_link IS
  'Link completo do botão, ex: https://wa.me/554792931650';

-- ---------------------------------------------------------------------------
-- 2) Função de configuração (continua lendo URL + service_key do Vault)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._config_email_lembrete()
RETURNS TABLE (url text, service_key text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_edge_function_url') AS url,
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_edge_function_key') AS service_key;
$$;

REVOKE ALL ON FUNCTION public._config_email_lembrete() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._config_email_lembrete() TO postgres, service_role;

-- ---------------------------------------------------------------------------
-- 3) Trigger: e-mail de boas-vindas usando dados do POLO do aluno
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_notif_polo_novo_aluno()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_polo_nome       TEXT;
  v_email_remetente TEXT;
  v_senha_app       TEXT;
  v_whatsapp_numero TEXT;
  v_whatsapp_link   TEXT;
  v_url             TEXT;
  v_key             TEXT;
  v_html            TEXT;
  v_assunto         TEXT;
BEGIN
  -- Sem e-mail do aluno → não envia
  IF NEW.email IS NULL OR btrim(NEW.email) = '' THEN
    RETURN NEW;
  END IF;

  -- Carrega dados do polo do aluno
  SELECT
    p.nome,
    p.email_remetente,
    p.senha_app,
    p.whatsapp_numero,
    p.whatsapp_link
  INTO
    v_polo_nome,
    v_email_remetente,
    v_senha_app,
    v_whatsapp_numero,
    v_whatsapp_link
  FROM public.polos p
  WHERE p.id = NEW.polo_id;

  -- Se o polo não tiver e-mail + senha de app configurados, não envia
  IF v_email_remetente IS NULL OR btrim(v_email_remetente) = ''
     OR v_senha_app IS NULL OR btrim(v_senha_app) = '' THEN
    RAISE WARNING 'Polo % sem email_remetente/senha_app configurados. E-mail não enviado.', COALESCE(v_polo_nome, NEW.polo_id::text);
    RETURN NEW;
  END IF;

  -- Fallbacks de WhatsApp (caso o polo ainda não tenha preenchido)
  v_whatsapp_numero := COALESCE(NULLIF(btrim(v_whatsapp_numero), ''), '(47) 9293-1650');
  v_whatsapp_link   := COALESCE(NULLIF(btrim(v_whatsapp_link), ''), 'https://wa.me/554792931650');

  -- Credenciais da Edge Function (URL + service_role)
  SELECT c.url, c.service_key INTO v_url, v_key
  FROM public._config_email_lembrete() c;

  IF v_url IS NULL OR btrim(v_url) = '' OR v_key IS NULL OR btrim(v_key) = '' THEN
    RAISE WARNING 'Vault sem email_edge_function_url/key. E-mail não enviado.';
    RETURN NEW;
  END IF;

  v_assunto := 'Sua rematrícula está esperando por você' ||
               COALESCE(', ' || NEW.nome, '') || '!';

  v_html := '
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:24px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">

          <!-- Cabeçalho -->
          <tr>
            <td style="background-color:#0f2744;padding:28px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">
                Uniasselvi ' || COALESCE(v_polo_nome, '') || '
              </h1>
            </td>
          </tr>

          <!-- Corpo -->
          <tr>
            <td style="padding:36px 32px;color:#333333;font-size:15px;line-height:1.6;">
              <p style="margin:0 0 16px 0;">
                Olá, <strong>' || COALESCE(NEW.nome, 'Aluno') || '</strong>!
              </p>
              <p style="margin:0 0 16px 0;">
                Identificamos que sua rematrícula para o curso ainda não foi concluída. Não deixe sua vaga escapar para o próximo semestre!
              </p>
              <p style="margin:0 0 16px 0;">
                Nossa equipe da Jornada Acadêmica está pronta para te ajudar em qualquer etapa do processo, seja com dúvidas sobre documentação, pagamento ou qualquer outra questão.
              </p>
              <p style="margin:0 0 24px 0;">
                Fale agora com a gente pelo WhatsApp:
              </p>

              <!-- Botão WhatsApp (dinâmico por polo) -->
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px auto;">
                <tr>
                  <td align="center" style="background-color:#25D366;border-radius:8px;">
                    <a href="' || v_whatsapp_link || '" target="_blank"
                       style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;">
                      💬 Conversar no WhatsApp
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 16px 0;color:#666666;font-size:13px;text-align:center;">
                Ou entre em contato pelo número <strong>' || v_whatsapp_numero || '</strong>.
              </p>
              <p style="margin:0;color:#666666;font-size:13px;text-align:center;">
                Qualquer dúvida, é só responder esse email.
              </p>
            </td>
          </tr>

          <!-- Rodapé -->
          <tr>
            <td style="background-color:#f9fafb;padding:20px 32px;text-align:center;color:#999999;font-size:12px;">
              Uniasselvi ' || COALESCE(v_polo_nome, '') || ' · Rematrícula
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>';

  BEGIN
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body := jsonb_build_object(
        'to',          NEW.email,
        'subject',     v_assunto,
        'html',        v_html,
        'smtpUser',    v_email_remetente,   -- e-mail do polo
        'smtpPassword', v_senha_app,        -- senha de app do polo
        'fromName',    'Uniasselvi ' || COALESCE(v_polo_nome, '')
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Falha ao enviar e-mail de boas-vindas ao aluno: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) Trigger (garante que está ativo)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_email_polo_novo_aluno ON public.alunos;
CREATE TRIGGER trg_email_polo_novo_aluno
  AFTER INSERT ON public.alunos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notif_polo_novo_aluno();

-- ---------------------------------------------------------------------------
-- 5) Preencher os dados de cada polo
--    TROQUE pelos valores reais de cada unidade
-- ---------------------------------------------------------------------------

-- Exemplo: Itajaí
UPDATE public.polos
SET
  email_remetente = 'itajauniasselvi@gmail.com',
  senha_app       = 'xxxx xxxx xxxx xxxx',          -- senha de app do Gmail
  whatsapp_numero = '(47) 9293-1650',
  whatsapp_link   = 'https://wa.me/554792931650'
WHERE nome = 'Itajaí';

-- Exemplo: outro polo (descomente e preencha)
-- UPDATE public.polos
-- SET
--   email_remetente = 'outro.polo@gmail.com',
--   senha_app       = 'yyyy yyyy yyyy yyyy',
--   whatsapp_numero = '(48) 9999-9999',
--   whatsapp_link   = 'https://wa.me/5548999999999'
-- WHERE nome = 'Nome do Polo';

-- ---------------------------------------------------------------------------
-- 6) Checagem rápida
-- ---------------------------------------------------------------------------
-- SELECT nome, email_remetente, whatsapp_numero, whatsapp_link
-- FROM public.polos
-- ORDER BY nome;
