-- 3단계 OPS-08 (G-2 §"주문 RPC 재정의 (OPS-08 + LOC-004)") — 실효 영업 판정 SQL 쌍둥이
--
-- 신규 함수 2개 (운영에 동일 이름 없음 — 2026-10-21 pg_proc 읽기 전용 확인):
--   * public.store_front_hhmm_to_minutes(text) -> integer   IMMUTABLE
--       = lib/stores/store-auto-hours.ts normalizeHHMM + hhmmToMinutes
--         ("9:00" | "09:00" -> 540, 앞뒤 공백 허용, 실패 NULL)
--   * public.store_front_commerce_open(jsonb, boolean, timestamptz) -> boolean   STABLE
--       = resolveStoreFrontCommerceState(businessHoursJson, dbIsOpen, now).isOpenForCommerce
--         (resolveStoreFrontOpen) 와 같은 규칙:
--         1) is_open = false -> false (NULL 은 영업, isStoreDbOpenForCommerce)
--         2) business_hours_json 이 문자열 jsonb 면 JSON 재해석, 객체 아니면 {} (coerceBusinessHoursRecord)
--         3) 자동 영업시간: auto_business_hours.enabled === true AND schedule_enforced === true
--            AND open/close 정규화 성공 AND open <> close 일 때만 적용 (readAutoBusinessHoursConfig).
--            시간대 = auto_business_hours.timezone(trim, 비면 Asia/Manila). 시간대 해석 실패 -> 스케줄 밖(false).
--            open < close: open <= now < close · 자정 넘김: now >= open OR now < close
--         4) 휴게: break_hours {start|open, end|close} (키가 문자열이면 그 값만 사용 · 정규화 실패 -> 레거시로)
--            또는 레거시 break_time / breakTime 문자열 "HH:MM-HH:MM ..." (구분자 - ~ U+2013 U+301C).
--            스케줄 안이고 휴게 구간 안이면 false.
--       같은 고정 fixture 표로 TS(vitest) 와 SQL(격리 DB) 을 검증:
--         supabase/tests/isolated/stage3-rpc/commerce-open-fixtures.json
--         lib/stores/__tests__/store-front-commerce-open-sql-twin-parity.test.ts
--       OPS-03(요일·휴무일 확장) 이 TS 모델을 넓히면 이 함수도 같은 fixture 로 함께 갱신한다
--       (주문 RPC 재정의 불필요 — RPC 는 이 함수만 호출).
--   함수 본문은 ASCII 만 (U+2013 / U+301C 는 chr() 로 만든다).
--   기대 md5(prosrc): store_front_hhmm_to_minutes = ce72c511aa98ca606e134c877a836f59
--                     store_front_commerce_open   = 0a0b29cb72251fa8fdaf4041d2c52a87
--   알려진 차이(실무 영향 없음): 시간대 이름은 PostgreSQL tzdata 로 해석 — Intl 이 거부하지만 PG 가 받는
--   POSIX/약어 문자열은 오너 폼 선택지(STORE_AUTO_TIMEZONE_OPTIONS) 밖이라 저장 경로에서 나오지 않는다.
--
-- 배포 순서: 이 파일 -> 20270604110100 (주문 RPC 가 호출). 웹 의존 없음.
-- 롤백 (운영 승인 후에만): 20270604110100 을 먼저 롤백(주문 RPC 원문 복귀) 한 뒤
--   이 두 함수는 남겨 둬도 무해(호출자 없음). 제거가 필요하면 DROP FUNCTION 2줄(적용 도구 밖에서 수동).
--
-- 격리 DB 검증: supabase/tests/isolated/stage3-rpc/run.sh

CREATE OR REPLACE FUNCTION public.store_front_hhmm_to_minutes(p_raw text)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path = public
AS $fn$
DECLARE
  v_t text;
  v_m text[];
BEGIN
  IF p_raw IS NULL THEN
    RETURN NULL;
  END IF;
  v_t := regexp_replace(p_raw, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_m := regexp_match(v_t, '^([01]?[0-9]|2[0-3]):([0-5][0-9])$');
  IF v_m IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN v_m[1]::integer * 60 + v_m[2]::integer;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.store_front_commerce_open(p_business_hours_json jsonb, p_is_open boolean, p_now timestamptz)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path = public
AS $fn$
DECLARE
  v_h jsonb := p_business_hours_json;
  v_a jsonb;
  v_b jsonb;
  v_tz text := 'Asia/Manila';
  v_tmp text;
  v_now_m integer;
  v_open_m integer;
  v_close_m integer;
  v_within boolean := true;
  v_bs integer;
  v_be integer;
  v_legacy text;
  v_seg text[];
  v_tail text;
BEGIN
  -- isStoreDbOpenForCommerce: only explicit false closes
  IF p_is_open IS FALSE THEN
    RETURN false;
  END IF;

  -- coerceBusinessHoursRecord
  IF v_h IS NOT NULL AND jsonb_typeof(v_h) = 'string' THEN
    BEGIN
      v_tmp := regexp_replace(v_h #>> '{}', '^[[:space:]]+|[[:space:]]+$', '', 'g');
      v_h := CASE WHEN v_tmp = '' THEN NULL ELSE v_tmp::jsonb END;
    EXCEPTION WHEN others THEN
      v_h := NULL;
    END;
  END IF;
  IF v_h IS NULL OR jsonb_typeof(v_h) <> 'object' THEN
    v_h := '{}'::jsonb;
  END IF;

  -- readStoreFrontTimeZone
  v_a := v_h->'auto_business_hours';
  IF v_a IS NOT NULL AND jsonb_typeof(v_a) = 'object'
     AND jsonb_typeof(v_a->'timezone') = 'string' THEN
    v_tmp := regexp_replace(v_a->>'timezone', '^[[:space:]]+|[[:space:]]+$', '', 'g');
    IF v_tmp <> '' THEN
      v_tz := v_tmp;
    END IF;
  END IF;

  BEGIN
    v_now_m := extract(hour FROM (coalesce(p_now, now()) AT TIME ZONE v_tz))::integer * 60
             + extract(minute FROM (coalesce(p_now, now()) AT TIME ZONE v_tz))::integer;
  EXCEPTION WHEN others THEN
    v_now_m := NULL;
  END;

  -- readAutoBusinessHoursConfig + isNowWithinAutoSchedule
  IF v_a IS NOT NULL AND jsonb_typeof(v_a) = 'object'
     AND (v_a->'enabled') = 'true'::jsonb
     AND (v_a->'schedule_enforced') = 'true'::jsonb THEN
    v_open_m := CASE WHEN jsonb_typeof(v_a->'open') = 'string'
                     THEN public.store_front_hhmm_to_minutes(v_a->>'open') END;
    v_close_m := CASE WHEN jsonb_typeof(v_a->'close') = 'string'
                      THEN public.store_front_hhmm_to_minutes(v_a->>'close') END;
    IF v_open_m IS NOT NULL AND v_close_m IS NOT NULL AND v_open_m <> v_close_m THEN
      IF v_now_m IS NULL THEN
        v_within := false;
      ELSIF v_open_m < v_close_m THEN
        v_within := v_now_m >= v_open_m AND v_now_m < v_close_m;
      ELSE
        v_within := v_now_m >= v_open_m OR v_now_m < v_close_m;
      END IF;
    END IF;
  END IF;

  IF NOT v_within THEN
    RETURN false;
  END IF;

  -- readBreakHoursFormFields + readNormalizedBreakInterval
  v_b := v_h->'break_hours';
  IF v_b IS NOT NULL AND jsonb_typeof(v_b) = 'object' THEN
    v_bs := CASE
      WHEN jsonb_typeof(v_b->'start') = 'string' THEN public.store_front_hhmm_to_minutes(v_b->>'start')
      WHEN jsonb_typeof(v_b->'open') = 'string' THEN public.store_front_hhmm_to_minutes(v_b->>'open')
    END;
    v_be := CASE
      WHEN jsonb_typeof(v_b->'end') = 'string' THEN public.store_front_hhmm_to_minutes(v_b->>'end')
      WHEN jsonb_typeof(v_b->'close') = 'string' THEN public.store_front_hhmm_to_minutes(v_b->>'close')
    END;
    IF v_bs IS NULL OR v_be IS NULL OR v_bs = v_be THEN
      v_bs := NULL;
      v_be := NULL;
    END IF;
  END IF;

  IF v_bs IS NULL THEN
    -- legacy String(break_time ?? breakTime ?? "").trim(); "none" text has no separator -> no break
    IF v_h ? 'break_time' AND jsonb_typeof(v_h->'break_time') <> 'null' THEN
      v_legacy := v_h->>'break_time';
    ELSIF v_h ? 'breakTime' AND jsonb_typeof(v_h->'breakTime') <> 'null' THEN
      v_legacy := v_h->>'breakTime';
    END IF;
    v_legacy := regexp_replace(coalesce(v_legacy, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
    IF v_legacy <> '' THEN
      v_seg := regexp_split_to_array(v_legacy, '[~' || chr(8211) || chr(12316) || '-]');
      IF coalesce(array_length(v_seg, 1), 0) >= 2 THEN
        v_tail := (regexp_split_to_array(
          regexp_replace(v_seg[2], '^[[:space:]]+|[[:space:]]+$', '', 'g'), '[[:space:]]+'))[1];
        v_bs := public.store_front_hhmm_to_minutes(v_seg[1]);
        v_be := public.store_front_hhmm_to_minutes(v_tail);
        IF v_bs IS NULL OR v_be IS NULL OR v_bs = v_be THEN
          v_bs := NULL;
          v_be := NULL;
        END IF;
      END IF;
    END IF;
  END IF;

  -- isNowWithinBreakWindow (same timezone as schedule)
  IF v_bs IS NOT NULL AND v_be IS NOT NULL AND v_now_m IS NOT NULL THEN
    IF v_bs < v_be THEN
      IF v_now_m >= v_bs AND v_now_m < v_be THEN
        RETURN false;
      END IF;
    ELSIF v_now_m >= v_bs OR v_now_m < v_be THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$fn$;

REVOKE ALL ON FUNCTION public.store_front_hhmm_to_minutes(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.store_front_commerce_open(jsonb, boolean, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_front_hhmm_to_minutes(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.store_front_commerce_open(jsonb, boolean, timestamptz) TO service_role;
