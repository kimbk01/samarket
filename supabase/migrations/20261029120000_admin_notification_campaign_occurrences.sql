-- Admin notification campaigns — Occurrence SSOT (definition vs execution split)
-- Additive + backfill. Keeps legacy campaign columns for cutover reads.

BEGIN;

-- 1) Campaign definition extensions
ALTER TABLE public.admin_notification_campaigns
  ADD COLUMN IF NOT EXISTS create_request_id text,
  ADD COLUMN IF NOT EXISTS is_qa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS send_mode text NOT NULL DEFAULT 'immediate',
  ADD COLUMN IF NOT EXISTS recurrence_kind text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS recurrence_time time,
  ADD COLUMN IF NOT EXISTS recurrence_timezone text NOT NULL DEFAULT 'Asia/Seoul',
  ADD COLUMN IF NOT EXISTS recurrence_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS recurrence_end_at timestamptz,
  ADD COLUMN IF NOT EXISTS recurrence_max_count int,
  ADD COLUMN IF NOT EXISTS recurrence_weekday smallint,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scheduled_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS send_lease_expires_at timestamptz;

COMMENT ON COLUMN public.admin_notification_campaigns.create_request_id IS
  'Client create idempotency key — UNIQUE when set prevents duplicate campaign rows';
COMMENT ON COLUMN public.admin_notification_campaigns.is_qa IS
  'QA/test campaign — hidden from production default list';
COMMENT ON COLUMN public.admin_notification_campaigns.send_mode IS
  'immediate | scheduled | recurring';
COMMENT ON COLUMN public.admin_notification_campaigns.send_lease_expires_at IS
  'Occurrence send lease expiry for stuck recovery';

CREATE UNIQUE INDEX IF NOT EXISTS admin_notification_campaigns_create_request_uidx
  ON public.admin_notification_campaigns (create_request_id)
  WHERE create_request_id IS NOT NULL AND length(trim(create_request_id)) > 0;

ALTER TABLE public.admin_notification_campaigns
  DROP CONSTRAINT IF EXISTS admin_notification_campaigns_send_mode_check;
ALTER TABLE public.admin_notification_campaigns
  ADD CONSTRAINT admin_notification_campaigns_send_mode_check CHECK (
    send_mode IN ('immediate', 'scheduled', 'recurring')
  );

ALTER TABLE public.admin_notification_campaigns
  DROP CONSTRAINT IF EXISTS admin_notification_campaigns_recurrence_kind_check;
ALTER TABLE public.admin_notification_campaigns
  ADD CONSTRAINT admin_notification_campaigns_recurrence_kind_check CHECK (
    recurrence_kind IN ('none', 'daily', 'weekly', 'monthly')
  );

ALTER TABLE public.admin_notification_campaigns
  DROP CONSTRAINT IF EXISTS admin_notification_campaigns_status_check;
ALTER TABLE public.admin_notification_campaigns
  ADD CONSTRAINT admin_notification_campaigns_status_check CHECK (
    status IN (
      'draft',
      'scheduled',
      'active',
      'paused',
      'ended',
      'cancelled',
      'sending',
      'sent',
      'partially_failed',
      'failed'
    )
  );

-- 2) Occurrence table — one row = one logical send execution
CREATE TABLE IF NOT EXISTS public.admin_notification_campaign_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.admin_notification_campaigns (id) ON DELETE CASCADE,
  sequence_number int NOT NULL DEFAULT 1,
  trigger_type text NOT NULL DEFAULT 'immediate' CHECK (
    trigger_type IN ('immediate', 'scheduled', 'recurring', 'recovery', 'test')
  ),
  scheduled_for timestamptz,
  status text NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'sending', 'sent', 'partially_failed', 'failed', 'cancelled')
  ),
  idempotency_key text,
  send_claim_token text,
  send_claimed_at timestamptz,
  send_lease_expires_at timestamptz,
  send_progress_offset int NOT NULL DEFAULT 0,
  last_error text,
  -- audience snapshot at dispatch start
  target_member_count int NOT NULL DEFAULT 0,
  push_eligible_member_count int NOT NULL DEFAULT 0,
  push_device_count int NOT NULL DEFAULT 0,
  in_app_member_count int NOT NULL DEFAULT 0,
  -- channel-separated metrics (NOT combined sent_count)
  push_attempted int NOT NULL DEFAULT 0,
  push_sent int NOT NULL DEFAULT 0,
  push_skipped int NOT NULL DEFAULT 0,
  push_failed int NOT NULL DEFAULT 0,
  in_app_attempted int NOT NULL DEFAULT 0,
  in_app_sent int NOT NULL DEFAULT 0,
  in_app_skipped int NOT NULL DEFAULT 0,
  in_app_failed int NOT NULL DEFAULT 0,
  -- content snapshot (immutable after dispatch starts)
  content_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  audience_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  triggered_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  cancelled_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_notification_campaign_occurrences_campaign_seq_uidx
  ON public.admin_notification_campaign_occurrences (campaign_id, sequence_number);

CREATE UNIQUE INDEX IF NOT EXISTS admin_notification_campaign_occurrences_idempotency_uidx
  ON public.admin_notification_campaign_occurrences (campaign_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND length(trim(idempotency_key)) > 0;

CREATE UNIQUE INDEX IF NOT EXISTS admin_notification_campaign_occurrences_scheduled_uidx
  ON public.admin_notification_campaign_occurrences (campaign_id, scheduled_for)
  WHERE scheduled_for IS NOT NULL AND status IN ('queued', 'sending');

CREATE INDEX IF NOT EXISTS admin_notification_campaign_occurrences_due_idx
  ON public.admin_notification_campaign_occurrences (scheduled_for ASC)
  WHERE status = 'queued' AND scheduled_for IS NOT NULL;

CREATE INDEX IF NOT EXISTS admin_notification_campaign_occurrences_campaign_idx
  ON public.admin_notification_campaign_occurrences (campaign_id, created_at DESC);

ALTER TABLE public.admin_notification_campaign_occurrences ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.admin_notification_campaign_occurrences IS
  'Admin campaign execution SSOT — one row per logical send (immediate/scheduled/recurring occurrence)';

-- 3) Link deliveries + targets to occurrence
ALTER TABLE public.notification_campaign_deliveries
  ADD COLUMN IF NOT EXISTS occurrence_id uuid REFERENCES public.admin_notification_campaign_occurrences (id) ON DELETE CASCADE;

ALTER TABLE public.admin_notification_campaign_targets
  ADD COLUMN IF NOT EXISTS occurrence_id uuid REFERENCES public.admin_notification_campaign_occurrences (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS notification_campaign_deliveries_occurrence_idx
  ON public.notification_campaign_deliveries (occurrence_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS notification_campaign_deliveries_occurrence_user_device_channel_uidx
  ON public.notification_campaign_deliveries (
    occurrence_id,
    user_id,
    COALESCE(device_id, '00000000-0000-0000-0000-000000000000'::uuid),
    channel
  )
  WHERE occurrence_id IS NOT NULL;

-- 4) Backfill — one occurrence per legacy terminal/in-flight campaign
INSERT INTO public.admin_notification_campaign_occurrences (
  campaign_id,
  sequence_number,
  trigger_type,
  scheduled_for,
  status,
  send_progress_offset,
  target_member_count,
  push_sent,
  push_skipped,
  push_failed,
  in_app_sent,
  in_app_skipped,
  in_app_failed,
  started_at,
  completed_at,
  content_snapshot,
  created_at,
  updated_at
)
SELECT
  c.id,
  1,
  CASE
    WHEN c.scheduled_at IS NOT NULL AND c.status IN ('scheduled', 'draft') THEN 'scheduled'
    ELSE 'immediate'
  END,
  c.scheduled_at,
  CASE c.status
    WHEN 'sending' THEN 'sending'
    WHEN 'sent' THEN 'sent'
    WHEN 'partially_failed' THEN 'partially_failed'
    WHEN 'failed' THEN 'failed'
    WHEN 'cancelled' THEN 'cancelled'
    WHEN 'scheduled' THEN 'queued'
    ELSE 'queued'
  END,
  COALESCE(c.send_progress_offset, 0),
  COALESCE(c.target_count, 0),
  COALESCE(c.sent_count, 0),
  COALESCE(c.skipped_count, 0),
  COALESCE(c.failed_count, 0),
  0,
  0,
  0,
  c.send_claimed_at,
  c.sent_at,
  jsonb_build_object(
    'title', c.title,
    'body', c.body,
    'type', c.type,
    'channel', c.channel,
    'deeplink_url', c.deeplink_url,
    'web_url', c.web_url,
    'push_image_url', c.push_image_url,
    'in_app_image_url', c.in_app_image_url
  ),
  c.created_at,
  c.updated_at
FROM public.admin_notification_campaigns AS c
WHERE NOT EXISTS (
  SELECT 1
  FROM public.admin_notification_campaign_occurrences AS o
  WHERE o.campaign_id = c.id
);

UPDATE public.notification_campaign_deliveries AS d
SET occurrence_id = o.id
FROM public.admin_notification_campaign_occurrences AS o
WHERE d.occurrence_id IS NULL
  AND o.campaign_id = d.campaign_id
  AND o.sequence_number = 1;

UPDATE public.admin_notification_campaign_targets AS t
SET occurrence_id = o.id
FROM public.admin_notification_campaign_occurrences AS o
WHERE t.occurrence_id IS NULL
  AND o.campaign_id = t.campaign_id
  AND o.sequence_number = 1;

-- Mark obvious QA rows (title prefix heuristic for backfill only — not runtime authority)
UPDATE public.admin_notification_campaigns
SET is_qa = true
WHERE is_qa = false
  AND (
    title ILIKE '[QA-%'
    OR title ILIKE 'QA-%'
    OR title ILIKE '%[QA]%'
    OR channel = 'test_only'
  );

-- 5) Occurrence claim RPC — scheduled/recurring due → sending
CREATE OR REPLACE FUNCTION public.claim_due_admin_notification_campaign_occurrence(
  p_claim_token text,
  p_now timestamptz DEFAULT now(),
  p_lease_seconds int DEFAULT 600
)
RETURNS SETOF public.admin_notification_campaign_occurrences
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_lease timestamptz := p_now + make_interval(secs => GREATEST(60, LEAST(p_lease_seconds, 3600)));
BEGIN
  IF nullif(btrim(p_claim_token), '') IS NULL THEN
    RETURN;
  END IF;

  -- Reclaim stuck sending occurrences (lease expired)
  UPDATE public.admin_notification_campaign_occurrences AS o
  SET
    status = 'queued',
    send_claim_token = NULL,
    send_claimed_at = NULL,
    send_lease_expires_at = NULL,
    last_error = COALESCE(o.last_error, 'lease_expired_requeued'),
    updated_at = p_now
  WHERE o.status = 'sending'
    AND o.send_lease_expires_at IS NOT NULL
    AND o.send_lease_expires_at < p_now;

  SELECT o.id
    INTO v_id
  FROM public.admin_notification_campaign_occurrences AS o
  INNER JOIN public.admin_notification_campaigns AS c ON c.id = o.campaign_id
  WHERE o.status = 'queued'
    AND o.scheduled_for IS NOT NULL
    AND o.scheduled_for <= p_now
    AND c.status NOT IN ('cancelled', 'ended', 'paused')
    AND c.channel IS DISTINCT FROM 'test_only'
  ORDER BY o.scheduled_for ASC
  FOR UPDATE OF o SKIP LOCKED
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.admin_notification_campaign_occurrences AS o
  SET
    status = 'sending',
    send_claim_token = btrim(p_claim_token),
    send_claimed_at = p_now,
    send_lease_expires_at = v_lease,
    started_at = COALESCE(o.started_at, p_now),
    last_error = NULL,
    updated_at = p_now
  WHERE o.id = v_id
    AND o.status = 'queued'
  RETURNING o.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_due_admin_notification_campaign_occurrence(text, timestamptz, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_due_admin_notification_campaign_occurrence(text, timestamptz, int) TO service_role;

-- 6) Manual/immediate occurrence send claim
CREATE OR REPLACE FUNCTION public.claim_admin_notification_campaign_occurrence_send(
  p_occurrence_id uuid,
  p_idempotency_key text,
  p_claim_token text,
  p_now timestamptz DEFAULT now(),
  p_lease_seconds int DEFAULT 600
)
RETURNS TABLE (
  claimed boolean,
  already_running boolean,
  occurrence public.admin_notification_campaign_occurrences
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.admin_notification_campaign_occurrences%ROWTYPE;
  v_key text := nullif(btrim(p_idempotency_key), '');
  v_token text := nullif(btrim(p_claim_token), '');
  v_lease timestamptz := p_now + make_interval(secs => GREATEST(60, LEAST(p_lease_seconds, 3600)));
BEGIN
  IF p_occurrence_id IS NULL OR v_token IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_row
  FROM public.admin_notification_campaign_occurrences
  WHERE id = p_occurrence_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_row.status IN ('sending', 'sent', 'partially_failed') THEN
    IF v_key IS NOT NULL AND v_row.idempotency_key IS NOT NULL AND v_row.idempotency_key = v_key THEN
      claimed := false;
      already_running := true;
      occurrence := v_row;
      RETURN NEXT;
      RETURN;
    END IF;
    claimed := false;
    already_running := true;
    occurrence := v_row;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_row.status NOT IN ('queued', 'failed') THEN
    claimed := false;
    already_running := false;
    occurrence := v_row;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.admin_notification_campaign_occurrences
  SET
    status = 'sending',
    send_claim_token = v_token,
    send_claimed_at = p_now,
    send_lease_expires_at = v_lease,
    idempotency_key = COALESCE(v_key, idempotency_key),
    started_at = COALESCE(started_at, p_now),
    last_error = NULL,
    updated_at = p_now
  WHERE id = p_occurrence_id
  RETURNING * INTO v_row;

  claimed := true;
  already_running := false;
  occurrence := v_row;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_admin_notification_campaign_occurrence_send(uuid, text, text, timestamptz, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_admin_notification_campaign_occurrence_send(uuid, text, text, timestamptz, int) TO service_role;

-- 7) Idempotent occurrence insert (scheduled/recurring)
CREATE OR REPLACE FUNCTION public.ensure_admin_notification_campaign_occurrence(
  p_campaign_id uuid,
  p_sequence_number int,
  p_trigger_type text,
  p_scheduled_for timestamptz,
  p_idempotency_key text,
  p_triggered_by uuid DEFAULT NULL,
  p_content_snapshot jsonb DEFAULT '{}'::jsonb,
  p_now timestamptz DEFAULT now()
)
RETURNS public.admin_notification_campaign_occurrences
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.admin_notification_campaign_occurrences%ROWTYPE;
  v_key text := nullif(btrim(p_idempotency_key), '');
BEGIN
  IF p_campaign_id IS NULL THEN
    RAISE EXCEPTION 'campaign_id_required';
  END IF;

  IF v_key IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.admin_notification_campaign_occurrences
    WHERE campaign_id = p_campaign_id
      AND idempotency_key = v_key
    LIMIT 1;
    IF FOUND THEN
      RETURN v_existing;
    END IF;
  END IF;

  IF p_scheduled_for IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.admin_notification_campaign_occurrences
    WHERE campaign_id = p_campaign_id
      AND scheduled_for = p_scheduled_for
      AND status IN ('queued', 'sending', 'sent', 'partially_failed', 'failed')
    LIMIT 1;
    IF FOUND THEN
      RETURN v_existing;
    END IF;
  END IF;

  INSERT INTO public.admin_notification_campaign_occurrences (
    campaign_id,
    sequence_number,
    trigger_type,
    scheduled_for,
    status,
    idempotency_key,
    triggered_by,
    content_snapshot,
    created_at,
    updated_at
  )
  VALUES (
    p_campaign_id,
    GREATEST(1, COALESCE(p_sequence_number, 1)),
    COALESCE(nullif(btrim(p_trigger_type), ''), 'immediate'),
    p_scheduled_for,
    'queued',
    v_key,
    p_triggered_by,
    COALESCE(p_content_snapshot, '{}'::jsonb),
    p_now,
    p_now
  )
  ON CONFLICT (campaign_id, sequence_number) DO UPDATE
  SET updated_at = p_now
  RETURNING * INTO v_existing;

  RETURN v_existing;
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing
    FROM public.admin_notification_campaign_occurrences
    WHERE campaign_id = p_campaign_id
      AND (
        (v_key IS NOT NULL AND idempotency_key = v_key)
        OR (p_scheduled_for IS NOT NULL AND scheduled_for = p_scheduled_for)
      )
    ORDER BY created_at DESC
    LIMIT 1;
    IF FOUND THEN
      RETURN v_existing;
    END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_admin_notification_campaign_occurrence(uuid, int, text, timestamptz, text, uuid, jsonb, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_admin_notification_campaign_occurrence(uuid, int, text, timestamptz, text, uuid, jsonb, timestamptz) TO service_role;

COMMIT;
