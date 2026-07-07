-- ╔══════════════════════════════════════════════════════════════════╗
-- ║          BetOz — Supabase Complete Setup Script                  ║
-- ║  Run this ONCE in SQL Editor. Safe to re-run (idempotent).      ║
-- ║  https://supabase.com/dashboard/project/ohhbmxrqkjqaqgttxygx/sql║
-- ╚══════════════════════════════════════════════════════════════════╝


-- ════════════════════════════════════════════════
-- 1. TABLES
-- ════════════════════════════════════════════════

-- Users table: stores every player + their bonus points
CREATE TABLE IF NOT EXISTS public.users (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        UNIQUE NOT NULL,
  avatar       TEXT,
  bonus_points INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Predictions table: one row per (user × match)
CREATE TABLE IF NOT EXISTS public.predictions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id   TEXT        NOT NULL,
  user_name  TEXT        NOT NULL,
  home_score INTEGER     NOT NULL,
  away_score INTEGER     NOT NULL,
  saved_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(match_id, user_name)
);

-- Match overrides table: admin can set manual results
CREATE TABLE IF NOT EXISTS public.match_overrides (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id   TEXT        UNIQUE NOT NULL,
  home_score INTEGER     NOT NULL,
  away_score INTEGER     NOT NULL,
  set_at     TIMESTAMPTZ DEFAULT NOW()
);


-- ════════════════════════════════════════════════
-- 2. PERFORMANCE INDEXES
-- ════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_predictions_user   ON public.predictions(user_name);
CREATE INDEX IF NOT EXISTS idx_predictions_match  ON public.predictions(match_id);
CREATE INDEX IF NOT EXISTS idx_overrides_match    ON public.match_overrides(match_id);


-- ════════════════════════════════════════════════
-- 3. ROW LEVEL SECURITY
--    Family app → allow full read/write for all via anon key
-- ════════════════════════════════════════════════
ALTER TABLE public.users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predictions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_overrides ENABLE ROW LEVEL SECURITY;

-- Drop old policies first (safe to re-run)
DROP POLICY IF EXISTS "Allow all users"          ON public.users;
DROP POLICY IF EXISTS "Allow read users"         ON public.users;
DROP POLICY IF EXISTS "Allow insert users"       ON public.users;
DROP POLICY IF EXISTS "Allow update users"       ON public.users;
DROP POLICY IF EXISTS "Allow all predictions"    ON public.predictions;
DROP POLICY IF EXISTS "Allow all overrides"      ON public.match_overrides;
DROP POLICY IF EXISTS "Allow read predictions"   ON public.predictions;
DROP POLICY IF EXISTS "Allow write predictions"  ON public.predictions;

-- Single permissive policy per table
CREATE POLICY "Allow all users"       ON public.users           FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all predictions" ON public.predictions     FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all overrides"   ON public.match_overrides FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════
-- 4. REALTIME (live leaderboard updates)
-- ════════════════════════════════════════════════
ALTER TABLE public.predictions     REPLICA IDENTITY FULL;
ALTER TABLE public.users           REPLICA IDENTITY FULL;
ALTER TABLE public.match_overrides REPLICA IDENTITY FULL;

-- Add tables to realtime publication (idempotent checks)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'predictions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.predictions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'users'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'match_overrides'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.match_overrides;
  END IF;
END $$;


-- ════════════════════════════════════════════════
-- 5. SEED DATA
--    רוני = 6 נק', אורי = 4 נק', יהונתן = 9 נק'
--    (bonus_points = starting balance carried over)
--    ON CONFLICT → updates bonus only, keeps other data intact
-- ════════════════════════════════════════════════
INSERT INTO public.users (name, bonus_points) VALUES
  ('רוני',     6),
  ('אורי',     4),
  ('יהונתן',   9)
ON CONFLICT (name) DO UPDATE
  SET bonus_points = EXCLUDED.bonus_points;


-- ════════════════════════════════════════════════
-- 6. VERIFY — you should see 3 rows below
-- ════════════════════════════════════════════════
SELECT
  name,
  bonus_points,
  created_at::date AS joined
FROM public.users
ORDER BY bonus_points DESC;
