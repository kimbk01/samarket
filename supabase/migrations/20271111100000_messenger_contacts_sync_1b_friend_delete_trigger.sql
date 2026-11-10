-- 메신저 연락처 동기화 1b — 친구 삭제 시 재추천 제한 기록 트리거 (SSOT docs/design/messenger-contacts-sync-plan.md v5 §5-3 · Owner #18 재설계 승인)
-- 목적: 친구 삭제가 커밋되면 「이전 친구」 재추천 제한(contact_suppressions) 또는 실패 기록(contact_suppression_failures)
--       둘 중 하나가 반드시 같은 트랜잭션에 남는다. 둘 다 못 쓰면 친구 삭제도 취소된다(조용한 누락 없음).
-- 기존 친구 코드·계약(F-9 양쪽 삭제 · §14-5 차단 시 정리 · 기존 트리거 trg_user_social_relations_blocked_clears_friend)은 바꾸지 않는다.
--   · 친구 삭제는 한 문장(owner→target, target→owner 2행)으로 실행된다 (lib/community-messenger/social-relations.ts removeFriendPairSaved).
--   · 기존 차단 트리거 안의 friend 행 DELETE 도 이 문장 트리거를 실행한다 → 차단한 쪽 「이전 친구」 1행 (차단 판정은 차단 표가 따로 함).
--   · 계정 삭제 연쇄(profiles → user_social_relations CASCADE) 중에는 대상 계정이 없으므로 기록하지 않는다(EXISTS 확인).
-- 차단 트리거는 만들지 않는다 (차단 행은 해제해도 남아 목록 쿼리가 직접 제외 — §5-1).
-- 운영 적용: Owner 별도 승인. 롤백: DROP TRIGGER 1줄 (친구 동작 즉시 원상 · 표는 남겨 목록 제외 유지).
--   DROP TRIGGER IF EXISTS trg_usr_friend_delete_contact_suppress ON public.user_social_relations;
--   DROP FUNCTION IF EXISTS public.contact_suppress_on_friend_delete();

CREATE OR REPLACE FUNCTION public.contact_suppress_on_friend_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rows integer;
BEGIN
  BEGIN
    -- ① 1차 기록 (하위 트랜잭션) — 정렬된 순서로만 잠근다, 이미 있으면 그대로
    INSERT INTO public.contact_suppressions (owner_user_id, target_user_id, reason, created_at)
    SELECT DISTINCT o.owner_user_id, o.target_user_id, 'former_friend', now()
    FROM old_rows o
    WHERE o.relation_type = 'friend'
      AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = o.owner_user_id)
      AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = o.target_user_id)
    ORDER BY o.owner_user_id, o.target_user_id
    ON CONFLICT (owner_user_id, target_user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- ② 실패분 기록 (다른 표 · 제약 최소). 이것도 실패하면 예외가 밖으로 나가 친구 삭제도 함께 취소된다.
    INSERT INTO public.contact_suppression_failures (owner_user_id, target_user_id, reason, sqlstate, message)
    SELECT o.owner_user_id, o.target_user_id, 'former_friend', SQLSTATE, left(SQLERRM, 300)
    FROM old_rows o
    WHERE o.relation_type = 'friend';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RAISE WARNING 'contact_suppress_failed sqlstate=% rows=%', SQLSTATE, v_rows;
  END;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.contact_suppress_on_friend_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_usr_friend_delete_contact_suppress ON public.user_social_relations;
CREATE TRIGGER trg_usr_friend_delete_contact_suppress
AFTER DELETE ON public.user_social_relations
REFERENCING OLD TABLE AS old_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.contact_suppress_on_friend_delete();
