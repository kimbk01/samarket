-- 1b 트리거 시험 T1~T4·T6~T9 (T5 동시성·T10 성능은 run.sh 의 pgbench). NOTICE 'PASS id' / ERROR 'FAIL id'
CREATE OR REPLACE FUNCTION t_ok(p_id text, p_cond boolean, p_detail text DEFAULT '') RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF coalesce(p_cond, false) THEN RAISE NOTICE 'PASS %', p_id; ELSE RAISE EXCEPTION 'FAIL % %', p_id, p_detail; END IF;
END $$;
-- 앱이 쓰는 문장 그대로 (social-relations.ts removeFriendPairSaved · blockUserSocial upsert)
CREATE OR REPLACE FUNCTION t_remove_pair(a uuid, b uuid) RETURNS void LANGUAGE sql AS $$
  DELETE FROM public.user_social_relations WHERE relation_type = 'friend'
    AND ((owner_user_id = a AND target_user_id = b) OR (owner_user_id = b AND target_user_id = a)) $$;
CREATE OR REPLACE FUNCTION t_make_friends(a uuid, b uuid) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.user_social_relations (owner_user_id, target_user_id, relation_type)
  VALUES (a, b, 'friend'), (b, a, 'friend') ON CONFLICT (owner_user_id, target_user_id) DO NOTHING $$;
CREATE OR REPLACE FUNCTION t_block(a uuid, b uuid) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.user_social_relations (owner_user_id, target_user_id, relation_type, is_active, block_source, blocked_at)
  VALUES (a, b, 'blocked', true, 'profile', now())
  ON CONFLICT (owner_user_id, target_user_id) DO UPDATE SET relation_type = 'blocked', is_active = true, blocked_at = now() $$;

INSERT INTO public.profiles (id, nickname) VALUES
 ('10000000-0000-0000-0000-00000000000a', 'A'), ('10000000-0000-0000-0000-00000000000b', 'B'),
 ('10000000-0000-0000-0000-00000000000c', 'C'), ('10000000-0000-0000-0000-00000000000d', 'D');

DO $t$
DECLARE
  A uuid := '10000000-0000-0000-0000-00000000000a';
  B uuid := '10000000-0000-0000-0000-00000000000b';
  C uuid := '10000000-0000-0000-0000-00000000000c';
  D uuid := '10000000-0000-0000-0000-00000000000d';
  v_failed boolean := false;
  v_rec integer;
BEGIN
  -- T1 정상 삭제: 친구 2행 삭제 + 양쪽 「이전 친구」
  PERFORM t_make_friends(A, B);
  PERFORM t_remove_pair(A, B);
  PERFORM t_ok('T1 정상 삭제 → 제한 2행', (SELECT count(*) FROM contact_suppressions WHERE reason = 'former_friend'
      AND ((owner_user_id = A AND target_user_id = B) OR (owner_user_id = B AND target_user_id = A))) = 2
    AND NOT EXISTS (SELECT 1 FROM user_social_relations WHERE relation_type = 'friend'));
  PERFORM t_remove_pair(A, B);
  PERFORM t_ok('T1b 지울 행 없음 → 기록 변화 없음', (SELECT count(*) FROM contact_suppressions) = 2);
  DELETE FROM contact_suppressions;

  -- T4 차단 (기존 BEFORE 트리거 경유 + 앱 정리 단계)
  PERFORM t_make_friends(A, B);
  PERFORM t_block(A, B);
  PERFORM t_ok('T4a 차단 시 기존 트리거 동작 그대로 (A→B blocked, B→A friend 남음)',
    (SELECT relation_type FROM user_social_relations WHERE owner_user_id = A AND target_user_id = B) = 'blocked'
    AND (SELECT relation_type FROM user_social_relations WHERE owner_user_id = B AND target_user_id = A) = 'friend'
    AND EXISTS (SELECT 1 FROM contact_suppressions WHERE owner_user_id = A AND target_user_id = B));
  PERFORM t_remove_pair(A, B);  -- cleanupCommunityMessengerFriendGraphOnBlock → removeFriendPairSaved
  PERFORM t_ok('T4b 차단 정리 후 양쪽 제한, 차단 행 유지',
    (SELECT count(*) FROM contact_suppressions WHERE (owner_user_id, target_user_id) IN ((A, B), (B, A))) = 2
    AND (SELECT relation_type FROM user_social_relations WHERE owner_user_id = A AND target_user_id = B) = 'blocked');
  DELETE FROM user_social_relations; DELETE FROM contact_suppressions;

  -- T2 ① 실패 주입 → 친구 삭제 성공 + 실패 2행
  ALTER TABLE contact_suppressions ADD CONSTRAINT t_inject_fail CHECK (reason = 'hidden') NOT VALID;
  PERFORM t_make_friends(A, B);
  PERFORM t_remove_pair(A, B);
  PERFORM t_ok('T2 ① 실패 → 친구 삭제 성공·실패 행 2·제한 0',
    NOT EXISTS (SELECT 1 FROM user_social_relations WHERE relation_type = 'friend')
    AND (SELECT count(*) FROM contact_suppression_failures WHERE resolved_at IS NULL AND sqlstate = '23514') = 2
    AND (SELECT count(*) FROM contact_suppressions) = 0);

  -- T3 ①② 모두 실패 → 친구 삭제 취소
  ALTER TABLE contact_suppression_failures ADD CONSTRAINT t_inject_fail2 CHECK (false) NOT VALID;
  PERFORM t_make_friends(C, D);
  BEGIN
    PERFORM t_remove_pair(C, D);
  EXCEPTION WHEN check_violation THEN
    v_failed := true;
  END;
  PERFORM t_ok('T3 ①② 실패 → 오류 반환·친구 2행 그대로', v_failed
    AND (SELECT count(*) FROM user_social_relations WHERE relation_type = 'friend' AND owner_user_id IN (C, D)) = 2);
  ALTER TABLE contact_suppression_failures DROP CONSTRAINT t_inject_fail2;
  ALTER TABLE contact_suppressions DROP CONSTRAINT t_inject_fail;

  -- T9 미복구 실패 행 대상은 목록 제외 (계약 함수로 확인)
  PERFORM t_ok('T9 미복구 실패 행 존재', EXISTS (SELECT 1 FROM contact_suppression_failures
    WHERE owner_user_id = A AND target_user_id = B AND resolved_at IS NULL));

  -- T6 복구 (매일 정리) · 멱등
  v_rec := (public.cm_contacts_daily_maintenance(false)->>'recovered_failures')::int;
  PERFORM t_ok('T6a 정리 작업 복구 2건', v_rec = 2
    AND (SELECT count(*) FROM contact_suppressions WHERE reason = 'former_friend') = 2
    AND NOT EXISTS (SELECT 1 FROM contact_suppression_failures WHERE resolved_at IS NULL));
  v_rec := (public.cm_contacts_daily_maintenance(false)->>'recovered_failures')::int;
  PERFORM t_ok('T6b 재실행 멱등', v_rec = 0
    AND (SELECT count(*) FROM contact_suppressions) = 2);
  DELETE FROM contact_suppressions; DELETE FROM contact_suppression_failures;

  -- T7 롤백: 트리거 제거 → 친구 삭제 정상·기록 없음 → 다시 만들면 정상
  DROP TRIGGER trg_usr_friend_delete_contact_suppress ON public.user_social_relations;
  PERFORM t_remove_pair(C, D);
  PERFORM t_ok('T7a DROP 후 친구 삭제 정상·기록 0', NOT EXISTS (SELECT 1 FROM user_social_relations WHERE relation_type = 'friend')
    AND (SELECT count(*) FROM contact_suppressions) = 0);
  CREATE TRIGGER trg_usr_friend_delete_contact_suppress AFTER DELETE ON public.user_social_relations
    REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.contact_suppress_on_friend_delete();
  PERFORM t_make_friends(C, D);
  PERFORM t_remove_pair(C, D);
  PERFORM t_ok('T7b 재생성 후 정상', (SELECT count(*) FROM contact_suppressions) = 2);
  DELETE FROM contact_suppressions;

  -- T8 계정 삭제 연쇄 (친구·차단 있는 계정)
  PERFORM t_make_friends(A, C);
  PERFORM t_block(D, C);
  DELETE FROM profiles WHERE id = C;
  PERFORM t_ok('T8 계정 삭제 성공·관계 연쇄 삭제·고아 기록 0',
    NOT EXISTS (SELECT 1 FROM profiles WHERE id = C)
    AND NOT EXISTS (SELECT 1 FROM user_social_relations WHERE C IN (owner_user_id, target_user_id))
    AND NOT EXISTS (SELECT 1 FROM contact_suppressions WHERE C IN (owner_user_id, target_user_id))
    AND NOT EXISTS (SELECT 1 FROM contact_suppression_failures));
END
$t$;

-- 권한
DO $g$ BEGIN
  PERFORM t_ok('GRANT 트리거 함수 직접 실행 불가 (anon·authenticated)',
    NOT has_function_privilege('authenticated', 'public.contact_suppress_on_friend_delete()', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.contact_suppress_on_friend_delete()', 'EXECUTE'));
  PERFORM t_ok('TRG 트리거 정의 = 문장 단위 AFTER DELETE',
    (SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname = 'trg_usr_friend_delete_contact_suppress')
      LIKE '%AFTER DELETE ON public.user_social_relations REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT%');
END $g$;
