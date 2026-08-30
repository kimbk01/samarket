-- Delivery Ads activation bridge: system SCHEDULED→ACTIVE / ACTIVE→ENDED.
-- Separate from admin_delivery_ad_transition so paused CUT3 rewrites do not erase this authority.
-- No Business Cash / billing / CUT3 ops case side effects.

BEGIN;

CREATE OR REPLACE FUNCTION public.delivery_ad_system_schedule_transition(
  p_product_kind text,
  p_campaign_id uuid,
  p_action text,
  p_expected_lifecycle text,
  p_expected_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_from text;
  v_to text;
  v_now timestamptz := now();
  v_audit_action text;
  v_audit_id uuid;
  v_is_active boolean;
BEGIN
  IF p_campaign_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'campaign_not_found');
  END IF;

  IF p_product_kind NOT IN ('store_sponsored', 'banner') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_product');
  END IF;

  IF p_action NOT IN ('activate_due', 'end_due') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_action');
  END IF;

  IF p_product_kind = 'banner' THEN
    SELECT * INTO v_row FROM public.store_banner_ad_campaigns WHERE id = p_campaign_id FOR UPDATE;
  ELSE
    SELECT * INTO v_row FROM public.store_paid_ad_campaigns WHERE id = p_campaign_id FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'campaign_not_found');
  END IF;

  v_from := v_row.lifecycle_status;

  IF p_expected_lifecycle IS NOT NULL AND v_from IS DISTINCT FROM p_expected_lifecycle THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stale_lifecycle', 'current', v_from);
  END IF;
  IF p_expected_updated_at IS NOT NULL AND v_row.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stale_updated_at');
  END IF;

  IF p_action = 'activate_due' THEN
    IF v_from IS DISTINCT FROM 'SCHEDULED' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'illegal_transition', 'from', v_from, 'to', 'ACTIVE');
    END IF;
    IF v_row.start_at > v_now THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_due', 'detail', 'start_at_future');
    END IF;
    IF v_row.end_at <= v_now THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_due', 'detail', 'end_at_passed');
    END IF;
    v_to := 'ACTIVE';
    v_audit_action := 'system_activated';
  ELSE
    -- end_due: ACTIVE (or overdue SCHEDULED) past end_at → ENDED
    IF v_from NOT IN ('ACTIVE', 'SCHEDULED') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'illegal_transition', 'from', v_from, 'to', 'ENDED');
    END IF;
    IF v_row.end_at > v_now THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_due', 'detail', 'end_at_future');
    END IF;
    v_to := 'ENDED';
    v_audit_action := 'system_ended';
  END IF;

  v_is_active := (v_to IN ('ACTIVE', 'SCHEDULED'));

  IF p_product_kind = 'banner' THEN
    UPDATE public.store_banner_ad_campaigns SET
      lifecycle_status = v_to,
      is_active = v_is_active,
      activated_at = CASE WHEN v_to = 'ACTIVE' THEN COALESCE(activated_at, v_now) ELSE activated_at END,
      ended_at = CASE WHEN v_to = 'ENDED' THEN v_now ELSE ended_at END,
      updated_at = v_now
    WHERE id = p_campaign_id;
  ELSE
    UPDATE public.store_paid_ad_campaigns SET
      lifecycle_status = v_to,
      is_active = v_is_active,
      activated_at = CASE WHEN v_to = 'ACTIVE' THEN COALESCE(activated_at, v_now) ELSE activated_at END,
      ended_at = CASE WHEN v_to = 'ENDED' THEN v_now ELSE ended_at END,
      updated_at = v_now
    WHERE id = p_campaign_id;
  END IF;

  INSERT INTO public.delivery_ad_audit_logs (
    product_kind, campaign_id, actor_type, actor_user_id, action, reason, before_json, after_json
  ) VALUES (
    p_product_kind,
    p_campaign_id,
    'system',
    NULL,
    v_audit_action,
    NULL,
    jsonb_build_object('lifecycle', v_from, 'updated_at', v_row.updated_at),
    jsonb_build_object('lifecycle', v_to, 'action', p_action)
  )
  RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object(
    'ok', true,
    'campaign_id', p_campaign_id,
    'from', v_from,
    'to', v_to,
    'action', p_action,
    'audit_id', v_audit_id
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'db_error', 'detail', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.delivery_ad_system_schedule_transition(text, uuid, text, text, timestamptz) IS
  'System schedule promoter: activate_due (SCHEDULED→ACTIVE) and end_due (ACTIVE|SCHEDULED→ENDED). service_role only.';

REVOKE ALL ON FUNCTION public.delivery_ad_system_schedule_transition(text, uuid, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delivery_ad_system_schedule_transition(text, uuid, text, text, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delivery_ad_system_schedule_transition(text, uuid, text, text, timestamptz) TO service_role;

-- Bounded due-campaign lookups
CREATE INDEX IF NOT EXISTS store_paid_ad_campaigns_scheduled_start_idx
  ON public.store_paid_ad_campaigns (start_at)
  WHERE lifecycle_status = 'SCHEDULED';

CREATE INDEX IF NOT EXISTS store_banner_ad_campaigns_scheduled_start_idx
  ON public.store_banner_ad_campaigns (start_at)
  WHERE lifecycle_status = 'SCHEDULED';

CREATE INDEX IF NOT EXISTS store_paid_ad_campaigns_active_end_idx
  ON public.store_paid_ad_campaigns (end_at)
  WHERE lifecycle_status IN ('ACTIVE', 'SCHEDULED');

CREATE INDEX IF NOT EXISTS store_banner_ad_campaigns_active_end_idx
  ON public.store_banner_ad_campaigns (end_at)
  WHERE lifecycle_status IN ('ACTIVE', 'SCHEDULED');

COMMIT;
