-- =============================================
-- 020 - Isolamento completo por polo (admin deixa de ver outros polos)
-- =============================================
-- Rode este script no SQL Editor do Supabase (depois de 017, 018 e 019).
--
-- MUDANÇA DE REGRA DE NEGÓCIO em relação à 019:
--   Antes: admin enxergava alunos/colaboradores/métricas de TODOS os polos.
--   Agora: admin é isolado por polo exatamente como o supervisor. A ÚNICA
--   diferença prática entre admin e supervisor passa a ser:
--     - admin autoriza cadastro de usuários (aprova/reprova, define role,
--       áreas liberadas e polo de QUALQUER usuário, de qualquer polo)
--     - admin cadastra polos
--   Todo o resto (alunos, interações, aba de Colaboradores, métricas) é
--   igual entre admin e supervisor e enxerga só o próprio polo.
--
-- Por ora só existe 1 admin (vinculado ao polo Itajaí), então na prática
-- ele passa a ver alunos/colaboradores só de Itajaí — igual um supervisor
-- de Itajaí veria.
--
-- ACHADO IMPORTANTE (motivo de vários dos itens abaixo): várias views de
-- métricas (004/006/016) e a policy de SELECT de `profiles` (schema.sql)
-- nunca tiveram isolamento por polo nenhum — nem antes nem depois da 019.
-- A 019 só criou funções RPC novas, mas o frontend (metricasService.ts,
-- usuariosService.ts/getColaboradores) continuava lendo direto das views
-- antigas, sem filtro. Isso é corrigido aqui revogando o SELECT dessas
-- views e trocando por RPCs de verdade.

-- =============================================
-- 1) PROFILES — isolamento real por polo
-- =============================================
-- Antes: "USING (true)" pra qualquer authenticated (schema.sql) — todo
-- mundo via todo mundo, de qualquer polo. Agora:
--   - sempre vê a si mesmo
--   - admin vê todos (precisa pra autorizar cadastro de qualquer polo)
--   - supervisor/colaborador só vê profiles do próprio polo
-- A tela de Usuários (admin-only) continua funcionando sem mudança —
-- ela lê a tabela `profiles` direto e depende desse bypass de admin.
DROP POLICY IF EXISTS "Autenticados podem ver todos os profiles" ON public.profiles;
CREATE POLICY "Ver profiles por polo (exceto admin)"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR public.is_admin()
    OR polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
  );

-- RPC própria pra "aba de Colaboradores" e pra qualquer lista de
-- colaboradores usada fora da tela de Usuários (delegação, exibição de
-- responsável, etc.) — isolada por polo pra TODO MUNDO, admin incluso.
-- É essa função que o frontend deve chamar em vez de `.from('profiles')`
-- sempre que for mostrar "colaboradores da minha equipe" (Usuarios.tsx,
-- que é exclusiva do admin pra autorizar cadastro, continua lendo
-- `profiles` direto e enxergando todo mundo, de propósito).
CREATE OR REPLACE FUNCTION public.colaboradores_polo()
RETURNS TABLE (id UUID, name VARCHAR, email VARCHAR, polo_id UUID, polo_nome VARCHAR)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name, p.email, p.polo_id, pol.nome
  FROM public.profiles p
  LEFT JOIN public.polos pol ON pol.id = p.polo_id
  WHERE p.polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
  ORDER BY p.name;
$$;

GRANT EXECUTE ON FUNCTION public.colaboradores_polo() TO authenticated;

-- Delegação de responsável: antes o admin podia atribuir um responsável
-- de outro polo (bypass explícito). Isso não faz mais sentido — admin
-- agora só enxerga (e só deve poder atribuir) gente do próprio polo.
CREATE OR REPLACE FUNCTION public.valida_responsavel_mesmo_polo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  polo_responsavel UUID;
BEGIN
  IF NEW.responsavel_id IS NOT NULL THEN
    SELECT polo_id INTO polo_responsavel FROM public.profiles WHERE id = NEW.responsavel_id;
    IF polo_responsavel IS NOT DISTINCT FROM NEW.polo_id THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'O responsável precisa pertencer ao mesmo polo do contato.';
  END IF;
  RETURN NEW;
END;
$$;

-- =============================================
-- 2) ALUNOS — admin perde o bypass global, vira "supervisor do próprio polo"
-- =============================================
DROP POLICY IF EXISTS "Selecionar alunos por hierarquia" ON public.alunos;
CREATE POLICY "Selecionar alunos por hierarquia"
  ON public.alunos FOR SELECT TO authenticated
  USING (
    public.tem_acesso_area(area)
    AND polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
    AND (
      public.is_admin()
      OR public.is_supervisor()
      OR responsavel_id = auth.uid()
      OR responsavel_id IS NULL
    )
  );

DROP POLICY IF EXISTS "Criar alunos" ON public.alunos;
CREATE POLICY "Criar alunos"
  ON public.alunos FOR INSERT TO authenticated
  WITH CHECK (
    public.tem_acesso_area(area)
    AND polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
  );

DROP POLICY IF EXISTS "Atualizar alunos por hierarquia" ON public.alunos;
CREATE POLICY "Atualizar alunos por hierarquia"
  ON public.alunos FOR UPDATE TO authenticated
  USING (
    public.tem_acesso_area(area)
    AND polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
    AND (
      (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'supervisor')
      OR responsavel_id = auth.uid()
      OR responsavel_id IS NULL
    )
  )
  WITH CHECK (
    public.tem_acesso_area(area)
    AND polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
    AND (
      (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'supervisor')
      OR responsavel_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Deletar alunos por hierarquia" ON public.alunos;
CREATE POLICY "Deletar alunos por hierarquia"
  ON public.alunos FOR DELETE TO authenticated
  USING (
    public.tem_acesso_area(area)
    AND polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
    AND (
      (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'supervisor')
      OR responsavel_id = auth.uid()
    )
  );

-- =============================================
-- 3) INTERAÇÕES — mesmo tratamento
-- =============================================
DROP POLICY IF EXISTS "Ver interações por hierarquia" ON public.interacoes;
CREATE POLICY "Ver interações por hierarquia"
  ON public.interacoes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = interacoes.aluno_id
        AND public.tem_acesso_area(a.area)
        AND a.polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
        AND (
          public.is_admin() OR public.is_supervisor()
          OR a.responsavel_id = auth.uid()
          OR a.responsavel_id IS NULL
        )
    )
  );

DROP POLICY IF EXISTS "Criar interações por hierarquia" ON public.interacoes;
CREATE POLICY "Criar interações por hierarquia"
  ON public.interacoes FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = interacoes.aluno_id
        AND public.tem_acesso_area(a.area)
        AND a.polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
        AND (
          public.is_admin() OR public.is_supervisor()
          OR a.responsavel_id = auth.uid()
          OR a.responsavel_id IS NULL
        )
    )
  );

DROP POLICY IF EXISTS "Atualizar interações por hierarquia" ON public.interacoes;
CREATE POLICY "Atualizar interações por hierarquia"
  ON public.interacoes FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = interacoes.aluno_id
        AND public.tem_acesso_area(a.area)
        AND a.polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
        AND (public.is_admin() OR public.is_supervisor() OR a.responsavel_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Deletar interações por hierarquia" ON public.interacoes;
CREATE POLICY "Deletar interações por hierarquia"
  ON public.interacoes FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = interacoes.aluno_id
        AND public.tem_acesso_area(a.area)
        AND a.polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
        AND (public.is_admin() OR public.is_supervisor() OR a.responsavel_id = auth.uid())
    )
  );

-- =============================================
-- 4) RPCs de métricas da 019 — tira o bypass de admin
-- =============================================
CREATE OR REPLACE FUNCTION public.metricas_colaboradores_polo()
RETURNS TABLE (
  colaborador_id UUID, colaborador_nome VARCHAR, area VARCHAR, polo_id UUID, polo_nome VARCHAR,
  total_alunos BIGINT, sucesso BIGINT, encerrados_sem_sucesso BIGINT,
  valor_recuperado NUMERIC, valor_total_carteira NUMERIC, total_interacoes BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    p.id, p.name, a.area, pol.id, pol.nome,
    COUNT(a.id),
    COUNT(a.id) FILTER (
      WHERE (a.area = 'rematricula' AND a.status = 'rematriculado')
         OR (a.area = 'retencao'    AND a.status = 'recuperado')
         OR (a.area = 'engajamento' AND a.status IN ('engajado', 'estabilizado'))
    ),
    COUNT(a.id) FILTER (WHERE a.status IN ('desistente', 'perdido')),
    COALESCE(SUM(a.valor_pendente) FILTER (
      WHERE (a.area = 'rematricula' AND a.status = 'rematriculado')
         OR (a.area = 'retencao'    AND a.status = 'recuperado')
    ), 0),
    COALESCE(SUM(a.valor_pendente), 0),
    COUNT(i.id)
  FROM public.profiles p
  JOIN public.alunos a ON a.responsavel_id = p.id
  LEFT JOIN public.polos pol ON pol.id = a.polo_id
  LEFT JOIN public.interacoes i ON i.aluno_id = a.id
  WHERE a.polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
  GROUP BY p.id, p.name, a.area, pol.id, pol.nome;
$$;

CREATE OR REPLACE FUNCTION public.pipeline_area_polo()
RETURNS TABLE (area VARCHAR, status VARCHAR, polo_id UUID, total BIGINT, total_valor_pendente NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT area, status, a.polo_id, COUNT(*), COALESCE(SUM(valor_pendente), 0)
  FROM public.alunos a
  WHERE a.polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
  GROUP BY area, status, a.polo_id;
$$;

CREATE OR REPLACE FUNCTION public.metricas_canais_polo()
RETURNS TABLE (canal_contato VARCHAR, area VARCHAR, polo_id UUID, total BIGINT, sucesso BIGINT, taxa_conversao NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    canal_contato, area, a.polo_id,
    COUNT(*),
    COUNT(*) FILTER (
      WHERE (area = 'rematricula' AND status = 'rematriculado')
         OR (area = 'retencao'    AND status = 'recuperado')
         OR (area = 'engajamento' AND status IN ('engajado', 'estabilizado'))
    ),
    ROUND(
      COUNT(*) FILTER (
        WHERE (area = 'rematricula' AND status = 'rematriculado')
           OR (area = 'retencao'    AND status = 'recuperado')
           OR (area = 'engajamento' AND status IN ('engajado', 'estabilizado'))
      ) * 100.0 / NULLIF(COUNT(*), 0), 1
    )
  FROM public.alunos a
  WHERE a.polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
  GROUP BY canal_contato, area, a.polo_id;
$$;

CREATE OR REPLACE FUNCTION public.alertas_operacao_polo()
RETURNS TABLE (area VARCHAR, polo_id UUID, travados BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    area, a.polo_id,
    COUNT(*) FILTER (
      WHERE status_atualizado_em < NOW() - INTERVAL '14 days'
        AND NOT (
          (area = 'rematricula' AND status IN ('rematriculado', 'desistente'))
          OR (area = 'retencao'    AND status IN ('recuperado', 'perdido'))
          OR (area = 'engajamento' AND status IN ('estabilizado', 'desistente'))
        )
    )
  FROM public.alunos a
  WHERE a.polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
  GROUP BY area, a.polo_id;
$$;

CREATE OR REPLACE FUNCTION public.metricas_overview_polo()
RETURNS TABLE (area VARCHAR, polo_id UUID, total BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT area, a.polo_id, COUNT(*)
  FROM public.alunos a
  WHERE a.polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
  GROUP BY area, a.polo_id;
$$;

CREATE OR REPLACE FUNCTION public.metricas_tempo_status_polo()
RETURNS TABLE (area VARCHAR, status VARCHAR, polo_id UUID, dias_medio_no_status NUMERIC, total BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    area, status, a.polo_id,
    ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - status_atualizado_em)) / 86400)::numeric, 1),
    COUNT(*)
  FROM public.alunos a
  WHERE a.polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
  GROUP BY area, status, a.polo_id;
$$;

-- Nova: substitui a view antiga `pipeline_rematricula_resumo` (usada pelo
-- Kanban de Rematrícula pra mostrar o total de cada coluna, pra TODOS os
-- papéis — não só admin). A view antiga não tinha filtro nenhum de polo.
CREATE OR REPLACE FUNCTION public.pipeline_rematricula_polo()
RETURNS TABLE (status VARCHAR, total BIGINT, total_valor_pendente NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT status, COUNT(*), COALESCE(SUM(valor_pendente), 0)
  FROM public.alunos
  WHERE area = 'rematricula'
    AND polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
  GROUP BY status;
$$;

GRANT EXECUTE ON FUNCTION public.metricas_colaboradores_polo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pipeline_area_polo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.metricas_canais_polo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.alertas_operacao_polo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.metricas_overview_polo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.metricas_tempo_status_polo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pipeline_rematricula_polo() TO authenticated;

-- =============================================
-- 5) Fecha as views antigas sem isolamento nenhum (004/006/016).
--    Ninguém no frontend deve mais lê-las depois deste deploy — ver
--    checklist no final do arquivo pros services que precisam trocar
--    `.from(view)` por `.rpc(...)`.
-- =============================================
REVOKE SELECT ON public.pipeline_rematricula_resumo FROM authenticated;
REVOKE SELECT ON public.pipeline_area_resumo        FROM authenticated;
REVOKE SELECT ON public.metricas_canais              FROM authenticated;
REVOKE SELECT ON public.metricas_canais_area         FROM authenticated;
REVOKE SELECT ON public.metricas_overview_geral      FROM authenticated;
REVOKE SELECT ON public.alertas_operacao_resumo      FROM authenticated;
REVOKE SELECT ON public.metricas_tempo_status_area   FROM authenticated;
REVOKE SELECT ON public.metricas_jornada_multi_area  FROM authenticated;
-- metricas_colaboradores e metricas_colaboradores_area já foram revogadas na 019.

-- =============================================
-- 6) Checklist pós-migration (frontend)
-- =============================================
-- a) alunosService.ts:
--    - getPipelineResumo(): trocar `.from('pipeline_rematricula_resumo')`
--      por `.rpc('pipeline_rematricula_polo')`.
--    - getColaboradores(): trocar `.from('profiles').select(...)` por
--      `.rpc('colaboradores_polo')` (colunas: id, name, email, polo_id,
--      polo_nome — mesmo formato já esperado por mapDatabaseToAluno/etc).
-- b) metricasService.ts (5 funções):
--    - getPipelineResumo(area)      -> .rpc('pipeline_area_polo').eq('area', area)
--    - getMetricasColaboradores(area) -> .rpc('metricas_colaboradores_polo').eq('area', area)...
--    - getMetricasCanais(area)      -> .rpc('metricas_canais_polo').eq('area', area)...
--    - getMetricasCanaisCruzado()   -> .rpc('metricas_canais_polo')
--    - getOverviewGeral()           -> .rpc('metricas_overview_polo') e .rpc('alertas_operacao_polo')
-- c) Depois de trocar essas chamadas, teste como admin: ele deve passar a
--    ver só os números/colaboradores/alunos de Itajaí, igual um supervisor
--    de Itajaí veria. A tela de Usuários continua mostrando todo mundo,
--    de qualquer polo (ela não muda).