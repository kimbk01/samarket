-- SR-1 P2: commerce push handoff state on existing notification_events (no outbox table).
-- Inbox authority remains notification_events; push recovery uses these columns + claim RPC.

ALTER TABLE public.notification_events
  ADD COLUMN IF NOT EXISTS push_handoff_status text NULL,
  ADD COLUMN IF NOT EXISTS push_handoff_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS push_handoff_next_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS push_handoff_claimed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS push_handoff_claim_token text NULL,
  ADD COLUMN IF NOT EXISTS push_handoff_last_error text NULL;

ALTER TABLE public.notification_events
  DROP CONSTRAINT IF EXISTS notification_events_push_handoff_status_check;
ALTER TABLE public.notification_events
  ADD CONSTRAINT notification_events_push_handoff_status_check CHECK (
    push_handoff_status IS NULL
    OR push_handoff_status IN ('pending', 'retryable', 'terminal', 'handed_off')
  );

CREATE INDEX IF NOT EXISTS notification_events_push_handoff_due_idx
  ON public.notification_events (push_handoff_next_at ASC NULLS LAST, created_at ASC)
  WHERE push_handoff_status IN ('pending', 'retryable');

COMMENT ON COLUMN public.notification_events.push_handoff_status IS
  'SR-1 P2 commerce push handoff: pending|retryable|terminal|handed_off. NULL = non-managed / legacy.';
COMMENT ON COLUMN public.notification_events.push_handoff_attempts IS
  'Push handoff attempt count for recoverable commerce dispatch.';
COMMENT ON COLUMN public.notification_events.push_handoff_next_at IS
  'Earliest time retry owner may claim this event for push handoff.';

CREATE OR REPLACE FUNCTION public.claim_commerce_notification_push_handoff(
  p_limit integer DEFAULT 20,
  p_claim_token text DEFAULT NULL,
  p_stale_claim_seconds integer DEFAULT 120
)
RETURNS SETOF public.notification_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text := nullif(btrim(coalesce(p_claim_token, '')), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 100));
  v_stale interval := make_interval(secs => greatest(30, coalesce(p_stale_claim_seconds, 120)));
BEGIN
  IF v_token IS NULL THEN
    RAISE EXCEPTION 'claim_token_required';
  END IF;

  RETURN QUERY
  WITH due AS (
    SELECT e.id
    FROM public.notification_events e
    WHERE e.push_handoff_status IN ('pending', 'retryable')
      AND e.push_handoff_next_at IS NOT NULL
      AND e.push_handoff_next_at <= now()
      AND (
        e.push_handoff_claimed_at IS NULL
        OR e.push_handoff_claimed_at < now() - v_stale
      )
      AND e.type IN ('order_status', 'delivery_status')
    ORDER BY e.push_handoff_next_at ASC, e.created_at ASC
    FOR UPDATE OF e SKIP LOCKED
    LIMIT v_limit
  ),
  claimed AS (
    UPDATE public.notification_events e
    SET
      push_handoff_claimed_at = now(),
      push_handoff_claim_token = v_token,
      push_handoff_attempts = e.push_handoff_attempts + 1
    FROM due
    WHERE e.id = due.id
    RETURNING e.*
  )
  SELECT * FROM claimed;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_commerce_notification_push_handoff(integer, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_commerce_notification_push_handoff(integer, text, integer) TO service_role;

COMMENT ON FUNCTION public.claim_commerce_notification_push_handoff(integer, text, integer) IS
  'SR-1 P2: atomically claim due commerce notification_events for recoverable push handoff.';
