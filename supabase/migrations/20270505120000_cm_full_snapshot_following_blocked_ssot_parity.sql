-- A-3: get_cm_bootstrap_full_snapshot.following_blocked — 레거시 community_messenger_friendships 분기 제거.
--
-- 원인(운영 함수 본문 확인, 2026-10-15):
--   following_blocked 는 friendships(status='blocked') 를 UNION 하면서
--     WHEN f.requester_user_id = p_user_id ... THEN f.addressee_user_id
--     WHEN f.addressee_user_id = p_user_id ... THEN f.requester_user_id
--   분기로 "내가 차단당한 상대(차단한 사람)" 까지 내 차단 목록에 넣는다(방향 역전).
--   또한 is_active 개념이 없고 차단 해제(unblockUserSocial)가 이 레거시 행을 지우지 않아, 해제 후에도 차단으로 남는다.
-- SSOT 정합: 앱 서버의 listBlockedByMeIds(lib/community-messenger/social-relations.ts) 는
--   user_social_relations(blocked, is_active) + user_relationships(blocked) 만 사용한다. 이 RPC 도 동일하게 맞춘다.
--
-- 적용 방식: 운영 DB 는 저장소 마이그레이션 본문과 다른 경로(20270503120000 의 DO 분기)로 배포되어 있으므로,
--   운영의 실제 함수 정의(pg_get_functiondef)를 읽어 해당 분기 문자열만 제거한다.
--   - 적용 전 정의 해시가 검증값과 다르면 아무것도 바꾸지 않고 예외로 중단(데이터·정의 무변경).
--   - 제거 구간은 정확히 1회만 존재해야 한다.
-- 데이터 변경 없음(함수 정의만). ACL 은 CREATE OR REPLACE 로 유지된다.
-- 롤백: 적용 전 정의(해시 c54f986680b580c0813d8d0afacd3c0c)를 백업 테이블 없이 복원하려면
--   20270503120000 의 운영 적용 본문을 다시 실행한다(운영 schema_migrations 20261015084501 에 기록된 본문).

DO $mig$
DECLARE
  v_oid oid;
  v_old text;
  v_start int;
  v_end int;
  v_cut text;
  v_new text;
BEGIN
  SELECT p.oid INTO v_oid
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_cm_bootstrap_full_snapshot';
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'get_cm_bootstrap_full_snapshot not found';
  END IF;

  v_old := pg_get_functiondef(v_oid);
  IF md5(v_old) = '5f437ce297f1643b6c7c8f1f1fa304c0' THEN
    RAISE NOTICE 'following_blocked already SSOT-only — skip';
    RETURN;
  END IF;
  IF md5(v_old) <> 'c54f986680b580c0813d8d0afacd3c0c' THEN
    RAISE EXCEPTION 'unexpected get_cm_bootstrap_full_snapshot definition hash % — abort (no change)', md5(v_old);
  END IF;

  v_start := strpos(v_old, 'SELECT CASE' || E'\n' || '              WHEN f.blocked_by_user_id = p_user_id THEN');
  v_end := strpos(v_old, 'SELECT sr.target_user_id AS blocked_id');
  IF v_start = 0 OR v_end = 0 OR v_start >= v_end THEN
    RAISE EXCEPTION 'following_blocked friendships branch markers not found — abort';
  END IF;
  v_cut := substr(v_old, v_start, v_end - v_start);
  IF strpos(v_cut, 'FROM public.community_messenger_friendships f') = 0
     OR strpos(v_cut, 'UNION') = 0 THEN
    RAISE EXCEPTION 'unexpected cut content — abort';
  END IF;

  v_new := substr(v_old, 1, v_start - 1) || substr(v_old, v_end);
  IF md5(v_new) <> '5f437ce297f1643b6c7c8f1f1fa304c0' THEN
    RAISE EXCEPTION 'unexpected new definition hash % — abort', md5(v_new);
  END IF;
  EXECUTE v_new;
END
$mig$;
