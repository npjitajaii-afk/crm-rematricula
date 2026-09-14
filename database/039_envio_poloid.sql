-- =============================================
-- 041 - FLUXO COMPLETO DO ZERO: e-mail de boas-vindas
--        para o ALUNO ao ser cadastrado
-- =============================================

-- 1) Extensões
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- 2) Coluna de e-mail no polo (referência futura)
ALTER TABLE public.polos
  ADD COLUMN IF NOT EXISTS email_notificacao VARCHAR(255);

COMMENT ON COLUMN public.polos.email_notificacao IS
  'E-mail de referência do polo (não usado no envio automático ao aluno).';

-- 3) Função que lê URL + service_key do Vault
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

-- 4) Função do trigger: e-mail de boas-vindas pro ALUNO
CREATE OR REPLACE FUNCTION public.trg_notif_polo_novo_aluno()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_polo_nome TEXT;
  v_url       TEXT;
  v_key       TEXT;
  v_html      TEXT;
BEGIN
  IF NEW.email IS NULL OR btrim(NEW.email) = '' THEN
    RETURN NEW;
  END IF;

  SELECT nome INTO v_polo_nome
  FROM public.polos
  WHERE id = NEW.polo_id;

  SELECT c.url, c.service_key INTO v_url, v_key
  FROM public._config_email_lembrete() c;

  IF v_url IS NULL OR btrim(v_url) = '' OR v_key IS NULL OR btrim(v_key) = '' THEN
    RETURN NEW;
  END IF;

  v_html :=
    '<p>Olá, ' || COALESCE(NEW.nome, 'aluno(a)') || '!</p>' ||
    '<p>Seu cadastro foi realizado com sucesso' ||
      COALESCE(' no polo <strong>' || v_polo_nome || '</strong>', '') || '.</p>' ||
    '<ul>' ||
      COALESCE('<li><strong>Curso:</strong> ' || NEW.curso || '</li>', '') ||
      COALESCE('<li><strong>Turno:</strong> ' || NEW.turno || '</li>', '') ||
      COALESCE('<li><strong>RA:</strong> ' || NEW.ra || '</li>', '') ||
    '</ul>' ||
    '<p>Em breve alguém da nossa equipe entrará em contato.</p>';

  BEGIN
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body := jsonb_build_object(
        'to', NEW.email,
        'subject', 'Cadastro confirmado' || COALESCE(' — ' || v_polo_nome, ''),
        'html', v_html
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Falha ao enviar e-mail de boas-vindas ao aluno: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- 5) Trigger
DROP TRIGGER IF EXISTS trg_email_polo_novo_aluno ON public.alunos;
CREATE TRIGGER trg_email_polo_novo_aluno
  AFTER INSERT ON public.alunos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notif_polo_novo_aluno();