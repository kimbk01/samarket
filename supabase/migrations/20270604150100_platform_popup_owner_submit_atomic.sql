-- Stage 3 / 3-D part 2 - ADS-13 (design G-2 section 3-D, RC-7).
-- Owner platform popup submit = idempotency key bind + Cash debit + status change in ONE transaction.
-- Previously TS ran key bind -> debit -> status UPDATE (SECURED funding + draft row possible).
-- Owner new sales stay disabled (lib/platform-popup/owner-popup-new-sales-gate.ts); this function is the
-- REQUIRED submit path before sales are re-enabled.
--
-- New function only. Reused unchanged: business_cash_delivery_ad_spend a06219b984fe0bc444abd09f03042614.
-- Existing rows (approved 3 / rejected 1 / draft 9) are not touched.
-- Rollback: DROP FUNCTION public.owner_submit_platform_popup_request(uuid, uuid, text); redeploy previous web.

CREATE OR REPLACE FUNCTION public.owner_submit_platform_popup_request(
  p_request_id uuid,
  p_owner_user_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_req public.platform_popup_owner_requests;
  v_after public.platform_popup_owner_requests;
  v_spend jsonb;
BEGIN
  IF v_key IS NULL OR length(v_key) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_required');
  END IF;
  IF p_request_id IS NULL OR p_owner_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT * INTO v_req FROM public.platform_popup_owner_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_req.owner_user_id IS DISTINCT FROM p_owner_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF v_req.submit_idempotency_key = v_key
     AND v_req.request_status IN ('submitted', 'under_review', 'approved') THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'request', to_jsonb(v_req));
  END IF;

  IF v_req.request_status NOT IN ('draft', 'revision_required') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'illegal_transition', 'status', v_req.request_status);
  END IF;
  IF v_req.package_id IS NULL OR v_req.price_minor IS NULL OR v_req.price_minor <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'package_required');
  END IF;
  IF coalesce(array_length(v_req.requested_surfaces, 1), 0) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'surface_required');
  END IF;
  IF nullif(btrim(coalesce(v_req.creative_asset_path, '')), '') IS NULL
     AND nullif(btrim(coalesce(v_req.creative_asset_url, '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'creative_required');
  END IF;
  IF v_req.requested_start_at IS NOT NULL AND v_req.requested_end_at IS NOT NULL
     AND v_req.requested_end_at <= v_req.requested_start_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'schedule_invalid');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.platform_popup_owner_requests
    WHERE submit_idempotency_key = v_key AND id <> v_req.id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duplicate_submit');
  END IF;

  -- Revision resubmit: an existing SECURED funding returns idempotent=true (no second debit).
  v_spend := public.business_cash_delivery_ad_spend(
    p_owner_user_id, v_req.store_id, v_req.id, 'platform_popup', v_req.price_minor
  );
  IF coalesce((v_spend ->> 'ok')::boolean, false) IS NOT TRUE THEN
    UPDATE public.platform_popup_owner_requests
    SET payment_status = 'failed', submit_idempotency_key = NULL, updated_at = now()
    WHERE id = v_req.id;
    RETURN v_spend || jsonb_build_object('ok', false, 'stage', 'debit');
  END IF;

  UPDATE public.platform_popup_owner_requests
  SET request_status = 'submitted',
      payment_status = 'funded',
      submit_idempotency_key = v_key,
      submitted_at = coalesce(v_req.submitted_at, now()),
      revision_reason = NULL,
      updated_at = now()
  WHERE id = v_req.id
  RETURNING * INTO v_after;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', coalesce((v_spend ->> 'idempotent')::boolean, false),
    'request', to_jsonb(v_after),
    'funding_id', v_spend -> 'funding_id',
    'amount_minor', v_spend -> 'amount_minor'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.owner_submit_platform_popup_request(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_submit_platform_popup_request(uuid, uuid, text) TO service_role;
