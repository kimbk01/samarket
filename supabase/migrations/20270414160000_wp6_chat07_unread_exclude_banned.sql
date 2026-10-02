-- WP-6 / CHAT-07 (forward-fix) — unread 증가에서 ban 멤버 제외
--
-- 저장 카운터가 ban 된 그룹 멤버도 +1 해 unread 가 어긋났다(활성 2,951명 중 165명).
-- 두 전송 RPC 의 unread_count 증가 분기에서 ban 멤버는 값을 유지(미증가)하도록 통일.
-- (counts_as_unread 반영은 append RPC 가 이미 처리.) 165명 1회 재동기화 + 백업은
-- gated(별도 Owner 승인·dry-run). 정의는 현행 prod 정의에 unread CASE 한 곳만 수정.

BEGIN;

CREATE OR REPLACE FUNCTION public.community_messenger_send_text_message(p_room_id uuid, p_sender_id uuid, p_content text, p_client_message_id text DEFAULT NULL::text, p_created_at timestamp with time zone DEFAULT now(), p_reply_to_message_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      (
        r.room_type IN ('private_group', 'open_group')
        AND p.left_at IS NULL
        AND NOT COALESCE(public.cm_group_is_user_banned(r.id, p_sender_id), false)
      )
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

  -- CHAT-01 (Owner LOCK 01): 완료/취소된 주문 채팅은 새 메시지 차단.
  IF public.cm_store_order_room_is_terminal(p_room_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_order_chat_closed');
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

  -- CHAT-08: last_message_at forward-only. 더 과거 메시지는 미리보기를 덮지 않는다.
  UPDATE public.community_messenger_rooms
  SET
    last_message = CASE WHEN p_created_at >= COALESCE(last_message_at, p_created_at) THEN trim(p_content) ELSE last_message END,
    last_message_at = GREATEST(COALESCE(last_message_at, p_created_at), p_created_at),
    last_message_type = CASE WHEN p_created_at >= COALESCE(last_message_at, p_created_at) THEN 'text' ELSE last_message_type END,
    updated_at = p_created_at
  WHERE id = p_room_id;

  UPDATE public.community_messenger_participants p
  SET
    unread_count = CASE
      WHEN p.user_id = p_sender_id THEN 0
      WHEN NOT COALESCE(public.cm_group_is_user_banned(p_room_id, p.user_id), false) THEN coalesce(p.unread_count, 0) + 1
      ELSE p.unread_count
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
EXCEPTION
  WHEN unique_violation THEN
    -- CHAT-04: 동시 2중 제출 경쟁 → 먼저 커밋된 행을 deduped 성공으로 반환.
    IF v_trim_client IS NOT NULL THEN
      SELECT * INTO v_msg
      FROM public.community_messenger_messages m
      WHERE m.room_id = p_room_id
        AND m.sender_id = p_sender_id
        AND m.metadata->>'client_message_id' = v_trim_client
      ORDER BY m.created_at DESC
      LIMIT 1;
      IF FOUND THEN
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
    RETURN jsonb_build_object('ok', false, 'error', 'unique_violation');
END;
$function$;

CREATE OR REPLACE FUNCTION public.dibay_append_room_message_atomic(p_idempotency_key text, p_room_id uuid, p_chat_domain text, p_domain_identity_key text, p_sender_id uuid, p_sender_role text, p_message_type text, p_content text, p_metadata jsonb DEFAULT '{}'::jsonb, p_created_at timestamp with time zone DEFAULT now(), p_counts_as_unread boolean DEFAULT true, p_client_message_id text DEFAULT NULL::text, p_force_null_message_sender boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_msg_type text;
BEGIN
  v_idem := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  IF v_idem IS NULL OR p_room_id IS NULL OR p_sender_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_args');
  END IF;

  v_msg_type := coalesce(nullif(btrim(p_message_type), ''), 'text');
  IF coalesce(p_force_null_message_sender, false) AND v_msg_type IS DISTINCT FROM 'system' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'null_sender_forbidden');
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

  -- CHAT-01 (Owner LOCK 01): 완료/취소된 store_order 방에서 사용자 콘텐츠 차단.
  -- system(상태 안내)·call_stub(통화 기록)은 이벤트 기록이므로 허용.
  IF v_msg_type NOT IN ('system', 'call_stub')
     AND public.cm_store_order_room_is_terminal(p_room_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_order_chat_closed');
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
    v_msg_type,
    coalesce(p_content, ''),
    v_meta,
    coalesce(p_created_at, now())
  )
  RETURNING * INTO v_msg;

  v_preview := CASE v_msg.message_type
    WHEN 'image' THEN '사진'
    WHEN 'file' THEN left(
      nullif(btrim(coalesce(v_msg.metadata->>'fileName', '')), ''),
      200
    )
    ELSE left(trim(coalesce(v_msg.content, '')), 200)
  END;
  IF v_msg.message_type = 'file' AND (v_preview IS NULL OR btrim(v_preview) = '') THEN
    v_preview := '파일';
  END IF;

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
        WHEN NOT COALESCE(public.cm_group_is_user_banned(p_room_id, p.user_id), false) THEN coalesce(p.unread_count, 0) + 1
        ELSE p.unread_count
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
  WHEN unique_violation THEN
    -- CHAT-04: 동시 2중 제출 경쟁 → 먼저 커밋된 행을 deduped 성공으로 반환.
    IF v_trim_client IS NOT NULL THEN
      SELECT * INTO v_msg
      FROM public.community_messenger_messages m
      WHERE m.room_id = p_room_id
        AND m.sender_id IS NOT DISTINCT FROM CASE
          WHEN coalesce(p_force_null_message_sender, false) THEN NULL
          ELSE p_sender_id
        END
        AND m.metadata->>'client_message_id' = v_trim_client
      ORDER BY m.created_at DESC
      LIMIT 1;
      IF FOUND THEN
        SELECT coalesce(to_jsonb(coalesce(array_agg(user_id::text ORDER BY user_id), ARRAY[]::text[])), '[]'::jsonb)
          INTO v_recipients
        FROM public.community_messenger_participants
        WHERE room_id = p_room_id AND user_id <> p_sender_id AND left_at IS NULL;
        RETURN jsonb_build_object(
          'ok', true,
          'deduped', true,
          'message', to_jsonb(v_msg),
          'recipient_user_ids', coalesce(v_recipients, '[]'::jsonb),
          'authority', 'room_unread_v1'
        );
      END IF;
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'unique_violation', 'rolledBack', true);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'rolledBack', true);
END;
$function$;

COMMIT;
