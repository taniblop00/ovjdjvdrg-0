-- BetOz Supabase Schema
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/ohhbmxrqkjqaqgttxygx/sql

-- ════════════════════════════════
-- USERS TABLE
-- ════════════════════════════════
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  avatar TEXT,
  bonus_points INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════
-- PREDICTIONS TABLE
-- ════════════════════════════════
CREATE TABLE IF NOT EXISTS public.predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  home_score INTEGER NOT NULL,
  away_score INTEGER NOT NULL,
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(match_id, user_name)
);

-- ════════════════════════════════
-- MATCH OVERRIDES TABLE (admin only)
-- ════════════════════════════════
CREATE TABLE IF NOT EXISTS public.match_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id TEXT UNIQUE NOT NULL,
  home_score INTEGER NOT NULL,
  away_score INTEGER NOT NULL,
  set_at TIMESTAMPTZ DEFAULT NOW()
);


-- ════════════════════════════════
-- ROW LEVEL SECURITY (allow all for now - family app)
-- ════════════════════════════════
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all users" ON public.users;
DROP POLICY IF EXISTS "Allow all predictions" ON public.predictions;
DROP POLICY IF EXISTS "Allow all overrides" ON public.match_overrides;

CREATE POLICY "Allow all users" ON public.users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all predictions" ON public.predictions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all overrides" ON public.match_overrides FOR ALL USING (true) WITH CHECK (true);


-- ════════════════════════════════
-- ENABLE REALTIME
-- ════════════════════════════════
ALTER TABLE public.predictions REPLICA IDENTITY FULL;
ALTER TABLE public.users REPLICA IDENTITY FULL;

-- Add tables to realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'predictions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.predictions;
  END IF;
END $$;

-- ════════════════════════════════
-- SEED EXISTING USERS WITH BONUS POINTS
-- (רוני=6, אורי=4, יהונתן=9)
-- ════════════════════════════════
INSERT INTO public.users (name, bonus_points) VALUES 
  ('רוני', 6),
  ('אורי', 4),
  ('יהונתן', 9)
ON CONFLICT (name) DO UPDATE SET bonus_points = EXCLUDED.bonus_points;

-- ════════════════════════════════
-- VERIFY
-- ════════════════════════════════
SELECT name, bonus_points FROM public.users ORDER BY bonus_points DESC;
