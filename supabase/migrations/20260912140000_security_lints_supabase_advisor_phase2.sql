-- Supabase Security Advisor WARN (splinter export ckdosyydvgzqwpbwuhon) phase 2
--
-- P0: anon + SECURITY DEFINER RPC 차단
--   - confirm_dibay_id: service_role only (API 경유)
--   - community_messenger_send_text_message: anon REVOKE + auth.uid() = p_sender_id 가드
-- P1: PUBLIC EXECUTE 상속 제거 (모든 대상 함수)
-- P2: posts_mask_reserved_buyer_id — posts_masked 뷰 계약상 anon EXECUTE 유지 (lint 잔존 가능)
--     home_sync_* / is_*_admin — authenticated 유지 (클라·RLS 계약, lint 잔존 가능)
--
-- auth_leaked_password_protection: Dashboard 수동 설정 (migration 범위 밖)

BEGIN;

-- ---------------------------------------------------------------------------
-- confirm_dibay_id — service_role 전용 + 본문 가드 (권한 누수 방어)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_dibay_id(
  p_user_id uuid,
  p_dibay_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized text;
  v_row public.profiles%ROWTYPE;
  v_terms_version text := '2026-04-store-review';
  v_privacy_version text := '2026-04-store-review';
  v_now timestamptz := now();
BEGIN
  IF (SELECT auth.role()) <> 'service_role' THEN
    IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
    END IF;
  END IF;

  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_id_required');
  END IF;

  v_normalized := lower(btrim(replace(COALESCE(p_dibay_id, ''), '@', '')));
  IF v_normalized = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_required');
  END IF;

  IF v_normalized !~ '^[a-z0-9](?:[a-z0-9_.]{2,18}[a-z0-9])$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_invalid_format');
  END IF;

  IF v_normalized IN (
    'admin', 'administrator', 'support', 'owner', 'system', 'official',
    'staff', 'root', 'mod', 'help', 'dibay', 'samarket'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_reserved');
  END IF;

  IF v_normalized ~ '^dibay_[a-f0-9]{6}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_reserved_pattern');
  END IF;

  SELECT * INTO v_row FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_missing');
  END IF;

  IF v_row.dibay_id_locked = true AND v_row.dibay_id IS NOT NULL AND btrim(v_row.dibay_id) <> '' THEN
    IF lower(btrim(v_row.dibay_id)) = v_normalized THEN
      RETURN jsonb_build_object('ok', true, 'dibay_id', lower(btrim(v_row.dibay_id)), 'idempotent', true);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_already_locked');
  END IF;

  IF v_row.terms_accepted_at IS NULL
    OR v_row.privacy_accepted_at IS NULL
    OR v_row.terms_version IS DISTINCT FROM v_terms_version
    OR v_row.privacy_version IS DISTINCT FROM v_privacy_version
  THEN
    RETURN jsonb_build_object('ok', false, 'error', 'terms_required');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE lower(btrim(p.dibay_id)) = v_normalized
      AND p.id <> p_user_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_taken');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE lower(btrim(p.username)) = v_normalized
      AND p.id <> p_user_id
      AND p.username_confirmed = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_taken');
  END IF;

  UPDATE public.profiles
  SET
    dibay_id = v_normalized,
    dibay_id_locked = true,
    username = v_normalized,
    username_confirmed = true,
    username_set_at = COALESCE(username_set_at, v_now),
    onboarding_status = 'completed',
    onboarding_completed_at = COALESCE(onboarding_completed_at, v_now),
    updated_at = v_now
  WHERE id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'dibay_id', v_normalized);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_taken');
END;
$$;

COMMENT ON FUNCTION public.confirm_dibay_id(uuid, text) IS
  'DIBAY ID 확정 — service_role API 전용. anon/authenticated RPC 금지.';

-- ---------------------------------------------------------------------------
-- community_messenger_send_text_message — sender 위조 차단 (auth.uid 가드)
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
  WHERE r.id = p_room_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_found');
  END IF;

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

      SELECT coalesce(
        to_jsonb(coalesce(array_agg(user_id::text ORDER BY user_id), array[]::text[])),
        '[]'::jsonb
      )
        INTO v_recipients
      FROM public.community_messenger_participants
      WHERE room_id = p_room_id AND user_id <> p_sender_id;

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
      ELSE NULL
    END,
    last_read_message_id = CASE
      WHEN p.user_id = p_sender_id THEN v_msg.id
      ELSE p.last_read_message_id
    END
  WHERE p.room_id = p_room_id;

  SELECT coalesce(
    to_jsonb(coalesce(array_agg(user_id::text ORDER BY user_id), array[]::text[])),
    '[]'::jsonb
  )
    INTO v_recipients
  FROM public.community_messenger_participants
  WHERE room_id = p_room_id AND user_id <> p_sender_id;

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
  'CM 텍스트 전송 — auth.uid()=p_sender_id 또는 service_role. anon RPC 금지.';

-- ---------------------------------------------------------------------------
-- EXECUTE 권한 정리 (PUBLIC 상속 제거)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  v_grant_authenticated boolean;
  v_grant_anon boolean;
BEGIN
  FOR r IN
    SELECT *
    FROM (
      VALUES
        ('confirm_dibay_id(uuid, text)', false, false),
        (
          'community_messenger_send_text_message(uuid, uuid, text, text, timestamp with time zone, uuid)',
          true,
          false
        ),
        ('posts_mask_reserved_buyer_id(uuid)', true, true),
        ('home_sync_direct_keys_critical_bundle(uuid[], uuid[])', true, false),
        ('home_sync_direct_keys_item_trade_rows(uuid[])', true, false),
        ('is_platform_admin(uuid)', true, false),
        ('is_admin_user()', true, false)
    ) AS t(sig, grant_authenticated, grant_anon)
  LOOP
    IF to_regprocedure('public.' || r.sig) IS NULL THEN
      CONTINUE;
    END IF;

    v_grant_authenticated := r.grant_authenticated;
    v_grant_anon := r.grant_anon;

    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM anon', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM authenticated', r.sig);

    IF v_grant_anon THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO anon', r.sig);
    END IF;
    IF v_grant_authenticated THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', r.sig);
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', r.sig);
  END LOOP;
END $$;

COMMIT;
