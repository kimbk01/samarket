-- DIBAY Finance SSOT-19 · D2 (Point) — atomic post_ads refund + charge approval guard.
--
-- F-01: refund_post_ad_points — one transaction: lock the ad row, enforce the
--       pending → cancelled/rejected transition, refund ONLY what the ledger shows
--       was debited for this ad (ad_purchase − prior ad_refund), project balance.
--       Pattern mirrors purchase_member_content_promotion / approve_user_point_charge_request.
-- F-03: approve_user_point_charge_request — refuse non-positive or internally
--       inconsistent snapshots (point_amount = round(payment_amount * applied_rate)).
--       Body is 20261027120000 + the guard only.

BEGIN;

CREATE OR REPLACE FUNCTION public.refund_post_ad_points(
  p_user_id uuid,
  p_ad_id uuid,
  p_actor_type text,
  p_actor_id uuid,
  p_target_status text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ad public.post_ads%ROWTYPE;
  v_debited bigint;
  v_refunded bigint;
  v_refundable integer;
  v_cache integer;
  v_sum integer;
  v_ledger uuid;
  v_balance integer;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_user_id IS NULL OR p_ad_id IS NULL
     OR p_actor_type NOT IN ('user', 'admin')
     OR p_target_status NOT IN ('cancelled', 'rejected')
     OR (p_actor_type = 'user' AND p_target_status <> 'cancelled')
     OR (p_actor_type = 'admin' AND p_actor_id IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  SELECT * INTO v_ad
    FROM public.post_ads
   WHERE id = p_ad_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_ad.user_id IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_owner');
  END IF;

  IF v_ad.apply_status = p_target_status THEN
    RETURN jsonb_build_object(
      'ok', true, 'idempotent', true, 'refunded_amount', 0,
      'ledger_id', NULL, 'status', v_ad.apply_status
    );
  END IF;
  IF v_ad.apply_status NOT IN ('draft', 'pending_payment', 'pending_review') THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'not_cancellable', 'current_status', v_ad.apply_status
    );
  END IF;

  SELECT points INTO v_cache
    FROM public.profiles
   WHERE id = v_ad.user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT
    coalesce(-sum(amount) FILTER (WHERE entry_type = 'ad_purchase'), 0),
    coalesce(sum(amount) FILTER (WHERE entry_type = 'ad_refund'), 0)
    INTO v_debited, v_refunded
    FROM public.point_ledger
   WHERE user_id = v_ad.user_id
     AND related_type = 'ad_application'
     AND related_id = p_ad_id::text;

  v_refundable := greatest(0, least(v_debited - v_refunded, greatest(coalesce(v_ad.point_cost, 0), 0)))::integer;

  IF v_refundable > 0 THEN
    v_sum := public.sum_user_point_ledger(v_ad.user_id);
    INSERT INTO public.point_ledger (
      user_id, entry_type, amount, balance_after,
      related_type, related_id, description, actor_type
    ) VALUES (
      v_ad.user_id, 'ad_refund', v_refundable, v_sum + v_refundable,
      'ad_application', p_ad_id::text,
      CASE WHEN p_target_status = 'rejected' THEN '게시글 광고 반려 환불' ELSE '게시글 광고 취소 환불' END,
      CASE WHEN p_actor_type = 'admin' THEN 'admin' ELSE 'user' END
    ) RETURNING id INTO v_ledger;
  END IF;

  UPDATE public.post_ads
     SET apply_status = p_target_status,
         is_active = false,
         rejected_by = CASE WHEN p_target_status = 'rejected' THEN p_actor_id ELSE rejected_by END,
         rejected_at = CASE WHEN p_target_status = 'rejected' THEN now() ELSE rejected_at END,
         admin_note = CASE
           WHEN p_target_status = 'rejected' AND nullif(btrim(coalesce(p_reason, '')), '') IS NOT NULL
             THEN btrim(p_reason)
           ELSE admin_note
         END,
         updated_at = now()
   WHERE id = p_ad_id;

  v_balance := public.project_user_point_balance_from_ledger(v_ad.user_id);

  RETURN jsonb_build_object(
    'ok', true, 'idempotent', false,
    'refunded_amount', v_refundable,
    'ledger_id', v_ledger,
    'status', p_target_status,
    'balance_after', v_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refund_post_ad_points(uuid, uuid, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_post_ad_points(uuid, uuid, text, uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.refund_post_ad_points(uuid, uuid, text, uuid, text, text) IS
  'F-01 SSOT-19: atomic post_ads cancel/reject. Refund capped by ledger ad_purchase minus prior ad_refund for the ad.';

CREATE OR REPLACE FUNCTION public.approve_user_point_charge_request(
  p_request_id uuid,
  p_admin_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req record;
  v_sum integer;
  v_new_balance integer;
  v_cache integer;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_req
    FROM public.point_charge_requests
   WHERE id = p_request_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_req.request_status NOT IN ('pending', 'waiting_confirm', 'on_hold') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_processed');
  END IF;

  -- SSOT-19 F-03: snapshot must be positive and internally consistent.
  IF coalesce(v_req.point_amount, 0) <= 0
     OR coalesce(v_req.payment_amount, 0) <= 0
     OR (coalesce(v_req.applied_rate, 0) > 0
         AND v_req.point_amount <> round(v_req.payment_amount * v_req.applied_rate)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'snapshot_invalid');
  END IF;

  SELECT points INTO v_cache
    FROM public.profiles
   WHERE id = v_req.user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  v_sum := public.sum_user_point_ledger(v_req.user_id);
  IF COALESCE(v_cache, 0) IS DISTINCT FROM v_sum THEN
    PERFORM public.project_user_point_balance_from_ledger(v_req.user_id);
    v_sum := public.sum_user_point_ledger(v_req.user_id);
  END IF;

  v_new_balance := v_sum + v_req.point_amount;

  UPDATE public.point_charge_requests
     SET request_status = 'approved',
         approved_at = now(),
         approved_by = p_admin_user_id,
         processed_at = now(),
         processed_by = p_admin_user_id,
         updated_at = now()
   WHERE id = p_request_id;

  INSERT INTO public.point_ledger (
    user_id, entry_type, amount, balance_after,
    related_type, related_id, description, actor_type
  ) VALUES (
    v_req.user_id,
    'charge',
    v_req.point_amount,
    v_new_balance,
    'point_charge',
    p_request_id::text,
    '포인트 충전 승인',
    'admin'
  );

  v_new_balance := public.project_user_point_balance_from_ledger(v_req.user_id);

  RETURN jsonb_build_object(
    'ok', true,
    'balance_after', v_new_balance,
    'user_id', v_req.user_id,
    'point_amount', v_req.point_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_user_point_charge_request(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_user_point_charge_request(uuid, uuid) TO service_role;

COMMIT;
