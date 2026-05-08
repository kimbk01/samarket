-- Double-check / close gaps from 20260808120000–135000:
--
-- Postgres often leaves EXECUTE granted to PUBLIC on functions. REVOKE FROM anon/authenticated alone
-- can still leave the RPC callable anonymously via PUBLIC inheritance.
--
-- This pass aligns with the lint-driven SECURITY DEFINER RPC list:
-- - REVOKE ALL from PUBLIC on every matching overload where prosecdef = true
-- - REVOKE EXECUTE from anon, authenticated (idempotent with earlier migrations)
-- - GRANT EXECUTE to service_role so server callers (Supabase JS + service_role) stay working
--
-- Function name set mirrors 20260808120000_revoke_anon_execute_on_security_definer_rpcs.sql

do $$
declare
  r record;
begin
  for r in
    select
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as identity_args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef is true
      and p.proname in (
        'admin_delivery_operations_dashboard',
        'approve_delivery_alert_auto_action',
        'bump_post_job_application_count',
        'can_manage_meeting',
        'can_manage_open_chat_room',
        'community_messenger_apply_room_read_mark',
        'community_messenger_apply_unread_for_text_message',
        'community_messenger_bootstrap_my_room_ids',
        'community_messenger_bootstrap_rooms',
        'community_messenger_group_actor_role',
        'community_messenger_kick_group_member',
        'community_messenger_room_messages_after',
        'community_messenger_send_text_message',
        'community_messenger_set_group_member_role',
        'community_messenger_transfer_group_owner',
        'community_messenger_update_group_notice',
        'community_messenger_update_group_permissions',
        'community_post_bump_comment_count',
        'community_post_bump_like_count',
        'delivery_alert_apply_auto_action_effect',
        'delivery_operation_alert_events_audit_actor_bu',
        'delivery_operation_alert_events_audit_ai',
        'delivery_operation_alert_events_audit_au',
        'detect_platform_runtime_capabilities',
        'ensure_store_sales_permission_row',
        'has_joined_meeting_member',
        'has_joined_open_chat_member',
        'increment_community_post_view_count',
        'increment_philife_post_view_count',
        'is_admin_user',
        'is_platform_admin',
        'log_delivery_alert_auto_action',
        'log_meeting_member_attendance_event',
        'philife_list_default_section_topics_for_feed',
        'philify_list_default_section_topics_for_feed',
        'refresh_meeting_room_stats',
        'refresh_open_chat_room_stats',
        'reject_delivery_alert_auto_action',
        'retry_delivery_alert_auto_action',
        'run_delivery_operation_alert_auto_actions',
        'scan_store_order_sla_warnings',
        'sum_owner_order_chat_unread',
        'sync_community_post_comment_count',
        'sync_community_post_like_count',
        'sync_delivery_operation_alert_events',
        'sync_meeting_chat_participant',
        'sync_open_chat_chat_participant'
      )
  loop
    execute format(
      'revoke all on function %I.%I(%s) from public',
      r.schema_name,
      r.function_name,
      r.identity_args
    );
    execute format(
      'revoke execute on function %I.%I(%s) from anon',
      r.schema_name,
      r.function_name,
      r.identity_args
    );
    execute format(
      'revoke execute on function %I.%I(%s) from authenticated',
      r.schema_name,
      r.function_name,
      r.identity_args
    );
    execute format(
      'grant execute on function %I.%I(%s) to service_role',
      r.schema_name,
      r.function_name,
      r.identity_args
    );
  end loop;
end
$$;
