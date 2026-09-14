-- =============================================
-- 032 - Tela de Transferências (só banco)
--
-- Rode no SQL Editor do Supabase DEPOIS de 031.
--
-- Contexto: a tela de Transferências (admin + supervisor) tem duas ações
-- independentes:
--   1) Mudar setor/responsável de um ALUNO — já funciona hoje via UPDATE
--      em `alunos` (RLS "Atualizar alunos por hierarquia" já libera
--      admin/supervisor pra qualquer contato do polo, ver 030).
--   2) Mudar o SETOR de um COLABORADOR — hoje é admin-only (RLS +
--      trigger). Este arquivo estende isso pra supervisor, mas só sobre
--      colaboradores do próprio polo — nunca sobre outro admin/supervisor
--      (regra confirmada: "não pode mudar outro usuário do mesmo nível
--      de acesso").
-- =============================================

-- =============================================
-- 1) RLS: supervisor pode fazer UPDATE na linha de um colaborador do
--    próprio polo (a coluna que pode mudar continua restrita pelo
--    trigger protege_campos_sensiveis_profile, ver abaixo).
-- =============================================
DROP POLICY IF EXISTS "Atualizar profile por hierarquia" ON public.profiles;
CREATE POLICY "Atualizar profile por hierarquia"
  ON public.profiles FOR UPDATE TO authenticated
  USING (
    auth.uid() = id
    OR public.is_admin()
    OR (public.supervisiona_polo(polo_id) AND role = 'colaborador')
  )
  WITH CHECK (
    auth.uid() = id
    OR public.is_admin()
    OR (public.supervisiona_polo(polo_id) AND role = 'colaborador')
  );

-- =============================================
-- 2) Trigger: abre exceção só pra setor_id, só quando quem edita é
--    supervisor do mesmo polo e o alvo é colaborador. Papel, aprovação,
--    áreas liberadas e polo continuam admin-only, como antes.
-- =============================================
CREATE OR REPLACE FUNCTION public.protege_campos_sensiveis_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.polo_id IS DISTINCT FROM OLD.polo_id AND OLD.polo_id IS NOT NULL THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar o polo após o cadastro.';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.areas_permitidas IS DISTINCT FROM OLD.areas_permitidas THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar papel, status de aprovação ou áreas liberadas.';
  END IF;

  IF NEW.setor_id IS DISTINCT FROM OLD.setor_id THEN
    -- Tela de Transferências: supervisor pode mover o setor de um
    -- colaborador do próprio polo. Nunca de outro admin/supervisor.
    IF NOT (
      public.supervisiona_polo(OLD.polo_id)
      AND OLD.role = 'colaborador'
    ) THEN
      RAISE EXCEPTION 'Você não tem permissão para alterar o setor deste usuário.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger já existe (criado em 007) e referencia a função pelo nome —
-- CREATE OR REPLACE acima já é suficiente, sem precisar recriar o trigger.

-- =============================================
-- 3) Checklist pós-migration
-- =============================================
-- a) Supervisor loga, abre Transferências → aba Colaboradores, muda o
--    setor de um colaborador do próprio polo → deve funcionar.
-- b) Supervisor tenta (via SQL direto, simulando bug futuro) mudar
--    setor_id de outro supervisor/admin → deve falhar com a exception
--    acima.
-- c) Colaborador tenta mudar o próprio setor_id → deve continuar
--    falhando (ele não é admin nem supervisor).
-- d) Admin continua podendo tudo, como antes.
