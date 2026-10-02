-- WP-6 / CHAT-01(Owner LOCK 01) + CHAT-08 — community_messenger_send_text_message 보강
--
-- CHAT-01: 완료(completed)·취소(cancelled)된 store_order 채팅방에서 새 메시지 차단.
--   정확 문구(클라 배너/서버 오류코드): "완료되거나 취소된 주문에서는 새 메시지를 보낼 수 없습니다."
--   오류코드: store_order_chat_closed. 대상 prod: completed 510 · cancelled 149 방.
--   system 안내 라인은 이 RPC 를 거치지 않으므로 영향 없음(별도 insert).
-- CHAT-08: last_message_at 을 무조건 덮어 call_stub 이 통화 중 메시지를 가리던 문제 →
--   forward-only(GREATEST) 로 바꾸고, 더 과거면 last_message/type 도 덮지 않음.
--
-- 주의: 이 RPC 는 전체 텍스트 전송 핫패스다. 아래 정의는 prod 현행 정의에 CHAT-01/08 두 블록만
--   추가/수정한 것이며, 배포 전 CI/리뷰로 검증한다(본 PR 은 apply-gated).

BEGIN;

-- Owner LOCK 01 종료 판정 함수 (completed/cancelled)
CREATE OR REPLACE FUNCTION public.cm_store_order_room_is_terminal(p_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.store_orders o
    WHERE o.community_messenger_room_id = p_room_id
      AND lower(trim(o.order_status)) IN ('completed', 'cancelled')
  );
$fn$;

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
$function$;

COMMIT;
