-- Supabase security lint cleanup:
-- - Fix role-mutable function search_path (function_search_path_mutable)
-- - Remove overly permissive RLS DML policies (rls_policy_always_true)
-- - Remove broad SELECT policy that enables public bucket listing (public_bucket_allows_listing)

-- 1) Fix function search_path for flagged functions (all overloads).
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
      and p.proname in (
        'community_messenger_message_reactions_set_room_id',
        'meetings_sync_room_policy_legacy',
        'meeting_members_apply_defaults',
        'after_meeting_members_changed',
        'after_meeting_notices_changed',
        'after_meeting_member_bans_changed',
        'guard_profiles_self_update',
        'set_updated_at'
      )
  loop
    execute format(
      'alter function %I.%I(%s) set search_path = pg_catalog, public',
      r.schema_name,
      r.function_name,
      r.identity_args
    );
  end loop;
end
$$;

-- 2) Drop permissive RLS policies (DML always-true) flagged by linter.
--    This intentionally errs on the side of safety: after dropping, DML will be denied unless
--    a stricter policy exists elsewhere.
drop policy if exists categories_delete_anon on public.categories;
drop policy if exists categories_insert_anon on public.categories;
drop policy if exists categories_update_anon on public.categories;

drop policy if exists category_settings_delete_anon on public.category_settings;
drop policy if exists category_settings_insert_anon on public.category_settings;
drop policy if exists category_settings_update_anon on public.category_settings;

drop policy if exists chat_event_logs_insert on public.chat_event_logs;
drop policy if exists comments_insert on public.comments;
drop policy if exists community_post_images_insert on public.community_post_images;
drop policy if exists community_post_likes_mutate on public.community_post_likes;

drop policy if exists favorites_delete_own on public.favorites;
drop policy if exists favorites_insert_own on public.favorites;

drop policy if exists posts_delete on public.posts;
drop policy if exists posts_insert on public.posts;
drop policy if exists posts_update on public.posts;

drop policy if exists "allow all authenticated" on public.locations;
drop policy if exists "allow all authenticated" on public.meeting_feed_comments;
drop policy if exists "allow all authenticated" on public.meeting_feed_images;
drop policy if exists "allow all authenticated" on public.meeting_members;
drop policy if exists "allow all authenticated" on public.meeting_reports;
drop policy if exists "allow all authenticated" on public.meetings;
drop policy if exists "allow all authenticated" on public.user_relationships;

drop policy if exists moderation_audit_messages_insert on public.moderation_audit_messages;
drop policy if exists notification_logs_insert on public.notification_logs;
drop policy if exists notifications_insert_service on public.notifications;

-- 3) Public bucket listing: drop broad SELECT policy on storage.objects for `post-images`.
--    Linter warns that public buckets don't need broad SELECT policy and it can expose listing.
drop policy if exists "post-images: allow select" on storage.objects;

