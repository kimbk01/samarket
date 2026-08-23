-- CUT 4 — Bounded Gi×Dj shadow wave ranking (SHADOW ONLY).
-- Replaces full-candidate shadow pool with per-wave LIMIT queries.
-- NO user-visible cutover. NO store_orders live aggregate. Active coverage only.

BEGIN;

-- ---------------------------------------------------------------------------
-- Indexes for dense rating/reviews/popular waves (approved+visible)
-- Shared schedule prefix; sort-specific trailing keys.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_stores_discovery_wave_schedule_delivery
  ON public.stores (discovery_schedule_state, delivery_available, id)
  WHERE approval_status = 'approved' AND is_visible = true;

COMMENT ON INDEX public.idx_stores_discovery_wave_schedule_delivery IS
  'CUT 4 Gi schedule/delivery wave filter. QUERY: G0–G5 predicates. EXPECTED LIMIT: remaining.';

CREATE INDEX IF NOT EXISTS idx_stores_discovery_wave_popular
  ON public.stores (
    discovery_schedule_state,
    completed_orders_30d DESC,
    rating_avg DESC NULLS LAST,
    review_count DESC,
    slug,
    id
  )
  WHERE approval_status = 'approved' AND is_visible = true;

COMMENT ON INDEX public.idx_stores_discovery_wave_popular IS
  'CUT 4 popular/default order keys after Gi. ORDER: orders→rating→reviews→slug/id. LIMIT: remaining.';

CREATE INDEX IF NOT EXISTS idx_stores_discovery_wave_rating
  ON public.stores (
    discovery_schedule_state,
    rating_avg DESC NULLS LAST,
    review_count DESC,
    slug,
    id
  )
  WHERE approval_status = 'approved' AND is_visible = true;

COMMENT ON INDEX public.idx_stores_discovery_wave_rating IS
  'CUT 4 rating wave. ORDER: rating→reviews→slug/id. Dense same-schedule LIMIT path.';

CREATE INDEX IF NOT EXISTS idx_stores_discovery_wave_reviews
  ON public.stores (
    discovery_schedule_state,
    review_count DESC,
    rating_avg DESC NULLS LAST,
    slug,
    id
  )
  WHERE approval_status = 'approved' AND is_visible = true;

COMMENT ON INDEX public.idx_stores_discovery_wave_reviews IS
  'CUT 4 reviews wave. ORDER: reviews→rating→slug/id. Dense same-schedule LIMIT path.';

-- ---------------------------------------------------------------------------
-- In-range / out-of-range helpers (active policy_version only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.store_discovery_shadow_in_range(
  p_store_id uuid,
  p_policy_version bigint,
  p_origin_lat double precision,
  p_origin_lng double precision,
  p_distance_axis_enabled boolean
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.store_delivery_coverage%ROWTYPE;
  v_origin geography;
BEGIN
  IF p_distance_axis_enabled IS DISTINCT FROM true THEN
    RETURN true;
  END IF;

  SELECT * INTO v_row
  FROM public.store_delivery_coverage c
  WHERE c.store_id = p_store_id AND c.policy_version = p_policy_version;

  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF v_row.distance_applies IS DISTINCT FROM true THEN
    RETURN true;
  END IF;
  IF v_row.covers_all IS TRUE THEN
    RETURN true;
  END IF;
  IF p_origin_lat IS NULL OR p_origin_lng IS NULL
    OR p_origin_lat < -90 OR p_origin_lat > 90
    OR p_origin_lng < -180 OR p_origin_lng > 180
  THEN
    RETURN false;
  END IF;
  IF v_row.coverage_geog IS NULL THEN
    RETURN false;
  END IF;
  v_origin := ST_SetSRID(ST_MakePoint(p_origin_lng, p_origin_lat), 4326)::geography;
  RETURN ST_Covers(v_row.coverage_geog, v_origin);
END;
$$;

REVOKE ALL ON FUNCTION public.store_discovery_shadow_in_range(uuid, bigint, double precision, double precision, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_discovery_shadow_in_range(uuid, bigint, double precision, double precision, boolean)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Single Gi×Dj wave — bounded LIMIT, no full catalog materialization
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_store_discovery_shadow_wave(
  p_eligibility_rank integer,
  p_district_tier integer,
  p_sort text DEFAULT 'default',
  p_limit integer DEFAULT 48,
  p_origin_lat double precision DEFAULT NULL,
  p_origin_lng double precision DEFAULT NULL,
  p_district text DEFAULT NULL,
  p_distance_axis_enabled boolean DEFAULT false,
  p_search_q text DEFAULT NULL,
  p_store_category_id uuid DEFAULT NULL,
  p_store_topic_id uuid DEFAULT NULL,
  p_wants_all_subs boolean DEFAULT true,
  p_orphan_business_types text[] DEFAULT '{}'::text[]
)
RETURNS TABLE (
  store_id uuid,
  slug text,
  district text,
  rating_avg numeric,
  review_count integer,
  delivery_available boolean,
  discovery_schedule_state text,
  completed_orders_30d integer,
  lat double precision,
  lng double precision,
  distance_km double precision,
  out_of_range boolean,
  eligibility_rank integer,
  district_tier integer,
  active_policy_version bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active bigint := public.store_discovery_active_coverage_policy_version();
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 48), 500));
  v_q text := NULLIF(btrim(coalesce(p_search_q, '')), '');
  v_orphans text[] := coalesce(p_orphan_business_types, '{}'::text[]);
  v_sort text := lower(coalesce(NULLIF(btrim(p_sort), ''), 'default'));
  v_gi integer := COALESCE(p_eligibility_rank, 0);
  v_dj integer := COALESCE(p_district_tier, 0);
  v_has_origin boolean := (
    p_distance_axis_enabled IS TRUE
    AND p_origin_lat IS NOT NULL AND p_origin_lng IS NOT NULL
    AND p_origin_lat >= -90 AND p_origin_lat <= 90
    AND p_origin_lng >= -180 AND p_origin_lng <= 180
  );
  v_origin geography;
BEGIN
  -- GUARD: never read building_policy_version for discovery
  IF v_has_origin THEN
    v_origin := ST_SetSRID(ST_MakePoint(p_origin_lng, p_origin_lat), 4326)::geography;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      s.id,
      s.slug::text AS slug,
      s.district::text AS district,
      s.rating_avg,
      coalesce(s.review_count, 0) AS review_count,
      s.delivery_available,
      s.discovery_schedule_state::text AS discovery_schedule_state,
      coalesce(s.completed_orders_30d, 0) AS completed_orders_30d,
      s.lat::double precision AS lat,
      s.lng::double precision AS lng,
      CASE
        WHEN v_has_origin AND s.location_geog IS NOT NULL
        THEN round((ST_Distance(s.location_geog, v_origin) / 1000.0)::numeric, 3)::double precision
        ELSE NULL::double precision
      END AS distance_km,
      CASE
        WHEN v_gi NOT IN (0, 2) THEN false
        WHEN p_distance_axis_enabled IS DISTINCT FROM true THEN false
        ELSE NOT public.store_discovery_shadow_in_range(
          s.id, v_active, p_origin_lat, p_origin_lng, p_distance_axis_enabled
        )
      END AS out_of_range,
      public.store_discovery_district_tier(s.district, p_district) AS district_tier
    FROM public.stores s
    WHERE s.approval_status = 'approved'
      AND s.is_visible = true
      AND (
        -- Gi schedule push-down (avoid coverage work for G3/G4/G5/G1 when possible)
        (v_gi = 0 AND s.discovery_schedule_state = 'ORDERABLE' AND s.delivery_available IS TRUE)
        OR (v_gi = 1 AND s.discovery_schedule_state = 'ORDERABLE' AND s.delivery_available IS DISTINCT FROM TRUE)
        OR (v_gi = 2 AND s.discovery_schedule_state = 'ORDERABLE' AND s.delivery_available IS TRUE)
        OR (v_gi = 3 AND s.discovery_schedule_state = 'IN_BREAK')
        OR (v_gi = 5 AND s.discovery_schedule_state = 'CLOSED')
        OR (
          v_gi = 4
          AND (
            s.discovery_schedule_state IS NULL
            OR s.discovery_schedule_state IN ('PREPARING', 'UNKNOWN')
          )
        )
      )
      AND (
        v_q IS NULL OR length(v_q) < 2
        OR s.store_name ILIKE '%' || v_q || '%'
        OR s.slug ILIKE '%' || v_q || '%'
      )
      AND (
        p_store_category_id IS NULL
        OR (
          (
            s.store_category_id = p_store_category_id
            AND (
              p_wants_all_subs IS TRUE
              OR p_store_topic_id IS NULL
              OR s.store_topic_id = p_store_topic_id
            )
          )
          OR (
            p_wants_all_subs IS NOT TRUE
            AND p_store_topic_id IS NOT NULL
            AND s.store_category_id = p_store_category_id
            AND s.store_topic_id IS NULL
            AND cardinality(v_orphans) > 0
            AND s.business_type = ANY (v_orphans)
          )
          OR (
            s.store_category_id IS NULL
            AND cardinality(v_orphans) > 0
            AND s.business_type = ANY (v_orphans)
          )
        )
      )
  ),
  gated AS (
    SELECT
      b.*,
      CASE
        WHEN b.discovery_schedule_state = 'ORDERABLE'
          AND b.delivery_available IS TRUE
          AND b.out_of_range IS NOT TRUE THEN 0
        WHEN b.discovery_schedule_state = 'ORDERABLE'
          AND b.delivery_available IS DISTINCT FROM TRUE THEN 1
        WHEN b.discovery_schedule_state = 'ORDERABLE'
          AND b.delivery_available IS TRUE
          AND b.out_of_range IS TRUE THEN 2
        WHEN b.discovery_schedule_state = 'IN_BREAK' THEN 3
        WHEN b.discovery_schedule_state = 'CLOSED' THEN 5
        ELSE 4
      END AS eligibility_rank
    FROM base b
  )
  SELECT
    g.id,
    g.slug,
    g.district,
    g.rating_avg,
    g.review_count,
    g.delivery_available,
    g.discovery_schedule_state,
    g.completed_orders_30d,
    g.lat,
    g.lng,
    g.distance_km,
    g.out_of_range,
    g.eligibility_rank,
    g.district_tier,
    v_active
  FROM gated g
  WHERE g.eligibility_rank = v_gi
    AND (
      -- Dj filter only for default/home recommended order
      v_sort NOT IN ('default', 'home')
      OR g.district_tier = v_dj
    )
  ORDER BY
    CASE WHEN v_sort IN ('distance', 'default', 'home') AND v_has_origin THEN g.distance_km END ASC NULLS LAST,
    CASE WHEN v_sort IN ('popular', 'default', 'home') THEN g.completed_orders_30d END DESC,
    CASE WHEN v_sort = 'rating' THEN g.rating_avg END DESC NULLS LAST,
    CASE WHEN v_sort = 'rating' THEN g.review_count END DESC,
    CASE WHEN v_sort = 'reviews' THEN g.review_count END DESC,
    CASE WHEN v_sort = 'reviews' THEN g.rating_avg END DESC NULLS LAST,
    CASE WHEN v_sort IN ('popular', 'default', 'home') THEN g.rating_avg END DESC NULLS LAST,
    CASE WHEN v_sort IN ('popular', 'default', 'home') THEN g.review_count END DESC,
    g.slug ASC,
    g.id ASC
  LIMIT v_limit;
END;
$$;

COMMENT ON FUNCTION public.get_store_discovery_shadow_wave(
  integer, integer, text, integer, double precision, double precision, text, boolean, text, uuid, uuid, boolean, text[]
) IS
  'CUT 4 bounded Gi×Dj wave. INDEX PATH: schedule/delivery + sort indexes; coverage gist for G0/G2. LIMIT=remaining only. No store_orders. No full catalog sort.';

REVOKE ALL ON FUNCTION public.get_store_discovery_shadow_wave(
  integer, integer, text, integer, double precision, double precision, text, boolean, text, uuid, uuid, boolean, text[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_store_discovery_shadow_wave(
  integer, integer, text, integer, double precision, double precision, text, boolean, text, uuid, uuid, boolean, text[]
) TO service_role;

-- Soft-deprecate bulk shadow RPCs (kept for rollback; wave is CUT 4 authority)
COMMENT ON FUNCTION public.get_store_discovery_home_shadow(double precision, double precision, text, text, boolean, integer) IS
  'CUT 3 bulk shadow — SUPERSEDED by get_store_discovery_shadow_wave (CUT 4). Do not use for new paths.';

COMMENT ON FUNCTION public.get_store_discovery_browse_shadow(double precision, double precision, text, boolean, uuid, uuid, boolean, text[], text, integer) IS
  'CUT 3 bulk shadow — SUPERSEDED by get_store_discovery_shadow_wave (CUT 4). Do not use for new paths.';

COMMIT;
