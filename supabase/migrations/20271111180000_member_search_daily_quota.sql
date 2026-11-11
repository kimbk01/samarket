-- 친구 찾기 하루 검색 횟수 — DB 에서 센다 (회원 아이디 v3 후속 F3, Owner 「모두 진행」 2026-11-11)
-- 원인: 운영에 Redis(UPSTASH_*·KV_*) 환경변수가 없어 enforceRateLimit 이 서버 인스턴스 메모리로만 셈 →
--       「회원당 하루 500회」(설계 §3.3)가 인스턴스마다 따로 세어져 지켜지지 않음 (2026-11-11 운영 환경변수 조회).
-- 날짜 경계 = 필리핀 날짜(Asia/Manila). 저장 시각은 UTC 그대로.

BEGIN;

CREATE TABLE IF NOT EXISTS public.member_search_daily_quota (
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  day date NOT NULL,
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);

ALTER TABLE public.member_search_daily_quota ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.member_search_daily_quota FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.member_search_daily_quota TO service_role;

-- 1회 세고 결과를 돌려준다. allowed = 이번 회차가 한도 안인가. 지난 날짜 행은 그 회원 것만 지운다.
CREATE OR REPLACE FUNCTION public.member_search_quota_hit(p_user_id uuid, p_limit integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_day date := (now() AT TIME ZONE 'Asia/Manila')::date;
  v_count integer;
BEGIN
  IF p_user_id IS NULL OR p_limit IS NULL OR p_limit < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_request');
  END IF;

  INSERT INTO public.member_search_daily_quota (user_id, day, count, updated_at)
  VALUES (p_user_id, v_day, 1, now())
  ON CONFLICT (user_id, day) DO UPDATE
    SET count = public.member_search_daily_quota.count + 1,
        updated_at = now()
  RETURNING count INTO v_count;

  DELETE FROM public.member_search_daily_quota WHERE user_id = p_user_id AND day < v_day;

  RETURN jsonb_build_object('ok', true, 'allowed', v_count <= p_limit, 'count', v_count, 'limit', p_limit);
EXCEPTION
  WHEN foreign_key_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_missing');
END;
$function$;

REVOKE ALL ON FUNCTION public.member_search_quota_hit(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_search_quota_hit(uuid, integer) TO service_role;

COMMIT;
