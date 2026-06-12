-- 사용자 포인트 충전 승인 — 원자 처리 (매장 approve_store_point_charge_request 와 동급)

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
  v_balance integer;
  v_new_balance integer;
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

  SELECT points INTO v_balance
    FROM public.profiles
   WHERE id = v_req.user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  v_new_balance := COALESCE(v_balance, 0) + GREATEST(0, v_req.point_amount);
  UPDATE public.profiles SET points = v_new_balance WHERE id = v_req.user_id;

  UPDATE public.point_charge_requests
     SET request_status = 'approved',
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

  RETURN jsonb_build_object(
    'ok', true,
    'balance_after', v_new_balance,
    'user_id', v_req.user_id,
    'point_amount', v_req.point_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_user_point_charge_request(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_user_point_charge_request(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.approve_user_point_charge_request(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.approve_user_point_charge_request(uuid, uuid) TO service_role;
