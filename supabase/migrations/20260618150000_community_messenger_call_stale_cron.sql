-- P4 Active Call — stale heartbeat cleanup via pg_cron (one-sided: either peer silent > 90s)

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
  ended_count integer := 0;
  r record;
BEGIN
  IF to_regclass('public.community_messenger_call_sessions') IS NULL THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT id
    FROM public.community_messenger_call_sessions
    WHERE status = 'active'
      AND answered_at IS NOT NULL
      AND answered_at < grace_cutoff
      AND caller_last_heartbeat_at IS NOT NULL
      AND callee_last_heartbeat_at IS NOT NULL
      AND (
        caller_last_heartbeat_at < stale_cutoff
        OR callee_last_heartbeat_at < stale_cutoff
      )
  LOOP
    UPDATE public.community_messenger_call_sessions
      SET status = 'ended',
          ended_at = now(),
          ended_reason = 'heartbeat_timeout',
          updated_at = now()
    WHERE id = r.id
      AND status = 'active';
    IF FOUND THEN
      ended_count := ended_count + 1;
    END IF;
  END LOOP;

  RETURN ended_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_stale_community_messenger_call_sessions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_community_messenger_call_sessions() TO service_role;

COMMIT;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'cleanup_stale_cm_call_sessions';

    PERFORM cron.schedule(
      'cleanup_stale_cm_call_sessions',
      '*/2 * * * *',
      $cron$SELECT public.cleanup_stale_community_messenger_call_sessions();$cron$
    );
    RAISE NOTICE 'cleanup_stale_cm_call_sessions: cron.schedule registered (*/2 * * * *)';
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_function THEN NULL;
END $$;
