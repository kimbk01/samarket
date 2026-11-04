-- D1 (실기 2026-11-04 R3-3) — 영업·배달 설정 같은 화면 재저장 409 `store_changed`.
-- 원인: BEFORE UPDATE 트리거 안의 NEW 에서 생성 열(district_norm · location_geog)은 아직 계산 전이라 NULL,
--       OLD 에는 값이 있어 `to_jsonb(NEW) - 시스템 열` 비교가 늘 달라진다 → 시스템 열만 바꾸는 UPDATE
--       (저장 응답 뒤 백그라운드 `persistDiscoveryScheduleProjectionForStore`·영업 상태 크론 등)도 updated_at 을 올려
--       화면이 가진 revision 이 낡는다.
-- 수정: 비교에서 생성 열 2개를 뺀다. 생성 열은 원본 열(district · lat · lng)이 바뀔 때만 바뀌므로
--       원본 열 비교로 실제 변경은 그대로 잡힌다. 함수 본문 외 변경 없음 (트리거 재생성 없음).
-- 롤백: docs/audit/rollback/20271105120000_stores_updated_at_ignore_generated_cols.rollback.sql

CREATE OR REPLACE FUNCTION public.stores_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_system_cols text[] := ARRAY[
    'updated_at',
    'delivery_policy_version',
    'discovery_schedule_state',
    'next_schedule_transition_at',
    'completed_orders_30d',
    'completed_orders_30d_at',
    'point_balance',
    'point_commerce_blocked',
    'point_block_reason',
    'point_warning_at',
    'rating_avg',
    'review_count',
    -- 생성 열: BEFORE 트리거의 NEW 에서는 NULL (원본 열 비교로 변경을 잡는다)
    'district_norm',
    'location_geog'
  ];
BEGIN
  IF (to_jsonb(NEW) - v_system_cols) = (to_jsonb(OLD) - v_system_cols) THEN
    NEW.updated_at := OLD.updated_at;
  ELSE
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;
