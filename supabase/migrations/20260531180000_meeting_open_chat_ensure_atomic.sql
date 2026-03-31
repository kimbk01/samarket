-- 기본 오픈채팅 방 생성: 동시 요청 시 중복 insert 방지 (advisory lock + 단일 트랜잭션)

CREATE OR REPLACE FUNCTION public.ensure_default_meeting_open_chat_room_atomic(
  p_meeting_id uuid,
  p_host_user_id uuid,
  p_title text,
  p_max_members integer,
  p_description text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_room_id uuid;
  v_nick text;
  v_room_title text;
  v_max int;
  v_now timestamptz := now();
  v_msg text := '채팅방이 열렸습니다. 오픈 닉네임으로 대화해 주세요.';
BEGIN
  IF p_meeting_id IS NULL OR p_host_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_request');
  END IF;

  PERFORM pg_advisory_xact_lock(842155, hashtext(p_meeting_id::text));

  SELECT id
  INTO v_existing
  FROM public.meeting_open_chat_rooms
  WHERE meeting_id = p_meeting_id
    AND is_active = true
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'room_id', v_existing, 'created', false);
  END IF;

  v_room_title := left(trim(coalesce(p_title, '')), 200);
  IF v_room_title = '' THEN
    v_room_title := '모임 오픈채팅';
  END IF;

  v_nick := left(regexp_replace(trim(coalesce(p_title, '')), '\s+', ' ', 'g'), 40);
  IF length(v_nick) < 2 THEN
    v_nick := '모임장';
  END IF;

  v_max := coalesce(p_max_members, 300);
  IF v_max < 2 THEN
    v_max := 2;
  END IF;
  IF v_max > 2000 THEN
    v_max := 2000;
  END IF;

  INSERT INTO public.meeting_open_chat_rooms (
    meeting_id,
    title,
    description,
    join_type,
    password_hash,
    max_members,
    is_active,
    is_searchable,
    allow_rejoin_after_kick,
    owner_user_id,
    active_member_count,
    pending_join_count,
    created_at,
    updated_at
  )
  VALUES (
    p_meeting_id,
    v_room_title,
    left(trim(coalesce(p_description, '')), 500),
    'free',
    NULL,
    v_max,
    true,
    true,
    true,
    p_host_user_id,
    1,
    0,
    v_now,
    v_now
  )
  RETURNING id INTO v_room_id;

  INSERT INTO public.meeting_open_chat_members (
    room_id,
    user_id,
    role,
    open_nickname,
    intro_message,
    status,
    joined_at,
    last_seen_at,
    updated_at
  )
  VALUES (
    v_room_id,
    p_host_user_id,
    'owner',
    v_nick,
    '',
    'active',
    v_now,
    v_now,
    v_now
  );

  INSERT INTO public.meeting_open_chat_messages (
    room_id,
    user_id,
    member_id,
    message_type,
    content,
    created_at,
    updated_at
  )
  VALUES (
    v_room_id,
    NULL,
    NULL,
    'system',
    v_msg,
    v_now,
    v_now
  );

  UPDATE public.meeting_open_chat_rooms
  SET
    last_message_preview = left(v_msg, 200),
    last_message_at = v_now,
    updated_at = v_now
  WHERE id = v_room_id;

  INSERT INTO public.meeting_open_chat_logs (room_id, actor_user_id, action_type, action_detail)
  VALUES (
    v_room_id,
    p_host_user_id,
    'room_created',
    jsonb_build_object('title', v_room_title)
  );

  RETURN jsonb_build_object('ok', true, 'room_id', v_room_id, 'created', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_default_meeting_open_chat_room_atomic(uuid, uuid, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_default_meeting_open_chat_room_atomic(uuid, uuid, text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_default_meeting_open_chat_room_atomic(uuid, uuid, text, integer, text) TO authenticated;
