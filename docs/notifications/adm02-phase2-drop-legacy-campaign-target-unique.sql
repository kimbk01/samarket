-- ADM-02 phase 2 — drop legacy UNIQUE (campaign_id, user_id) on admin_notification_campaign_targets.
--
-- PRECONDITIONS (all required, Owner approval required):
--   1. supabase/migrations/20270514120000_admin_campaign_targets_occurrence_unique.sql applied.
--   2. The code that writes onConflict "occurrence_id,user_id" (campaign-target-rows.ts) is the
--      version serving Production. Code deployed BEFORE that change still writes
--      onConflict "campaign_id,user_id" and would fail with 42P10 after this script.
--
-- Effect: recurring selected_users occurrences, test sends and later occurrences get their own
-- target rows; earlier occurrences keep sent/skipped history. No row is updated or deleted.
--
-- Rollback (only possible while no user has rows in two occurrences of the same campaign):
--   do $$ begin
--     if exists (select 1 from public.admin_notification_campaign_targets
--                group by campaign_id, user_id having count(*) > 1) then
--       raise exception 'rollback blocked: per-occurrence history exists (campaign_id,user_id duplicates)';
--     end if;
--     alter table public.admin_notification_campaign_targets
--       add constraint admin_notification_campaign_targets_campaign_id_user_id_key unique (campaign_id, user_id);
--   end $$;
--   The code keeps working after rollback (it falls back to the legacy key on 42P10/23505).

begin;

alter table public.admin_notification_campaign_targets
  drop constraint if exists admin_notification_campaign_targets_campaign_id_user_id_key;

create index if not exists admin_notification_campaign_targets_campaign_user_idx
  on public.admin_notification_campaign_targets (campaign_id, user_id);

commit;
