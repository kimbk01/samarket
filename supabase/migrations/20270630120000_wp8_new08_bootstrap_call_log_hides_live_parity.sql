-- WP-8 NEW-08 (LOCK-04): get_cm_bootstrap_full_snapshot.call_logs — 사용자 숨김(call_log_user_hides) 제외.
--
-- 20270414210000 은 20261118140000 기준 전체 본문 교체라, 운영에 이미 적용된
--   20270503120000(차단 is_active 정합)·20270505120000(following_blocked SSOT 정합) 을 되돌린다.
--   그래서 그 파일 본문을 그대로 실행하지 않는다.
-- 적용 방식: 운영 함수 정의(pg_get_functiondef)를 읽어 call_logs CTE 의 WHERE 한 곳에만 숨김 조건을 넣는다.
--   - 적용 전 정의 해시가 20270505120000 적용 후 값(5f437ce2…)과 다르면 아무것도 바꾸지 않고 중단.
--   - 바꿀 문자열은 정확히 1회만 존재해야 한다.
-- 선행: 20270414200000(community_messenger_call_log_user_hides 테이블).
-- 데이터 변경 없음(함수 정의만). ACL 은 CREATE OR REPLACE 로 유지된다.
-- 롤백: 숨김 조건 문자열을 원래 WHERE 한 줄로 되돌리는 같은 방식의 역치환(결과 해시 5f437ce297f1643b6c7c8f1f1fa304c0).
DO $mig$
DECLARE
  v_oid oid;
  v_old text;
  v_from text := '      WHERE cl.caller_user_id = p_user_id OR cl.peer_user_id = p_user_id' || E'\n' || '      LIMIT 100';
  v_to text := '      WHERE (cl.caller_user_id = p_user_id OR cl.peer_user_id = p_user_id)' || E'\n'
    || '        AND NOT EXISTS (' || E'\n'
    || '          SELECT 1 FROM public.community_messenger_call_log_user_hides h' || E'\n'
    || '          WHERE h.user_id = p_user_id AND h.call_log_id = cl.id' || E'\n'
    || '        )' || E'\n'
    || '      LIMIT 100';
  v_new text;
BEGIN
  IF to_regclass('public.community_messenger_call_log_user_hides') IS NULL THEN
    RAISE EXCEPTION 'community_messenger_call_log_user_hides missing — apply 20270414200000 first';
  END IF;

  SELECT p.oid INTO v_oid
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_cm_bootstrap_full_snapshot';
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'get_cm_bootstrap_full_snapshot not found';
  END IF;

  v_old := pg_get_functiondef(v_oid);
  IF strpos(v_old, 'community_messenger_call_log_user_hides') > 0 THEN
    RAISE NOTICE 'call_log hides already applied — skip';
    RETURN;
  END IF;
  IF md5(v_old) <> '5f437ce297f1643b6c7c8f1f1fa304c0' THEN
    RAISE EXCEPTION 'unexpected get_cm_bootstrap_full_snapshot definition hash % — abort (no change)', md5(v_old);
  END IF;
  IF strpos(v_old, v_from) = 0
     OR strpos(substr(v_old, strpos(v_old, v_from) + length(v_from)), v_from) > 0 THEN
    RAISE EXCEPTION 'call_logs WHERE marker not found exactly once — abort';
  END IF;

  v_new := replace(v_old, v_from, v_to);
  EXECUTE v_new;
END
$mig$;
