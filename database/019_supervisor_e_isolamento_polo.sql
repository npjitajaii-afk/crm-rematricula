-- =============================================
-- 018 - Papel "supervisor" + isolamento por polo (dados e métricas)
-- =============================================
-- Rode este script no SQL Editor do Supabase (depois de todas as
-- migrations anteriores, especialmente 007 e 017).
--
-- Regras de negócio implementadas aqui:
--
-- ADMIN (só existe 1, vinculado ao polo Itajaí, mas enxerga tudo):
--   - vê/edita/exclui alunos de qualquer polo
--   - vê métricas de todos os polos
--   - vê e autoriza usuários (aprova cadastro, define role/status/áreas/polo)
--
-- SUPERVISOR (1 por polo, ou mais):
--   - sobe planilha (INSERT de alunos) só dentro do próprio polo
--   - vê e exclui contatos (alunos) do próprio polo, de qualquer colaborador
--   - vê métricas só do próprio polo
--   - vê a aba de colaboradores do próprio polo (SELECT em profiles já é
--     liberado pra todo authenticated desde a 007 — filtro é no frontend)
--   - NÃO vê a tela de Usuários nem autoriza cadastro (isso fica só pra
--     admin — reforçado pelo trigger protege_campos_sensiveis_profile,
--     que já bloqueia quem não é admin de mudar role/status/areas/polo)
--   - pode delegar (reatribuir responsavel_id) contatos do seu polo pra
--     qualquer colaborador do mesmo polo
--
-- COLABORADOR (sem mudança de comportamento, só reafirmado aqui):
--   - vê/edita só os próprios contatos + os ainda sem dono, dentro do
--     próprio polo

-- =============================================
-- 1) Papel "supervisor" na constraint de profiles.role
-- =============================================
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS valid_role;

ALTER TABLE public.profiles
  ADD CONSTRAINT valid_role CHECK (role IN ('admin', 'supervisor', 'colaborador'));

COMMENT ON COLUMN public.profiles.role IS
  'Papel: admin (vê/autoriza tudo, todos os polos) | supervisor (vê/exclui/delega contatos e métricas só do próprio polo, não autoriza usuários) | colaborador (só seus próprios contatos, dentro do polo)';

-- =============================================
-- 2) Funções auxiliares de papel
-- =============================================
CREATE OR REPLACE FUNCTION public.is_supervisor(uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = uid AND role = 'supervisor'
  );
$$;

-- Supervisor "enxerga tudo do polo" igual admin enxerga tudo do sistema.
-- Centraliza a regra "admin OU (supervisor do mesmo polo)" usada em várias
-- policies abaixo.
CREATE OR REPLACE FUNCTION public.supervisiona_polo(p_polo_id UUID, uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = uid AND role = 'supervisor' AND polo_id IS NOT DISTINCT FROM p_polo_id
  );
$$;

COMMENT ON FUNCTION public.supervisiona_polo IS
  'True se o usuário logado é supervisor do polo informado. Usada nas policies de alunos/interações pra dar acesso amplo (qualquer responsável) dentro do polo, sem estender esse acesso a outros polos.';

-- =============================================
-- 3) ALUNOS — policies com 3 níveis (admin / supervisor / colaborador)
-- =============================================
-- NOTA (mesmo motivo da 003_fix_delete_bulk.sql): em UPDATE/DELETE em massa
-- (ex.: exclusão de vários contatos pelo supervisor), a policy é reavaliada
-- linha a linha dentro do mesmo statement. Funções SECURITY DEFINER como
-- is_admin() já se mostraram instáveis nesse cenário no passado, então as
-- policies de UPDATE/DELETE abaixo usam subquery direta em profiles em vez
-- de is_admin()/is_supervisor() pra checar o papel do usuário logado.

DROP POLICY IF EXISTS "Selecionar alunos por hierarquia" ON public.alunos;
CREATE POLICY "Selecionar alunos por hierarquia"
  ON public.alunos FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (
      public.tem_acesso_area(area)
      AND polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
      AND (
        public.supervisiona_polo(polo_id)
        OR responsavel_id = auth.uid()
        OR responsavel_id IS NULL
      )
    )
  );

DROP POLICY IF EXISTS "Criar alunos" ON public.alunos;
CREATE POLICY "Criar alunos"
  ON public.alunos FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      public.tem_acesso_area(area)
      AND polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
    )
  );

DROP POLICY IF EXISTS "Atualizar alunos por hierarquia" ON public.alunos;
CREATE POLICY "Atualizar alunos por hierarquia"
  ON public.alunos FOR UPDATE TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (
      public.tem_acesso_area(area)
      AND polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
      AND (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'supervisor'
        OR responsavel_id = auth.uid()
        OR responsavel_id IS NULL
      )
    )
  )
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (
      public.tem_acesso_area(area)
      -- não deixa mover o aluno pra outro polo por baixo do pano
      AND polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
      AND (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'supervisor'
        OR responsavel_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Deletar alunos por hierarquia" ON public.alunos;
CREATE POLICY "Deletar alunos por hierarquia"
  ON public.alunos FOR DELETE TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    OR (
      public.tem_acesso_area(area)
      AND polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
      AND (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'supervisor'
        OR responsavel_id = auth.uid()
      )
    )
  );

-- =============================================
-- 4) Integridade da delegação: responsavel_id precisa ser alguém do
--    mesmo polo do aluno (evita delegar pra fora do polo por engano ou
--    via chamada direta à API burlando o frontend).
-- =============================================
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
    -- admin pode atribuir livremente (ex.: ajuste manual); os demais não.
    IF public.is_admin() THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'O responsável precisa pertencer ao mesmo polo do contato.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_valida_responsavel_mesmo_polo ON public.alunos;
CREATE TRIGGER trg_valida_responsavel_mesmo_polo
  BEFORE INSERT OR UPDATE OF responsavel_id ON public.alunos
  FOR EACH ROW EXECUTE FUNCTION public.valida_responsavel_mesmo_polo();

-- =============================================
-- 5) INTERAÇÕES — segue a mesma regra de "supervisor enxerga o polo
--    inteiro" (precisa pra registrar nota ao excluir/delegar um contato
--    que não é dele).
-- =============================================
DROP POLICY IF EXISTS "Ver interações por hierarquia" ON public.interacoes;
CREATE POLICY "Ver interações por hierarquia"
  ON public.interacoes FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = interacoes.aluno_id
        AND public.tem_acesso_area(a.area)
        AND a.polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
        AND (
          public.supervisiona_polo(a.polo_id)
          OR a.responsavel_id = auth.uid()
          OR a.responsavel_id IS NULL
        )
    )
  );

DROP POLICY IF EXISTS "Criar interações por hierarquia" ON public.interacoes;
CREATE POLICY "Criar interações por hierarquia"
  ON public.interacoes FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = interacoes.aluno_id
        AND public.tem_acesso_area(a.area)
        AND a.polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
        AND (
          public.supervisiona_polo(a.polo_id)
          OR a.responsavel_id = auth.uid()
          OR a.responsavel_id IS NULL
        )
    )
  );

DROP POLICY IF EXISTS "Atualizar interações por hierarquia" ON public.interacoes;
CREATE POLICY "Atualizar interações por hierarquia"
  ON public.interacoes FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = interacoes.aluno_id
        AND public.tem_acesso_area(a.area)
        AND a.polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
        AND (public.supervisiona_polo(a.polo_id) OR a.responsavel_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Deletar interações por hierarquia" ON public.interacoes;
CREATE POLICY "Deletar interações por hierarquia"
  ON public.interacoes FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.alunos a
      WHERE a.id = interacoes.aluno_id
        AND public.tem_acesso_area(a.area)
        AND a.polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
        AND (public.supervisiona_polo(a.polo_id) OR a.responsavel_id = auth.uid())
    )
  );

-- =============================================
-- 6) Métricas isoladas por polo
-- =============================================
-- PROBLEMA: as views de 004_metricas.sql e 016_metricas_multi_funil.sql são
-- GRANT SELECT direto pra "authenticated", sem RLS própria — no Postgres,
-- policies de RLS das tabelas base só valem "de verdade" pra quem consulta
-- a tabela diretamente; views herdam a visão do dono da view (normalmente
-- um role com privilégio total no Supabase), então elas expõem TODOS os
-- polos e TODOS os colaboradores pra qualquer authenticated, hoje contido
-- só por convenção no frontend (ver nota em 016). Isso não cobre mais o
-- requisito de "supervisor só vê métricas do próprio polo" — então:
--
-- 1) Revogamos o SELECT direto de metricas_colaboradores_area (a mais
--    sensível: performance individual por colaborador).
-- 2) Criamos funções RPC SECURITY DEFINER que aplicam o filtro de polo
--    de verdade, no banco, antes de devolver a linha.
--
-- O frontend (metricasService.ts) precisa trocar as chamadas
-- `.from('metricas_colaboradores_area').select(...)` etc. por
-- `.rpc('metricas_colaboradores_polo')` (mesma ideia pra pipeline,
-- canais, alertas, overview e tempo-no-status). Isso fica pro próximo
-- passo (frontend); aqui só deixamos a função pronta e já revogamos o
-- acesso cru na mais sensível pra não deixar a brecha aberta.

REVOKE SELECT ON public.metricas_colaboradores_area FROM authenticated;
REVOKE SELECT ON public.metricas_colaboradores FROM authenticated;

CREATE OR REPLACE FUNCTION public.metricas_colaboradores_polo()
RETURNS TABLE (
  colaborador_id UUID,
  colaborador_nome VARCHAR,
  area VARCHAR,
  polo_id UUID,
  polo_nome VARCHAR,
  total_alunos BIGINT,
  sucesso BIGINT,
  encerrados_sem_sucesso BIGINT,
  valor_recuperado NUMERIC,
  valor_total_carteira NUMERIC,
  total_interacoes BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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
  WHERE
    public.is_admin()
    OR a.polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
  GROUP BY p.id, p.name, a.area, pol.id, pol.nome;
$$;

GRANT EXECUTE ON FUNCTION public.metricas_colaboradores_polo() TO authenticated;

CREATE OR REPLACE FUNCTION public.pipeline_area_polo()
RETURNS TABLE (area VARCHAR, status VARCHAR, polo_id UUID, total BIGINT, total_valor_pendente NUMERIC)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT area, status, a.polo_id, COUNT(*), COALESCE(SUM(valor_pendente), 0)
  FROM public.alunos a
  WHERE public.is_admin() OR a.polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
  GROUP BY area, status, a.polo_id;
$$;

GRANT EXECUTE ON FUNCTION public.pipeline_area_polo() TO authenticated;

CREATE OR REPLACE FUNCTION public.metricas_canais_polo()
RETURNS TABLE (canal_contato VARCHAR, area VARCHAR, polo_id UUID, total BIGINT, sucesso BIGINT, taxa_conversao NUMERIC)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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
  WHERE public.is_admin() OR a.polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
  GROUP BY canal_contato, area, a.polo_id;
$$;

GRANT EXECUTE ON FUNCTION public.metricas_canais_polo() TO authenticated;

CREATE OR REPLACE FUNCTION public.alertas_operacao_polo()
RETURNS TABLE (area VARCHAR, polo_id UUID, travados BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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
  WHERE public.is_admin() OR a.polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
  GROUP BY area, a.polo_id;
$$;

GRANT EXECUTE ON FUNCTION public.alertas_operacao_polo() TO authenticated;

CREATE OR REPLACE FUNCTION public.metricas_overview_polo()
RETURNS TABLE (area VARCHAR, polo_id UUID, total BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT area, a.polo_id, COUNT(*)
  FROM public.alunos a
  WHERE public.is_admin() OR a.polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
  GROUP BY area, a.polo_id;
$$;

GRANT EXECUTE ON FUNCTION public.metricas_overview_polo() TO authenticated;

CREATE OR REPLACE FUNCTION public.metricas_tempo_status_polo()
RETURNS TABLE (area VARCHAR, status VARCHAR, polo_id UUID, dias_medio_no_status NUMERIC, total BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    area, status, a.polo_id,
    ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - status_atualizado_em)) / 86400)::numeric, 1),
    COUNT(*)
  FROM public.alunos a
  WHERE public.is_admin() OR a.polo_id IS NOT DISTINCT FROM public.get_user_polo_id()
  GROUP BY area, status, a.polo_id;
$$;

GRANT EXECUTE ON FUNCTION public.metricas_tempo_status_polo() TO authenticated;

-- =============================================
-- 7) Checklist pós-migration
-- =============================================
-- a) Promova supervisores existentes:
--    UPDATE public.profiles SET role = 'supervisor' WHERE email = '...';
--    (o polo_id de cada supervisor já precisa estar setado — é ele que
--    define qual polo o supervisor enxerga; só admin pode alterar polo_id,
--    então isso é feito pela tela de Usuários já existente).
-- b) O frontend (Usuarios.tsx / usuariosService.ts) precisa passar a
--    aceitar 'supervisor' como opção de role no formulário de aprovação.
-- c) O frontend precisa esconder a tela/rota de Usuários pra quem não é
--    admin (hoje já deve ser assim, checar App.tsx) — a proteção de dados
--    (trigger protege_campos_sensiveis_profile) já impede supervisor de
--    alterar role/status/areas_permitidas/polo mesmo se a rota vazar.
-- d) metricasService.ts precisa trocar os selects diretos nas views antigas
--    por chamadas .rpc(...) nas 6 funções criadas na seção 6 acima.