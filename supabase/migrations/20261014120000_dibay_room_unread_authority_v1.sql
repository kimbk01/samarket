-- DIBAY Room Unread Authority v1 — PARTIAL REBUILD
-- Verdict: ROOM UNREAD PARTIAL REBUILD REQUIRED
-- DO NOT: wire Phase 8B dibay_*_atomic_mark_read · counter-only heal · FULL notification rebuild
--
-- Authority = stable cursor (last_read_message_id) + ordering (created_at, id)
-- Projection = community_messenger_participants.unread_count
--
-- RPCs:
--   dibay_cm_canonical_unread_count  (helper)
--   dibay_mark_room_read_atomic      (all domains incl. store_order)
--   dibay_append_room_message_atomic (typed append + unread projection)
-- Also:
--   community_messenger_apply_unread_for_text_message — stop recipient last_read_at wipe
--   community_messenger_send_text_message — stop recipient last_read_at wipe (participant UPDATE only)

-- ---------------------------------------------------------------------------
-- Idempotency
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dibay_room_unread_idempotency (
  user_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  op text NOT NULL CHECK (op IN ('mark_read', 'append')),
  room_id uuid NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, idempotency_key)
);

COMMENT ON TABLE public.dibay_room_unread_idempotency IS
  'Room Unread Authority v1: append/mark-read idempotency. Phase 8B table remains quarantined.';

CREATE INDEX IF NOT EXISTS dibay_room_unread_idempotency_room_idx
  ON public.dibay_room_unread_idempotency (room_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Canonical unread count (cursor Authority → projection number)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dibay_cm_canonical_unread_count(
  p_room_id uuid,
  p_viewer_id uuid
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cursor_id uuid;
  v_cursor_at timestamptz;
  v_joined_at timestamptz;
  v_left_at timestamptz;
  v_count int;
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
    AND (v_joined_at IS NULL OR m.created_at >= v_joined_at)
    AND (
      v_cursor_id IS NULL
      OR v_cursor_at IS NULL
      OR m.created_at > v_cursor_at
      OR (m.created_at = v_cursor_at AND m.id > v_cursor_id)
    );

  RETURN coalesce(v_count, 0);
END;
$$;

COMMENT ON FUNCTION public.dibay_cm_canonical_unread_count(uuid, uuid) IS
  'Room Unread Authority: count peer messages after stable cursor (created_at, id).';

REVOKE ALL ON FUNCTION public.dibay_cm_canonical_unread_count(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dibay_cm_canonical_unread_count(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Fix legacy apply_unread: NEVER wipe recipient last_read_at / last_read_message_id
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_messenger_apply_unread_for_text_message(
  p_room_id uuid,
  p_sender_id uuid,
  p_read_at timestamptz
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  UPDATE public.community_messenger_participants p
  SET
    unread_count = CASE
      WHEN p.user_id = p_sender_id THEN 0
      ELSE coalesce(p.unread_count, 0) + 1
    END,
    last_read_at = CASE
      WHEN p.user_id = p_sender_id THEN p_read_at
      ELSE p.last_read_at
    END,
    last_read_message_id = CASE
      WHEN p.user_id = p_sender_id THEN p.last_read_message_id
      ELSE p.last_read_message_id
    END
  WHERE p.room_id = p_room_id
    AND (p.left_at IS NULL);
$$;

COMMENT ON FUNCTION public.community_messenger_apply_unread_for_text_message(uuid, uuid, timestamptz) IS
  'Room Unread v1: sender unread=0; recipient +1; recipient cursor PRESERVED (no last_read_at wipe).';

-- ---------------------------------------------------------------------------
-- Mark read atomic (all domains)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dibay_mark_room_read_atomic(
  p_viewer_id uuid,
  p_room_id uuid,
  p_chat_domain text,
  p_domain_identity_key text,
  p_viewer_role text,
  p_store_id uuid DEFAULT NULL,
  p_order_id uuid DEFAULT NULL,
  p_read_through_message_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := (SELECT auth.role());
  v_uid uuid := auth.uid();
  v_room_domain text;
  v_room_identity text;
  v_room_deleted timestamptz;
  v_part_id uuid;
  v_existing_cursor uuid;
  v_existing_at timestamptz;
  v_existing_unread int;
  v_left_at timestamptz;
  v_through_id uuid;
  v_through_at timestamptz;
  v_cursor_at timestamptz;
  v_now timestamptz := now();
  v_unread int;
  v_advanced boolean := false;
  v_idem text;
  v_prev jsonb;
  v_cleared_events int := 0;
  v_cleared_targets int := 0;
  v_order_store uuid;
  v_buyer uuid;
  v_owner uuid;
  v_result jsonb;
BEGIN
  IF p_viewer_id IS NULL OR p_room_id IS NULL
     OR nullif(btrim(p_chat_domain), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_args');
  END IF;

  IF v_role IS DISTINCT FROM 'service_role' THEN
    IF v_uid IS NULL OR v_uid IS DISTINCT FROM p_viewer_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
    END IF;
  END IF;

  v_idem := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  IF v_idem IS NOT NULL THEN
    SELECT i.result INTO v_prev
    FROM public.dibay_room_unread_idempotency i
    WHERE i.user_id = p_viewer_id AND i.idempotency_key = v_idem;
    IF FOUND THEN
      RETURN v_prev;
    END IF;
  END IF;

  SELECT r.chat_domain, r.domain_identity_key, r.deleted_at
    INTO v_room_domain, v_room_identity, v_room_deleted
  FROM public.community_messenger_rooms r
  WHERE r.id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_found');
  END IF;
  IF v_room_deleted IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_deleted');
  END IF;
  IF v_room_domain IS DISTINCT FROM btrim(p_chat_domain) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'domain_mismatch');
  END IF;
  IF nullif(btrim(p_domain_identity_key), '') IS NOT NULL
     AND v_room_identity IS DISTINCT FROM btrim(p_domain_identity_key) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'identity_mismatch');
  END IF;

  -- store_order role / store scope
  IF p_chat_domain = 'store_order' THEN
    IF p_viewer_role NOT IN ('customer', 'owner') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'surface_role');
    END IF;
    IF p_order_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'order_required');
    END IF;

    SELECT so.store_id, so.buyer_user_id, st.owner_user_id
      INTO v_order_store, v_buyer, v_owner
    FROM public.store_orders so
    INNER JOIN public.stores st ON st.id = so.store_id
    WHERE so.id = p_order_id
      AND so.community_messenger_room_id = p_room_id
    FOR UPDATE OF so;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
    END IF;
    IF p_store_id IS NOT NULL AND v_order_store IS DISTINCT FROM p_store_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'store_mismatch');
    END IF;
    IF p_viewer_role = 'customer' AND p_viewer_id IS DISTINCT FROM v_buyer THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_buyer');
    END IF;
    IF p_viewer_role = 'owner' AND p_viewer_id IS DISTINCT FROM v_owner THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_owner');
    END IF;
  END IF;

  SELECT p.id, p.last_read_message_id, p.last_read_at, coalesce(p.unread_count, 0), p.left_at
    INTO v_part_id, v_existing_cursor, v_existing_at, v_existing_unread, v_left_at
  FROM public.community_messenger_participants p
  WHERE p.room_id = p_room_id AND p.user_id = p_viewer_id
  FOR UPDATE;

  IF v_part_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_member');
  END IF;
  IF v_left_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'participant_left');
  END IF;

  -- resolve through message (open → tail)
  IF p_read_through_message_id IS NOT NULL THEN
    SELECT m.id, m.created_at INTO v_through_id, v_through_at
    FROM public.community_messenger_messages m
    WHERE m.id = p_read_through_message_id
      AND m.room_id = p_room_id
      AND m.deleted_at IS NULL;
    IF v_through_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'through_not_found');
    END IF;
  ELSE
    SELECT m.id, m.created_at INTO v_through_id, v_through_at
    FROM public.community_messenger_messages m
    WHERE m.room_id = p_room_id AND m.deleted_at IS NULL
    ORDER BY m.created_at DESC NULLS LAST, m.id DESC NULLS LAST
    LIMIT 1;
  END IF;

  -- monotonic: refuse cursor regression
  IF v_existing_cursor IS NOT NULL AND v_through_id IS NOT NULL THEN
    SELECT m.created_at INTO v_cursor_at
    FROM public.community_messenger_messages m
    WHERE m.id = v_existing_cursor AND m.room_id = p_room_id;
    IF v_cursor_at IS NOT NULL AND v_through_at IS NOT NULL THEN
      IF v_through_at < v_cursor_at
         OR (v_through_at = v_cursor_at AND v_through_id < v_existing_cursor) THEN
        RETURN jsonb_build_object(
          'ok', true,
          'duplicateSkipped', true,
          'regressionBlocked', true,
          'lastReadAdvanced', false,
          'lastReadMessageId', v_existing_cursor,
          'lastReadAt', coalesce(v_existing_at, v_now),
          'unreadCount', v_existing_unread,
          'participantId', v_part_id
        );
      END IF;
    END IF;
  END IF;

  -- duplicate: already at through with unread 0
  IF v_existing_unread = 0
     AND v_through_id IS NOT NULL
     AND v_existing_cursor IS NOT DISTINCT FROM v_through_id THEN
    v_result := jsonb_build_object(
      'ok', true,
      'duplicateSkipped', true,
      'lastReadAdvanced', false,
      'lastReadMessageId', v_existing_cursor,
      'lastReadAt', coalesce(v_existing_at, v_now),
      'unreadCount', 0,
      'participantId', v_part_id,
      'clearedEventCount', 0,
      'clearedTargetCount', 0
    );
    IF v_idem IS NOT NULL THEN
      INSERT INTO public.dibay_room_unread_idempotency (user_id, idempotency_key, op, room_id, result)
      VALUES (p_viewer_id, v_idem, 'mark_read', p_room_id, v_result)
      ON CONFLICT DO NOTHING;
    END IF;
    RETURN v_result;
  END IF;

  -- message_reads through cursor (peer messages only)
  IF v_through_id IS NOT NULL THEN
    INSERT INTO public.community_messenger_message_reads (message_id, reader_user_id, read_at)
    SELECT m.id, p_viewer_id, v_now
    FROM public.community_messenger_messages m
    WHERE m.room_id = p_room_id
      AND m.deleted_at IS NULL
      AND m.sender_id IS DISTINCT FROM p_viewer_id
      AND (
        m.created_at < v_through_at
        OR (m.created_at = v_through_at AND m.id <= v_through_id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.community_messenger_message_reads r
        WHERE r.message_id = m.id AND r.reader_user_id = p_viewer_id
      )
    ON CONFLICT DO NOTHING;
  END IF;

  -- advance cursor then recount from Authority formula
  UPDATE public.community_messenger_participants p
  SET
    last_read_message_id = coalesce(v_through_id, p.last_read_message_id),
    last_read_at = v_now
  WHERE p.room_id = p_room_id AND p.user_id = p_viewer_id;

  v_unread := public.dibay_cm_canonical_unread_count(p_room_id, p_viewer_id);

  UPDATE public.community_messenger_participants p
  SET unread_count = coalesce(v_unread, 0)
  WHERE p.room_id = p_room_id AND p.user_id = p_viewer_id;

  v_advanced := true;

  -- room message notification events
  UPDATE public.notification_events e
  SET unread = false, read_at = v_now, opened_at = coalesce(e.opened_at, v_now)
  WHERE e.user_id = p_viewer_id
    AND e.unread = true
    AND e.read_at IS NULL
    AND e.chat_domain = p_chat_domain
    AND (
      e.room_id = p_room_id
      OR (
        nullif(btrim(p_domain_identity_key), '') IS NOT NULL
        AND e.domain_identity_key = btrim(p_domain_identity_key)
      )
    );
  GET DIAGNOSTICS v_cleared_events = ROW_COUNT;

  -- derived targets (not Authority)
  IF p_chat_domain = 'store_order' THEN
    UPDATE public.notification_targets nt
    SET is_unread = false, last_read_at = v_now, updated_at = v_now
    WHERE nt.user_id = p_viewer_id
      AND nt.is_unread = true
      AND (
        (p_viewer_role = 'customer' AND nt.target_type = 'buyer_order' AND nt.target_id = p_order_id::text)
        OR (p_viewer_role = 'owner' AND nt.target_type = 'owner_order_chat' AND nt.target_id = p_room_id::text
            AND (nt.store_id IS NULL OR nt.store_id = coalesce(p_store_id, v_order_store)))
        OR (nt.target_type = 'chat_room' AND nt.target_id = p_room_id::text AND nt.chat_domain = 'store_order')
      );
    GET DIAGNOSTICS v_cleared_targets = ROW_COUNT;
  ELSIF p_chat_domain = 'trade' THEN
    UPDATE public.notification_targets nt
    SET is_unread = false, last_read_at = v_now, updated_at = v_now
    WHERE nt.user_id = p_viewer_id
      AND nt.is_unread = true
      AND nt.chat_domain = 'trade'
      AND (
        (nt.target_type = 'chat_room' AND nt.target_id = p_room_id::text)
        OR (
          nullif(btrim(p_domain_identity_key), '') IS NOT NULL
          AND nt.domain_identity_key = btrim(p_domain_identity_key)
        )
      );
    GET DIAGNOSTICS v_cleared_targets = ROW_COUNT;
  ELSE
    UPDATE public.notification_targets nt
    SET is_unread = false, last_read_at = v_now, updated_at = v_now
    WHERE nt.user_id = p_viewer_id
      AND nt.is_unread = true
      AND nt.target_type = 'chat_room'
      AND nt.target_id = p_room_id::text;
    GET DIAGNOSTICS v_cleared_targets = ROW_COUNT;
  END IF;

  v_result := jsonb_build_object(
    'ok', true,
    'duplicateSkipped', false,
    'lastReadAdvanced', v_advanced,
    'lastReadMessageId', v_through_id,
    'lastReadAt', v_now,
    'unreadCount', coalesce(v_unread, 0),
    'participantId', v_part_id,
    'clearedEventCount', v_cleared_events,
    'clearedTargetCount', v_cleared_targets,
    'authority', 'room_unread_v1'
  );

  IF v_idem IS NOT NULL THEN
    INSERT INTO public.dibay_room_unread_idempotency (user_id, idempotency_key, op, room_id, result)
    VALUES (p_viewer_id, v_idem, 'mark_read', p_room_id, v_result)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'rolledBack', true);
END;
$$;

COMMENT ON FUNCTION public.dibay_mark_room_read_atomic(
  uuid, uuid, text, text, text, uuid, uuid, uuid, text
) IS
  'Room Unread Authority v1: single mark-read TX — cursor + message_reads + projection + events + targets.';

REVOKE ALL ON FUNCTION public.dibay_mark_room_read_atomic(
  uuid, uuid, text, text, text, uuid, uuid, uuid, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dibay_mark_room_read_atomic(
  uuid, uuid, text, text, text, uuid, uuid, uuid, text
) TO service_role;

-- ---------------------------------------------------------------------------
-- Append room message atomic (typed; unread projection in same TX)
-- ---------------------------------------------------------------------------
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
  p_client_message_id text DEFAULT NULL
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
      AND m.sender_id = p_sender_id
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

  INSERT INTO public.community_messenger_messages (
    room_id, sender_id, message_type, content, metadata, created_at
  ) VALUES (
    p_room_id,
    p_sender_id,
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

  -- Unread projection: sender 0 + advance own cursor; recipients +1 WITHOUT wiping cursor
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
  text, uuid, text, text, uuid, text, text, text, jsonb, timestamptz, boolean, text
) IS
  'Room Unread Authority v1: message insert + recipient unread projection in one TX; recipient cursor preserved.';

REVOKE ALL ON FUNCTION public.dibay_append_room_message_atomic(
  text, uuid, text, text, uuid, text, text, text, jsonb, timestamptz, boolean, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dibay_append_room_message_atomic(
  text, uuid, text, text, uuid, text, text, text, jsonb, timestamptz, boolean, text
) TO service_role;
