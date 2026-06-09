-- bottom_nav_chat: consumer chat_room only (general CM rooms).
-- trade unread → trade target (trade pillar / tier1 bell); delivery customer → buyer_order (bottom_nav_delivery).
-- DO NOT re-add trade to bottom_nav_chat — prevents chat_room+trade double count on one trade message.

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
        t.target_type = 'chat_room'
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

REVOKE ALL ON FUNCTION public.count_notification_targets(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_notification_targets(uuid, text, uuid) TO service_role;
