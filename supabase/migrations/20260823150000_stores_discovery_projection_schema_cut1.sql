-- CUT 1 — Stores discovery scale projection schema (additive only).
-- Authority: DIBAY STORES SCALE ROOT ARCHITECTURE DECISION (Option B coverage geometry).
-- NO backfill, NO builder, NO discovery cutover in this migration.

BEGIN;

-- ---------------------------------------------------------------------------
-- 0) Extensions (PostGIS + pg_trgm) — idempotent; Supabase may pre-install PostGIS
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$
BEGIN
  IF to_regproc('postgis_version') IS NULL THEN
    RAISE EXCEPTION 'stores_discovery_projection_cut1: postgis extension unavailable';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 1) Global coverage policy version state (singleton)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.delivery_coverage_policy_state (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  active_policy_version bigint NOT NULL DEFAULT 1 CHECK (active_policy_version >= 1),
  building_policy_version bigint NULL CHECK (building_policy_version IS NULL OR building_policy_version >= 1),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.delivery_coverage_policy_state IS
  'Singleton: active_policy_version is discovery read authority; building_policy_version tracks in-flight global rebuild (V+1).';

INSERT INTO public.delivery_coverage_policy_state (id, active_policy_version)
VALUES (1, 1)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) stores — geo/district/schedule/order projection columns (additive)
-- ---------------------------------------------------------------------------
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS delivery_policy_version bigint NOT NULL DEFAULT 1 CHECK (delivery_policy_version >= 1);

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS discovery_schedule_state text;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS next_schedule_transition_at timestamptz;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS completed_orders_30d integer NOT NULL DEFAULT 0 CHECK (completed_orders_30d >= 0);

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS completed_orders_30d_at timestamptz;

ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_discovery_schedule_state_check;
ALTER TABLE public.stores ADD CONSTRAINT stores_discovery_schedule_state_check
  CHECK (
    discovery_schedule_state IS NULL
    OR discovery_schedule_state IN ('ORDERABLE', 'IN_BREAK', 'CLOSED', 'PREPARING', 'UNKNOWN')
  );

COMMENT ON COLUMN public.stores.lat IS
  'LAT/LNG AUTHORITY for store coordinates. location_geog is a query projection derived from lat/lng.';
COMMENT ON COLUMN public.stores.lng IS
  'LAT/LNG AUTHORITY for store coordinates. location_geog is a query projection derived from lat/lng.';
COMMENT ON COLUMN public.stores.delivery_policy_version IS
  'Per-store delivery policy/coverage inputs version. Bumped on lat/lng, delivery_available, or store override changes (CUT 2 builder).';
COMMENT ON COLUMN public.stores.discovery_schedule_state IS
  'Materialized schedule/commerce state for discovery ranking (CUT 2 builder). NULL until backfill.';
COMMENT ON COLUMN public.stores.next_schedule_transition_at IS
  'Next schedule transition for event-driven refresh (CUT 2 builder).';
COMMENT ON COLUMN public.stores.completed_orders_30d IS
  'Rolling 30d completed-order projection for discovery popular sort. Default 0 — new stores not penalized vs live aggregate ?? 0.';
COMMENT ON COLUMN public.stores.completed_orders_30d_at IS
  'Projection freshness timestamp. Maintained by CUT 2/3 daily-stats pipeline.';

-- district_norm — lower(trim(district)) parity with districtRank input normalization
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stores'
      AND column_name = 'district_norm'
  ) THEN
    EXECUTE $sql$
      ALTER TABLE public.stores
      ADD COLUMN district_norm text
      GENERATED ALWAYS AS (lower(btrim(coalesce(district, '')))) STORED
    $sql$;
  END IF;
EXCEPTION
  WHEN others THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'stores'
        AND column_name = 'district_norm'
    ) THEN
      EXECUTE 'ALTER TABLE public.stores ADD COLUMN district_norm text';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.trg_stores_sync_district_norm()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.district_norm := lower(btrim(coalesce(NEW.district, '')));
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  is_generated boolean := false;
BEGIN
  SELECT (c.is_generated = 'ALWAYS')
  INTO is_generated
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'stores'
    AND c.column_name = 'district_norm';

  IF is_generated IS DISTINCT FROM true THEN
    DROP TRIGGER IF EXISTS stores_sync_district_norm ON public.stores;
    CREATE TRIGGER stores_sync_district_norm
      BEFORE INSERT OR UPDATE OF district
      ON public.stores
      FOR EACH ROW
      EXECUTE FUNCTION public.trg_stores_sync_district_norm();

    UPDATE public.stores s
    SET district_norm = lower(btrim(coalesce(s.district, '')))
    WHERE s.district_norm IS DISTINCT FROM lower(btrim(coalesce(s.district, '')));
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.trg_stores_sync_district_norm() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_stores_sync_district_norm() TO service_role;

COMMENT ON COLUMN public.stores.district_norm IS
  'Discovery districtRank projection: lower(trim(district)). Original district column remains authority.';

-- location_geog — geography(Point,4326) projection from lat/lng (not authority)
CREATE OR REPLACE FUNCTION public.stores_compute_location_geog(
  p_lat double precision,
  p_lng double precision
)
RETURNS geography
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_lat IS NOT NULL
      AND p_lng IS NOT NULL
      AND p_lat >= -90::double precision
      AND p_lat <= 90::double precision
      AND p_lng >= -180::double precision
      AND p_lng <= 180::double precision
    THEN ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    ELSE NULL::geography
  END;
$$;

COMMENT ON FUNCTION public.stores_compute_location_geog(double precision, double precision) IS
  'Pure lat/lng → geography(Point,4326) projection. Used by generated column or sync trigger.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stores'
      AND column_name = 'location_geog'
  ) THEN
    EXECUTE $sql$
      ALTER TABLE public.stores
      ADD COLUMN location_geog geography(Point, 4326)
      GENERATED ALWAYS AS (public.stores_compute_location_geog(lat, lng)) STORED
    $sql$;
  END IF;
EXCEPTION
  WHEN others THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'stores'
        AND column_name = 'location_geog'
    ) THEN
      EXECUTE 'ALTER TABLE public.stores ADD COLUMN location_geog geography(Point, 4326)';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.trg_stores_sync_location_geog()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.location_geog := public.stores_compute_location_geog(NEW.lat, NEW.lng);
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  is_generated boolean := false;
BEGIN
  SELECT (c.is_generated = 'ALWAYS')
  INTO is_generated
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'stores'
    AND c.column_name = 'location_geog';

  IF is_generated IS DISTINCT FROM true THEN
    DROP TRIGGER IF EXISTS stores_sync_location_geog ON public.stores;
    CREATE TRIGGER stores_sync_location_geog
      BEFORE INSERT OR UPDATE OF lat, lng
      ON public.stores
      FOR EACH ROW
      EXECUTE FUNCTION public.trg_stores_sync_location_geog();

    UPDATE public.stores s
    SET location_geog = public.stores_compute_location_geog(s.lat, s.lng)
    WHERE s.location_geog IS DISTINCT FROM public.stores_compute_location_geog(s.lat, s.lng);
  END IF;
END $$;

COMMENT ON COLUMN public.stores.location_geog IS
  'GEO QUERY PROJECTION from stores.lat/lng. Authority remains lat/lng columns.';

-- ---------------------------------------------------------------------------
-- 3) store_delivery_coverage — versioned rows (dual-version safe)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_delivery_coverage (
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  policy_version bigint NOT NULL CHECK (policy_version >= 1),
  store_policy_version bigint NOT NULL DEFAULT 1 CHECK (store_policy_version >= 1),
  coverage_geog geography,
  effective_max_km double precision CHECK (effective_max_km IS NULL OR effective_max_km > 0),
  distance_applies boolean NOT NULL DEFAULT true,
  covers_all boolean NOT NULL DEFAULT false,
  delivery_mode_effective text NOT NULL DEFAULT 'inherit',
  built_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, policy_version),
  CONSTRAINT store_delivery_coverage_mode_check CHECK (
    delivery_mode_effective IN ('inherit', 'enabled', 'disabled')
  ),
  CONSTRAINT store_delivery_coverage_geog_presence_check CHECK (
    (covers_all = true AND coverage_geog IS NULL)
    OR (covers_all = false AND distance_applies = false)
    OR (covers_all = false AND distance_applies = true AND coverage_geog IS NOT NULL)
    OR (distance_applies = false)
  )
);

COMMENT ON TABLE public.store_delivery_coverage IS
  'Per-store delivery coverage geometry for discovery membership (ST_Covers). Versioned rows: (store_id, policy_version) allows V and V+1 coexistence during global rebuild.';
COMMENT ON COLUMN public.store_delivery_coverage.policy_version IS
  'Global delivery coverage policy version for this row. Discovery reads rows matching delivery_coverage_policy_state.active_policy_version.';
COMMENT ON COLUMN public.store_delivery_coverage.store_policy_version IS
  'Store-local inputs version (lat/lng, override, delivery_available) at build time.';
COMMENT ON COLUMN public.store_delivery_coverage.covers_all IS
  'True when effective_max_km IS NULL and distance applies — no circle buffer; in-range for all origins (eligible_no_max).';

-- GiST for point-in-coverage: WHERE ST_Covers(coverage_geog, $origin)
CREATE INDEX IF NOT EXISTS idx_store_delivery_coverage_geog_gist
  ON public.store_delivery_coverage
  USING gist (coverage_geog)
  WHERE coverage_geog IS NOT NULL
    AND distance_applies = true
    AND covers_all = false;

CREATE INDEX IF NOT EXISTS idx_store_delivery_coverage_policy_store
  ON public.store_delivery_coverage (policy_version, store_id);

-- ---------------------------------------------------------------------------
-- 4) store_order_daily_stats — 30d metric foundation
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_order_daily_stats (
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  stat_date date NOT NULL,
  completed_count integer NOT NULL DEFAULT 0 CHECK (completed_count >= 0),
  PRIMARY KEY (store_id, stat_date)
);

COMMENT ON TABLE public.store_order_daily_stats IS
  'Daily completed-order buckets for stores.completed_orders_30d rollup. Maintained by CUT 2/3 — not discovery request aggregate.';

CREATE INDEX IF NOT EXISTS idx_store_order_daily_stats_stat_date
  ON public.store_order_daily_stats (stat_date);

-- ---------------------------------------------------------------------------
-- 5) Foundation indexes (CUT 1 only — no taxonomy×sort explosion)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_stores_district_norm_discovery
  ON public.stores (district_norm)
  WHERE approval_status = 'approved'
    AND is_visible = true;

CREATE INDEX IF NOT EXISTS idx_stores_district_norm_trgm
  ON public.stores
  USING gin (district_norm gin_trgm_ops)
  WHERE approval_status = 'approved'
    AND is_visible = true;

CREATE INDEX IF NOT EXISTS idx_stores_location_geog_gist
  ON public.stores
  USING gist (location_geog)
  WHERE location_geog IS NOT NULL
    AND approval_status = 'approved'
    AND is_visible = true;

CREATE INDEX IF NOT EXISTS idx_stores_discovery_schedule_transition
  ON public.stores (next_schedule_transition_at)
  WHERE next_schedule_transition_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 6) Security — deny public/authenticated direct access to projection tables
-- ---------------------------------------------------------------------------
ALTER TABLE public.delivery_coverage_policy_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_delivery_coverage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_order_daily_stats ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.delivery_coverage_policy_state FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.store_delivery_coverage FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.store_order_daily_stats FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.delivery_coverage_policy_state TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.store_delivery_coverage TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.store_order_daily_stats TO service_role;

REVOKE ALL ON FUNCTION public.stores_compute_location_geog(double precision, double precision) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stores_compute_location_geog(double precision, double precision) TO service_role;

REVOKE ALL ON FUNCTION public.trg_stores_sync_location_geog() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_stores_sync_location_geog() TO service_role;

-- ---------------------------------------------------------------------------
-- 7) Dual-version coexistence proof (fixture-level, migration-time)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_store_id uuid;
  v_active bigint;
BEGIN
  SELECT s.active_policy_version
  INTO v_active
  FROM public.delivery_coverage_policy_state s
  WHERE s.id = 1;

  IF v_active IS NULL THEN
    RAISE EXCEPTION 'stores_discovery_projection_cut1: active_policy_version missing';
  END IF;

  SELECT st.id
  INTO v_store_id
  FROM public.stores st
  LIMIT 1;

  IF v_store_id IS NULL THEN
    RAISE NOTICE 'stores_discovery_projection_cut1: dual-version proof skipped (no stores rows)';
    RETURN;
  END IF;

  INSERT INTO public.store_delivery_coverage (
    store_id,
    policy_version,
    store_policy_version,
    coverage_geog,
    effective_max_km,
    distance_applies,
    covers_all,
    delivery_mode_effective
  )
  VALUES
    (
      v_store_id,
      v_active,
      1,
      ST_SetSRID(ST_MakePoint(121.0, 14.55), 4326)::geography,
      5,
      true,
      false,
      'inherit'
    ),
    (
      v_store_id,
      v_active + 1,
      2,
      ST_SetSRID(ST_MakePoint(121.0, 14.55), 4326)::geography,
      7,
      true,
      false,
      'inherit'
    )
  ON CONFLICT (store_id, policy_version) DO UPDATE
  SET
    store_policy_version = EXCLUDED.store_policy_version,
    coverage_geog = EXCLUDED.coverage_geog,
    effective_max_km = EXCLUDED.effective_max_km,
    built_at = now();

  IF (
    SELECT count(*)::integer
    FROM public.store_delivery_coverage c
    WHERE c.store_id = v_store_id
      AND c.policy_version IN (v_active, v_active + 1)
  ) <> 2 THEN
    RAISE EXCEPTION 'stores_discovery_projection_cut1: dual-version rows not coexistent for store %', v_store_id;
  END IF;

  DELETE FROM public.store_delivery_coverage c
  WHERE c.store_id = v_store_id
    AND c.policy_version = v_active + 1;
END
$$;

COMMENT ON INDEX public.idx_store_delivery_coverage_geog_gist IS
  'Discovery membership query shape: ... WHERE policy_version = active AND ST_Covers(coverage_geog, origin_geog). Planner proof: CUT 7.';

COMMIT;
