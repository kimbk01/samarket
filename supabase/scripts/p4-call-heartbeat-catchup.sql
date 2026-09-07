-- P4 Active Call heartbeat catch-up (Dashboard SQL Editor — run once)
-- Combines:
--   20260618140000_community_messenger_call_heartbeat.sql
--   20260618150000_community_messenger_call_stale_cron.sql
--   20261210120000_cm_call_terminal_writer_ssot_cut1.sql  (CUT1: detect-only, no terminal UPDATE)
--
-- CUT1: do NOT reintroduce SQL terminal mutation. Stale ends go through
--   GET/POST /api/community-messenger/calls/sessions/stale-cleanup

-- === heartbeat columns ===
alter table public.community_messenger_call_sessions
  add column if not exists caller_last_heartbeat_at timestamptz,
  add column if not exists callee_last_heartbeat_at timestamptz,
  add column if not exists reconnecting_since timestamptz;

comment on column public.community_messenger_call_sessions.caller_last_heartbeat_at is
  'Initiator last client heartbeat while status=active (P4 active call SSOT)';
comment on column public.community_messenger_call_sessions.callee_last_heartbeat_at is
  'Recipient last client heartbeat while status=active (P4 active call SSOT)';
comment on column public.community_messenger_call_sessions.reconnecting_since is
  'When either peer entered reconnecting (optional observability)';

create index if not exists community_messenger_call_sessions_active_heartbeat_idx
  on public.community_messenger_call_sessions (status, caller_last_heartbeat_at, callee_last_heartbeat_at)
  where status = 'active';

-- === CUT1 detect-only candidate counter (both-stale AND) — NO terminal UPDATE ===
CREATE OR REPLACE FUNCTION public.cleanup_stale_community_messenger_call_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stale_cutoff timestamptz := now() - interval '90 seconds';
  grace_cutoff timestamptz := now() - interval '30 seconds';
  candidate_count integer := 0;
BEGIN
  IF to_regclass('public.community_messenger_call_sessions') IS NULL THEN
    RETURN 0;
  END IF;

  SELECT count(*)::integer
    INTO candidate_count
  FROM public.community_messenger_call_sessions
  WHERE status = 'active'
    AND answered_at IS NOT NULL
    AND answered_at < grace_cutoff
    AND caller_last_heartbeat_at IS NOT NULL
    AND callee_last_heartbeat_at IS NOT NULL
    AND caller_last_heartbeat_at < stale_cutoff
    AND callee_last_heartbeat_at < stale_cutoff;

  RETURN coalesce(candidate_count, 0);
END;
$$;

COMMENT ON FUNCTION public.cleanup_stale_community_messenger_call_sessions() IS
  'CUT1 detect-only: both-stale active candidate count. Does NOT end sessions. Terminal writer = updateCommunityMessengerCallSession via /api/.../stale-cleanup.';

REVOKE ALL ON FUNCTION public.cleanup_stale_community_messenger_call_sessions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_community_messenger_call_sessions() TO service_role;

-- Unschedule legacy mutating cron if present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'cleanup_stale_cm_call_sessions';
    RAISE NOTICE 'CUT1 catchup: unscheduled cleanup_stale_cm_call_sessions';
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_function THEN NULL;
END $$;
