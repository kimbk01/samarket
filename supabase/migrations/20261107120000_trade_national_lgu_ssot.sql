-- Trade National LGU SSOT (N0/N2)
-- PSGC City/Municipality reference + posts.trade_lgu_id snapshot column.
-- Does NOT rewrite existing posts.region/city. Does NOT backfill trade_lgu_id.
-- Data rows: load via scripts/trade/import-psgc-trade-national-lgu-to-db.mjs (or generated seed).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) National LGU reference
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trade_national_lgu (
  canonical_id text PRIMARY KEY,
  lgu_type text NOT NULL CHECK (lgu_type IN ('city', 'municipality')),
  display_name text NOT NULL,
  region_code text NOT NULL,
  region_name text NOT NULL,
  province_code text NULL,
  province_name text NULL,
  is_active boolean NOT NULL DEFAULT true,
  dataset_version text NOT NULL,
  superseded_by text NULL REFERENCES public.trade_national_lgu (canonical_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trade_national_lgu_region_code_idx
  ON public.trade_national_lgu (region_code);

CREATE INDEX IF NOT EXISTS trade_national_lgu_display_name_idx
  ON public.trade_national_lgu (display_name);

COMMENT ON TABLE public.trade_national_lgu IS
  'PSGC City/Municipality national Trade discovery SSOT. Separate from local Area taxonomy (posts.region/city).';

-- ---------------------------------------------------------------------------
-- 2) Aliases
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trade_national_lgu_alias (
  id bigserial PRIMARY KEY,
  alias text NOT NULL,
  alias_raw text NOT NULL,
  canonical_id text NOT NULL REFERENCES public.trade_national_lgu (canonical_id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('legacy_product', 'provider_display', 'display_name', 'old_name')),
  dataset_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alias, canonical_id, kind)
);

CREATE INDEX IF NOT EXISTS trade_national_lgu_alias_alias_idx
  ON public.trade_national_lgu_alias (alias);

COMMENT ON TABLE public.trade_national_lgu_alias IS
  'Explicit deterministic aliases for national LGU (legacy product + provider display). No fuzzy authority.';

-- ---------------------------------------------------------------------------
-- 3) Local area → national map
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trade_local_area_lgu_map (
  region_id text NOT NULL,
  city_id text NOT NULL,
  legacy_lgu_alias text NOT NULL,
  canonical_id text NOT NULL REFERENCES public.trade_national_lgu (canonical_id) ON DELETE RESTRICT,
  dataset_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (region_id, city_id)
);

CREATE INDEX IF NOT EXISTS trade_local_area_lgu_map_canonical_idx
  ON public.trade_local_area_lgu_map (canonical_id);

COMMENT ON TABLE public.trade_local_area_lgu_map IS
  'Bridge: existing regions-data local Area (region_id, city_id) → PSGC national LGU.';

-- ---------------------------------------------------------------------------
-- 4) Listing snapshot column (nullable for legacy rows; no backfill)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.posts') IS NULL THEN
    RAISE NOTICE 'trade_national_lgu_ssot: public.posts missing — skip trade_lgu_id';
  ELSE
    ALTER TABLE public.posts
      ADD COLUMN IF NOT EXISTS trade_lgu_id text NULL;

    -- FK only if reference table exists (it does in this migration)
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'posts_trade_lgu_id_fkey'
    ) THEN
      ALTER TABLE public.posts
        ADD CONSTRAINT posts_trade_lgu_id_fkey
        FOREIGN KEY (trade_lgu_id)
        REFERENCES public.trade_national_lgu (canonical_id)
        ON DELETE RESTRICT;
    END IF;

    CREATE INDEX IF NOT EXISTS posts_trade_lgu_id_partial_idx
      ON public.posts (trade_lgu_id)
      WHERE trade_lgu_id IS NOT NULL;

    COMMENT ON COLUMN public.posts.trade_lgu_id IS
      'National Trade discovery LGU (PSGC). Independent of posts.region/city local Area snapshot.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5) posts_masked regenerate — MUST match 20260910140000 contract
--    - security_invoker = true (no silent DEFINER fallback)
--    - reserved_buyer_id via posts_mask_reserved_buyer_id(uuid) only
--    - column set/order = information_schema.posts ordinal
--    - anon/authenticated: column grants excluding reserved_buyer_id
--    - DML grants on public.posts restored (INSERT/UPDATE/DELETE)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  parts text[] := ARRAY[]::text[];
  r record;
  tbl regclass := to_regclass('public.posts');
  col_grant text;
  mask_fn regprocedure;
BEGIN
  IF tbl IS NULL THEN
    RAISE NOTICE 'trade_national_lgu_ssot: posts_masked skip — no posts';
    RETURN;
  END IF;

  SELECT to_regprocedure('public.posts_mask_reserved_buyer_id(uuid)') INTO mask_fn;
  IF mask_fn IS NULL THEN
    RAISE EXCEPTION
      'trade_national_lgu_ssot: public.posts_mask_reserved_buyer_id(uuid) missing — refuse posts_masked recreate (would break reserved_buyer mask contract)';
  END IF;

  FOR r IN
    SELECT column_name, ordinal_position
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'posts'
    ORDER BY ordinal_position
  LOOP
    IF r.column_name = 'reserved_buyer_id' THEN
      parts := array_append(
        parts,
        'public.posts_mask_reserved_buyer_id(p.id) AS reserved_buyer_id'
      );
    ELSE
      parts := array_append(parts, format('p.%I', r.column_name));
    END IF;
  END LOOP;

  IF array_length(parts, 1) IS NULL OR array_length(parts, 1) < 1 THEN
    RAISE EXCEPTION 'trade_national_lgu_ssot: posts columns empty — abort';
  END IF;

  EXECUTE 'DROP VIEW IF EXISTS public.posts_masked';

  -- Hard requirement: security_invoker (same as 20260910140000). No DEFINER fallback.
  EXECUTE format(
    'CREATE VIEW public.posts_masked WITH (security_invoker = true) AS SELECT %s FROM public.posts AS p',
    array_to_string(parts, ', ')
  );

  COMMENT ON VIEW public.posts_masked IS
    '거래 posts 읽기용: reserved_buyer_id 마스킹 (security_invoker). trade_lgu_id 포함. INSERT/UPDATE/DELETE 는 public.posts 사용.';

  SELECT string_agg(format('%I', c.column_name), ', ' ORDER BY c.ordinal_position)
    INTO col_grant
  FROM information_schema.columns AS c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'posts'
    AND c.column_name <> 'reserved_buyer_id';

  IF col_grant IS NOT NULL AND length(trim(col_grant)) > 0 THEN
    REVOKE SELECT ON TABLE public.posts FROM PUBLIC;
    REVOKE SELECT ON TABLE public.posts FROM anon;
    REVOKE SELECT ON TABLE public.posts FROM authenticated;

    EXECUTE format(
      'GRANT SELECT (%s) ON TABLE public.posts TO anon, authenticated',
      col_grant
    );
  END IF;

  GRANT SELECT ON TABLE public.posts_masked TO anon, authenticated, service_role;
  GRANT SELECT ON TABLE public.posts TO service_role;
  GRANT SELECT ON TABLE public.posts TO postgres;
  GRANT INSERT, UPDATE, DELETE ON TABLE public.posts TO authenticated;
  GRANT INSERT, UPDATE, DELETE ON TABLE public.posts TO service_role;
END $$;

-- ---------------------------------------------------------------------------
-- 6) RLS — reference tables public SELECT (picker/search); no write for clients
-- ---------------------------------------------------------------------------
ALTER TABLE public.trade_national_lgu ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_national_lgu_alias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_local_area_lgu_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trade_national_lgu_select_all ON public.trade_national_lgu;
CREATE POLICY trade_national_lgu_select_all
  ON public.trade_national_lgu
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS trade_national_lgu_alias_select_all ON public.trade_national_lgu_alias;
CREATE POLICY trade_national_lgu_alias_select_all
  ON public.trade_national_lgu_alias
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS trade_local_area_lgu_map_select_all ON public.trade_local_area_lgu_map;
CREATE POLICY trade_local_area_lgu_map_select_all
  ON public.trade_local_area_lgu_map
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON TABLE public.trade_national_lgu TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.trade_national_lgu_alias TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.trade_local_area_lgu_map TO anon, authenticated, service_role;

GRANT ALL ON TABLE public.trade_national_lgu TO service_role;
GRANT ALL ON TABLE public.trade_national_lgu_alias TO service_role;
GRANT ALL ON TABLE public.trade_local_area_lgu_map TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.trade_national_lgu_alias_id_seq TO service_role;

COMMIT;
