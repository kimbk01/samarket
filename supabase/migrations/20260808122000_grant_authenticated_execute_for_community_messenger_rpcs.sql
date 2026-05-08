-- Allow signed-in users to call selected Community Messenger RPCs.
--
-- Background:
-- - We revoked broad EXECUTE on SECURITY DEFINER RPCs from `anon` and `authenticated`
--   to close accidental privilege-escalation paths.
-- - These RPCs are used by the app's Community Messenger client flows and must remain callable
--   by signed-in users.
--
-- Policy:
-- - Grant ONLY to `authenticated` (never to `anon`).
-- - The functions themselves must enforce membership/authorization (do not trust caller-supplied user ids).

grant execute on function public.community_messenger_bootstrap_my_room_ids(uuid, integer) to authenticated;
grant execute on function public.community_messenger_bootstrap_rooms(uuid[]) to authenticated;

grant execute on function public.community_messenger_room_messages_after(uuid, uuid, uuid, integer) to authenticated;
grant execute on function public.community_messenger_send_text_message(
  uuid,
  uuid,
  text,
  text,
  timestamp with time zone,
  uuid
) to authenticated;

grant execute on function public.community_messenger_apply_unread_for_text_message(
  uuid,
  uuid,
  timestamp with time zone
) to authenticated;

grant execute on function public.community_messenger_apply_room_read_mark(uuid, uuid, text, uuid) to authenticated;

grant execute on function public.community_messenger_update_group_notice(uuid, text) to authenticated;
grant execute on function public.community_messenger_update_group_permissions(
  uuid,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean
) to authenticated;
grant execute on function public.community_messenger_set_group_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.community_messenger_transfer_group_owner(uuid, uuid) to authenticated;
grant execute on function public.community_messenger_kick_group_member(uuid, uuid) to authenticated;

