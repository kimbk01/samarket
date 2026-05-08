-- Community Messenger RPC hardening (A-1):
-- Keep SECURITY DEFINER RPCs server-only (service_role), not directly callable by signed-in users.
--
-- Background:
-- - We previously granted some CM RPCs to `authenticated` to keep the app working.
-- - Under A-1, we instead rely on Next.js API routes (server) which call DB using service_role.
-- - This removes the "Signed-in users can execute SECURITY DEFINER" lint for these RPCs.

revoke execute on function public.community_messenger_bootstrap_my_room_ids(uuid, integer) from authenticated;
revoke execute on function public.community_messenger_bootstrap_rooms(uuid[]) from authenticated;

revoke execute on function public.community_messenger_room_messages_after(uuid, uuid, uuid, integer) from authenticated;
revoke execute on function public.community_messenger_send_text_message(
  uuid,
  uuid,
  text,
  text,
  timestamp with time zone,
  uuid
) from authenticated;

revoke execute on function public.community_messenger_apply_unread_for_text_message(
  uuid,
  uuid,
  timestamp with time zone
) from authenticated;

revoke execute on function public.community_messenger_apply_room_read_mark(uuid, uuid, text, uuid) from authenticated;

revoke execute on function public.community_messenger_update_group_notice(uuid, text) from authenticated;
revoke execute on function public.community_messenger_update_group_permissions(
  uuid,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean
) from authenticated;
revoke execute on function public.community_messenger_set_group_member_role(uuid, uuid, text) from authenticated;
revoke execute on function public.community_messenger_transfer_group_owner(uuid, uuid) from authenticated;
revoke execute on function public.community_messenger_kick_group_member(uuid, uuid) from authenticated;

