-- 운영자 알림 남은 결함 단계 C (Owner 「설계안 승인」 2026-11-04)
-- 설계: docs/audit/admin-push-fix-confirmed-design-2026-11-04.md §3

-- C-1 (I-5) 알림 id 로 발송 기록 찾기(열람·닫음) -------------------------------
CREATE INDEX IF NOT EXISTS notification_campaign_deliveries_event_idx
  ON public.notification_campaign_deliveries (notification_event_id)
  WHERE notification_event_id IS NOT NULL;

-- C-2 (D-1) 받는 사람 기록 고유성 = 회차 단위만 ------------------------------------
-- 예전 캠페인 단위 키가 있으면 반복 2회차 기록이 1회차 행을 덮어썼다. 회차 없는 예전 행만 캠페인 단위 유지.
CREATE UNIQUE INDEX IF NOT EXISTS admin_notification_campaign_targets_legacy_campaign_user_uidx
  ON public.admin_notification_campaign_targets (campaign_id, user_id)
  WHERE occurrence_id IS NULL;
ALTER TABLE public.admin_notification_campaign_targets
  DROP CONSTRAINT IF EXISTS admin_notification_campaign_targets_campaign_id_user_id_key;
DROP INDEX IF EXISTS public.admin_notification_campaign_targets_campaign_id_user_id_key;

-- C-5 회차 열 ------------------------------------------------------------------
ALTER TABLE public.admin_notification_campaign_occurrences
  ADD COLUMN IF NOT EXISTS record_error_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS send_progress_cursor text,
  ADD COLUMN IF NOT EXISTS active_since timestamptz;

-- C-6 (C-5, C-6) 회차 번호 = 함수 안에서 배정 · 같은 번호 다른 종류면 오류 --------------
CREATE OR REPLACE FUNCTION public.ensure_admin_notification_campaign_occurrence(
  p_campaign_id uuid,
  p_sequence_number integer,
  p_trigger_type text,
  p_scheduled_for timestamp with time zone,
  p_idempotency_key text,
  p_triggered_by uuid DEFAULT NULL::uuid,
  p_content_snapshot jsonb DEFAULT '{}'::jsonb,
  p_now timestamp with time zone DEFAULT now()
)
RETURNS public.admin_notification_campaign_occurrences
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing public.admin_notification_campaign_occurrences%ROWTYPE;
  v_key text := nullif(btrim(p_idempotency_key), '');
  v_trigger text := COALESCE(nullif(btrim(p_trigger_type), ''), 'immediate');
  v_seq integer;
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

  IF p_sequence_number IS NULL THEN
    -- 같은 캠페인의 번호 배정을 한 줄로 세운다(동시 생성 시 같은 번호 방지).
    PERFORM 1 FROM public.admin_notification_campaigns WHERE id = p_campaign_id FOR UPDATE;
    SELECT COALESCE(max(sequence_number), 0) + 1 INTO v_seq
    FROM public.admin_notification_campaign_occurrences
    WHERE campaign_id = p_campaign_id;
  ELSE
    v_seq := GREATEST(1, p_sequence_number);
  END IF;

  INSERT INTO public.admin_notification_campaign_occurrences (
    campaign_id, sequence_number, trigger_type, scheduled_for, status,
    idempotency_key, triggered_by, content_snapshot, created_at, updated_at
  )
  VALUES (
    p_campaign_id, v_seq, v_trigger, p_scheduled_for, 'queued',
    v_key, p_triggered_by, COALESCE(p_content_snapshot, '{}'::jsonb), p_now, p_now
  )
  ON CONFLICT (campaign_id, sequence_number) DO UPDATE
  SET updated_at = p_now
  WHERE admin_notification_campaign_occurrences.trigger_type = EXCLUDED.trigger_type
  RETURNING * INTO v_existing;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'occurrence_sequence_conflict';
  END IF;

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
$function$;

REVOKE EXECUTE ON FUNCTION public.ensure_admin_notification_campaign_occurrence(uuid, integer, text, timestamp with time zone, text, uuid, jsonb, timestamp with time zone)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_admin_notification_campaign_occurrence(uuid, integer, text, timestamp with time zone, text, uuid, jsonb, timestamp with time zone)
  TO service_role;
