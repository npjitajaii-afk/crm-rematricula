-- CalendÃ¡rio geral do Engajamento e lembrete recorrente de boleto.
CREATE TABLE public.calendario_geral (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  dia_boleto SMALLINT NOT NULL DEFAULT 10 CHECK (dia_boleto BETWEEN 1 AND 28),
  titulo VARCHAR(255) NOT NULL DEFAULT 'Vencimento de boleto',
  mensagem TEXT NOT NULL DEFAULT 'Hoje Ã© o dia de vencimento do boleto. Direcione o aluno para os canais de suporte, se necessÃ¡rio.',
  numeros_suporte TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
INSERT INTO public.calendario_geral (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.calendario_geral ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver calendario geral" ON public.calendario_geral FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin atualiza calendario geral" ON public.calendario_geral FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Permite identificar o lembrete de um mÃªs e impedir duplicidades.
ALTER TABLE public.notificacoes ADD COLUMN IF NOT EXISTS referencia DATE;
ALTER TABLE public.notificacoes DROP CONSTRAINT IF EXISTS valid_tipo_notif;
ALTER TABLE public.notificacoes ADD CONSTRAINT valid_tipo_notif CHECK (tipo IN ('mudanca_status', 'nova_interacao', 'recado_admin', 'lembrete_boleto'));
CREATE UNIQUE INDEX IF NOT EXISTS idx_notificacao_boleto_unica ON public.notificacoes (para_user_id, tipo, referencia) WHERE tipo = 'lembrete_boleto';

CREATE OR REPLACE FUNCTION public.disparar_notificacoes_boleto()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE config public.calendario_geral%ROWTYPE;
BEGIN
  SELECT * INTO config FROM public.calendario_geral WHERE id = true;
  IF config IS NULL OR EXTRACT(DAY FROM CURRENT_DATE) <> config.dia_boleto THEN RETURN; END IF;
  INSERT INTO public.notificacoes (para_user_id, tipo, titulo, corpo, referencia)
  SELECT p.id, 'lembrete_boleto', config.titulo,
    config.mensagem || CASE WHEN config.numeros_suporte <> '' THEN E'\nSuporte: ' || config.numeros_suporte ELSE '' END,
    CURRENT_DATE
  FROM public.profiles p
  WHERE p.role = 'colaborador' AND 'engajamento' = ANY(p.areas_permitidas)
  ON CONFLICT (para_user_id, tipo, referencia) WHERE tipo = 'lembrete_boleto' DO NOTHING;
END;
$$;
GRANT EXECUTE ON FUNCTION public.disparar_notificacoes_boleto() TO authenticated;

-- Para envio automÃ¡tico Ã s 8h do dia configurado, crie no SQL Editor do
-- Supabase (com pg_cron habilitado):
-- SELECT cron.schedule('lembrete-boleto-engajamento', '0 8 * * *', $$SELECT public.disparar_notificacoes_boleto();$$);
