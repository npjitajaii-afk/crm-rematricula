-- =============================================
-- 056 - Comentários nas tarefas gerais + meta opcional
-- (rode após 054 e 055)
-- =============================================

CREATE TABLE IF NOT EXISTS public.tarefas_gerais_comentarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tarefa_id UUID NOT NULL REFERENCES public.tarefas_gerais(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tgc_tarefa ON public.tarefas_gerais_comentarios(tarefa_id, created_at);

ALTER TABLE public.tarefas_gerais_comentarios ENABLE ROW LEVEL SECURITY;

-- Ver: admin do polo da tarefa OU membro da tarefa
DROP POLICY IF EXISTS "Ver comentarios tarefa geral" ON public.tarefas_gerais_comentarios;
CREATE POLICY "Ver comentarios tarefa geral"
  ON public.tarefas_gerais_comentarios FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tarefas_gerais t
      WHERE t.id = tarefa_id
        AND (
          (public.is_admin() AND public.mesmo_polo_do_usuario(t.polo_id))
          OR t.para_user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.tarefas_gerais_membros m
            WHERE m.tarefa_id = t.id AND m.user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "Criar comentarios tarefa geral" ON public.tarefas_gerais_comentarios;
CREATE POLICY "Criar comentarios tarefa geral"
  ON public.tarefas_gerais_comentarios FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.tarefas_gerais t
      WHERE t.id = tarefa_id
        AND (
          (public.is_admin() AND public.mesmo_polo_do_usuario(t.polo_id))
          OR t.para_user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.tarefas_gerais_membros m
            WHERE m.tarefa_id = t.id AND m.user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "Apagar proprio comentario tarefa" ON public.tarefas_gerais_comentarios;
CREATE POLICY "Apagar proprio comentario tarefa"
  ON public.tarefas_gerais_comentarios FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      public.is_admin()
      AND EXISTS (
        SELECT 1 FROM public.tarefas_gerais t
        WHERE t.id = tarefa_id AND public.mesmo_polo_do_usuario(t.polo_id)
      )
    )
  );

-- Espelho rematrícula
CREATE TABLE IF NOT EXISTS public.rematricula_tarefas_gerais_comentarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tarefa_id UUID NOT NULL REFERENCES public.rematricula_tarefas_gerais(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rtgc_tarefa ON public.rematricula_tarefas_gerais_comentarios(tarefa_id, created_at);

ALTER TABLE public.rematricula_tarefas_gerais_comentarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ver comentarios tarefa geral rem" ON public.rematricula_tarefas_gerais_comentarios;
CREATE POLICY "Ver comentarios tarefa geral rem"
  ON public.rematricula_tarefas_gerais_comentarios FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rematricula_tarefas_gerais t
      WHERE t.id = tarefa_id
        AND (
          (public.is_admin() AND public.mesmo_polo_do_usuario(t.polo_id))
          OR t.para_user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.rematricula_tarefas_gerais_membros m
            WHERE m.tarefa_id = t.id AND m.user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "Criar comentarios tarefa geral rem" ON public.rematricula_tarefas_gerais_comentarios;
CREATE POLICY "Criar comentarios tarefa geral rem"
  ON public.rematricula_tarefas_gerais_comentarios FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.rematricula_tarefas_gerais t
      WHERE t.id = tarefa_id
        AND (
          (public.is_admin() AND public.mesmo_polo_do_usuario(t.polo_id))
          OR t.para_user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.rematricula_tarefas_gerais_membros m
            WHERE m.tarefa_id = t.id AND m.user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "Apagar proprio comentario tarefa rem" ON public.rematricula_tarefas_gerais_comentarios;
CREATE POLICY "Apagar proprio comentario tarefa rem"
  ON public.rematricula_tarefas_gerais_comentarios FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      public.is_admin()
      AND EXISTS (
        SELECT 1 FROM public.rematricula_tarefas_gerais t
        WHERE t.id = tarefa_id AND public.mesmo_polo_do_usuario(t.polo_id)
      )
    )
  );
