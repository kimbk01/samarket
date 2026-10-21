-- 3단계 3-A LOC-006 (문서 G-2 §3-A, 2026-10-21) — V2 배달 지역 교체를 한 트랜잭션으로 (원자 + 동시 저장 409)
-- 근거(운영 ckdosyydvgzqwpbwuhon 읽기 전용 조회 2026-10-21 PHT):
--   * 현행 TS lib/delivery/service-area/store-delivery-service-areas.ts replaceStoreDeliveryServiceAreas 가
--     DELETE -> INSERT -> stores UPDATE 를 서로 다른 요청으로 실행 (INSERT 실패 시 지역 0행 = V2 매장 전면 주문 불가).
--   * public.store_delivery_service_areas: (id uuid pk, store_id uuid fk stores ON DELETE CASCADE, geo_identity text,
--     area_type text CHECK = 'city_municipality', display_name_snapshot text, source text CHECK IN (owner, admin,
--     migration_proposal), is_store_home bool, created_at, updated_at timestamptz default now()), UNIQUE (store_id, geo_identity),
--     RLS ON, 트리거 없음. 운영 8행 (D-5: 변경 0).
--   * stores.delivery_service_area_authority text NOT NULL default 'legacy_radius' CHECK IN (legacy_radius, v2_lgu).
--   * 함수 replace_store_delivery_service_areas 운영에 없음 (신규, base md5 없음).
-- 계약:
--   * stores 행 FOR UPDATE 잠금 -> 버전 확인 -> DELETE/INSERT/authority 를 같은 TX 에서. 중간 실패 = 전체 롤백(기존 행 유지).
--   * 버전 = 해당 매장 store_delivery_service_areas.updated_at 의 max (행 없음 = NULL). 편집기가 불러온 버전과 다르면
--     {ok:false, error:'service_areas_version_conflict', current_version} (라우트가 409 로 매핑). p_check_version=false 면 생략.
--     stores.updated_at 은 다른 매장 정보 저장에도 바뀌므로 지역 버전으로 쓰지 않는다.
--   * 같은 TX 의 모든 행 updated_at/created_at = clock_timestamp() 한 값 -> 반환 version 으로 다음 저장의 기대값이 된다.
--   * LGU id 카탈로그 검증(unknown_lgu)·감사 로그는 서버 TS 가 RPC 호출 전/후에 한다 (카탈로그는 TS 정적 데이터).
--   * SECURITY DEFINER, EXECUTE 는 service_role 만.
-- 함수 본문 ASCII 전용. DROP 없음. 데이터 변경 0 (함수 생성만).
-- 기대 md5(prosrc) replace_store_delivery_service_areas = 격리 DB run.sh 출력 참조 (보고서 기재).
-- 롤백: REVOKE EXECUTE ON FUNCTION public.replace_store_delivery_service_areas(uuid, text[], text[], text, boolean, text,
--   timestamptz, boolean) FROM service_role;  (웹은 이전 커밋으로 되돌리면 기존 3단계 TS 경로로 동작)

CREATE OR REPLACE FUNCTION public.replace_store_delivery_service_areas(
  p_store_id uuid,
  p_ids text[],
  p_display_names text[],
  p_home_id text,
  p_activate boolean,
  p_source text,
  p_expected_version timestamptz,
  p_check_version boolean
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_authority text;
  v_current timestamptz;
  v_now timestamptz := clock_timestamp();
  v_count integer := 0;
  v_ids text[] := coalesce(p_ids, ARRAY[]::text[]);
  v_names text[] := coalesce(p_display_names, ARRAY[]::text[]);
  v_home text := nullif(btrim(coalesce(p_home_id, '')), '');
BEGIN
  IF p_store_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_store_id');
  END IF;
  IF p_source IS NULL OR p_source NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_source');
  END IF;
  IF coalesce(array_length(v_ids, 1), 0) <> coalesce(array_length(v_names, 1), 0) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'display_names_length_mismatch');
  END IF;

  SELECT s.delivery_service_area_authority INTO v_authority
  FROM public.stores s
  WHERE s.id = p_store_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_not_found');
  END IF;

  SELECT max(a.updated_at) INTO v_current
  FROM public.store_delivery_service_areas a
  WHERE a.store_id = p_store_id;

  IF coalesce(p_check_version, false) AND v_current IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'service_areas_version_conflict',
      'current_version', v_current
    );
  END IF;

  DELETE FROM public.store_delivery_service_areas WHERE store_id = p_store_id;

  INSERT INTO public.store_delivery_service_areas (
    store_id, geo_identity, area_type, display_name_snapshot, source, is_store_home, created_at, updated_at
  )
  SELECT DISTINCT ON (x.gid)
    p_store_id,
    x.gid,
    'city_municipality',
    coalesce(nullif(btrim(coalesce(x.dn, '')), ''), x.gid),
    p_source,
    (v_home IS NOT NULL AND x.gid = v_home),
    v_now,
    v_now
  FROM (
    SELECT btrim(coalesce(u.gid, '')) AS gid, u.dn, u.ord
    FROM unnest(v_ids, v_names) WITH ORDINALITY AS u(gid, dn, ord)
  ) x
  WHERE x.gid <> ''
  ORDER BY x.gid, x.ord;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF coalesce(p_activate, false) THEN
    UPDATE public.stores
    SET delivery_service_area_authority = 'v2_lgu'
    WHERE id = p_store_id
      AND delivery_service_area_authority IS DISTINCT FROM 'v2_lgu';
    v_authority := 'v2_lgu';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'authority', v_authority,
    'version', CASE WHEN v_count > 0 THEN v_now ELSE NULL END,
    'count', v_count,
    'previous_version', v_current
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.replace_store_delivery_service_areas(uuid, text[], text[], text, boolean, text, timestamptz, boolean) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.replace_store_delivery_service_areas(uuid, text[], text[], text, boolean, text, timestamptz, boolean) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.replace_store_delivery_service_areas(uuid, text[], text[], text, boolean, text, timestamptz, boolean) FROM authenticated;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.replace_store_delivery_service_areas(uuid, text[], text[], text, boolean, text, timestamptz, boolean) TO service_role;
