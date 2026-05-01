-- =============================================================================
-- Security Advisor 2차: Function Search Path Mutable (후보만, 조건부 ALTER)
-- - RLS / DROP / CREATE OR REPLACE / 트리거 변경 없음
-- - guard_profiles_self_update, is_platform_admin 등 auth·프로필 권한 함수 제외
-- 실행: ① Discovery SELECT → ② 아래 DO 블록들 순서 실행 (SQL Editor)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) 존재 확인 — 실행 후 "있는 함수 / 인자" 확인
-- -----------------------------------------------------------------------------
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS identity_args,
  p.oid::regprocedure AS regprocedure
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'set_updated_at',
    'price_offers_set_updated_at',
    'price_offers_sync_amount_before_write',
    'normalize_ph_phone',
    'log_meeting_member_status_event',
    'log_meeting_notice_event',
    'touch_meeting_room_timestamp'
  )
ORDER BY p.proname, identity_args;

-- -----------------------------------------------------------------------------
-- 2) ALTER — 존재할 때만 (DO $$). 인자 없는 트리거형: identity = ''
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'price_offers_set_updated_at'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    ALTER FUNCTION public.price_offers_set_updated_at() SET search_path = public, pg_temp;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'price_offers_sync_amount_before_write'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    ALTER FUNCTION public.price_offers_sync_amount_before_write() SET search_path = public, pg_temp;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'log_meeting_member_status_event'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    ALTER FUNCTION public.log_meeting_member_status_event() SET search_path = public, pg_temp;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'log_meeting_notice_event'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    ALTER FUNCTION public.log_meeting_notice_event() SET search_path = public, pg_temp;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'touch_meeting_room_timestamp'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    ALTER FUNCTION public.touch_meeting_room_timestamp() SET search_path = public, pg_temp;
  END IF;
END $$;

-- 레포에 정의 없음·시그니처 가변 가능 → public 내 동일 이름의 모든 오버로드에만 적용
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS rp
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'set_updated_at'
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.rp);
  END LOOP;
END $$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS rp
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'normalize_ph_phone'
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.rp);
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 3) 적용 확인 — proconfig 에 search_path= 가 보이면 설정 반영됨
-- -----------------------------------------------------------------------------
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS identity_args,
  p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'set_updated_at',
    'price_offers_set_updated_at',
    'price_offers_sync_amount_before_write',
    'normalize_ph_phone',
    'log_meeting_member_status_event',
    'log_meeting_notice_event',
    'touch_meeting_room_timestamp'
  )
ORDER BY p.proname, identity_args;
