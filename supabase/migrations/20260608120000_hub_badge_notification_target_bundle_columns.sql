-- Hub badge cold path: embed notification_targets hub bundle on counter row (1 RTT read after refresh).
-- Semantics: count_notification_targets_hub_bundle(p_user_id, hub_store_id) snapshot at refresh time.
-- Prerequisite: notification_targets + count RPCs (20260606120000 may not be applied on remote yet).

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

REVOKE ALL ON FUNCTION public.count_notification_targets(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_notification_targets_hub_bundle(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_notification_targets(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.count_notification_targets_hub_bundle(uuid, uuid) TO service_role;

ALTER TABLE public.hub_badge_user_unread_counters
  ADD COLUMN IF NOT EXISTS nt_bottom_nav_chat integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nt_bottom_nav_community integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nt_bottom_nav_delivery integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nt_fab_owner_orders integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nt_fab_owner_store integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nt_fab_owner_order_chat integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nt_owner_commerce_inbox integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nt_bundle_at timestamptz NULL;

COMMENT ON COLUMN public.hub_badge_user_unread_counters.nt_bundle_at IS
  'When set, owner hub badge read path uses embedded nt_* fields (skips count_notification_targets_hub_bundle RPC).';

CREATE OR REPLACE FUNCTION public.get_owner_hub_badge_snapshot(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH hub AS (
    SELECT s.id, s.slug
    FROM public.stores AS s
    INNER JOIN public.store_sales_permissions AS p ON p.store_id = s.id
    WHERE s.owner_user_id = p_user_id
      AND s.approval_status = 'approved'
      AND s.is_visible = true
      AND p.allowed_to_sell = true
      AND p.sales_status = 'approved'
    ORDER BY s.created_at DESC
    LIMIT 1
  ),
  has_hub AS (
    SELECT EXISTS (SELECT 1 FROM hub) AS v
  ),
  unread_parts AS (
    SELECT CASE
      WHEN (SELECT v FROM has_hub)
      THEN public.hub_badge_user_chat_unread_parts(p_user_id)
      ELSE jsonb_build_object(
        'store_order_participant_unread', 0,
        'item_trade_participant_unread', 0,
        'community_participant_unread', 0,
        'product_chat_unread_deduped', 0
      )
    END AS j
  ),
  cm_room_count AS (
    SELECT public.get_community_messenger_unread_room_count(p_user_id) AS n
  ),
  order_rooms AS (
    SELECT o.community_messenger_room_id
    FROM public.store_orders AS o
    WHERE o.store_id = (SELECT id FROM hub)
      AND o.community_messenger_room_id IS NOT NULL
    LIMIT 80
  ),
  store_order_unread AS (
    SELECT coalesce(sum(greatest(cmp.unread_count, 0)), 0)::int AS n
    FROM order_rooms AS ord
    INNER JOIN public.community_messenger_participants AS cmp
      ON cmp.room_id = ord.community_messenger_room_id
     AND cmp.user_id = p_user_id
  ),
  attention AS (
    SELECT CASE
      WHEN (SELECT v FROM has_hub)
      THEN public.get_owner_hub_store_attention_counts((SELECT id FROM hub))
      ELSE jsonb_build_object(
        'refund_pending_count', 0,
        'order_pending_count', 0,
        'inquiry_pending_count', 0
      )
    END AS j
  ),
  parts AS (
    SELECT (SELECT j FROM unread_parts) AS unread_j
  ),
  hub_id AS (
    SELECT id FROM hub
  ),
  nt_bundle AS (
    SELECT public.count_notification_targets_hub_bundle(
      p_user_id,
      (SELECT id FROM hub_id)
    ) AS j
  )
  SELECT jsonb_build_object(
    'has_hub_store', (SELECT v FROM has_hub),
    'hub_store_id', (SELECT id FROM hub),
    'hub_store_slug', (SELECT slug FROM hub),
    'store_order_participant_unread',
      coalesce(((SELECT unread_j FROM parts)->>'store_order_participant_unread')::int, 0),
    'item_trade_participant_unread',
      coalesce(((SELECT unread_j FROM parts)->>'item_trade_participant_unread')::int, 0),
    'community_participant_unread',
      coalesce(((SELECT unread_j FROM parts)->>'community_participant_unread')::int, 0),
    'product_chat_unread_deduped',
      coalesce(((SELECT unread_j FROM parts)->>'product_chat_unread_deduped')::int, 0),
    'community_messenger_unread_room_count', (SELECT n FROM cm_room_count),
    'store_order_chat_unread', coalesce((SELECT n FROM store_order_unread), 0),
    'refund_pending_count',
      coalesce(((SELECT j FROM attention)->>'refund_pending_count')::int, 0),
    'order_pending_count',
      coalesce(((SELECT j FROM attention)->>'order_pending_count')::int, 0),
    'inquiry_pending_count',
      coalesce(((SELECT j FROM attention)->>'inquiry_pending_count')::int, 0),
    'nt_bottom_nav_chat',
      coalesce(((SELECT j FROM nt_bundle)->>'bottom_nav_chat')::int, 0),
    'nt_bottom_nav_community',
      coalesce(((SELECT j FROM nt_bundle)->>'bottom_nav_community')::int, 0),
    'nt_bottom_nav_delivery',
      coalesce(((SELECT j FROM nt_bundle)->>'bottom_nav_delivery')::int, 0),
    'nt_fab_owner_orders',
      coalesce(((SELECT j FROM nt_bundle)->>'fab_owner_orders')::int, 0),
    'nt_fab_owner_store',
      coalesce(((SELECT j FROM nt_bundle)->>'fab_owner_store')::int, 0),
    'nt_fab_owner_order_chat',
      coalesce(((SELECT j FROM nt_bundle)->>'fab_owner_order_chat')::int, 0),
    'nt_owner_commerce_inbox',
      coalesce(((SELECT j FROM nt_bundle)->>'owner_commerce_inbox')::int, 0)
  );
$$;

COMMENT ON FUNCTION public.get_owner_hub_badge_snapshot(uuid) IS
  'Owner hub badge snapshot — hub store + unread + attention + notification_targets hub bundle (refresh write path).';
