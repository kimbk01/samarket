-- CUT 2 — Discovery projection maintainers (builders, ledger, rebuild lifecycle).
-- Additive only. NO discovery ranking cutover. NO full backfill.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Rolling 30d popularity ledger — exact created_at >= since parity (not calendar buckets)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_order_popularity_ledger (
  order_id uuid PRIMARY KEY REFERENCES public.store_orders (id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  order_created_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.store_order_popularity_ledger IS
  'Orders contributing to stores.completed_orders_30d. Metric: completed orders with created_at >= now()-30d (timestamp rolling, not calendar-day buckets).';

CREATE INDEX IF NOT EXISTS idx_store_order_popularity_ledger_store_created
  ON public.store_order_popularity_ledger (store_id, order_created_at DESC);

CREATE INDEX IF NOT EXISTS idx_store_order_popularity_ledger_created
  ON public.store_order_popularity_ledger (order_created_at);

ALTER TABLE public.store_order_popularity_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.store_order_popularity_ledger FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.store_order_popularity_ledger TO service_role;

-- ---------------------------------------------------------------------------
-- 2) Global coverage rebuild lifecycle columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.delivery_coverage_policy_state
  ADD COLUMN IF NOT EXISTS rebuild_status text;

ALTER TABLE public.delivery_coverage_policy_state
  ADD COLUMN IF NOT EXISTS rebuild_cursor_store_id uuid;

ALTER TABLE public.delivery_coverage_policy_state
  ADD COLUMN IF NOT EXISTS rebuild_processed bigint NOT NULL DEFAULT 0;

ALTER TABLE public.delivery_coverage_policy_state
  ADD COLUMN IF NOT EXISTS rebuild_expected bigint NOT NULL DEFAULT 0;

ALTER TABLE public.delivery_coverage_policy_state
  ADD COLUMN IF NOT EXISTS rebuild_failed_count bigint NOT NULL DEFAULT 0;

ALTER TABLE public.delivery_coverage_policy_state
  ADD COLUMN IF NOT EXISTS rebuild_failed_store_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.delivery_coverage_policy_state
  ADD COLUMN IF NOT EXISTS rebuild_started_at timestamptz;

ALTER TABLE public.delivery_coverage_policy_state DROP CONSTRAINT IF EXISTS delivery_coverage_policy_state_rebuild_status_check;
ALTER TABLE public.delivery_coverage_policy_state ADD CONSTRAINT delivery_coverage_policy_state_rebuild_status_check
  CHECK (
    rebuild_status IS NULL
    OR rebuild_status IN ('building', 'complete', 'failed')
  );

-- Missing store coords: allow NULL coverage_geog when distance applies
ALTER TABLE public.store_delivery_coverage DROP CONSTRAINT IF EXISTS store_delivery_coverage_geog_presence_check;
ALTER TABLE public.store_delivery_coverage ADD CONSTRAINT store_delivery_coverage_geog_presence_check
  CHECK (
    (covers_all = true AND coverage_geog IS NULL)
    OR (distance_applies = false)
    OR (covers_all = false AND distance_applies = true AND coverage_geog IS NOT NULL)
    OR (covers_all = false AND distance_applies = true AND coverage_geog IS NULL)
  );

-- ---------------------------------------------------------------------------
-- 3) Coverage upsert — ST_Buffer authority (service_role only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_store_delivery_coverage(
  p_store_id uuid,
  p_policy_version bigint,
  p_store_policy_version bigint,
  p_effective_max_km double precision,
  p_distance_applies boolean,
  p_covers_all boolean,
  p_delivery_mode_effective text,
  p_lat double precision,
  p_lng double precision
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_geog geography;
BEGIN
  IF p_store_id IS NULL OR p_policy_version IS NULL THEN
    RETURN;
  END IF;

  v_geog := NULL;
  IF p_distance_applies = true AND p_covers_all = false THEN
    IF p_lat IS NOT NULL
      AND p_lng IS NOT NULL
      AND p_lat >= -90 AND p_lat <= 90
      AND p_lng >= -180 AND p_lng <= 180
      AND p_effective_max_km IS NOT NULL
      AND p_effective_max_km > 0
    THEN
      v_geog := ST_Buffer(
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
        p_effective_max_km * 1000.0
      );
    END IF;
  END IF;

  INSERT INTO public.store_delivery_coverage (
    store_id,
    policy_version,
    store_policy_version,
    coverage_geog,
    effective_max_km,
    distance_applies,
    covers_all,
    delivery_mode_effective,
    built_at
  )
  VALUES (
    p_store_id,
    p_policy_version,
    COALESCE(p_store_policy_version, 1),
    v_geog,
    p_effective_max_km,
    COALESCE(p_distance_applies, true),
    COALESCE(p_covers_all, false),
    COALESCE(NULLIF(trim(p_delivery_mode_effective), ''), 'inherit'),
    now()
  )
  ON CONFLICT (store_id, policy_version) DO UPDATE
  SET
    store_policy_version = EXCLUDED.store_policy_version,
    coverage_geog = EXCLUDED.coverage_geog,
    effective_max_km = EXCLUDED.effective_max_km,
    distance_applies = EXCLUDED.distance_applies,
    covers_all = EXCLUDED.covers_all,
    delivery_mode_effective = EXCLUDED.delivery_mode_effective,
    built_at = now();
END;
$$;

COMMENT ON FUNCTION public.upsert_store_delivery_coverage(uuid, bigint, bigint, double precision, boolean, boolean, text, double precision, double precision) IS
  'CUT 2 coverage builder DB authority — ST_Buffer geography circle from effective_max_km.';

REVOKE ALL ON FUNCTION public.upsert_store_delivery_coverage(uuid, bigint, bigint, double precision, boolean, boolean, text, double precision, double precision)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_store_delivery_coverage(uuid, bigint, bigint, double precision, boolean, boolean, text, double precision, double precision)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 4) Popularity ledger apply — idempotent completed transition
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_store_order_popularity_ledger(
  p_order_id uuid,
  p_store_id uuid,
  p_order_created_at timestamptz,
  p_since timestamptz
)
RETURNS TABLE (inserted boolean, counted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted boolean := false;
  v_counted boolean := false;
  v_row_count integer := 0;
BEGIN
  IF p_order_id IS NULL OR p_store_id IS NULL OR p_order_created_at IS NULL OR p_since IS NULL THEN
    RETURN QUERY SELECT false, false;
    RETURN;
  END IF;

  INSERT INTO public.store_order_popularity_ledger (order_id, store_id, order_created_at)
  VALUES (p_order_id, p_store_id, p_order_created_at)
  ON CONFLICT (order_id) DO NOTHING;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_inserted := v_row_count > 0;

  IF v_inserted AND p_order_created_at >= p_since THEN
    UPDATE public.stores
    SET
      completed_orders_30d = GREATEST(0, COALESCE(completed_orders_30d, 0) + 1),
      completed_orders_30d_at = now()
    WHERE id = p_store_id;
    v_counted := true;
  END IF;

  RETURN QUERY SELECT v_inserted, v_counted;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_store_order_popularity_ledger(uuid, uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_store_order_popularity_ledger(uuid, uuid, timestamptz, timestamptz)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 5) Popularity ledger expiration batch
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_store_order_popularity_ledger_batch(
  p_since timestamptz,
  p_limit integer DEFAULT 500
)
RETURNS TABLE (expired_count integer, stores_touched integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 500), 5000));
  v_expired integer := 0;
  v_stores integer := 0;
BEGIN
  IF p_since IS NULL THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  WITH doomed AS (
    SELECT l.order_id, l.store_id
    FROM public.store_order_popularity_ledger l
    WHERE l.order_created_at < p_since
    ORDER BY l.order_created_at ASC
    LIMIT v_limit
  ),
  dec AS (
    SELECT d.store_id, COUNT(*)::integer AS n
    FROM doomed d
    GROUP BY d.store_id
  ),
  apply_dec AS (
    UPDATE public.stores s
    SET
      completed_orders_30d = GREATEST(0, COALESCE(s.completed_orders_30d, 0) - dec.n),
      completed_orders_30d_at = now()
    FROM dec
    WHERE s.id = dec.store_id
    RETURNING s.id
  ),
  del AS (
    DELETE FROM public.store_order_popularity_ledger l
    USING doomed d
    WHERE l.order_id = d.order_id
    RETURNING l.order_id
  )
  SELECT
    (SELECT COUNT(*)::integer FROM del),
    (SELECT COUNT(*)::integer FROM apply_dec)
  INTO v_expired, v_stores;

  RETURN QUERY SELECT v_expired, v_stores;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_store_order_popularity_ledger_batch(timestamptz, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_store_order_popularity_ledger_batch(timestamptz, integer)
  TO service_role;

-- Daily stats auxiliary row for reconcile (NOT discovery read authority)
CREATE OR REPLACE FUNCTION public.upsert_store_order_daily_stat_on_completed(
  p_store_id uuid,
  p_order_created_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date date;
BEGIN
  IF p_store_id IS NULL OR p_order_created_at IS NULL THEN
    RETURN;
  END IF;
  v_date := (p_order_created_at AT TIME ZONE 'UTC')::date;
  INSERT INTO public.store_order_daily_stats (store_id, stat_date, completed_count)
  VALUES (p_store_id, v_date, 1)
  ON CONFLICT (store_id, stat_date) DO UPDATE
  SET completed_count = public.store_order_daily_stats.completed_count + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_store_order_daily_stat_on_completed(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_store_order_daily_stat_on_completed(uuid, timestamptz)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 6) Global rebuild lifecycle RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.begin_delivery_coverage_global_rebuild()
RETURNS TABLE (
  active_policy_version bigint,
  building_policy_version bigint,
  rebuild_expected bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active bigint;
  v_building bigint;
  v_expected bigint;
BEGIN
  SELECT s.active_policy_version
  INTO v_active
  FROM public.delivery_coverage_policy_state s
  WHERE s.id = 1
  FOR UPDATE;

  IF v_active IS NULL THEN
    RAISE EXCEPTION 'delivery_coverage_policy_state missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.delivery_coverage_policy_state s
    WHERE s.id = 1 AND s.rebuild_status = 'building'
  ) THEN
    SELECT s.building_policy_version, s.rebuild_expected
    INTO v_building, v_expected
    FROM public.delivery_coverage_policy_state s
    WHERE s.id = 1;
    RETURN QUERY SELECT v_active, v_building, v_expected;
    RETURN;
  END IF;

  v_building := v_active + 1;

  SELECT COUNT(*)::bigint
  INTO v_expected
  FROM public.stores st
  WHERE st.approval_status = 'approved'
    AND st.is_visible = true;

  UPDATE public.delivery_coverage_policy_state
  SET
    building_policy_version = v_building,
    rebuild_status = 'building',
    rebuild_cursor_store_id = NULL,
    rebuild_processed = 0,
    rebuild_expected = v_expected,
    rebuild_failed_count = 0,
    rebuild_failed_store_ids = '[]'::jsonb,
    rebuild_started_at = now(),
    updated_at = now()
  WHERE id = 1;

  RETURN QUERY SELECT v_active, v_building, v_expected;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_delivery_coverage_global_rebuild() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_delivery_coverage_global_rebuild() TO service_role;

CREATE OR REPLACE FUNCTION public.mark_delivery_coverage_rebuild_progress(
  p_store_id uuid,
  p_failed boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.delivery_coverage_policy_state
  SET
    rebuild_processed = rebuild_processed + 1,
    rebuild_cursor_store_id = p_store_id,
    rebuild_failed_count = CASE WHEN p_failed THEN rebuild_failed_count + 1 ELSE rebuild_failed_count END,
    rebuild_failed_store_ids = CASE
      WHEN p_failed THEN COALESCE(rebuild_failed_store_ids, '[]'::jsonb) || to_jsonb(p_store_id::text)
      ELSE rebuild_failed_store_ids
    END,
    updated_at = now()
  WHERE id = 1
    AND rebuild_status = 'building';
END;
$$;

REVOKE ALL ON FUNCTION public.mark_delivery_coverage_rebuild_progress(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_delivery_coverage_rebuild_progress(uuid, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.try_flip_delivery_coverage_active_version()
RETURNS TABLE (
  flipped boolean,
  active_policy_version bigint,
  previous_policy_version bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.delivery_coverage_policy_state%ROWTYPE;
  v_prev bigint;
BEGIN
  SELECT *
  INTO v_row
  FROM public.delivery_coverage_policy_state
  WHERE id = 1
  FOR UPDATE;

  IF v_row.rebuild_status IS DISTINCT FROM 'building'
    OR v_row.building_policy_version IS NULL
    OR v_row.rebuild_failed_count <> 0
    OR v_row.rebuild_processed < v_row.rebuild_expected
  THEN
    RETURN QUERY SELECT false, v_row.active_policy_version, NULL::bigint;
    RETURN;
  END IF;

  v_prev := v_row.active_policy_version;

  UPDATE public.delivery_coverage_policy_state
  SET
    active_policy_version = v_row.building_policy_version,
    building_policy_version = NULL,
    rebuild_status = 'complete',
    updated_at = now()
  WHERE id = 1;

  DELETE FROM public.store_delivery_coverage c
  WHERE c.policy_version < v_row.building_policy_version - 1;

  RETURN QUERY SELECT true, v_row.building_policy_version, v_prev;
END;
$$;

REVOKE ALL ON FUNCTION public.try_flip_delivery_coverage_active_version() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_flip_delivery_coverage_active_version() TO service_role;

COMMIT;
