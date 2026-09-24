-- =============================================================
-- supabase_setup.sql — Controle TCU · AFCE
-- Execute este script no SQL Editor do Supabase:
--   https://app.supabase.com → seu projeto → SQL Editor → New query
-- =============================================================

-- ----------------------------------------------------------------
-- 1. EXTENSÃO (garante UUID)
-- ----------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------
-- 2. TABELA PRINCIPAL DE ESTADO
--    Armazena o estado completo serializado do app por usuário.
--    Estratégia: 1 linha por user_id (upsert). Simples e eficiente
--    para o volume de dados deste app (~50 KB comprimido).
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_state (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payload     JSONB       NOT NULL DEFAULT '{}'::jsonb,  -- estado completo
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice único: 1 registro por usuário
CREATE UNIQUE INDEX IF NOT EXISTS user_state_user_id_idx ON public.user_state(user_id);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_state_updated_at ON public.user_state;
CREATE TRIGGER user_state_updated_at
  BEFORE UPDATE ON public.user_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------
-- 3. TABELA DE ATIVIDADES DE ESTUDO
--    Armazena cada sessão de estudo individualmente,
--    permitindo queries analíticas server-side no futuro.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.study_activities (
  id              TEXT        PRIMARY KEY,  -- ex: "act_1700000000000_abc12"
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  discipline_id   TEXT        NOT NULL,
  discipline_name TEXT,
  tipo            TEXT,                     -- Leitura, Exercício, Revisão...
  date            DATE        NOT NULL,
  seconds         INTEGER     NOT NULL DEFAULT 0,
  feitas          INTEGER     NOT NULL DEFAULT 0,
  acertos         INTEGER     NOT NULL DEFAULT 0,
  step_id         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para queries de data e disciplina
CREATE INDEX IF NOT EXISTS study_activities_user_date_idx
  ON public.study_activities(user_id, date DESC);

CREATE INDEX IF NOT EXISTS study_activities_user_discipline_idx
  ON public.study_activities(user_id, discipline_id);

-- ----------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS)
--    Cada usuário só enxerga e modifica seus próprios dados.
--    CRÍTICO: sem RLS, qualquer usuário autenticado leria dados alheios.
-- ----------------------------------------------------------------

-- user_state
ALTER TABLE public.user_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_state_select_own" ON public.user_state;
CREATE POLICY "user_state_select_own"
  ON public.user_state FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_state_insert_own" ON public.user_state;
CREATE POLICY "user_state_insert_own"
  ON public.user_state FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_state_update_own" ON public.user_state;
CREATE POLICY "user_state_update_own"
  ON public.user_state FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_state_delete_own" ON public.user_state;
CREATE POLICY "user_state_delete_own"
  ON public.user_state FOR DELETE
  USING (auth.uid() = user_id);

-- study_activities
ALTER TABLE public.study_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activities_select_own" ON public.study_activities;
CREATE POLICY "activities_select_own"
  ON public.study_activities FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "activities_insert_own" ON public.study_activities;
CREATE POLICY "activities_insert_own"
  ON public.study_activities FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "activities_update_own" ON public.study_activities;
CREATE POLICY "activities_update_own"
  ON public.study_activities FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "activities_delete_own" ON public.study_activities;
CREATE POLICY "activities_delete_own"
  ON public.study_activities FOR DELETE
  USING (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- 5. VERIFICAÇÃO — rode após o setup para confirmar
-- ----------------------------------------------------------------
-- SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public'
--   AND tablename IN ('user_state', 'study_activities');
-- (rowsecurity deve ser TRUE para ambas)
