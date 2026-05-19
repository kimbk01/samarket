-- Hub badge wave2: CM tab badge — count of rooms with unread_count > 0 (single SQL).
-- Mirrors: sumCommunityMessengerParticipantUnread (PostgREST count head).

CREATE INDEX IF NOT EXISTS idx_cmp_user_unread_positive
  ON public.community_messenger_participants (user_id)
  WHERE unread_count > 0;

CREATE OR REPLACE FUNCTION public.get_community_messenger_unread_room_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(count(*)::int, 0)
  FROM public.community_messenger_participants
  WHERE user_id = p_user_id
    AND unread_count > 0;
$$;

COMMENT ON FUNCTION public.get_community_messenger_unread_room_count(uuid) IS
  'Hub badge wave2: messenger tab unread room count (unread_count > 0), not message sum.';

REVOKE ALL ON FUNCTION public.get_community_messenger_unread_room_count(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_community_messenger_unread_room_count(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_community_messenger_unread_room_count(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_community_messenger_unread_room_count(uuid) TO service_role;
