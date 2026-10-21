-- 3-B OPS-03 — 실효 영업 판정 SQL 쌍둥이에 요일별 영업시간·휴무일(임시휴무) 반영.
--
-- 의존: 20270604110000_store_front_commerce_open_sql_twin.sql (OPS-08, commit e649c0bb) 가 먼저 적용되어야 한다
--   (public.store_front_hhmm_to_minutes 사용, store_front_commerce_open 을 이 파일이 CREATE OR REPLACE).
--   주문 RPC(create_store_order_atomic)는 이 함수만 호출하므로 RPC 재정의 불필요.
--
-- TS 단일 정의: lib/stores/store-weekly-hours.ts (evaluateStoreSchedule) + lib/stores/store-auto-hours.ts
--   (readAutoBusinessHoursConfig / resolveStoreFrontCommerceState). 규칙:
--   * 적용 조건은 기존과 같다: auto_business_hours.enabled = true AND schedule_enforced = true AND 유효 open/close.
--   * weekly: { sun|mon|tue|wed|thu|fri|sat: [{open,close}, ...] | null } — 객체이고 7개 키 중 하나라도 있으면 사용.
--       키 없음 = 기본 open/close · null / 배열 아님 / 유효 구간 없음 = 그 요일 휴무.
--       구간: open/close 문자열 정규화 성공 AND open <> close 인 것만, 배열 순서대로 최대 3개.
--   * closed_dates: 배열의 문자열 원소 중 trim 후 YYYY-MM-DD 이고 실제 달력 날짜인 것 (중복 제거, 최근 120개).
--       연도 0000-0099 는 TS(Date.UTC 1900 보정)와 같이 무효.
--       해당 영업일(매장 시간대 날짜)은 구간 없음.
--   * 판정: 오늘 구간(open<close: open<=now<close · 자정 넘김: now>=open) 또는
--           전날 구간 중 자정 넘김(open>close) 의 꼬리(now<close). 전날이 휴무(요일·날짜)면 꼬리 없음.
--   * weekly·closed_dates 가 없으면 기존 단일 구간 공식과 결과 동일 (OPS-08 fixture 48건 그대로 PASS).
--   * 휴게·수동 마감·coerce·시간대 규칙은 e649c0bb 본문 그대로.
-- 고정 fixture: supabase/tests/isolated/stage3-3b/commerce-open-weekly-fixtures.json (39건)
--   + OPS-08 의 supabase/tests/isolated/stage3-rpc/commerce-open-fixtures.json (48건, 회귀) — 격리 DB stage3-3b/run.sh.
--
-- base md5(prosrc) store_front_commerce_open (e649c0bb, 미적용 신규 함수) = 0a0b29cb72251fa8fdaf4041d2c52a87
-- expected new md5(prosrc):
--   store_front_commerce_open      = a085d58b5f917f5ea656b00c0e3407bb
--   store_front_day_intervals      = 92d2c31e5eeb76c37321c89791262cd5   (신규 helper)
-- 함수 본문 ASCII 만 (U+2013 / U+301C 는 e649c0bb 와 같이 chr() 사용).
-- DROP 없음. Rollback: 20270604110000 의 store_front_commerce_open 본문으로 CREATE OR REPLACE 재실행
--   (helper store_front_day_intervals 는 호출자가 없어지면 남겨 둬도 무해).
-- 배포 순서: 20270604110000 -> 20270604110100 -> 이 파일. 웹(OPS-03 TS) 과 같은 배포 창에 적용한다
--   (웹만 먼저 나가면 요일 휴무 매장에 TS 는 막고 RPC 는 통과시키는 ms 창 — 기존 OPS-08 잔여 위험과 같은 성격).

CREATE OR REPLACE FUNCTION public.store_front_day_intervals(
  p_auto jsonb,
  p_closed text[],
  p_ymd text,
  p_dow integer,
  p_default_open integer,
  p_default_close integer
)
 RETURNS TABLE(open_m integer, close_m integer)
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path = public
AS $fn$
DECLARE
  v_weekly jsonb;
  v_key text;
  v_day jsonb;
  v_item jsonb;
  v_o integer;
  v_c integer;
  v_n integer := 0;
  v_has_weekly boolean := false;
BEGIN
  IF p_closed IS NOT NULL AND p_ymd = ANY (p_closed) THEN
    RETURN;
  END IF;

  v_key := (ARRAY['sun','mon','tue','wed','thu','fri','sat'])[((p_dow % 7) + 7) % 7 + 1];
  v_weekly := p_auto->'weekly';
  IF v_weekly IS NOT NULL AND jsonb_typeof(v_weekly) = 'object' THEN
    v_has_weekly := (v_weekly ?| ARRAY['sun','mon','tue','wed','thu','fri','sat']);
  END IF;

  IF NOT v_has_weekly OR NOT (v_weekly ? v_key) THEN
    open_m := p_default_open;
    close_m := p_default_close;
    RETURN NEXT;
    RETURN;
  END IF;

  v_day := v_weekly->v_key;
  IF v_day IS NULL OR jsonb_typeof(v_day) <> 'array' THEN
    RETURN;
  END IF;

  FOR v_item IN SELECT e FROM jsonb_array_elements(v_day) WITH ORDINALITY AS t(e, i) ORDER BY i LOOP
    EXIT WHEN v_n >= 3;
    CONTINUE WHEN jsonb_typeof(v_item) <> 'object';
    v_o := CASE WHEN jsonb_typeof(v_item->'open') = 'string'
                THEN public.store_front_hhmm_to_minutes(v_item->>'open') END;
    v_c := CASE WHEN jsonb_typeof(v_item->'close') = 'string'
                THEN public.store_front_hhmm_to_minutes(v_item->>'close') END;
    CONTINUE WHEN v_o IS NULL OR v_c IS NULL OR v_o = v_c;
    open_m := v_o;
    close_m := v_c;
    v_n := v_n + 1;
    RETURN NEXT;
  END LOOP;
  RETURN;
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
  v_local timestamp;
  v_ymd text;
  v_prev_ymd text;
  v_dow integer;
  v_closed text[];
  v_iv record;
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
    v_local := coalesce(p_now, now()) AT TIME ZONE v_tz;
    v_now_m := extract(hour FROM v_local)::integer * 60 + extract(minute FROM v_local)::integer;
  EXCEPTION WHEN others THEN
    v_local := NULL;
    v_now_m := NULL;
  END;

  -- readAutoBusinessHoursConfig + evaluateStoreSchedule (OPS-03 weekly / closed_dates)
  IF v_a IS NOT NULL AND jsonb_typeof(v_a) = 'object'
     AND (v_a->'enabled') = 'true'::jsonb
     AND (v_a->'schedule_enforced') = 'true'::jsonb THEN
    v_open_m := CASE WHEN jsonb_typeof(v_a->'open') = 'string'
                     THEN public.store_front_hhmm_to_minutes(v_a->>'open') END;
    v_close_m := CASE WHEN jsonb_typeof(v_a->'close') = 'string'
                      THEN public.store_front_hhmm_to_minutes(v_a->>'close') END;
    IF v_open_m IS NOT NULL AND v_close_m IS NOT NULL AND v_open_m <> v_close_m THEN
      v_within := false;
      IF v_now_m IS NOT NULL THEN
        IF jsonb_typeof(v_a->'closed_dates') = 'array' THEN
          SELECT array_agg(d ORDER BY d) INTO v_closed FROM (
            SELECT DISTINCT d FROM (
              SELECT regexp_replace(e #>> '{}', '^[[:space:]]+|[[:space:]]+$', '', 'g') AS d
              FROM jsonb_array_elements(v_a->'closed_dates') AS x(e)
              WHERE jsonb_typeof(e) = 'string'
            ) s
            WHERE CASE
              WHEN d !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN false
              WHEN substr(d, 1, 4)::integer < 100 OR substr(d, 6, 2)::integer NOT BETWEEN 1 AND 12 THEN false
              ELSE substr(d, 9, 2)::integer BETWEEN 1 AND extract(day FROM (
                     make_date(substr(d, 1, 4)::integer, substr(d, 6, 2)::integer, 1)
                     + interval '1 month' - interval '1 day'))::integer
            END
            ORDER BY d DESC
            LIMIT 120
          ) k;
        END IF;
        v_ymd := to_char(v_local, 'YYYY-MM-DD');
        v_prev_ymd := to_char(v_local - interval '1 day', 'YYYY-MM-DD');
        v_dow := extract(dow FROM v_local)::integer;
        FOR v_iv IN SELECT * FROM public.store_front_day_intervals(v_a, v_closed, v_ymd, v_dow, v_open_m, v_close_m) LOOP
          IF (v_iv.open_m < v_iv.close_m AND v_now_m >= v_iv.open_m AND v_now_m < v_iv.close_m)
             OR (v_iv.open_m > v_iv.close_m AND v_now_m >= v_iv.open_m) THEN
            v_within := true;
            EXIT;
          END IF;
        END LOOP;
        IF NOT v_within THEN
          FOR v_iv IN SELECT * FROM public.store_front_day_intervals(v_a, v_closed, v_prev_ymd, v_dow + 6, v_open_m, v_close_m) LOOP
            IF v_iv.open_m > v_iv.close_m AND v_now_m < v_iv.close_m THEN
              v_within := true;
              EXIT;
            END IF;
          END LOOP;
        END IF;
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

REVOKE ALL ON FUNCTION public.store_front_day_intervals(jsonb, text[], text, integer, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.store_front_commerce_open(jsonb, boolean, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_front_day_intervals(jsonb, text[], text, integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.store_front_commerce_open(jsonb, boolean, timestamptz) TO service_role;
