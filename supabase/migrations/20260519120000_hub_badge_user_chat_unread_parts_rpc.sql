-- Hub badge cold path: user chat unread parts in one indexed round-trip.
-- Mirrors lib/chat/user-chat-unread-parts.ts (participant unread + item_trade cursor hint + product_chats dedup).

CREATE OR REPLACE FUNCTION public.hub_badge_user_chat_unread_parts(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH active_parts AS (
    SELECT
      p.room_id,
      COALESCE(p.unread_count, 0) AS p_unread,
      p.last_read_message_id AS p_last_read
    FROM public.chat_room_participants AS p
    WHERE p.user_id = p_user_id
      AND p.hidden = false
      AND (p.is_active IS DISTINCT FROM false)
      AND p.left_at IS NULL
  ),
  rooms AS (
    SELECT
      r.id,
      r.room_type,
      r.item_id,
      r.seller_id,
      r.buyer_id,
      r.is_locked,
      r.last_message_id,
      r.community_messenger_room_id,
      ap.p_unread,
      ap.p_last_read,
      (
        NOT COALESCE(r.is_locked, false)
        OR r.room_type = 'store_order'
      ) AS eligible
    FROM active_parts AS ap
    INNER JOIN public.chat_rooms AS r ON r.id = ap.room_id
  ),
  store_order_sum AS (
    SELECT COALESCE(SUM(r.p_unread), 0)::int AS n
    FROM rooms AS r
    WHERE r.eligible
      AND r.room_type = 'store_order'
  ),
  item_trade_rows AS (
    SELECT
      r.p_last_read,
      r.last_message_id,
      r.community_messenger_room_id,
      lm.id AS lm_id,
      lm.sender_id AS lm_sender_id
    FROM rooms AS r
    LEFT JOIN public.chat_messages AS lm ON lm.id = r.last_message_id
    WHERE r.eligible
      AND r.room_type = 'item_trade'
  ),
  item_trade_sum AS (
    SELECT COALESCE(SUM(
      CASE
        WHEN itr.community_messenger_room_id IS NOT NULL
          AND btrim(itr.community_messenger_room_id::text) <> '' THEN 0
        WHEN itr.last_message_id IS NULL
          OR btrim(itr.last_message_id::text) = '' THEN 0
        WHEN itr.lm_id IS NULL THEN 0
        WHEN itr.lm_sender_id = p_user_id THEN 0
        WHEN COALESCE(itr.p_last_read::text, '') = itr.last_message_id::text THEN 0
        ELSE 1
      END
    ), 0)::int AS n
    FROM item_trade_rows AS itr
  ),
  community_sum AS (
    SELECT COALESCE(SUM(r.p_unread), 0)::int AS n
    FROM rooms AS r
    WHERE r.eligible
      AND r.room_type IS NOT NULL
      AND r.room_type NOT IN ('store_order', 'item_trade')
  ),
  item_trade_keys AS (
    SELECT DISTINCT
      r.item_id,
      r.seller_id,
      r.buyer_id
    FROM rooms AS r
    WHERE r.room_type = 'item_trade'
      AND r.item_id IS NOT NULL
      AND r.seller_id IS NOT NULL
      AND r.buyer_id IS NOT NULL
  ),
  product_chat_sum AS (
    SELECT COALESCE(SUM(
      CASE
        WHEN pc.seller_id = p_user_id THEN COALESCE(pc.unread_count_seller, 0)
        ELSE COALESCE(pc.unread_count_buyer, 0)
      END
    ), 0)::int AS n
    FROM public.product_chats AS pc
    WHERE (pc.seller_id = p_user_id OR pc.buyer_id = p_user_id)
      AND NOT EXISTS (
        SELECT 1
        FROM item_trade_keys AS itk
        WHERE itk.item_id = pc.post_id
          AND itk.seller_id = pc.seller_id
          AND itk.buyer_id = pc.buyer_id
      )
  )
  SELECT jsonb_build_object(
    'store_order_participant_unread', (SELECT n FROM store_order_sum),
    'item_trade_participant_unread', (SELECT n FROM item_trade_sum),
    'community_participant_unread', (SELECT n FROM community_sum),
    'product_chat_unread_deduped', (SELECT n FROM product_chat_sum)
  );
$$;

COMMENT ON FUNCTION public.hub_badge_user_chat_unread_parts(uuid) IS
  'Owner hub badge: chat_rooms/product_chats unread parts — single SQL path for cold badge aggregate.';

REVOKE ALL ON FUNCTION public.hub_badge_user_chat_unread_parts(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hub_badge_user_chat_unread_parts(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.hub_badge_user_chat_unread_parts(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hub_badge_user_chat_unread_parts(uuid) TO service_role;
