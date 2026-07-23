-- Phase 8B D1-1 — Domain Atomic Mark Read RPCs (parallel deploy; production route wiring NOT enabled).
-- Domains: general_direct / group / trade → dibay_messenger_domain_atomic_mark_read
-- Domain: store_order → dibay_store_order_atomic_mark_read (separate; do NOT fold into CM RPC)
-- SECURITY DEFINER + fixed search_path. auth.uid() must match p_user_id (or service_role).
-- Rollback (수동 전용, migrations runner 대상 아님):
--   supabase/rollback/20261005120000_dibay_messenger_domain_atomic_mark_read.rollback.sql
--   docs: supabase/rollback/README.md

ALTER TABLE public.community_messenger_participants
  ADD COLUMN IF NOT EXISTS mark_read_generation bigint NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.dibay_domain_mark_read_idempotency (
  user_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  chat_domain text NOT NULL,
  room_id uuid NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, idempotency_key),
  CONSTRAINT dibay_domain_mark_read_idempotency_domain_check CHECK (
    chat_domain IN ('general_direct', 'group', 'trade', 'store_order')
  )
);

COMMENT ON TABLE public.dibay_domain_mark_read_idempotency IS
  'Phase 8B D1-1: mark-read idempotency store. Production route wiring still OFF.';

CREATE OR REPLACE FUNCTION public.dibay_messenger_domain_atomic_mark_read(
  p_user_id uuid,
  p_room_id uuid,
  p_chat_domain text,
  p_domain_identity_key text,
  p_generation bigint,
  p_last_read_message_id uuid,
  p_idempotency_key text
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
  v_part_gen bigint;
  v_prev jsonb;
  v_cleared_targets int := 0;
  v_cleared_events int := 0;
  v_remaining_msg int := 0;
  v_remaining_rooms int := 0;
  v_remaining_domain_events int := 0;
  v_remaining_global_events int := 0;
  v_result jsonb;
BEGIN
  IF p_chat_domain NOT IN ('general_direct', 'group', 'trade') THEN
    RETURN jsonb_build_object(
      'status', 'domain_mismatch',
      'reason', 'cm_rpc_forbids_store_order',
      'rolledBack', true
    );
  END IF;

  IF v_role IS DISTINCT FROM 'service_role' THEN
    IF v_uid IS NULL OR v_uid IS DISTINCT FROM p_user_id THEN
      RETURN jsonb_build_object(
        'status', 'forbidden',
        'reason', 'auth_uid_mismatch',
        'rolledBack', true
      );
    END IF;
  END IF;

  IF p_user_id IS NULL OR p_room_id IS NULL
     OR nullif(btrim(p_chat_domain), '') IS NULL
     OR nullif(btrim(p_domain_identity_key), '') IS NULL
     OR nullif(btrim(p_idempotency_key), '') IS NULL
     OR p_generation IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'forbidden',
      'reason', 'required_args',
      'rolledBack', true
    );
  END IF;

  IF btrim(p_domain_identity_key) NOT LIKE p_chat_domain || ':%' THEN
    RETURN jsonb_build_object(
      'status', 'identity_mismatch',
      'reason', 'identity_prefix',
      'rolledBack', true
    );
  END IF;

  SELECT i.result INTO v_prev
  FROM public.dibay_domain_mark_read_idempotency AS i
  WHERE i.user_id = p_user_id AND i.idempotency_key = btrim(p_idempotency_key);
  IF FOUND THEN
    RETURN v_prev;
  END IF;

  SELECT r.chat_domain, r.domain_identity_key
  INTO v_room_domain, v_room_identity
  FROM public.community_messenger_rooms AS r
  WHERE r.id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'forbidden',
      'reason', 'room_not_found',
      'rolledBack', true
    );
  END IF;

  IF v_room_domain IS DISTINCT FROM p_chat_domain THEN
    RETURN jsonb_build_object(
      'status', 'domain_mismatch',
      'reason', 'stored_chat_domain',
      'rolledBack', true
    );
  END IF;

  IF v_room_identity IS DISTINCT FROM btrim(p_domain_identity_key) THEN
    RETURN jsonb_build_object(
      'status', 'identity_mismatch',
      'reason', 'stored_identity',
      'rolledBack', true
    );
  END IF;

  SELECT p.mark_read_generation
  INTO v_part_gen
  FROM public.community_messenger_participants AS p
  WHERE p.room_id = p_room_id AND p.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'forbidden',
      'reason', 'not_participant',
      'rolledBack', true
    );
  END IF;

  IF p_generation < coalesce(v_part_gen, 0) THEN
    RETURN jsonb_build_object(
      'status', 'stale',
      'reason', 'stale_generation',
      'currentGeneration', coalesce(v_part_gen, 0),
      'incomingGeneration', p_generation,
      'rolledBack', true
    );
  END IF;

  -- 1) participant cursor / unread
  UPDATE public.community_messenger_participants AS p
  SET
    unread_count = 0,
    last_read_at = now(),
    last_read_message_id = coalesce(p_last_read_message_id, p.last_read_message_id),
    mark_read_generation = p_generation
  WHERE p.room_id = p_room_id AND p.user_id = p_user_id;

  -- 2) notification_targets — Domain + identity scoped (trade must NOT clear other identities)
  -- REQUIRED: user_id + chat_domain + domain_identity_key + viewer scope
  -- trade: target_type='trade' alone is FORBIDDEN without identical domain_identity_key
  UPDATE public.notification_targets AS nt
  SET is_unread = false, last_read_at = now(), updated_at = now()
  WHERE nt.user_id = p_user_id
    AND nt.is_unread = true
    AND nt.chat_domain = p_chat_domain
    AND nt.domain_identity_key = btrim(p_domain_identity_key)
    AND nt.scope IN ('consumer', 'user', 'member')
    AND (
      (nt.target_type = 'chat_room' AND nt.target_id = p_room_id::text)
      OR (
        p_chat_domain = 'trade'
        AND nt.target_type = 'trade'
        AND nt.domain_identity_key = btrim(p_domain_identity_key)
      )
    );
  GET DIAGNOSTICS v_cleared_targets = ROW_COUNT;

  -- 3) notification_events — same Domain + room OR matching identity only
  UPDATE public.notification_events AS e
  SET unread = false, read_at = now()
  WHERE e.user_id = p_user_id
    AND e.unread = true
    AND e.read_at IS NULL
    AND e.chat_domain = p_chat_domain
    AND (
      e.room_id = p_room_id
      OR e.domain_identity_key = btrim(p_domain_identity_key)
    );
  GET DIAGNOSTICS v_cleared_events = ROW_COUNT;

  SELECT coalesce(sum(greatest(p.unread_count, 0)), 0)::int,
         count(*) FILTER (WHERE p.unread_count > 0)::int
  INTO v_remaining_msg, v_remaining_rooms
  FROM public.community_messenger_participants AS p
  INNER JOIN public.community_messenger_rooms AS r ON r.id = p.room_id
  WHERE p.user_id = p_user_id
    AND r.chat_domain = p_chat_domain;

  SELECT count(*)::int
  INTO v_remaining_domain_events
  FROM public.notification_events AS e
  WHERE e.user_id = p_user_id
    AND e.unread = true
    AND e.read_at IS NULL
    AND e.chat_domain = p_chat_domain;

  SELECT count(*)::int
  INTO v_remaining_global_events
  FROM public.notification_events AS e
  WHERE e.user_id = p_user_id
    AND e.unread = true
    AND e.read_at IS NULL;

  v_result := jsonb_build_object(
    'status', 'consistent',
    'domain', p_chat_domain,
    'identityKey', btrim(p_domain_identity_key),
    'roomId', p_room_id::text,
    'participantUnreadCount', 0,
    'clearedTargetCount', v_cleared_targets,
    'clearedNotificationEventCount', v_cleared_events,
    'remainingDomainUnreadMessageCount', v_remaining_msg,
    'remainingDomainUnreadRoomCount', v_remaining_rooms,
    'remainingDomainNotificationEventCount', v_remaining_domain_events,
    'remainingGlobalNotificationEventCount', v_remaining_global_events,
    'generation', p_generation,
    'idempotencyKey', btrim(p_idempotency_key)
  );

  INSERT INTO public.dibay_domain_mark_read_idempotency (
    user_id, idempotency_key, chat_domain, room_id, result
  ) VALUES (
    p_user_id, btrim(p_idempotency_key), p_chat_domain, p_room_id, v_result
  );

  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'status', 'rollback',
      'reason', SQLERRM,
      'rolledBack', true
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.dibay_store_order_atomic_mark_read(
  p_user_id uuid,
  p_room_id uuid,
  p_chat_domain text,
  p_domain_identity_key text,
  p_generation bigint,
  p_last_read_message_id uuid,
  p_idempotency_key text,
  p_surface_role text,
  p_order_id uuid,
  p_store_id uuid
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
  v_order_store uuid;
  v_buyer uuid;
  v_owner uuid;
  v_part_gen bigint;
  v_prev jsonb;
  v_cleared_targets int := 0;
  v_cleared_events int := 0;
  v_remaining_msg int := 0;
  v_remaining_rooms int := 0;
  v_remaining_domain_events int := 0;
  v_remaining_global_events int := 0;
  v_result jsonb;
BEGIN
  IF p_chat_domain IS DISTINCT FROM 'store_order' THEN
    RETURN jsonb_build_object(
      'status', 'domain_mismatch',
      'reason', 'store_order_rpc_only',
      'rolledBack', true
    );
  END IF;

  IF p_surface_role NOT IN ('customer', 'owner') THEN
    RETURN jsonb_build_object(
      'status', 'forbidden',
      'reason', 'surface_role',
      'rolledBack', true
    );
  END IF;

  IF v_role IS DISTINCT FROM 'service_role' THEN
    IF v_uid IS NULL OR v_uid IS DISTINCT FROM p_user_id THEN
      RETURN jsonb_build_object(
        'status', 'forbidden',
        'reason', 'auth_uid_mismatch',
        'rolledBack', true
      );
    END IF;
  END IF;

  IF p_user_id IS NULL OR p_room_id IS NULL OR p_order_id IS NULL OR p_store_id IS NULL
     OR nullif(btrim(p_domain_identity_key), '') IS NULL
     OR nullif(btrim(p_idempotency_key), '') IS NULL
     OR p_generation IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'forbidden',
      'reason', 'required_args',
      'rolledBack', true
    );
  END IF;

  IF btrim(p_domain_identity_key) IS DISTINCT FROM ('store_order:' || p_order_id::text) THEN
    RETURN jsonb_build_object(
      'status', 'identity_mismatch',
      'reason', 'order_identity',
      'rolledBack', true
    );
  END IF;

  SELECT i.result INTO v_prev
  FROM public.dibay_domain_mark_read_idempotency AS i
  WHERE i.user_id = p_user_id AND i.idempotency_key = btrim(p_idempotency_key);
  IF FOUND THEN
    RETURN v_prev;
  END IF;

  SELECT so.store_id, so.buyer_user_id, st.owner_user_id
  INTO v_order_store, v_buyer, v_owner
  FROM public.store_orders AS so
  INNER JOIN public.stores AS st ON st.id = so.store_id
  WHERE so.id = p_order_id
    AND so.community_messenger_room_id = p_room_id
  FOR UPDATE OF so;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'forbidden',
      'reason', 'order_not_found',
      'rolledBack', true
    );
  END IF;

  IF v_order_store IS DISTINCT FROM p_store_id THEN
    RETURN jsonb_build_object(
      'status', 'forbidden',
      'reason', 'store_mismatch',
      'rolledBack', true
    );
  END IF;

  IF p_surface_role = 'customer' AND p_user_id IS DISTINCT FROM v_buyer THEN
    RETURN jsonb_build_object(
      'status', 'forbidden',
      'reason', 'not_buyer',
      'rolledBack', true
    );
  END IF;

  IF p_surface_role = 'owner' AND p_user_id IS DISTINCT FROM v_owner THEN
    RETURN jsonb_build_object(
      'status', 'forbidden',
      'reason', 'not_owner',
      'rolledBack', true
    );
  END IF;

  SELECT r.chat_domain, r.domain_identity_key
  INTO v_room_domain, v_room_identity
  FROM public.community_messenger_rooms AS r
  WHERE r.id = p_room_id
  FOR UPDATE;

  IF v_room_domain IS DISTINCT FROM 'store_order'
     OR v_room_identity IS DISTINCT FROM btrim(p_domain_identity_key) THEN
    RETURN jsonb_build_object(
      'status', 'domain_mismatch',
      'reason', 'room_domain_or_identity',
      'rolledBack', true
    );
  END IF;

  SELECT p.mark_read_generation
  INTO v_part_gen
  FROM public.community_messenger_participants AS p
  WHERE p.room_id = p_room_id AND p.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'forbidden',
      'reason', 'not_participant',
      'rolledBack', true
    );
  END IF;

  IF p_generation < coalesce(v_part_gen, 0) THEN
    RETURN jsonb_build_object(
      'status', 'stale',
      'reason', 'stale_generation',
      'currentGeneration', coalesce(v_part_gen, 0),
      'incomingGeneration', p_generation,
      'rolledBack', true
    );
  END IF;

  UPDATE public.community_messenger_participants AS p
  SET
    unread_count = 0,
    last_read_at = now(),
    last_read_message_id = coalesce(p_last_read_message_id, p.last_read_message_id),
    mark_read_generation = p_generation
  WHERE p.room_id = p_room_id AND p.user_id = p_user_id;

  UPDATE public.notification_targets AS nt
  SET is_unread = false, last_read_at = now(), updated_at = now()
  WHERE nt.user_id = p_user_id
    AND nt.is_unread = true
    AND nt.chat_domain = 'store_order'
    AND (
      nt.domain_identity_key = btrim(p_domain_identity_key)
      OR (nt.target_type IN ('buyer_order', 'owner_order_chat') AND nt.target_id = p_order_id::text)
      OR (nt.target_type = 'chat_room' AND nt.target_id = p_room_id::text)
    )
    AND (
      p_surface_role = 'customer'
      OR (p_surface_role = 'owner' AND (nt.store_id IS NULL OR nt.store_id = p_store_id))
    );
  GET DIAGNOSTICS v_cleared_targets = ROW_COUNT;

  UPDATE public.notification_events AS e
  SET unread = false, read_at = now()
  WHERE e.user_id = p_user_id
    AND e.unread = true
    AND e.read_at IS NULL
    AND e.chat_domain = 'store_order'
    AND (
      e.room_id = p_room_id
      OR e.domain_identity_key = btrim(p_domain_identity_key)
    );
  GET DIAGNOSTICS v_cleared_events = ROW_COUNT;

  SELECT coalesce(sum(greatest(p.unread_count, 0)), 0)::int,
         count(*) FILTER (WHERE p.unread_count > 0)::int
  INTO v_remaining_msg, v_remaining_rooms
  FROM public.community_messenger_participants AS p
  INNER JOIN public.community_messenger_rooms AS r ON r.id = p.room_id
  WHERE p.user_id = p_user_id
    AND r.chat_domain = 'store_order';

  SELECT count(*)::int
  INTO v_remaining_domain_events
  FROM public.notification_events AS e
  WHERE e.user_id = p_user_id
    AND e.unread = true
    AND e.read_at IS NULL
    AND e.chat_domain = 'store_order';

  SELECT count(*)::int
  INTO v_remaining_global_events
  FROM public.notification_events AS e
  WHERE e.user_id = p_user_id
    AND e.unread = true
    AND e.read_at IS NULL;

  v_result := jsonb_build_object(
    'status', 'consistent',
    'domain', 'store_order',
    'identityKey', btrim(p_domain_identity_key),
    'roomId', p_room_id::text,
    'surfaceRole', p_surface_role,
    'orderId', p_order_id::text,
    'storeId', p_store_id::text,
    'participantUnreadCount', 0,
    'clearedTargetCount', v_cleared_targets,
    'clearedNotificationEventCount', v_cleared_events,
    'remainingDomainUnreadMessageCount', v_remaining_msg,
    'remainingDomainUnreadRoomCount', v_remaining_rooms,
    'remainingDomainNotificationEventCount', v_remaining_domain_events,
    'remainingGlobalNotificationEventCount', v_remaining_global_events,
    'generation', p_generation,
    'idempotencyKey', btrim(p_idempotency_key)
  );

  INSERT INTO public.dibay_domain_mark_read_idempotency (
    user_id, idempotency_key, chat_domain, room_id, result
  ) VALUES (
    p_user_id, btrim(p_idempotency_key), 'store_order', p_room_id, v_result
  );

  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'status', 'rollback',
      'reason', SQLERRM,
      'rolledBack', true
    );
END;
$$;

REVOKE ALL ON FUNCTION public.dibay_messenger_domain_atomic_mark_read(
  uuid, uuid, text, text, bigint, uuid, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dibay_messenger_domain_atomic_mark_read(
  uuid, uuid, text, text, bigint, uuid, text
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.dibay_store_order_atomic_mark_read(
  uuid, uuid, text, text, bigint, uuid, text, text, uuid, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dibay_store_order_atomic_mark_read(
  uuid, uuid, text, text, bigint, uuid, text, text, uuid, uuid
) TO authenticated, service_role;

COMMENT ON FUNCTION public.dibay_messenger_domain_atomic_mark_read(
  uuid, uuid, text, text, bigint, uuid, text
) IS
  'Phase 8B D1-1: atomic participant+targets+events mark-read for general_direct|group|trade. Production UI wiring OFF.';

COMMENT ON FUNCTION public.dibay_store_order_atomic_mark_read(
  uuid, uuid, text, text, bigint, uuid, text, text, uuid, uuid
) IS
  'Phase 8B D1-1: atomic store_order mark-read with surfaceRole/order/store checks. Separated from CM RPC. Wiring OFF.';
