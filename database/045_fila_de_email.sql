-- =============================================
-- FILA DE E-MAILS DE REMATRÍCULA / BOAS-VINDAS
-- - Enfileira no INSERT do aluno
-- - Processamento em lotes de 100
-- - Limite 500/dia por polo
-- - Relatório dos não enviados para o e-mail do polo
-- - DELETE de tudo da fila após o workflow (nada fica salvo)
-- =============================================

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- ---------------------------------------------------------------------------
-- 1) Tabela da fila (temporária – será limpa após o workflow)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_fila (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id        UUID REFERENCES public.alunos(id) ON DELETE SET NULL,
  polo_id         UUID NOT NULL REFERENCES public.polos(id) ON DELETE CASCADE,
  destinatario    VARCHAR(255) NOT NULL,
  assunto         TEXT NOT NULL,
  html            TEXT NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'skipped')),
  tentativas      INT NOT NULL DEFAULT 0,
  max_tentativas  INT NOT NULL DEFAULT 3,
  erro            TEXT,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  processado_em   TIMESTAMPTZ,
  enviado_em      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_email_fila_pending
  ON public.email_fila (polo_id, criado_em)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_email_fila_enviado_dia
  ON public.email_fila (polo_id, enviado_em)
  WHERE status = 'sent';

COMMENT ON TABLE public.email_fila IS
  'Fila temporária de e-mails de rematrícula. Limpa após envio + relatório.';

-- ---------------------------------------------------------------------------
-- 2) Contagem de envios do dia (timezone America/Sao_Paulo)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.email_envios_hoje(p_polo_id UUID)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INT
  FROM public.email_fila
  WHERE polo_id = p_polo_id
    AND status = 'sent'
    AND enviado_em >= (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')
    AND enviado_em <  (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '1 day';
$$;

-- ---------------------------------------------------------------------------
-- 3) Config da Edge Function (URL + service_key no Vault)
--    (reutiliza os secrets que você já usa no fluxo de e-mail)
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
-- 4) Trigger: no INSERT do aluno, ENFILEIRA (não envia mais direto)
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
  v_html            TEXT;
  v_assunto         TEXT;
BEGIN
  -- Sem e-mail do aluno → não enfileira
  IF NEW.email IS NULL OR btrim(NEW.email) = '' THEN
    RETURN NEW;
  END IF;

  -- Carrega dados do polo
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

  -- Polo sem SMTP configurado → não enfileira
  IF v_email_remetente IS NULL OR btrim(v_email_remetente) = ''
     OR v_senha_app IS NULL OR btrim(v_senha_app) = '' THEN
    RAISE WARNING 'Polo % sem email_remetente/senha_app. E-mail não enfileirado.',
      COALESCE(v_polo_nome, NEW.polo_id::text);
    RETURN NEW;
  END IF;

  v_whatsapp_numero := COALESCE(NULLIF(btrim(v_whatsapp_numero), ''), '(47) 9293-1650');
  v_whatsapp_link   := COALESCE(NULLIF(btrim(v_whatsapp_link), ''), 'https://wa.me/554792931650');

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
          <tr>
            <td style="background-color:#0f2744;padding:28px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">
                Uniasselvi ' || COALESCE(v_polo_nome, '') || '
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px;color:#333333;font-size:15px;line-height:1.6;">
              <p style="margin:0 0 16px 0;">Olá, <strong>' || COALESCE(NEW.nome, 'Aluno') || '</strong>!</p>
              <p style="margin:0 0 16px 0;">
                Identificamos que sua rematrícula para o curso ainda não foi concluída. Não deixe sua vaga escapar para o próximo semestre!
              </p>
              <p style="margin:0 0 16px 0;">
                Nossa equipe da Jornada Acadêmica está pronta para te ajudar em qualquer etapa do processo.
              </p>
              <p style="margin:0 0 24px 0;">Fale agora com a gente pelo WhatsApp:</p>
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

  INSERT INTO public.email_fila (aluno_id, polo_id, destinatario, assunto, html)
  VALUES (NEW.id, NEW.polo_id, NEW.email, v_assunto, v_html);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_email_polo_novo_aluno ON public.alunos;
CREATE TRIGGER trg_email_polo_novo_aluno
  AFTER INSERT ON public.alunos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notif_polo_novo_aluno();

-- ---------------------------------------------------------------------------
-- 5) Reserva o próximo lote (até 100, respeitando cota 500/dia)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.email_fila_proximo_lote(
  p_polo_id       UUID,
  p_tamanho       INT DEFAULT 100,
  p_limite_diario INT DEFAULT 500
)
RETURNS SETOF public.email_fila
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enviados INT;
  v_restante INT;
  v_pegar    INT;
BEGIN
  v_enviados := public.email_envios_hoje(p_polo_id);
  v_restante := GREATEST(0, p_limite_diario - v_enviados);
  v_pegar    := LEAST(p_tamanho, v_restante);

  IF v_pegar <= 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH cte AS (
    SELECT id
    FROM public.email_fila
    WHERE polo_id = p_polo_id
      AND status = 'pending'
    ORDER BY criado_em
    LIMIT v_pegar
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.email_fila f
  SET status       = 'processing',
      processado_em = now(),
      tentativas    = tentativas + 1
  FROM cte
  WHERE f.id = cte.id
  RETURNING f.*;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6) Itens não enviados (para montar o relatório)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.email_fila_itens_nao_enviados(p_polo_id UUID)
RETURNS TABLE (
  destinatario VARCHAR,
  assunto      TEXT,
  status       VARCHAR,
  erro         TEXT,
  criado_em    TIMESTAMPTZ,
  tentativas   INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT destinatario, assunto, status, erro, criado_em, tentativas
  FROM public.email_fila
  WHERE polo_id = p_polo_id
    AND status IN ('pending', 'failed', 'processing')
  ORDER BY criado_em;
$$;

-- ---------------------------------------------------------------------------
-- 7) Limpa TUDO da fila do polo (depois do relatório / fim do workflow)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.email_fila_limpar_polo(p_polo_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_apagados INT;
BEGIN
  DELETE FROM public.email_fila
  WHERE polo_id = p_polo_id;
  GET DIAGNOSTICS v_apagados = ROW_COUNT;
  RETURN v_apagados;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8) Permissões (só service_role usa essas funções)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.email_envios_hoje(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.email_fila_proximo_lote(UUID, INT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.email_fila_itens_nao_enviados(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.email_fila_limpar_polo(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.email_envios_hoje(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.email_fila_proximo_lote(UUID, INT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.email_fila_itens_nao_enviados(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.email_fila_limpar_polo(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 9) Checagem rápida (opcional – descomente para validar)
-- ---------------------------------------------------------------------------
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'email_fila'
-- ORDER BY ordinal_position;
--
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.alunos'::regclass;