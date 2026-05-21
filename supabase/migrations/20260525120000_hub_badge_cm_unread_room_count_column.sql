-- Hub badge cm_unread read-through: unread **room** count snapshot (semantics = get_community_messenger_unread_room_count).

ALTER TABLE public.hub_badge_user_unread_counters
  ADD COLUMN IF NOT EXISTS community_messenger_unread_room_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.hub_badge_user_unread_counters.community_messenger_unread_room_count IS
  'CM tab badge: count(participants) where unread_count > 0. NOT community_participant_unread (philife/trade sum).';
