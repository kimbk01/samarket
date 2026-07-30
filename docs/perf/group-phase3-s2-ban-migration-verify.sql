-- Phase 3 S2-1 Ban preflight / verification (run in Supabase SQL editor)
-- Apply migration:
--   20261011140000_cm_group_bans.sql

-- VERIFICATION after apply
SELECT to_regclass('public.community_messenger_group_bans') AS group_bans_table;

SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'community_messenger_group_bans'
  AND indexname = 'community_messenger_group_bans_one_active_uidx';

SELECT proname
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN (
    'cm_group_is_user_banned',
    'community_messenger_ban_group_member',
    'community_messenger_unban_group_member',
    'community_messenger_join_group_via_invite_link',
    'community_messenger_request_group_join',
    'community_messenger_decide_group_join_request'
  )
ORDER BY 1;

-- Expect: join/request/decide bodies reference user_banned
SELECT
  p.proname,
  (pg_get_functiondef(p.oid) ILIKE '%user_banned%') AS mentions_user_banned
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN (
    'community_messenger_join_group_via_invite_link',
    'community_messenger_request_group_join',
    'community_messenger_decide_group_join_request',
    'community_messenger_ban_group_member'
  )
ORDER BY 1;

-- Active bans count (informational)
SELECT count(*) AS active_bans
FROM public.community_messenger_group_bans
WHERE unbanned_at IS NULL;
