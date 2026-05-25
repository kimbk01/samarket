-- Owner hub badge: single-RPC snapshot (1 PostgREST RTT cold path).
-- Semantics aligned with build-owner-hub-badge-payload.ts + mergeOwnerHubBadgeUnreadAndStore.

ALTER TABLE public.hub_badge_user_unread_counters
  ADD COLUMN IF NOT EXISTS has_hub_store boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hub_store_id uuid NULL,
  ADD COLUMN IF NOT EXISTS hub_store_slug text NULL,
  ADD COLUMN IF NOT EXISTS store_order_chat_unread integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_pending_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS order_pending_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inquiry_pending_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.hub_badge_user_unread_counters.has_hub_store IS
  'Owner approved hub store exists — when false unread_parts fields are 0 (no_hub fast path).';
COMMENT ON COLUMN public.hub_badge_user_unread_counters.store_order_chat_unread IS
  'Hub store scoped CM order chat unread sum (owner participant unread in order rooms).';

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
      coalesce(((SELECT j FROM attention)->>'inquiry_pending_count')::int, 0)
  );
$$;

COMMENT ON FUNCTION public.get_owner_hub_badge_snapshot(uuid) IS
  'Owner hub badge cold path — single SQL snapshot (hub store + unread parts + CM room count + store order chat unread + attention).';

REVOKE ALL ON FUNCTION public.get_owner_hub_badge_snapshot(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_owner_hub_badge_snapshot(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_owner_hub_badge_snapshot(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_owner_hub_badge_snapshot(uuid) TO service_role;
