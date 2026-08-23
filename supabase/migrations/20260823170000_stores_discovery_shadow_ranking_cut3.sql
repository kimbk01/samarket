-- CUT 3 — Scalable discovery shadow ranking RPCs (SHADOW ONLY).
-- NO user-visible cutover. NO live store_orders aggregate. Active coverage version only.
-- Application TS applies existing exposure + comparator for product parity.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) District tier — parity with districtRank (lower/trim + bidirectional contains)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.store_discovery_district_tier(
  p_store_district text,
  p_filter_district text
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_filter_district IS NULL OR btrim(p_filter_district) = '' THEN 0
    WHEN lower(btrim(coalesce(p_store_district, ''))) = '' THEN 2
    WHEN lower(btrim(p_store_district)) = lower(btrim(p_filter_district)) THEN 0
    WHEN position(lower(btrim(p_filter_district)) in lower(btrim(p_store_district))) > 0
      OR position(lower(btrim(p_store_district)) in lower(btrim(p_filter_district))) > 0 THEN 1
    ELSE 2
  END;
$$;

COMMENT ON FUNCTION public.store_discovery_district_tier(text, text) IS
  'CUT 3 district tier D0/D1/D2 — must match lib/geo/haversine-km districtRank.';

REVOKE ALL ON FUNCTION public.store_discovery_district_tier(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_discovery_district_tier(text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 2) Active policy version reader (building version never used for shadow reads)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.store_discovery_active_coverage_policy_version()
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active bigint;
BEGIN
  SELECT s.active_policy_version
  INTO v_active
  FROM public.delivery_coverage_policy_state s
  WHERE s.id = 1;

  IF v_active IS NULL OR v_active < 1 THEN
    RETURN 1;
  END IF;
  RETURN v_active;
END;
$$;

REVOKE ALL ON FUNCTION public.store_discovery_active_coverage_policy_version() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_discovery_active_coverage_policy_version() TO service_role;

-- ---------------------------------------------------------------------------
-- 3) Coverage membership vs origin (active policy_version only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.store_discovery_coverage_origin_covered(
  p_store_id uuid,
  p_policy_version bigint,
  p_origin_lat double precision,
  p_origin_lng double precision
)
RETURNS TABLE (
  distance_applies boolean,
  covers_all boolean,
  has_coverage_geog boolean,
  origin_covered boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.store_delivery_coverage%ROWTYPE;
  v_origin geography;
BEGIN
  SELECT *
  INTO v_row
  FROM public.store_delivery_coverage c
  WHERE c.store_id = p_store_id
    AND c.policy_version = p_policy_version;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false, false, false;
    RETURN;
  END IF;

  IF v_row.distance_applies IS DISTINCT FROM true THEN
    RETURN QUERY SELECT false, coalesce(v_row.covers_all, false), false, false;
    RETURN;
  END IF;

  IF v_row.covers_all IS TRUE THEN
    RETURN QUERY SELECT true, true, false, true;
    RETURN;
  END IF;

  IF p_origin_lat IS NULL OR p_origin_lng IS NULL
    OR p_origin_lat < -90 OR p_origin_lat > 90
    OR p_origin_lng < -180 OR p_origin_lng > 180
  THEN
    RETURN QUERY SELECT true, false, (v_row.coverage_geog IS NOT NULL), false;
    RETURN;
  END IF;

  IF v_row.coverage_geog IS NULL THEN
    RETURN QUERY SELECT true, false, false, false;
    RETURN;
  END IF;

  v_origin := ST_SetSRID(ST_MakePoint(p_origin_lng, p_origin_lat), 4326)::geography;
  RETURN QUERY SELECT
    true,
    false,
    true,
    ST_Covers(v_row.coverage_geog, v_origin);
END;
$$;

REVOKE ALL ON FUNCTION public.store_discovery_coverage_origin_covered(uuid, bigint, double precision, double precision)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_discovery_coverage_origin_covered(uuid, bigint, double precision, double precision)
  TO service_role;

COMMENT ON FUNCTION public.store_discovery_coverage_origin_covered(uuid, bigint, double precision, double precision) IS
  'CUT 3 coverage membership — ST_Covers on active policy_version only. INDEX PATH: gist(coverage_geog).';

-- ---------------------------------------------------------------------------
-- 4) HOME shadow candidate rows (projection read; TS sorts + exposure)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_store_discovery_home_shadow(
  p_origin_lat double precision DEFAULT NULL,
  p_origin_lng double precision DEFAULT NULL,
  p_district text DEFAULT NULL,
  p_search_q text DEFAULT NULL,
  p_distance_axis_enabled boolean DEFAULT false,
  p_limit integer DEFAULT 500
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
  distance_applies boolean,
  covers_all boolean,
  has_coverage_geog boolean,
  origin_covered boolean,
  active_policy_version bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active bigint := public.store_discovery_active_coverage_policy_version();
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 500), 2000));
  v_q text := NULLIF(btrim(coalesce(p_search_q, '')), '');
BEGIN
  -- GUARD: never read building_policy_version rows for discovery
  RETURN QUERY
  SELECT
    s.id,
    s.slug::text,
    s.district::text,
    s.rating_avg,
    coalesce(s.review_count, 0),
    s.delivery_available,
    s.discovery_schedule_state::text,
    coalesce(s.completed_orders_30d, 0),
    s.lat::double precision,
    s.lng::double precision,
    coalesce(cov.distance_applies, false),
    coalesce(cov.covers_all, false),
    coalesce(cov.has_coverage_geog, false),
    coalesce(cov.origin_covered, false),
    v_active
  FROM public.stores s
  LEFT JOIN LATERAL public.store_discovery_coverage_origin_covered(
    s.id,
    v_active,
    CASE WHEN p_distance_axis_enabled THEN p_origin_lat ELSE NULL END,
    CASE WHEN p_distance_axis_enabled THEN p_origin_lng ELSE NULL END
  ) cov ON true
  WHERE s.approval_status = 'approved'
    AND s.is_visible = true
    AND (
      v_q IS NULL
      OR length(v_q) < 2
      OR s.store_name ILIKE '%' || v_q || '%'
      OR s.slug ILIKE '%' || v_q || '%'
    )
  ORDER BY s.id ASC
  LIMIT v_limit;
END;
$$;

COMMENT ON FUNCTION public.get_store_discovery_home_shadow(double precision, double precision, text, text, boolean, integer) IS
  'CUT 3 HOME shadow candidates — projection + active coverage only. TS applies recommended sort + exposure. No store_orders scan. INDEX PATH: stores(approval,visible,id); coverage gist; search ILIKE when q present.';

REVOKE ALL ON FUNCTION public.get_store_discovery_home_shadow(double precision, double precision, text, text, boolean, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_store_discovery_home_shadow(double precision, double precision, text, text, boolean, integer)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 5) BROWSE shadow candidate rows (taxonomy-scoped; TS sorts + page + exposure)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_store_discovery_browse_shadow(
  p_origin_lat double precision DEFAULT NULL,
  p_origin_lng double precision DEFAULT NULL,
  p_district text DEFAULT NULL,
  p_distance_axis_enabled boolean DEFAULT false,
  p_store_category_id uuid DEFAULT NULL,
  p_store_topic_id uuid DEFAULT NULL,
  p_wants_all_subs boolean DEFAULT true,
  p_orphan_business_types text[] DEFAULT '{}'::text[],
  p_sort text DEFAULT 'default',
  p_max_candidates integer DEFAULT 5000
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
  distance_applies boolean,
  covers_all boolean,
  has_coverage_geog boolean,
  origin_covered boolean,
  active_policy_version bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active bigint := public.store_discovery_active_coverage_policy_version();
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_max_candidates, 5000), 5000));
  v_orphans text[] := coalesce(p_orphan_business_types, '{}'::text[]);
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.slug::text,
    s.district::text,
    s.rating_avg,
    coalesce(s.review_count, 0),
    s.delivery_available,
    s.discovery_schedule_state::text,
    coalesce(s.completed_orders_30d, 0),
    s.lat::double precision,
    s.lng::double precision,
    coalesce(cov.distance_applies, false),
    coalesce(cov.covers_all, false),
    coalesce(cov.has_coverage_geog, false),
    coalesce(cov.origin_covered, false),
    v_active
  FROM public.stores s
  LEFT JOIN LATERAL public.store_discovery_coverage_origin_covered(
    s.id,
    v_active,
    CASE WHEN p_distance_axis_enabled THEN p_origin_lat ELSE NULL END,
    CASE WHEN p_distance_axis_enabled THEN p_origin_lng ELSE NULL END
  ) cov ON true
  WHERE s.approval_status = 'approved'
    AND s.is_visible = true
    AND (
      p_store_category_id IS NULL
      OR (
        -- linked category (+ optional topic)
        (
          s.store_category_id = p_store_category_id
          AND (
            p_wants_all_subs IS TRUE
            OR p_store_topic_id IS NULL
            OR s.store_topic_id = p_store_topic_id
          )
        )
        OR (
          -- orphan business_type under category with null topic
          p_wants_all_subs IS NOT TRUE
          AND p_store_topic_id IS NOT NULL
          AND s.store_category_id = p_store_category_id
          AND s.store_topic_id IS NULL
          AND cardinality(v_orphans) > 0
          AND s.business_type = ANY (v_orphans)
        )
        OR (
          -- null category orphan business_type
          s.store_category_id IS NULL
          AND cardinality(v_orphans) > 0
          AND s.business_type = ANY (v_orphans)
        )
      )
    )
  ORDER BY s.id ASC
  LIMIT v_limit;
END;
$$;

COMMENT ON FUNCTION public.get_store_discovery_browse_shadow(double precision, double precision, text, boolean, uuid, uuid, boolean, text[], text, integer) IS
  'CUT 3 BROWSE shadow candidates — taxonomy-scoped projection read. TS applies sort modes + exposure + page window. No store_orders. INDEX PATH: stores taxonomy + approval/visible; coverage gist. p_sort documented for callers; ordering finalized in TS for comparator parity.';

REVOKE ALL ON FUNCTION public.get_store_discovery_browse_shadow(double precision, double precision, text, boolean, uuid, uuid, boolean, text[], text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_store_discovery_browse_shadow(double precision, double precision, text, boolean, uuid, uuid, boolean, text[], text, integer)
  TO service_role;

-- Re-assert projection table lockdown (CUT 1/2)
REVOKE ALL ON TABLE public.store_delivery_coverage FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.delivery_coverage_policy_state FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.store_order_daily_stats FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.store_order_popularity_ledger FROM PUBLIC, anon, authenticated;

COMMIT;
