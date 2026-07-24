-- B3 — Hub / Bottom Chat CM unread room count = general_direct + group only.
-- Aligns get_community_messenger_unread_room_count with roomSummaryCountsForBottomChat.
-- trade / store_order excluded when chat_domain set; commerce direct_key excluded when null.
-- Residual: null chat_domain + trade/delivery via context_meta only → item 5 backfill.
-- DO NOT: Bell/App Icon · unread-badge-store · FCM · Message Authority.

CREATE OR REPLACE FUNCTION public.get_community_messenger_unread_room_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(count(*)::int, 0)
  FROM public.community_messenger_participants p
  INNER JOIN public.community_messenger_rooms r ON r.id = p.room_id
  WHERE p.user_id = p_user_id
    AND p.unread_count > 0
    AND (
      r.chat_domain IN ('general_direct', 'group')
      OR (
        r.chat_domain IS NULL
        AND coalesce(r.direct_key, '') NOT LIKE 'trade_pc:%'
        AND coalesce(r.direct_key, '') NOT LIKE 'trade_item:%'
        AND coalesce(r.direct_key, '') NOT LIKE 'store_order:%'
        AND coalesce(r.direct_key, '') NOT LIKE 'trade_order:%'
      )
    );
$$;

COMMENT ON FUNCTION public.get_community_messenger_unread_room_count(uuid) IS
  'B3 Bottom Chat / hub CM badge: unread room count for general_direct+group only (not message sum; excludes trade/store_order + commerce direct_key).';

REVOKE ALL ON FUNCTION public.get_community_messenger_unread_room_count(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_community_messenger_unread_room_count(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_community_messenger_unread_room_count(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_community_messenger_unread_room_count(uuid) TO service_role;
