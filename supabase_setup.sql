-- =============================================================
-- supabase_setup.sql — Controle TCU / Controle de Estudos
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
--    Estratégia: 1 linha por user_id (upsert). Simples e eficiente.
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
--    Armazena cada sessão de estudo individualmente.
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
-- 4. TABELA DE BACKUPS POR APARELHO (HISTÓRICO DE DISPOSITIVOS)
--    Garante que cada sincronização/aparelho conectado tenha snapshots
--    preservados por pelo menos 3 dias no servidor.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.state_backups (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id    TEXT,
  device_label TEXT,
  reason       TEXT        DEFAULT 'automatico',
  payload      JSONB       NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS state_backups_user_idx
  ON public.state_backups(user_id, created_at DESC);

-- Função para expurgar backups mais antigos que 3 dias
CREATE OR REPLACE FUNCTION public.clean_old_backups()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.state_backups WHERE created_at < NOW() - INTERVAL '3 days';
END;
$$;

-- ----------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS)
--    Cada usuário só enxerga e modifica seus próprios dados.
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

-- state_backups
ALTER TABLE public.state_backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "state_backups_select_own" ON public.state_backups;
CREATE POLICY "state_backups_select_own"
  ON public.state_backups FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "state_backups_insert_own" ON public.state_backups;
CREATE POLICY "state_backups_insert_own"
  ON public.state_backups FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "state_backups_delete_own" ON public.state_backups;
CREATE POLICY "state_backups_delete_own"
  ON public.state_backups FOR DELETE
  USING (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- 6. AGENDAMENTO SEMANAL (CRON — SÁBADO 23:59 HORÁRIO DE BRASÍLIA)
--    Requer extensões pg_cron e pg_net (disponíveis no painel do Supabase:
--    Database → Extensions → ativar 'pg_cron' e 'pg_net')
-- ----------------------------------------------------------------
-- O horário 23:59 de Sábado em Brasília (UTC-3) corresponde a 02:59 UTC de Domingo.
-- Exemplo de agendamento via pg_cron chamando a Edge Function weekly-report:
--
-- SELECT cron.schedule(
--   'weekly-study-report',
--   '59 2 * * 0',
--   $$
--   SELECT net.http_post(
--     url := 'https://ntmuaxqeedtzlznzjkxr.supabase.co/functions/v1/weekly-report',
--     headers := '{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_hGsz9_csLIR6AxTgogTZ6A_AwmoCtAf"}'::jsonb,
--     body := '{}'::jsonb
--   );
--   $$
-- );
--
-- Também executamos a limpeza de backups com mais de 3 dias diariamente:
-- SELECT cron.schedule('clean-old-backups-daily', '0 3 * * *', 'SELECT public.clean_old_backups();');

-- ----------------------------------------------------------------
-- 7. VERIFICAÇÃO
-- ----------------------------------------------------------------
-- SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public'
--   AND tablename IN ('user_state', 'study_activities', 'state_backups');
