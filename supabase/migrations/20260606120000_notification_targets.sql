-- Badge SSOT: unread targets (not event log rows).
-- CONTRACT: badge_count = COUNT(notification_targets) WHERE is_unread = true (+ surface filter).

CREATE TABLE IF NOT EXISTS public.notification_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  target_type text NOT NULL,
  target_id text NOT NULL,
  scope text NOT NULL DEFAULT 'consumer',
  store_id uuid NULL REFERENCES public.stores (id) ON DELETE SET NULL,
  is_unread boolean NOT NULL DEFAULT true,
  last_read_at timestamptz NULL,
  last_event_at timestamptz NOT NULL DEFAULT now(),
  meta jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_targets_scope_check CHECK (
    scope IN ('consumer', 'owner_store', 'rider')
  ),
  CONSTRAINT notification_targets_type_check CHECK (
    target_type IN (
      'chat_room',
      'trade',
      'community_post',
      'buyer_order',
      'owner_order',
      'store_review',
      'store_inquiry',
      'owner_order_chat',
      'rider_dispatch',
      'system'
    )
  ),
  CONSTRAINT notification_targets_user_type_id_uidx UNIQUE (user_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_targets_user_unread
  ON public.notification_targets (user_id)
  WHERE is_unread = true;

CREATE INDEX IF NOT EXISTS idx_notification_targets_user_scope_unread
  ON public.notification_targets (user_id, scope)
  WHERE is_unread = true;

CREATE INDEX IF NOT EXISTS idx_notification_targets_user_type_unread
  ON public.notification_targets (user_id, target_type)
  WHERE is_unread = true;

COMMENT ON TABLE public.notification_targets IS
  'Badge SSOT — one row per user+target; is_unread=true counts as 1 badge unit (never sum events/messages).';

-- bump
CREATE OR REPLACE FUNCTION public.upsert_notification_target_unread(
  p_user_id uuid,
  p_target_type text,
  p_target_id text,
  p_scope text DEFAULT 'consumer',
  p_store_id uuid DEFAULT NULL,
  p_meta jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR btrim(coalesce(p_target_type, '')) = '' OR btrim(coalesce(p_target_id, '')) = '' THEN
    RETURN;
  END IF;
  INSERT INTO public.notification_targets AS nt (
    user_id,
    target_type,
    target_id,
    scope,
    store_id,
    is_unread,
    last_event_at,
    meta,
    updated_at
  )
  VALUES (
    p_user_id,
    btrim(p_target_type),
    btrim(p_target_id),
    CASE
      WHEN btrim(coalesce(p_scope, '')) IN ('consumer', 'owner_store', 'rider') THEN btrim(p_scope)
      ELSE 'consumer'
    END,
    p_store_id,
    true,
    now(),
    p_meta,
    now()
  )
  ON CONFLICT (user_id, target_type, target_id) DO UPDATE SET
    is_unread = true,
    last_event_at = now(),
    scope = EXCLUDED.scope,
    store_id = COALESCE(EXCLUDED.store_id, nt.store_id),
    meta = COALESCE(EXCLUDED.meta, nt.meta),
    updated_at = now();
END;
$$;

-- clear
CREATE OR REPLACE FUNCTION public.clear_notification_target(
  p_user_id uuid,
  p_target_type text,
  p_target_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR btrim(coalesce(p_target_type, '')) = '' OR btrim(coalesce(p_target_id, '')) = '' THEN
    RETURN;
  END IF;
  UPDATE public.notification_targets
  SET
    is_unread = false,
    last_read_at = now(),
    updated_at = now()
  WHERE user_id = p_user_id
    AND target_type = btrim(p_target_type)
    AND target_id = btrim(p_target_id)
    AND is_unread = true;
END;
$$;

-- surface count
CREATE OR REPLACE FUNCTION public.count_notification_targets(
  p_user_id uuid,
  p_surface text,
  p_store_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(count(*)::int, 0)
  FROM public.notification_targets AS t
  WHERE t.user_id = p_user_id
    AND t.is_unread = true
    AND CASE btrim(coalesce(p_surface, ''))
      WHEN 'tier1_inbox_bell' THEN
        t.scope = 'consumer'
        AND t.target_type IN ('community_post', 'trade', 'buyer_order', 'system')
      WHEN 'bottom_nav_my' THEN
        t.scope = 'consumer'
        AND t.target_type IN ('community_post', 'trade', 'system')
      WHEN 'bottom_nav_chat' THEN
        t.target_type IN ('chat_room', 'trade')
        AND t.scope = 'consumer'
      WHEN 'bottom_nav_community' THEN
        t.target_type IN ('community_post', 'chat_room')
        AND t.scope = 'consumer'
      WHEN 'bottom_nav_delivery' THEN
        t.target_type = 'buyer_order'
        AND t.scope = 'consumer'
      WHEN 'fab_owner_orders' THEN
        t.target_type = 'owner_order'
        AND t.scope = 'owner_store'
        AND (p_store_id IS NULL OR t.store_id IS NULL OR t.store_id = p_store_id)
      WHEN 'fab_owner_store' THEN
        t.target_type IN ('store_review', 'store_inquiry')
        AND t.scope = 'owner_store'
        AND (p_store_id IS NULL OR t.store_id IS NULL OR t.store_id = p_store_id)
      WHEN 'fab_owner_order_chat' THEN
        t.target_type = 'owner_order_chat'
        AND t.scope = 'owner_store'
        AND (p_store_id IS NULL OR t.store_id IS NULL OR t.store_id = p_store_id)
      WHEN 'owner_commerce_inbox' THEN
        t.target_type = 'owner_order'
        AND t.scope = 'owner_store'
        AND (p_store_id IS NULL OR t.store_id IS NULL OR t.store_id = p_store_id)
      WHEN 'all_consumer_targets' THEN
        t.scope = 'consumer'
      WHEN 'all' THEN
        true
      ELSE false
    END;
$$;

-- hub badge bundle (1 RTT)
CREATE OR REPLACE FUNCTION public.count_notification_targets_hub_bundle(
  p_user_id uuid,
  p_store_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'bottom_nav_chat', public.count_notification_targets(p_user_id, 'bottom_nav_chat', p_store_id),
    'bottom_nav_community', public.count_notification_targets(p_user_id, 'bottom_nav_community', p_store_id),
    'bottom_nav_delivery', public.count_notification_targets(p_user_id, 'bottom_nav_delivery', p_store_id),
    'fab_owner_orders', public.count_notification_targets(p_user_id, 'fab_owner_orders', p_store_id),
    'fab_owner_store', public.count_notification_targets(p_user_id, 'fab_owner_store', p_store_id),
    'fab_owner_order_chat', public.count_notification_targets(p_user_id, 'fab_owner_order_chat', p_store_id),
    'owner_commerce_inbox', public.count_notification_targets(p_user_id, 'owner_commerce_inbox', p_store_id)
  );
$$;

-- segment → surface (bell / bottom nav stores)
CREATE OR REPLACE FUNCTION public.count_notification_unread_segmented(
  p_user_id uuid,
  p_segment text
)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_surface text;
  v_cnt integer;
BEGIN
  v_surface := CASE btrim(coalesce(p_segment, ''))
    WHEN 'all' THEN 'all'
    WHEN 'consumer' THEN 'tier1_inbox_bell'
    WHEN 'consumer_no_chat' THEN 'tier1_inbox_bell'
    WHEN 'owner_store_commerce' THEN 'owner_commerce_inbox'
    WHEN 'bottom_nav' THEN 'bottom_nav_my'
    WHEN 'bottom_nav_no_chat' THEN 'bottom_nav_my'
    ELSE NULL
  END;

  IF v_surface IS NULL THEN
    RETURN 0;
  END IF;

  IF v_surface = 'all' THEN
    SELECT public.count_notification_targets(p_user_id, 'all', NULL) INTO v_cnt;
  ELSE
    SELECT public.count_notification_targets(p_user_id, v_surface, NULL) INTO v_cnt;
  END IF;

  IF v_cnt IS NULL OR v_cnt = 0 THEN
    -- Legacy fallback until backfill completes (dev / pre-migration data)
    RETURN (
      SELECT count(*)::bigint
      FROM public.notifications AS n
      WHERE n.user_id = p_user_id
        AND n.is_read = false
        AND CASE btrim(coalesce(p_segment, ''))
          WHEN 'all' THEN true
          WHEN 'owner_store_commerce' THEN
            n.notification_type = 'commerce'
            AND (n.meta->>'kind') IN (
              'store_order_created',
              'store_order_accept_reminder_30s',
              'store_order_accept_reminder_60s',
              'store_order_payment_completed',
              'store_order_buyer_cancelled',
              'store_order_refund_requested'
            )
          WHEN 'consumer' THEN
            coalesce(n.notification_type, '') <> 'commerce'
            OR (
              n.notification_type = 'commerce'
              AND coalesce(n.meta->>'kind', '') NOT IN (
                'store_order_created',
                'store_order_accept_reminder_30s',
                'store_order_accept_reminder_60s',
                'store_order_payment_completed',
                'store_order_buyer_cancelled',
                'store_order_refund_requested'
              )
            )
          WHEN 'consumer_no_chat' THEN
            (
              coalesce(n.notification_type, '') <> 'commerce'
              AND coalesce(n.notification_type, '') <> 'chat'
            )
            OR (
              n.notification_type = 'commerce'
              AND coalesce(n.meta->>'kind', '') NOT IN (
                'store_order_created',
                'store_order_accept_reminder_30s',
                'store_order_accept_reminder_60s',
                'store_order_payment_completed',
                'store_order_buyer_cancelled',
                'store_order_refund_requested',
                'community_chat',
                'trade_chat',
                'group_chat'
              )
            )
          WHEN 'bottom_nav' THEN
            (
              coalesce(n.notification_type, '') <> 'commerce'
              AND coalesce(n.notification_type, '') <> 'chat'
            )
            OR (
              n.notification_type = 'commerce'
              AND coalesce(n.meta->>'kind', '') NOT IN (
                'store_order_created',
                'store_order_accept_reminder_30s',
                'store_order_accept_reminder_60s',
                'store_order_payment_completed',
                'store_order_buyer_cancelled',
                'store_order_refund_requested',
                'store_order_payment_completed_buyer',
                'store_order_owner_status',
                'store_order_payment_failed',
                'store_order_refund_approved',
                'store_order_auto_completed',
                'community_chat',
                'trade_chat',
                'group_chat'
              )
            )
          WHEN 'bottom_nav_no_chat' THEN
            (
              coalesce(n.notification_type, '') <> 'commerce'
              AND coalesce(n.notification_type, '') <> 'chat'
            )
            OR (
              n.notification_type = 'commerce'
              AND coalesce(n.meta->>'kind', '') NOT IN (
                'store_order_created',
                'store_order_accept_reminder_30s',
                'store_order_accept_reminder_60s',
                'store_order_payment_completed',
                'store_order_buyer_cancelled',
                'store_order_refund_requested',
                'store_order_payment_completed_buyer',
                'store_order_owner_status',
                'store_order_payment_failed',
                'store_order_refund_approved',
                'store_order_auto_completed',
                'community_chat',
                'trade_chat',
                'group_chat'
              )
            )
          ELSE false
        END
    );
  END IF;

  RETURN v_cnt::bigint;
END;
$$;

-- backfill (idempotent upsert)
CREATE OR REPLACE FUNCTION public.backfill_notification_targets(p_user_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_n integer := 0;
BEGIN
  FOR v_uid IN
    SELECT DISTINCT u.id
    FROM auth.users AS u
    WHERE p_user_id IS NULL OR u.id = p_user_id
  LOOP
    -- CM unread rooms → chat_room (consumer) or owner_order_chat
    INSERT INTO public.notification_targets (
      user_id, target_type, target_id, scope, store_id, is_unread, last_event_at, updated_at
    )
    SELECT
      cmp.user_id,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM public.store_orders AS o
          WHERE o.community_messenger_room_id = cmp.room_id
            AND o.store_id IN (
              SELECT s.id FROM public.stores AS s WHERE s.owner_user_id = cmp.user_id
            )
        ) THEN 'owner_order_chat'
        ELSE 'chat_room'
      END,
      cmp.room_id::text,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM public.store_orders AS o
          WHERE o.community_messenger_room_id = cmp.room_id
            AND o.store_id IN (
              SELECT s.id FROM public.stores AS s WHERE s.owner_user_id = cmp.user_id
            )
        ) THEN 'owner_store'
        ELSE 'consumer'
      END,
      (
        SELECT o.store_id FROM public.store_orders AS o
        WHERE o.community_messenger_room_id = cmp.room_id
        LIMIT 1
      ),
      true,
      now(),
      now()
    FROM public.community_messenger_participants AS cmp
    WHERE cmp.user_id = v_uid
      AND coalesce(cmp.unread_count, 0) > 0
    ON CONFLICT (user_id, target_type, target_id) DO UPDATE SET
      is_unread = true,
      last_event_at = now(),
      updated_at = now();

    -- unread notifications → buyer_order / owner_order / system (grouped)
    INSERT INTO public.notification_targets (
      user_id, target_type, target_id, scope, store_id, is_unread, last_event_at, updated_at
    )
    SELECT DISTINCT ON (n.user_id, tgt_type, tgt_id)
      n.user_id,
      tgt_type,
      tgt_id,
      tgt_scope,
      store_uuid,
      true,
      now(),
      now()
    FROM public.notifications AS n
    CROSS JOIN LATERAL (
      SELECT
        CASE
          WHEN n.notification_type = 'commerce'
            AND btrim(coalesce(n.meta->>'order_id', n.ref_id::text, '')) <> ''
            AND coalesce(n.meta->>'kind', '') IN (
              'store_order_created',
              'store_order_accept_reminder_30s',
              'store_order_accept_reminder_60s',
              'store_order_payment_completed',
              'store_order_buyer_cancelled',
              'store_order_refund_requested'
            ) THEN 'owner_order'
          WHEN n.notification_type = 'commerce'
            AND btrim(coalesce(n.meta->>'order_id', n.ref_id::text, '')) <> ''
            AND coalesce(n.meta->>'kind', '') IN (
              'store_order_owner_status',
              'store_order_payment_completed_buyer',
              'store_order_payment_failed',
              'store_order_refund_approved',
              'store_order_auto_completed'
            ) THEN 'buyer_order'
          WHEN n.notification_type = 'chat' THEN NULL
          ELSE 'system'
        END AS tgt_type,
        CASE
          WHEN n.notification_type = 'commerce'
            AND btrim(coalesce(n.meta->>'order_id', n.ref_id::text, '')) <> '' THEN
            btrim(coalesce(n.meta->>'order_id', n.ref_id::text, ''))
          WHEN n.notification_type = 'chat' THEN NULL
          ELSE n.id::text
        END AS tgt_id,
        CASE
          WHEN n.notification_type = 'commerce'
            AND coalesce(n.meta->>'kind', '') IN (
              'store_order_created',
              'store_order_accept_reminder_30s',
              'store_order_accept_reminder_60s',
              'store_order_payment_completed',
              'store_order_buyer_cancelled',
              'store_order_refund_requested'
            ) THEN 'owner_store'
          ELSE 'consumer'
        END AS tgt_scope,
        CASE
          WHEN btrim(coalesce(n.meta->>'store_id', '')) ~ '^[0-9a-f-]{36}$'
            THEN (n.meta->>'store_id')::uuid
          ELSE NULL
        END AS store_uuid
    ) AS mapped
    WHERE n.user_id = v_uid
      AND n.is_read = false
      AND mapped.tgt_type IS NOT NULL
      AND mapped.tgt_id IS NOT NULL
    ON CONFLICT (user_id, target_type, target_id) DO UPDATE SET
      is_unread = true,
      last_event_at = now(),
      updated_at = now();

    -- item_trade unread hint → trade target
    INSERT INTO public.notification_targets (
      user_id, target_type, target_id, scope, is_unread, last_event_at, updated_at
    )
    SELECT
      p.user_id,
      'trade',
      r.item_id::text || ':' || r.seller_id::text || ':' || r.buyer_id::text,
      'consumer',
      true,
      now(),
      now()
    FROM public.chat_room_participants AS p
    INNER JOIN public.chat_rooms AS r ON r.id = p.room_id
    LEFT JOIN public.chat_messages AS lm ON lm.id = r.last_message_id
    WHERE p.user_id = v_uid
      AND p.hidden = false
      AND (p.is_active IS DISTINCT FROM false)
      AND p.left_at IS NULL
      AND r.room_type = 'item_trade'
      AND r.item_id IS NOT NULL
      AND r.last_message_id IS NOT NULL
      AND btrim(r.last_message_id::text) <> ''
      AND lm.id IS NOT NULL
      AND lm.sender_id IS DISTINCT FROM p.user_id
      AND coalesce(p.last_read_message_id::text, '') <> r.last_message_id::text
      AND (
        r.community_messenger_room_id IS NULL
        OR btrim(r.community_messenger_room_id::text) = ''
      )
    ON CONFLICT (user_id, target_type, target_id) DO UPDATE SET
      is_unread = true,
      last_event_at = now(),
      updated_at = now();

    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$$;

REVOKE ALL ON TABLE public.notification_targets FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notification_targets TO service_role;

REVOKE ALL ON FUNCTION public.upsert_notification_target_unread(uuid, text, text, text, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clear_notification_target(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_notification_targets(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_notification_targets_hub_bundle(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.backfill_notification_targets(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.upsert_notification_target_unread(uuid, text, text, text, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_notification_target(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.count_notification_targets(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.count_notification_targets_hub_bundle(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.backfill_notification_targets(uuid) TO service_role;

COMMENT ON FUNCTION public.count_notification_unread_segmented(uuid, text) IS
  'Badge read path — notification_targets first; legacy notifications COUNT fallback when zero.';
