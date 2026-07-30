-- Phase 3 S1 preflight / verification (run in Supabase SQL editor)
-- Apply migrations:
--   20261011120000_cm_group_invite_links.sql
--   20261011123000_cm_group_join_requests.sql

-- PREFLIGHT: no action required beyond existing Phase2 owner uniqueness

-- VERIFICATION after apply
SELECT to_regclass('public.community_messenger_group_invite_links') AS invite_links_table;
SELECT to_regclass('public.community_messenger_group_join_requests') AS join_requests_table;

SELECT proname
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN (
    'community_messenger_create_group_invite_link',
    'community_messenger_update_group_invite_link',
    'community_messenger_revoke_group_invite_link',
    'community_messenger_join_group_via_invite_link',
    'community_messenger_request_group_join',
    'community_messenger_cancel_group_join_request',
    'community_messenger_decide_group_join_request',
    'community_messenger_close_pending_join_on_direct_add',
    'cm_sync_room_default_invite_token',
    'cm_group_activate_member'
  )
ORDER BY 1;

-- Expect: default links backfilled for rooms that had invite_token
SELECT count(*) AS default_active_links
FROM public.community_messenger_group_invite_links
WHERE is_default = true AND revoked_at IS NULL;
