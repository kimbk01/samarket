-- C-9: community_messenger_room_messages_after — deleted_at 행 제외(목록·latest·before·단건 조회와 동일 규칙).
--
-- 원인(운영 함수 본문 확인, 2026-10-15, md5 a16c2fd68a28a19af1e5674a7120d36f):
--   after RPC 만 m.deleted_at 필터가 없어, 삭제(숨김)된 메시지가 after= 증분 조회에서만 다시 내려온다.
--   lib/community-messenger/service.ts 의 다른 메시지 조회는 모두 .is("deleted_at", null) 을 쓴다.
-- 변경: 결과 행에 `m.deleted_at IS NULL` 추가. 앵커 존재 확인(a.*)은 그대로 둔다
--   (앵커가 삭제돼도 커서 의미는 유지 — 앵커 이후 행은 정상 반환).
-- 데이터 변경 없음. 시그니처·SECURITY DEFINER·search_path·ACL 동일.
-- 롤백: 아래 본문에서 `and m.deleted_at is null` 한 줄을 제거해 재실행.

-- 안전장치: 운영 정의 해시가 적용 전 값(a16c2fd68a28a19af1e5674a7120d36f)일 때만 교체. 이미 적용됐으면(표식 존재) skip,
-- 그 외 정의면 아무것도 바꾸지 않고 예외로 중단.
DO $mig$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'community_messenger_room_messages_after';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'community_messenger_room_messages_after not found';
  END IF;
  IF strpos(v_def, 'and m.deleted_at is null') > 0 THEN
    RAISE NOTICE 'community_messenger_room_messages_after already migrated — skip';
    RETURN;
  END IF;
  IF md5(v_def) <> 'a16c2fd68a28a19af1e5674a7120d36f' THEN
    RAISE EXCEPTION 'unexpected community_messenger_room_messages_after definition hash % — abort (no change)', md5(v_def);
  END IF;
  EXECUTE $def$
CREATE OR REPLACE FUNCTION public.community_messenger_room_messages_after(p_user_id uuid, p_room_id uuid, p_after_message_id uuid, p_limit integer)
 RETURNS SETOF community_messenger_messages
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select m.*
  from public.community_messenger_messages m
  where m.room_id = p_room_id
    and m.deleted_at is null
    and exists (
      select 1
      from public.community_messenger_participants p
      where p.room_id = p_room_id
        and p.user_id = p_user_id
    )
    and exists (
      select 1
      from public.community_messenger_messages a
      where a.id = p_after_message_id
        and a.room_id = p_room_id
    )
    and (
      m.created_at,
      m.id
    ) > (
      select a.created_at, a.id
      from public.community_messenger_messages a
      where a.id = p_after_message_id
        and a.room_id = p_room_id
    )
  order by m.created_at asc, m.id asc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$function$
$def$;
END
$mig$;
