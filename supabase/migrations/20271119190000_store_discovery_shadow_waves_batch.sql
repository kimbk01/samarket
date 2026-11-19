-- 매장 홈 피드 매장 탐색 — Gi×Dj 단계(wave) 여러 개를 DB 함수 1번으로 (2026-11-19 재적용 설계).
-- 근거: 운영 실측 home-feed 1요청당 get_store_discovery_shadow_wave 5.7회(11-19 00시 PHT 20요청·114회).
-- 원 설계 B1(#474, 운영 DB 미적용으로 되돌림 #480) 과 같은 함수 — 기존 단계 함수를 안에서 그대로 부른다(순위 동일).
-- 이번 순서: 운영 DB 적용(승인) → 결과 동일 확인 → 코드 전환(함수 없으면 기존 단건 호출로 동작).


BEGIN;

CREATE OR REPLACE FUNCTION public.get_store_discovery_shadow_waves_batch(
  p_eligibility_ranks integer[],
  p_district_tiers integer[],
  p_limits integer[],
  p_sort text DEFAULT 'default',
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
  wave_ord integer,
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
  v_n integer := GREATEST(
    COALESCE(array_length(p_eligibility_ranks, 1), 0),
    0
  );
  v_i integer;
  v_gi integer;
  v_dj integer;
  v_lim integer;
BEGIN
  IF v_n = 0 THEN
    RETURN;
  END IF;
  IF array_length(p_district_tiers, 1) IS DISTINCT FROM v_n
     OR array_length(p_limits, 1) IS DISTINCT FROM v_n THEN
    RAISE EXCEPTION 'get_store_discovery_shadow_waves_batch: array length mismatch';
  END IF;
  -- Cap batch size — HOME two-round uses at most 6 Gi × 3 Dj = 18
  IF v_n > 24 THEN
    RAISE EXCEPTION 'get_store_discovery_shadow_waves_batch: too many waves';
  END IF;

  FOR v_i IN 1..v_n LOOP
    v_gi := COALESCE(p_eligibility_ranks[v_i], 0);
    v_dj := COALESCE(p_district_tiers[v_i], 0);
    v_lim := COALESCE(p_limits[v_i], 48);
    RETURN QUERY
    SELECT
      (v_i - 1)::integer AS wave_ord,
      w.id,
      w.slug,
      w.district,
      w.rating_avg,
      w.review_count,
      w.delivery_available,
      w.discovery_schedule_state,
      w.completed_orders_30d,
      w.lat,
      w.lng,
      w.distance_km,
      w.out_of_range,
      w.eligibility_rank,
      w.district_tier,
      w.policy_version
    FROM public.get_store_discovery_shadow_wave(
      v_gi,
      v_dj,
      p_sort,
      v_lim,
      p_origin_lat,
      p_origin_lng,
      p_district,
      p_distance_axis_enabled,
      p_search_q,
      p_store_category_id,
      p_store_topic_id,
      p_wants_all_subs,
      p_orphan_business_types
    ) AS w;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.get_store_discovery_shadow_waves_batch(
  integer[], integer[], integer[], text, double precision, double precision, text, boolean, text, uuid, uuid, boolean, text[]
) IS
  'B1 batch of get_store_discovery_shadow_wave — one HTTP round-trip for multiple Gi×Dj waves. wave_ord 0-based.';

REVOKE ALL ON FUNCTION public.get_store_discovery_shadow_waves_batch(
  integer[], integer[], integer[], text, double precision, double precision, text, boolean, text, uuid, uuid, boolean, text[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_store_discovery_shadow_waves_batch(
  integer[], integer[], integer[], text, double precision, double precision, text, boolean, text, uuid, uuid, boolean, text[]
) TO service_role;

COMMIT;
