-- GROUP ACTIVE MEMBERSHIP AUTHORITY CLOSE
-- Scope: private_group / open_group only. Direct / trade / delivery semantics preserved.
--
-- 1) list RPC: exclude left group memberships
-- 2) send RPC: require active group membership; group recipients = left_at IS NULL
-- 3) RLS rooms/messages: group rooms require left_at IS NULL; non-group unchanged

-- ---------------------------------------------------------------------------
-- 1) bootstrap my room ids — GROUP left_at filter only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_messenger_bootstrap_my_room_ids(
  p_user_id uuid,
  p_limit integer DEFAULT 500
)
RETURNS TABLE (
  room_id uuid,
  last_message_at timestamptz,
  membership_total_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT
      p.room_id,
      r.last_message_at,
      count(*) OVER ()::integer AS membership_total_count
    FROM public.community_messenger_participants p
    JOIN public.community_messenger_rooms r
      ON r.id = p.room_id
    WHERE p.user_id = p_user_id
      AND (
        (
          r.room_type IS DISTINCT FROM 'private_group'
          AND r.room_type IS DISTINCT FROM 'open_group'
        )
        OR p.left_at IS NULL
      )
  )
  SELECT
    ranked.room_id,
    ranked.last_message_at,
    ranked.membership_total_count
  FROM ranked
  ORDER BY ranked.last_message_at DESC NULLS LAST, ranked.room_id ASC
  LIMIT least(greatest(coalesce(p_limit, 500), 0), 500);
$$;

COMMENT ON FUNCTION public.community_messenger_bootstrap_my_room_ids(uuid, integer) IS
  'CM bootstrap room ids — group rooms require left_at IS NULL; non-group unchanged.';

-- ---------------------------------------------------------------------------
-- 2) send text — group active membership + active recipients
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_messenger_send_text_message(
  p_room_id uuid,
  p_sender_id uuid,
  p_content text,
  p_client_message_id text DEFAULT NULL,
  p_created_at timestamptz DEFAULT now(),
  p_reply_to_message_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.community_messenger_rooms%rowtype;
  v_msg public.community_messenger_messages%rowtype;
  v_existing_id uuid;
  v_trim_client text;
  v_meta jsonb;
  v_recipients jsonb;
  v_pc_seller uuid;
  v_pc_buyer uuid;
  v_seller_left timestamptz;
  v_buyer_left timestamptz;
  v_pc_flow text;
  v_pc_mode text;
  v_reply_row public.community_messenger_messages%rowtype;
  v_reply_preview text;
  v_reply_type text;
  v_reply_label text;
  v_reply_sender uuid;
  v_is_group boolean;
BEGIN
  IF (SELECT auth.role()) <> 'service_role' THEN
    IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_sender_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
    END IF;
  END IF;

  IF p_content IS NULL OR length(trim(p_content)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'content_required');
  END IF;

  SELECT r.*
    INTO v_room
  FROM public.community_messenger_rooms r
  INNER JOIN public.community_messenger_participants p
    ON p.room_id = r.id AND p.user_id = p_sender_id
  WHERE r.id = p_room_id
    AND (
      -- GROUP: active membership required
      (
        r.room_type IN ('private_group', 'open_group')
        AND p.left_at IS NULL
        AND NOT COALESCE(public.cm_group_is_user_banned(r.id, p_sender_id), false)
      )
      -- NON-GROUP: preserve row-exists semantics
      OR r.room_type IS DISTINCT FROM 'private_group'
         AND r.room_type IS DISTINCT FROM 'open_group'
    );

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_found');
  END IF;

  v_is_group := v_room.room_type IN ('private_group', 'open_group');

  IF v_room.room_status = 'blocked' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_blocked');
  END IF;
  IF v_room.room_status = 'archived' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_archived');
  END IF;
  IF v_room.is_readonly THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_readonly');
  END IF;

  IF to_regclass('public.product_chats') IS NOT NULL THEN
    SELECT
      pc.seller_id,
      pc.buyer_id,
      pc.seller_left_at,
      pc.buyer_left_at,
      lower(coalesce(nullif(trim(pc.trade_flow_status::text), ''), 'chatting')),
      lower(coalesce(nullif(trim(pc.chat_mode::text), ''), 'open'))
    INTO v_pc_seller, v_pc_buyer, v_seller_left, v_buyer_left, v_pc_flow, v_pc_mode
    FROM public.product_chats pc
    WHERE pc.community_messenger_room_id = p_room_id
    LIMIT 1;

    IF v_pc_seller IS NOT NULL THEN
      IF v_pc_mode IN ('limited', 'readonly') THEN
        RETURN jsonb_build_object('ok', false, 'error', 'trade_chat_mode_locked');
      END IF;
      IF coalesce(v_pc_flow, 'chatting') <> 'chatting' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'trade_flow_not_chatting');
      END IF;
      IF p_sender_id = v_pc_seller AND v_seller_left IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'trade_sender_left');
      END IF;
      IF p_sender_id = v_pc_buyer AND v_buyer_left IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'trade_sender_left');
      END IF;
      IF p_sender_id = v_pc_buyer AND v_seller_left IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'trade_seller_closed');
      END IF;
    END IF;
  END IF;

  v_reply_preview := '';
  v_reply_type := '';
  v_reply_label := '';
  IF p_reply_to_message_id IS NOT NULL THEN
    SELECT m.* INTO v_reply_row
    FROM public.community_messenger_messages m
    WHERE m.id = p_reply_to_message_id
      AND m.room_id = p_room_id
      AND m.deleted_at IS NULL
    LIMIT 1;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'reply_target_not_found');
    END IF;
    IF v_reply_row.message_type = 'system' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'reply_target_invalid');
    END IF;
    v_reply_type := coalesce(nullif(trim(v_reply_row.message_type), ''), 'text');
    v_reply_sender := v_reply_row.sender_id;
    IF v_reply_sender IS NOT NULL THEN
      SELECT coalesce(nullif(trim(pr.nickname), ''), nullif(trim(pr.username), ''), '사용자')
        INTO v_reply_label
      FROM public.profiles pr
      WHERE pr.id = v_reply_sender;
    ELSE
      v_reply_label := '시스템';
    END IF;
    IF v_reply_label IS NULL THEN
      v_reply_label := '사용자';
    END IF;
    IF v_reply_row.deleted_for_everyone_at IS NOT NULL THEN
      v_reply_preview := '삭제된 메시지';
    ELSIF v_reply_type = 'text' THEN
      v_reply_preview := left(trim(coalesce(v_reply_row.content, '')), 280);
    ELSE
      v_reply_preview := '(' || v_reply_type || ')';
    END IF;
  END IF;

  v_trim_client := nullif(trim(p_client_message_id), '');

  IF v_trim_client IS NOT NULL THEN
    SELECT m.id
      INTO v_existing_id
    FROM public.community_messenger_messages m
    WHERE m.room_id = p_room_id
      AND m.sender_id = p_sender_id
      AND m.metadata->>'client_message_id' = v_trim_client
    ORDER BY m.created_at DESC
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      SELECT * INTO v_msg FROM public.community_messenger_messages WHERE id = v_existing_id;

      IF v_is_group THEN
        SELECT coalesce(
          to_jsonb(coalesce(array_agg(user_id::text ORDER BY user_id), array[]::text[])),
          '[]'::jsonb
        )
          INTO v_recipients
        FROM public.community_messenger_participants
        WHERE room_id = p_room_id
          AND user_id <> p_sender_id
          AND left_at IS NULL
          AND NOT COALESCE(public.cm_group_is_user_banned(p_room_id, user_id), false);
      ELSE
        SELECT coalesce(
          to_jsonb(coalesce(array_agg(user_id::text ORDER BY user_id), array[]::text[])),
          '[]'::jsonb
        )
          INTO v_recipients
        FROM public.community_messenger_participants
        WHERE room_id = p_room_id AND user_id <> p_sender_id;
      END IF;

      RETURN jsonb_build_object(
        'ok', true,
        'deduped', true,
        'message', to_jsonb(v_msg),
        'recipient_user_ids', coalesce(v_recipients, '[]'::jsonb),
        'room_direct_key', to_jsonb(v_room.direct_key)
      );
    END IF;
  END IF;

  v_meta := CASE
    WHEN v_trim_client IS NOT NULL THEN jsonb_build_object('client_message_id', v_trim_client)
    ELSE '{}'::jsonb
  END;

  INSERT INTO public.community_messenger_messages (
    room_id,
    sender_id,
    message_type,
    content,
    metadata,
    created_at,
    reply_to_message_id,
    reply_preview_text,
    reply_preview_type,
    reply_sender_label_snapshot
  ) VALUES (
    p_room_id,
    p_sender_id,
    'text',
    trim(p_content),
    v_meta,
    p_created_at,
    CASE WHEN p_reply_to_message_id IS NOT NULL THEN p_reply_to_message_id ELSE NULL END,
    coalesce(v_reply_preview, ''),
    coalesce(v_reply_type, ''),
    coalesce(v_reply_label, '')
  )
  RETURNING * INTO v_msg;

  UPDATE public.community_messenger_rooms
  SET
    last_message = trim(p_content),
    last_message_at = p_created_at,
    last_message_type = 'text',
    updated_at = p_created_at
  WHERE id = p_room_id;

  UPDATE public.community_messenger_participants p
  SET
    unread_count = CASE
      WHEN p.user_id = p_sender_id THEN 0
      ELSE coalesce(p.unread_count, 0) + 1
    END,
    last_read_at = CASE
      WHEN p.user_id = p_sender_id THEN p_created_at
      ELSE p.last_read_at
    END,
    last_read_message_id = CASE
      WHEN p.user_id = p_sender_id THEN v_msg.id
      ELSE p.last_read_message_id
    END
  WHERE p.room_id = p_room_id
    AND (p.left_at IS NULL);

  IF v_is_group THEN
    SELECT coalesce(
      to_jsonb(coalesce(array_agg(user_id::text ORDER BY user_id), array[]::text[])),
      '[]'::jsonb
    )
      INTO v_recipients
    FROM public.community_messenger_participants
    WHERE room_id = p_room_id
      AND user_id <> p_sender_id
      AND left_at IS NULL
      AND NOT COALESCE(public.cm_group_is_user_banned(p_room_id, user_id), false);
  ELSE
    SELECT coalesce(
      to_jsonb(coalesce(array_agg(user_id::text ORDER BY user_id), array[]::text[])),
      '[]'::jsonb
    )
      INTO v_recipients
    FROM public.community_messenger_participants
    WHERE room_id = p_room_id AND user_id <> p_sender_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'deduped', false,
    'message', to_jsonb(v_msg),
    'recipient_user_ids', coalesce(v_recipients, '[]'::jsonb),
    'room_direct_key', to_jsonb(v_room.direct_key)
  );
END;
$$;

COMMENT ON FUNCTION public.community_messenger_send_text_message(uuid, uuid, text, text, timestamptz, uuid) IS
  'CM text send — group active membership required; group recipients left_at IS NULL.';

-- ---------------------------------------------------------------------------
-- 3) RLS — group-only left_at on rooms/messages SELECT/ALL
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cm_can_access_messenger_room(p_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.community_messenger_participants p
    JOIN public.community_messenger_rooms r ON r.id = p.room_id
    WHERE p.room_id = p_room_id
      AND p.user_id = auth.uid()
      AND (
        (
          r.room_type IN ('private_group', 'open_group')
          AND p.left_at IS NULL
          AND NOT COALESCE(public.cm_group_is_user_banned(r.id, auth.uid()), false)
        )
        OR (
          r.room_type IS DISTINCT FROM 'private_group'
          AND r.room_type IS DISTINCT FROM 'open_group'
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.cm_can_access_messenger_room(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cm_can_access_messenger_room(uuid) TO authenticated, service_role;

-- Ensure ban helper is callable from authenticated RLS context (read-only check).
DO $$
BEGIN
  IF to_regprocedure('public.cm_group_is_user_banned(uuid, uuid)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.cm_group_is_user_banned(uuid, uuid) TO authenticated, service_role;
  END IF;
END $$;

DROP POLICY IF EXISTS community_messenger_rooms_member_policy ON public.community_messenger_rooms;
CREATE POLICY community_messenger_rooms_member_policy
  ON public.community_messenger_rooms
  FOR ALL
  USING (public.cm_can_access_messenger_room(id))
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS community_messenger_messages_member_policy ON public.community_messenger_messages;
CREATE POLICY community_messenger_messages_member_policy
  ON public.community_messenger_messages
  FOR ALL
  USING (public.cm_can_access_messenger_room(room_id))
  WITH CHECK (public.cm_can_access_messenger_room(room_id));
