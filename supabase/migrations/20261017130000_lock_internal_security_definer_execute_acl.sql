-- DIBAY Security ACL Phase 1 — lock internal SECURITY DEFINER EXECUTE
-- Project: ckdosyydvgzqwpbwuhon
-- Evidence: .qa-logs/security-acl-dump-20260804/acl-dump.json (live proacl)
--
-- Scope: EXECUTE privilege only on 12 proven internal/service functions.
-- No CREATE/REPLACE/DROP, no body/RLS/view/search_path changes, no schema-wide ACL.
--
-- Current Production (live dump): anon=true, authenticated=true, service_role=true
--   (some triggers also PUBLIC=true)
-- Expected after THIS migration: PUBLIC=false, anon=false, authenticated=false, service_role=true
-- Applied: NO
-- Verified: NO
--
-- EXCLUDED (do not touch here):
--   Phase 2: dibay_append_room_message_atomic, dibay_mark_room_read_atomic
--   KEEP: cm_is_room_participant, cm_is_room_admin, posts_mask_reserved_buyer_id,
--         is_platform_admin, is_admin_user
--   search_path-only later: cm_room_summary_try_parse_jsonb(text)
--   Dashboard: auth_leaked_password_protection

BEGIN;

-- ---------------------------------------------------------------------------
-- Existence gate — fail loud if any exact signature missing (no silent skip)
-- Signatures match Production ACL dump identity args (types only).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  missing_functions text[];
BEGIN
  SELECT array_agg(expected_signature ORDER BY expected_signature)
  INTO missing_functions
  FROM (
    VALUES
      ('public.claim_due_admin_notification_campaign(text, timestamp with time zone)'),
      ('public.claim_admin_notification_campaign_send(uuid, text, text, timestamp with time zone)'),
      ('public.cm_sync_room_default_invite_token(uuid)'),
      ('public.cm_group_activate_member(uuid, uuid)'),
      ('public.cm_group_is_user_banned(uuid, uuid)'),
      ('public.cm_group_room_is_deleted(uuid)'),
      ('public.dibay_cm_canonical_unread_count(uuid, uuid)'),
      ('public.cm_block_rejoin_on_deleted_group()'),
      ('public.cm_block_write_on_deleted_group()'),
      ('public.cm_participants_guard_privileged_insert()'),
      ('public.cm_participants_guard_privileged_update()'),
      ('public.community_messenger_open_leave_interval()')
  ) AS expected(expected_signature)
  WHERE to_regprocedure(expected_signature) IS NULL;

  IF missing_functions IS NOT NULL THEN
    RAISE EXCEPTION
      'Required functions missing: %',
      array_to_string(missing_functions, ', ');
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- A) Campaign / service worker only
-- Callers: cron/admin service_role routes (claim-scheduled-campaign.ts)
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.claim_due_admin_notification_campaign(text, timestamp with time zone)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_due_admin_notification_campaign(text, timestamp with time zone)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_due_admin_notification_campaign(text, timestamp with time zone)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_admin_notification_campaign(text, timestamp with time zone)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.claim_admin_notification_campaign_send(uuid, text, text, timestamp with time zone)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_admin_notification_campaign_send(uuid, text, text, timestamp with time zone)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_admin_notification_campaign_send(uuid, text, text, timestamp with time zone)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_admin_notification_campaign_send(uuid, text, text, timestamp with time zone)
  TO service_role;

-- ---------------------------------------------------------------------------
-- B) Group internal / service helpers
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.cm_sync_room_default_invite_token(uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cm_sync_room_default_invite_token(uuid)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.cm_sync_room_default_invite_token(uuid)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cm_sync_room_default_invite_token(uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.cm_group_activate_member(uuid, uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cm_group_activate_member(uuid, uuid)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.cm_group_activate_member(uuid, uuid)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cm_group_activate_member(uuid, uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.cm_group_is_user_banned(uuid, uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cm_group_is_user_banned(uuid, uuid)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.cm_group_is_user_banned(uuid, uuid)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cm_group_is_user_banned(uuid, uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.cm_group_room_is_deleted(uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cm_group_room_is_deleted(uuid)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.cm_group_room_is_deleted(uuid)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cm_group_room_is_deleted(uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- C) Canonical unread internal helper (called from mark_read DEFINER / service)
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.dibay_cm_canonical_unread_count(uuid, uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dibay_cm_canonical_unread_count(uuid, uuid)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.dibay_cm_canonical_unread_count(uuid, uuid)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.dibay_cm_canonical_unread_count(uuid, uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- D) Trigger / internal only (RPC surface lock; trigger fire is separate)
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.cm_block_rejoin_on_deleted_group()
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cm_block_rejoin_on_deleted_group()
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.cm_block_rejoin_on_deleted_group()
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cm_block_rejoin_on_deleted_group()
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.cm_block_write_on_deleted_group()
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cm_block_write_on_deleted_group()
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.cm_block_write_on_deleted_group()
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cm_block_write_on_deleted_group()
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.cm_participants_guard_privileged_insert()
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cm_participants_guard_privileged_insert()
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.cm_participants_guard_privileged_insert()
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cm_participants_guard_privileged_insert()
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.cm_participants_guard_privileged_update()
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cm_participants_guard_privileged_update()
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.cm_participants_guard_privileged_update()
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cm_participants_guard_privileged_update()
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.community_messenger_open_leave_interval()
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.community_messenger_open_leave_interval()
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.community_messenger_open_leave_interval()
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.community_messenger_open_leave_interval()
  TO service_role;

COMMIT;

-- ---------------------------------------------------------------------------
-- Expected ACL after apply (NOT applied / NOT verified in this draft step)
--
-- | target (Phase 1 ×12) | PUBLIC | anon | authenticated | service_role |
-- | -------------------- | -----: | ---: | ------------: | -----------: |
-- | all 12 above         |  false | false|         false |         true |
--
-- Current Production: anon/authenticated exposed (live dump 2026-08-04)
-- Expected after migration: anon/authenticated denied
-- Applied: NO
-- Verified: NO
--
-- Rollback (manual, if ever applied and must undo — do NOT run now):
--   Re-GRANT EXECUTE to anon/authenticated only if a regression requires it;
--   prefer re-dump proacl and restore prior grants from acl-dump.json.
-- ---------------------------------------------------------------------------
