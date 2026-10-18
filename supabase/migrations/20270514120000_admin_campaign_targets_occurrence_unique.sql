-- ADM-02 phase 1 — per-occurrence target history for admin notification campaigns.
--
-- Adds UNIQUE (occurrence_id, user_id) next to the legacy UNIQUE (campaign_id, user_id).
-- ADDITIVE ONLY: no row is updated or deleted.
--   * Compatible with the currently deployed code (it writes onConflict campaign_id,user_id).
--   * Compatible with the new code (it writes onConflict occurrence_id,user_id and falls back to
--     the legacy key on 42P10 / 23505), see lib/admin/notification-campaigns/campaign-target-rows.ts.
--   * Existing rows: one row per (campaign, user) and an occurrence belongs to one campaign, so
--     (occurrence_id, user_id) cannot collide. Rows with occurrence_id NULL (legacy, pre-occurrence)
--     are allowed multiple times (NULLS DISTINCT) and are left untouched.
--   Production pre-check (2026-10-18, read-only): 923 rows, 10 with NULL occurrence_id,
--   0 duplicate (occurrence_id, user_id).
--
-- Phase 2 (drop the legacy unique) is NOT in this folder on purpose: it must run only after the
-- new code is deployed — docs/notifications/adm02-phase2-drop-legacy-campaign-target-unique.sql.
--
-- Rollback:
--   alter table public.admin_notification_campaign_targets
--     drop constraint if exists admin_notification_campaign_targets_occurrence_user_key;

begin;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.admin_notification_campaign_targets'::regclass
      and conname = 'admin_notification_campaign_targets_occurrence_user_key'
  ) then
    alter table public.admin_notification_campaign_targets
      add constraint admin_notification_campaign_targets_occurrence_user_key
      unique (occurrence_id, user_id);
  end if;
end $$;

commit;
