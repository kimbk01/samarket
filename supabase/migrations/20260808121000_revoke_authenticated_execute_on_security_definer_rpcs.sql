-- Security hardening: remove authenticated execute on SECURITY DEFINER RPCs flagged by Supabase lints.
-- Generated from: Supabase Performance Security Lints export (authenticated_security_definer_function_executable).

-- NOTE:
-- - We REVOKE from `authenticated` only (keeps existing service_role grants intact).
-- - If a function is intentionally callable by all signed-in users, re-grant explicitly in a follow-up migration.

revoke execute on function public.admin_delivery_operations_dashboard(
  timestamp with time zone,
  timestamp with time zone,
  timestamp with time zone,
  timestamp with time zone
) from authenticated;

revoke execute on function public.approve_delivery_alert_auto_action(
  uuid,
  uuid,
  text
) from authenticated;

revoke execute on function public.bump_post_job_application_count() from authenticated;

revoke execute on function public.can_manage_meeting(uuid, uuid) from authenticated;
revoke execute on function public.can_manage_open_chat_room(uuid, uuid) from authenticated;

revoke execute on function public.community_messenger_apply_room_read_mark(
  uuid,
  uuid,
  text,
  uuid
) from authenticated;

revoke execute on function public.community_messenger_apply_unread_for_text_message(
  uuid,
  uuid,
  timestamp with time zone
) from authenticated;

revoke execute on function public.community_messenger_bootstrap_my_room_ids(uuid, integer) from authenticated;
revoke execute on function public.community_messenger_bootstrap_rooms(uuid[]) from authenticated;
revoke execute on function public.community_messenger_group_actor_role(uuid) from authenticated;

revoke execute on function public.community_messenger_kick_group_member(uuid, uuid) from authenticated;

revoke execute on function public.community_messenger_room_messages_after(
  uuid,
  uuid,
  uuid,
  integer
) from authenticated;

revoke execute on function public.community_messenger_send_text_message(
  uuid,
  uuid,
  text,
  text,
  timestamp with time zone,
  uuid
) from authenticated;

revoke execute on function public.community_messenger_set_group_member_role(uuid, uuid, text) from authenticated;
revoke execute on function public.community_messenger_transfer_group_owner(uuid, uuid) from authenticated;
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

revoke execute on function public.community_post_bump_comment_count() from authenticated;
revoke execute on function public.community_post_bump_like_count() from authenticated;

revoke execute on function public.delivery_alert_apply_auto_action_effect(
  uuid,
  uuid,
  text,
  text,
  integer,
  timestamp with time zone,
  uuid[]
) from authenticated;

revoke execute on function public.delivery_operation_alert_events_audit_actor_bu() from authenticated;
revoke execute on function public.delivery_operation_alert_events_audit_ai() from authenticated;
revoke execute on function public.delivery_operation_alert_events_audit_au() from authenticated;

revoke execute on function public.detect_platform_runtime_capabilities(boolean) from authenticated;

revoke execute on function public.ensure_store_sales_permission_row() from authenticated;

revoke execute on function public.has_joined_meeting_member(uuid, uuid) from authenticated;
revoke execute on function public.has_joined_open_chat_member(uuid, uuid) from authenticated;

revoke execute on function public.increment_community_post_view_count(uuid) from authenticated;
revoke execute on function public.increment_philife_post_view_count(uuid) from authenticated;

revoke execute on function public.is_admin_user() from authenticated;
revoke execute on function public.is_platform_admin(uuid) from authenticated;

revoke execute on function public.log_delivery_alert_auto_action(
  uuid,
  text,
  text,
  text,
  text,
  jsonb,
  uuid
) from authenticated;

revoke execute on function public.log_meeting_member_attendance_event() from authenticated;

revoke execute on function public.philife_list_default_section_topics_for_feed() from authenticated;
revoke execute on function public.philify_list_default_section_topics_for_feed() from authenticated;

revoke execute on function public.refresh_meeting_room_stats(uuid) from authenticated;
revoke execute on function public.refresh_open_chat_room_stats(uuid) from authenticated;

revoke execute on function public.reject_delivery_alert_auto_action(uuid, uuid, text) from authenticated;
revoke execute on function public.retry_delivery_alert_auto_action(uuid, uuid) from authenticated;

revoke execute on function public.run_delivery_operation_alert_auto_actions() from authenticated;
revoke execute on function public.scan_store_order_sla_warnings() from authenticated;

revoke execute on function public.sum_owner_order_chat_unread(text) from authenticated;

revoke execute on function public.sync_community_post_comment_count() from authenticated;
revoke execute on function public.sync_community_post_like_count() from authenticated;
revoke execute on function public.sync_delivery_operation_alert_events() from authenticated;

revoke execute on function public.sync_meeting_chat_participant(uuid, uuid, text) from authenticated;
revoke execute on function public.sync_open_chat_chat_participant(uuid, uuid, text) from authenticated;

