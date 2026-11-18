-- B3 — room_access 에 viewer cleared_at·participant_id 를 실어
-- GET messages 가 participants 를 다시 읽지 않게 한다 (접근 확인 결과 재사용).

BEGIN;

CREATE OR REPLACE FUNCTION public.community_messenger_room_access(p_user_id uuid, p_room_key text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_room_id uuid;
  v_room record;
  v_part record;
  v_banned boolean;
BEGIN
  IF p_room_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN jsonb_build_object('room_exists', false, 'participant_active', false);
  END IF;
  v_room_id := p_room_key::uuid;

  SELECT r.id, r.room_type, r.deleted_at
    INTO v_room
    FROM public.community_messenger_rooms r
   WHERE r.id = v_room_id;

  SELECT p.id, p.room_id, p.user_id, p.role, p.unread_count, p.is_muted, p.is_pinned,
         p.left_at, p.blocked_hidden_at, p.cleared_at
    INTO v_part
    FROM public.community_messenger_participants p
   WHERE p.room_id = v_room_id AND p.user_id = p_user_id;

  SELECT EXISTS (
    SELECT 1 FROM public.community_messenger_group_bans b
     WHERE b.room_id = v_room_id AND b.user_id = p_user_id AND b.unbanned_at IS NULL
  ) INTO v_banned;

  RETURN jsonb_build_object(
    'room_exists', v_room.id IS NOT NULL,
    'room_type', v_room.room_type,
    'deleted_at', v_room.deleted_at,
    'participant_active', v_part.id IS NOT NULL AND v_part.left_at IS NULL,
    'participant_id', v_part.id,
    'cleared_at', v_part.cleared_at,
    'group_participant', CASE
      WHEN v_part.id IS NOT NULL AND v_part.left_at IS NULL AND v_part.blocked_hidden_at IS NULL THEN
        jsonb_build_object(
          'id', v_part.id,
          'room_id', v_part.room_id,
          'user_id', v_part.user_id,
          'role', v_part.role,
          'unread_count', v_part.unread_count,
          'is_muted', v_part.is_muted,
          'is_pinned', v_part.is_pinned,
          'left_at', v_part.left_at
        )
      ELSE NULL
    END,
    'banned', v_banned
  );
END;
$$;

COMMENT ON FUNCTION public.community_messenger_room_access(uuid, text) IS
  '1-B room access one-shot; B3 adds participant_id + cleared_at for message history floor reuse.';

REVOKE ALL ON FUNCTION public.community_messenger_room_access(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_messenger_room_access(uuid, text) TO service_role;

COMMIT;
