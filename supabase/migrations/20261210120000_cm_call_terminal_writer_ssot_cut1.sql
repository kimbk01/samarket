-- CUT 1 — Terminal Writer SSOT
--
-- BEFORE: cleanup_stale_community_messenger_call_sessions() directly UPDATEd
--   status/ended_at/ended_reason (one-sided OR stale) and bypassed
--   updateCommunityMessengerCallSession (no call_stub / call_logs / terminal push).
--
-- AFTER:
--   - SQL function is DETECT-ONLY (both-stale AND semantics; never mutates terminal fields)
--   - pg_cron job unscheduled — terminal transitions must go through app authority:
--       GET/POST /api/community-messenger/calls/sessions/stale-cleanup
--       → cleanupStaleActiveCommunityMessengerCallSessions
--       → updateCommunityMessengerCallSession (FIRST VALID TERMINAL WINS)
--
-- Presence SSOT = both peers stale (AND), matching lib/call/call-active-presence.ts

BEGIN;

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
  -- CUT1: DO NOT mutate community_messenger_call_sessions terminal columns.
  -- Returns count of both-stale active candidates for observability only.
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

-- Stop pg_cron from implying SQL owns terminal transitions.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'cleanup_stale_cm_call_sessions';
    RAISE NOTICE 'CUT1: unscheduled cleanup_stale_cm_call_sessions (terminal writer moved to app stale-cleanup)';
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_function THEN NULL;
END $$;

COMMIT;
