-- Phase B: scheduled campaign atomic claim + send idempotency columns

ALTER TABLE public.admin_notification_campaigns
  ADD COLUMN IF NOT EXISTS send_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS send_claim_token text,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS send_idempotency_key text,
  ADD COLUMN IF NOT EXISTS test_send_idempotency_key text;

CREATE INDEX IF NOT EXISTS admin_notification_campaigns_scheduled_due_idx
  ON public.admin_notification_campaigns (scheduled_at ASC)
  WHERE status = 'scheduled' AND scheduled_at IS NOT NULL;

COMMENT ON COLUMN public.admin_notification_campaigns.send_claimed_at IS
  'When cron/manual send atomically claimed this campaign for sending';
COMMENT ON COLUMN public.admin_notification_campaigns.send_claim_token IS
  'Opaque claim token for the active send worker';
COMMENT ON COLUMN public.admin_notification_campaigns.last_error IS
  'Last send/cron failure reason (safe for ops; no tokens)';
COMMENT ON COLUMN public.admin_notification_campaigns.send_idempotency_key IS
  'Operational send idempotency key (draft/scheduled/failed -> sending)';
COMMENT ON COLUMN public.admin_notification_campaigns.test_send_idempotency_key IS
  'Test-send idempotency namespace (separate from operational send)';

CREATE OR REPLACE FUNCTION public.claim_due_admin_notification_campaign(
  p_claim_token text,
  p_now timestamptz DEFAULT now()
)
RETURNS SETOF public.admin_notification_campaigns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF nullif(btrim(p_claim_token), '') IS NULL THEN
    RETURN;
  END IF;

  SELECT c.id
    INTO v_id
  FROM public.admin_notification_campaigns AS c
  WHERE c.status = 'scheduled'
    AND c.scheduled_at IS NOT NULL
    AND c.scheduled_at <= p_now
    AND c.channel IS DISTINCT FROM 'test_only'
  ORDER BY c.scheduled_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.admin_notification_campaigns AS c
  SET
    status = 'sending',
    send_claimed_at = p_now,
    send_claim_token = btrim(p_claim_token),
    last_error = NULL,
    updated_at = p_now
  WHERE c.id = v_id
    AND c.status = 'scheduled'
  RETURNING c.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_due_admin_notification_campaign(text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_due_admin_notification_campaign(text, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_admin_notification_campaign_send(
  p_campaign_id uuid,
  p_idempotency_key text,
  p_claim_token text,
  p_now timestamptz DEFAULT now()
)
RETURNS TABLE (
  claimed boolean,
  already_running boolean,
  campaign public.admin_notification_campaigns
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.admin_notification_campaigns%ROWTYPE;
  v_key text := nullif(btrim(p_idempotency_key), '');
  v_token text := nullif(btrim(p_claim_token), '');
BEGIN
  IF p_campaign_id IS NULL OR v_token IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_row
  FROM public.admin_notification_campaigns
  WHERE id = p_campaign_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_row.status IN ('sending', 'sent', 'partially_failed') THEN
    IF v_key IS NOT NULL AND v_row.send_idempotency_key IS NOT NULL AND v_row.send_idempotency_key = v_key THEN
      claimed := false;
      already_running := true;
      campaign := v_row;
      RETURN NEXT;
      RETURN;
    END IF;
    claimed := false;
    already_running := true;
    campaign := v_row;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_row.status NOT IN ('draft', 'scheduled', 'failed') THEN
    claimed := false;
    already_running := false;
    campaign := v_row;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_row.channel = 'test_only' THEN
    claimed := false;
    already_running := false;
    campaign := v_row;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.admin_notification_campaigns
  SET
    status = 'sending',
    send_claimed_at = p_now,
    send_claim_token = v_token,
    send_idempotency_key = COALESCE(v_key, send_idempotency_key),
    last_error = NULL,
    updated_at = p_now
  WHERE id = p_campaign_id
  RETURNING * INTO v_row;

  claimed := true;
  already_running := false;
  campaign := v_row;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_admin_notification_campaign_send(uuid, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_admin_notification_campaign_send(uuid, text, text, timestamptz) TO service_role;
