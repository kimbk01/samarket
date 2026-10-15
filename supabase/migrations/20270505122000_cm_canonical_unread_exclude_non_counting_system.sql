-- C-6: dibay_cm_canonical_unread_count — 증분 unread 규칙과 일치하도록 "안 읽음에 포함되지 않는 system 메시지" 제외.
--
-- 원인(운영 함수 본문·코드 확인, 2026-10-15, md5 3dd433d3f83200fb2c4b1a23a8f99b14):
--   - 증분(메시지 삽입 시) 규칙:
--       · 일반/그룹(chat_domain NULL·general_*·group) system: appendCommunityMessengerSystemMessage 가 sender_id NULL 로 insert,
--         unread 증가 없음 + skipBadgeTargetBump (contracts/room-unread-authority.ts ROOM_UNREAD_SYSTEM_DEFAULT_COUNTS=false).
--       · store_order system: append RPC p_counts_as_unread=true (store-order-chat-service.ts) → 증가.
--       · trade system(판매글 변경 안내): community_messenger_apply_unread_for_text_message 호출 → 증가.
--   - 재계산(dibay_mark_room_read_atomic 의 부분 읽음 처리에서 호출)은 sender_id IS DISTINCT FROM viewer 로
--     sender NULL 인 system 행을 도메인과 무관하게 모두 센다 → 일반/그룹 방에서 방 unread 와 홈 배지가 어긋남.
--   운영 데이터: group system 136행, store_order system 4049행, trade system 308행 (모두 sender NULL).
-- 변경: system 행은 방 chat_domain 이 store_order·trade 일 때만 센다. 그 외 조건은 원본과 동일.
-- 데이터 변경 없음. 시그니처·SECURITY DEFINER·search_path·ACL 동일(CREATE OR REPLACE).
-- 롤백: 아래 본문에서 v_count_system 관련 조건을 제거한 원본(위 md5)을 재실행.

-- 안전장치: 운영 정의 해시가 적용 전 값(3dd433d3f83200fb2c4b1a23a8f99b14)일 때만 교체. 이미 적용됐으면(표식 존재) skip,
-- 그 외 정의면 아무것도 바꾸지 않고 예외로 중단.
DO $mig$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'dibay_cm_canonical_unread_count';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'dibay_cm_canonical_unread_count not found';
  END IF;
  IF strpos(v_def, 'v_count_system') > 0 THEN
    RAISE NOTICE 'dibay_cm_canonical_unread_count already migrated — skip';
    RETURN;
  END IF;
  IF md5(v_def) <> '3dd433d3f83200fb2c4b1a23a8f99b14' THEN
    RAISE EXCEPTION 'unexpected dibay_cm_canonical_unread_count definition hash % — abort (no change)', md5(v_def);
  END IF;
  EXECUTE $def$
CREATE OR REPLACE FUNCTION public.dibay_cm_canonical_unread_count(p_room_id uuid, p_viewer_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cursor_id uuid;
  v_cursor_at timestamptz;
  v_joined_at timestamptz;
  v_left_at timestamptz;
  v_count int;
  v_count_system boolean;
BEGIN
  IF p_room_id IS NULL OR p_viewer_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT p.last_read_message_id, p.joined_at, p.left_at
    INTO v_cursor_id, v_joined_at, v_left_at
  FROM public.community_messenger_participants p
  WHERE p.room_id = p_room_id AND p.user_id = p_viewer_id;

  IF NOT FOUND OR v_left_at IS NOT NULL THEN
    RETURN 0;
  END IF;

  SELECT coalesce(r.chat_domain IN ('store_order', 'trade'), false)
    INTO v_count_system
  FROM public.community_messenger_rooms r
  WHERE r.id = p_room_id;
  v_count_system := coalesce(v_count_system, false);

  IF v_cursor_id IS NOT NULL THEN
    SELECT m.created_at INTO v_cursor_at
    FROM public.community_messenger_messages m
    WHERE m.id = v_cursor_id AND m.room_id = p_room_id;
  END IF;

  SELECT count(*)::int INTO v_count
  FROM public.community_messenger_messages m
  WHERE m.room_id = p_room_id
    AND m.deleted_at IS NULL
    AND m.sender_id IS DISTINCT FROM p_viewer_id
    AND (v_count_system OR m.message_type IS DISTINCT FROM 'system')
    AND (v_joined_at IS NULL OR m.created_at >= v_joined_at)
    AND (
      v_cursor_id IS NULL
      OR v_cursor_at IS NULL
      OR m.created_at > v_cursor_at
      OR (m.created_at = v_cursor_at AND m.id > v_cursor_id)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.community_messenger_membership_leave_intervals g
      WHERE g.room_id = p_room_id
        AND g.user_id = p_viewer_id
        AND g.rejoined_at IS NOT NULL
        AND m.created_at >= g.left_at
        AND m.created_at < g.rejoined_at
    );

  RETURN coalesce(v_count, 0);
END;
$function$
$def$;
END
$mig$;
