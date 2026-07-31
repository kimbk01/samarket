-- Room Unread v1.1 — single append RPC with optional NULL message.sender_id
-- DROP prior 12-arg overload then recreate with defaulted 13th arg (PostgREST-safe).

DROP FUNCTION IF EXISTS public.dibay_append_room_message_atomic(
  text, uuid, text, text, uuid, text, text, text, jsonb, timestamptz, boolean, text
);

CREATE OR REPLACE FUNCTION public.dibay_append_room_message_atomic(
  p_idempotency_key text,
  p_room_id uuid,
  p_chat_domain text,
  p_domain_identity_key text,
  p_sender_id uuid,
  p_sender_role text,
  p_message_type text,
  p_content text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_created_at timestamptz DEFAULT now(),
  p_counts_as_unread boolean DEFAULT true,
  p_client_message_id text DEFAULT NULL,
  p_force_null_message_sender boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := (SELECT auth.role());
  v_uid uuid := auth.uid();
  v_room public.community_messenger_rooms%rowtype;
  v_msg public.community_messenger_messages%rowtype;
  v_part_left timestamptz;
  v_idem text;
  v_prev jsonb;
  v_trim_client text;
  v_existing_id uuid;
  v_meta jsonb;
  v_recipients jsonb;
  v_preview text;
  v_result jsonb;
  v_insert_sender uuid;
BEGIN
  v_idem := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  IF v_idem IS NULL OR p_room_id IS NULL OR p_sender_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_args');
  END IF;

  IF v_role IS DISTINCT FROM 'service_role' THEN
    IF v_uid IS NULL OR v_uid IS DISTINCT FROM p_sender_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
    END IF;
  END IF;

  SELECT i.result INTO v_prev
  FROM public.dibay_room_unread_idempotency i
  WHERE i.user_id = p_sender_id AND i.idempotency_key = v_idem;
  IF FOUND THEN
    RETURN v_prev;
  END IF;

  SELECT r.* INTO v_room
  FROM public.community_messenger_rooms r
  WHERE r.id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_found');
  END IF;
  IF v_room.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_deleted');
  END IF;
  IF nullif(btrim(p_chat_domain), '') IS NOT NULL
     AND v_room.chat_domain IS DISTINCT FROM btrim(p_chat_domain) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'domain_mismatch');
  END IF;
  IF nullif(btrim(p_domain_identity_key), '') IS NOT NULL
     AND v_room.domain_identity_key IS DISTINCT FROM btrim(p_domain_identity_key) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'identity_mismatch');
  END IF;
  IF v_room.room_status = 'blocked' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_blocked');
  END IF;
  IF v_room.is_readonly THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_readonly');
  END IF;

  SELECT p.left_at INTO v_part_left
  FROM public.community_messenger_participants p
  WHERE p.room_id = p_room_id AND p.user_id = p_sender_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_member');
  END IF;
  IF v_part_left IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'participant_left');
  END IF;

  v_trim_client := nullif(trim(coalesce(p_client_message_id, '')), '');
  IF v_trim_client IS NOT NULL THEN
    SELECT m.id INTO v_existing_id
    FROM public.community_messenger_messages m
    WHERE m.room_id = p_room_id
      AND m.sender_id IS NOT DISTINCT FROM CASE
        WHEN coalesce(p_force_null_message_sender, false) THEN NULL
        ELSE p_sender_id
      END
      AND m.metadata->>'client_message_id' = v_trim_client
    ORDER BY m.created_at DESC
    LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      SELECT * INTO v_msg FROM public.community_messenger_messages WHERE id = v_existing_id;
      SELECT coalesce(to_jsonb(coalesce(array_agg(user_id::text ORDER BY user_id), ARRAY[]::text[])), '[]'::jsonb)
        INTO v_recipients
      FROM public.community_messenger_participants
      WHERE room_id = p_room_id AND user_id <> p_sender_id AND left_at IS NULL;
      v_result := jsonb_build_object(
        'ok', true,
        'deduped', true,
        'message', to_jsonb(v_msg),
        'recipient_user_ids', coalesce(v_recipients, '[]'::jsonb),
        'authority', 'room_unread_v1'
      );
      INSERT INTO public.dibay_room_unread_idempotency (user_id, idempotency_key, op, room_id, result)
      VALUES (p_sender_id, v_idem, 'append', p_room_id, v_result)
      ON CONFLICT DO NOTHING;
      RETURN v_result;
    END IF;
  END IF;

  v_meta := coalesce(p_metadata, '{}'::jsonb);
  IF v_trim_client IS NOT NULL THEN
    v_meta := v_meta || jsonb_build_object('client_message_id', v_trim_client);
  END IF;

  v_insert_sender := CASE
    WHEN coalesce(p_force_null_message_sender, false) THEN NULL
    ELSE p_sender_id
  END;

  INSERT INTO public.community_messenger_messages (
    room_id, sender_id, message_type, content, metadata, created_at
  ) VALUES (
    p_room_id,
    v_insert_sender,
    coalesce(nullif(btrim(p_message_type), ''), 'text'),
    coalesce(p_content, ''),
    v_meta,
    coalesce(p_created_at, now())
  )
  RETURNING * INTO v_msg;

  v_preview := left(trim(coalesce(v_msg.content, '')), 200);

  UPDATE public.community_messenger_rooms
  SET
    last_message = v_preview,
    last_message_at = v_msg.created_at,
    last_message_type = v_msg.message_type,
    updated_at = v_msg.created_at
  WHERE id = p_room_id;

  IF coalesce(p_counts_as_unread, true) THEN
    UPDATE public.community_messenger_participants p
    SET
      unread_count = CASE
        WHEN p.user_id = p_sender_id THEN 0
        ELSE coalesce(p.unread_count, 0) + 1
      END,
      last_read_at = CASE
        WHEN p.user_id = p_sender_id THEN v_msg.created_at
        ELSE p.last_read_at
      END,
      last_read_message_id = CASE
        WHEN p.user_id = p_sender_id THEN v_msg.id
        ELSE p.last_read_message_id
      END
    WHERE p.room_id = p_room_id
      AND p.left_at IS NULL;
  ELSE
    UPDATE public.community_messenger_participants p
    SET
      unread_count = 0,
      last_read_at = v_msg.created_at,
      last_read_message_id = v_msg.id
    WHERE p.room_id = p_room_id
      AND p.user_id = p_sender_id
      AND p.left_at IS NULL;
  END IF;

  SELECT coalesce(to_jsonb(coalesce(array_agg(user_id::text ORDER BY user_id), ARRAY[]::text[])), '[]'::jsonb)
    INTO v_recipients
  FROM public.community_messenger_participants
  WHERE room_id = p_room_id AND user_id <> p_sender_id AND left_at IS NULL;

  v_result := jsonb_build_object(
    'ok', true,
    'deduped', false,
    'message', to_jsonb(v_msg),
    'recipient_user_ids', coalesce(v_recipients, '[]'::jsonb),
    'authority', 'room_unread_v1'
  );

  INSERT INTO public.dibay_room_unread_idempotency (user_id, idempotency_key, op, room_id, result)
  VALUES (p_sender_id, v_idem, 'append', p_room_id, v_result)
  ON CONFLICT DO NOTHING;

  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'rolledBack', true);
END;
$$;

COMMENT ON FUNCTION public.dibay_append_room_message_atomic(
  text, uuid, text, text, uuid, text, text, text, jsonb, timestamptz, boolean, text, boolean
) IS
  'Room Unread v1.1: append + unread; p_force_null_message_sender for system rows.';

REVOKE ALL ON FUNCTION public.dibay_append_room_message_atomic(
  text, uuid, text, text, uuid, text, text, text, jsonb, timestamptz, boolean, text, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dibay_append_room_message_atomic(
  text, uuid, text, text, uuid, text, text, text, jsonb, timestamptz, boolean, text, boolean
) TO service_role;
