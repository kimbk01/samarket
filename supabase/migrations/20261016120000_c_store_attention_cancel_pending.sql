-- Slice 2-5 C_store: Action Required counts include cancel_requested (store_id).
-- Clear = leave Action Required status (not notification read).

CREATE OR REPLACE FUNCTION public.get_owner_hub_store_attention_counts(p_store_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH order_counts AS (
    SELECT
      coalesce(
        sum(CASE WHEN o.order_status = 'refund_requested' THEN 1 ELSE 0 END),
        0
      )::int AS refund_pending_count,
      coalesce(
        sum(CASE WHEN o.order_status = 'pending' THEN 1 ELSE 0 END),
        0
      )::int AS order_pending_count,
      coalesce(
        sum(CASE WHEN o.order_status = 'cancel_requested' THEN 1 ELSE 0 END),
        0
      )::int AS cancel_pending_count
    FROM public.store_orders AS o
    WHERE o.store_id = p_store_id
      AND o.order_status IN ('refund_requested', 'pending', 'cancel_requested')
  ),
  inquiry_counts AS (
    SELECT coalesce(count(*)::int, 0) AS inquiry_pending_count
    FROM public.store_inquiries AS i
    WHERE i.store_id = p_store_id
      AND i.status = 'open'
  )
  SELECT jsonb_build_object(
    'refund_pending_count', (SELECT refund_pending_count FROM order_counts),
    'order_pending_count', (SELECT order_pending_count FROM order_counts),
    'cancel_pending_count', (SELECT cancel_pending_count FROM order_counts),
    'inquiry_pending_count', (SELECT inquiry_pending_count FROM inquiry_counts)
  );
$$;

COMMENT ON FUNCTION public.get_owner_hub_store_attention_counts(uuid) IS
  'Owner hub C_store attention — pending + refund + cancel_requested + open inquiries (store_id).';

ALTER TABLE public.hub_badge_user_unread_counters
  ADD COLUMN IF NOT EXISTS cancel_pending_count integer NOT NULL DEFAULT 0;

-- Preserve 20260608120000 snapshot body; add cancel_pending_count only.
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
        'cancel_pending_count', 0,
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
    'cancel_pending_count',
      coalesce(((SELECT j FROM attention)->>'cancel_pending_count')::int, 0),
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
  'Owner hub badge snapshot — includes C_store cancel_pending_count (Slice 2-5).';
