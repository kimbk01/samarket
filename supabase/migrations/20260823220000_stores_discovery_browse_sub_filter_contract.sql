-- CUT taxonomy SSOT — browse 2차 membership = browseStoreRowMatchesSubFilter.
-- Remove CUT6 blanket (category + store_topic_id IS NULL) OR that leaked null-topic
-- stores into every specific sub. Linked null-topic legacy remains app-side CONTRACT
-- filter after hydrate; wave candidates for specific sub are topic_id match only.
-- App MUST still call applyBrowseSubFilterContractToPrefetchedFilter on NEW path.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_store_discovery_shadow_wave(
  p_eligibility_rank integer,
  p_district_tier integer,
  p_sort text,
  p_limit integer,
  p_origin_lat double precision DEFAULT NULL,
  p_origin_lng double precision DEFAULT NULL,
  p_district text DEFAULT NULL,
  p_distance_axis_enabled boolean DEFAULT false,
  p_search_q text DEFAULT NULL,
  p_store_category_id uuid DEFAULT NULL,
  p_store_topic_id uuid DEFAULT NULL,
  p_wants_all_subs boolean DEFAULT false,
  p_orphan_business_types text[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
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
  policy_version bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, gis, extensions
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
        WHEN v_has_origin
          AND s.location_geog IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.store_delivery_coverage c
            WHERE c.store_id = s.id
              AND c.policy_version = v_active
              AND c.distance_applies IS TRUE
          )
        THEN round((ST_Distance(s.location_geog, v_origin) / 1000.0)::numeric, 3)::double precision
        ELSE NULL::double precision
      END AS distance_km,
      CASE
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
            -- category-null orphan exact business_type (primary aliases only)
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
      -- rating/reviews/popular/distance: no Dj filter
      v_sort NOT IN ('default', 'home')
      -- geo path: OOR before district — do not Dj-filter; ORDER BY district_tier
      OR v_has_origin
      -- no-geo recommended: Dj waves
      OR g.district_tier = v_dj
    )
  ORDER BY
    CASE
      WHEN v_sort IN ('distance', 'default', 'home') AND v_has_origin
      THEN CASE WHEN g.out_of_range IS TRUE THEN 1 ELSE 0 END
    END ASC NULLS FIRST,
    CASE WHEN v_sort IN ('default', 'home') THEN g.district_tier END ASC,
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
  'Wave Gi×Dj + browse sub membership: specific sub requires store_topic_id match (no null-topic blanket). App applies browseStoreRowMatchesSubFilter after hydrate.';

REVOKE ALL ON FUNCTION public.get_store_discovery_shadow_wave(
  integer, integer, text, integer, double precision, double precision, text, boolean, text, uuid, uuid, boolean, text[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_store_discovery_shadow_wave(
  integer, integer, text, integer, double precision, double precision, text, boolean, text, uuid, uuid, boolean, text[]
) TO service_role;

COMMIT;
