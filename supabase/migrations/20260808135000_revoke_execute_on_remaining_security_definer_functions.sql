-- Supabase Security Advisor cleanup:
-- Revoke EXECUTE on remaining SECURITY DEFINER RPCs from anon/authenticated/public.
-- Apply to all overloads by iterating pg_proc identity args.

do $$
declare
  r record;
begin
  for r in
    select
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as identity_args,
      p.prosecdef as security_definer
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'bump_post_job_application_count',
        'can_manage_meeting',
        'can_manage_open_chat_room',
        'community_messenger_apply_room_read_mark',
        'community_messenger_bootstrap_my_room_ids',
        'community_messenger_bootstrap_rooms',
        'community_messenger_room_messages_after',
        'community_messenger_send_text_message',
        'community_post_bump_comment_count',
        'community_post_bump_like_count',
        'detect_platform_runtime_capabilities',
        'ensure_store_sales_permission_row',
        'has_joined_meeting_member',
        'has_joined_open_chat_member',
        'is_admin_user',
        'log_meeting_member_attendance_event',
        'philify_list_default_section_topics_for_feed',
        'refresh_meeting_room_stats',
        'refresh_open_chat_room_stats',
        'sum_owner_order_chat_unread',
        'sync_community_post_comment_count',
        'sync_community_post_like_count',
        'sync_meeting_chat_participant',
        'sync_open_chat_chat_participant'
      )
  loop
    -- Always remove public execution paths; these RPCs are not intended for client direct calls.
    execute format('revoke all on function %I.%I(%s) from public', r.schema_name, r.function_name, r.identity_args);
    execute format('revoke execute on function %I.%I(%s) from anon', r.schema_name, r.function_name, r.identity_args);
    execute format('revoke execute on function %I.%I(%s) from authenticated', r.schema_name, r.function_name, r.identity_args);
  end loop;
end
$$;

