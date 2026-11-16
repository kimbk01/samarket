-- D7 (Owner 2026-11-16 「PR-C 진행」) — 「모두에게서 삭제」한 메시지를 안 읽음 수에서 뺀다.
-- 설계: docs/design/messenger-remaining-risks-design-2026-11-16.md §3 PR-C
--
-- 원인(운영 측정 2026-11-16 07:32 PHT): 지운 메시지가 상대 목록의 「안 읽음 1」에 그대로 남음.
--   - 안 읽음 수(participants.unread_count)는 받을 때 +1(community_messenger_apply_unread_for_text_message·send RPC)만 하고,
--     「모두에게서 삭제」(service deleteCommunityMessengerMessageForEveryone → messages.deleted_for_everyone_at 설정) 때 줄이는 처리가 없다.
--   - 재계산 함수 dibay_cm_canonical_unread_count 도 deleted_at 만 빼고 deleted_for_everyone_at 은 센다.
--
-- 변경
--   1) dibay_cm_canonical_unread_count: `AND m.deleted_for_everyone_at IS NULL` 1줄 추가. 그 외 본문·시그니처·SECURITY DEFINER·search_path 동일
--      (CREATE OR REPLACE 라 실행 권한 그대로).
--   2) 트리거 cm_messages_unread_on_delete_for_everyone: deleted_for_everyone_at NULL→값 전환(같은 UPDATE 트랜잭션)에서,
--      그 메시지를 재계산 함수가 「안 읽음」으로 세는 받는 사람(같은 조건: 보낸 사람 아님·나가지 않음·참가/기록 하한 이후·
--      읽음 위치 뒤·나갔다 다시 들어온 구간 밖·system 은 store_order/trade 방만)만 unread_count 를 1 줄인다(0 아래 금지).
--   지난 데이터는 고치지 않는다(앞으로 지우는 메시지부터 — Owner 「지난 데이터 채우기 불필요」).
--
-- 안전장치: 운영 재계산 함수 정의 해시가 적용 전 값(1aef6a6c77b367be70d1e17a2b24f459, 2026-11-16 조회)일 때만 교체.
--   이미 적용됐으면(deleted_for_everyone_at 포함) 건너뛰고, 그 외 정의면 아무것도 바꾸지 않고 중단.
-- 롤백:
--   DROP TRIGGER IF EXISTS cm_messages_unread_on_delete_for_everyone ON public.community_messenger_messages;
--   DROP FUNCTION IF EXISTS public.cm_unread_decrement_on_delete_for_everyone();
--   재계산 함수는 20271102130000_cm_direct_rejoin_history_floor.sql §3 본문을 다시 실행.

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
  IF strpos(v_def, 'deleted_for_everyone_at') > 0 THEN
    RAISE NOTICE 'dibay_cm_canonical_unread_count already excludes deleted_for_everyone_at — skip';
    RETURN;
  END IF;
  IF md5(v_def) <> '1aef6a6c77b367be70d1e17a2b24f459' THEN
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
  v_cleared_at timestamptz;
  v_count int;
  v_count_system boolean;
BEGIN
  IF p_room_id IS NULL OR p_viewer_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT p.last_read_message_id, p.joined_at, p.left_at, p.cleared_at
    INTO v_cursor_id, v_joined_at, v_left_at, v_cleared_at
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
    AND m.deleted_for_everyone_at IS NULL
    AND m.sender_id IS DISTINCT FROM p_viewer_id
    AND (v_count_system OR m.message_type IS DISTINCT FROM 'system')
    AND (v_joined_at IS NULL OR m.created_at >= v_joined_at)
    AND (v_cleared_at IS NULL OR m.created_at > v_cleared_at)
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

CREATE OR REPLACE FUNCTION public.cm_unread_decrement_on_delete_for_everyone()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count_system boolean;
BEGIN
  -- NULL → 값 전환만 (WHEN 절과 같은 조건 — 이미 지운 행 재 UPDATE·일반 수정은 건너뜀)
  IF OLD.deleted_for_everyone_at IS NOT NULL OR NEW.deleted_for_everyone_at IS NULL OR NEW.deleted_at IS NOT NULL THEN
    RETURN NULL;
  END IF;

  IF NEW.message_type = 'system' THEN
    SELECT coalesce(r.chat_domain IN ('store_order', 'trade'), false)
      INTO v_count_system
    FROM public.community_messenger_rooms r
    WHERE r.id = NEW.room_id;
    IF NOT coalesce(v_count_system, false) THEN
      RETURN NULL;
    END IF;
  END IF;

  -- 재계산 함수(dibay_cm_canonical_unread_count)가 이 메시지를 「안 읽음」으로 세는 받는 사람만 1 줄인다.
  UPDATE public.community_messenger_participants p
  SET unread_count = greatest(0, coalesce(p.unread_count, 0) - 1)
  WHERE p.room_id = NEW.room_id
    AND p.left_at IS NULL
    AND p.user_id IS DISTINCT FROM NEW.sender_id
    AND coalesce(p.unread_count, 0) > 0
    AND (p.joined_at IS NULL OR NEW.created_at >= p.joined_at)
    AND (p.cleared_at IS NULL OR NEW.created_at > p.cleared_at)
    AND NOT EXISTS (
      SELECT 1
      FROM public.community_messenger_messages c
      WHERE c.id = p.last_read_message_id
        AND c.room_id = NEW.room_id
        AND (c.created_at > NEW.created_at OR (c.created_at = NEW.created_at AND c.id >= NEW.id))
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.community_messenger_membership_leave_intervals g
      WHERE g.room_id = NEW.room_id
        AND g.user_id = p.user_id
        AND g.rejoined_at IS NOT NULL
        AND NEW.created_at >= g.left_at
        AND NEW.created_at < g.rejoined_at
    );

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.cm_unread_decrement_on_delete_for_everyone() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cm_unread_decrement_on_delete_for_everyone() FROM anon, authenticated;

DROP TRIGGER IF EXISTS cm_messages_unread_on_delete_for_everyone ON public.community_messenger_messages;
CREATE TRIGGER cm_messages_unread_on_delete_for_everyone
  AFTER UPDATE OF deleted_for_everyone_at ON public.community_messenger_messages
  FOR EACH ROW
  WHEN (OLD.deleted_for_everyone_at IS NULL AND NEW.deleted_for_everyone_at IS NOT NULL)
  EXECUTE FUNCTION public.cm_unread_decrement_on_delete_for_everyone();
