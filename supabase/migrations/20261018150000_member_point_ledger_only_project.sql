-- Phase 4 Slice 2: Member Point ledger-only projection.
-- SSOT = point_ledger SUM(amount); profiles.points = projected cache.
BEGIN;

CREATE OR REPLACE FUNCTION public.sum_user_point_ledger(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(amount), 0)::integer
    FROM public.point_ledger
   WHERE user_id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.project_user_point_balance_from_ledger(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sum integer;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 0;
  END IF;

  v_sum := GREATEST(0, public.sum_user_point_ledger(p_user_id));

  UPDATE public.profiles
     SET points = v_sum
   WHERE id = p_user_id;

  RETURN v_sum;
END;
$$;

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

  -- Serialize mutations on member profile row
  SELECT points INTO v_cache
    FROM public.profiles
   WHERE id = v_req.user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  v_sum := public.sum_user_point_ledger(v_req.user_id);
  IF COALESCE(v_cache, 0) IS DISTINCT FROM GREATEST(0, v_sum) THEN
    PERFORM public.project_user_point_balance_from_ledger(v_req.user_id);
    v_sum := public.sum_user_point_ledger(v_req.user_id);
  END IF;

  v_new_balance := GREATEST(0, v_sum) + GREATEST(0, v_req.point_amount);

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

REVOKE ALL ON FUNCTION public.sum_user_point_ledger(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sum_user_point_ledger(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sum_user_point_ledger(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sum_user_point_ledger(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.project_user_point_balance_from_ledger(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.project_user_point_balance_from_ledger(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.project_user_point_balance_from_ledger(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.project_user_point_balance_from_ledger(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.approve_user_point_charge_request(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_user_point_charge_request(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.approve_user_point_charge_request(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.approve_user_point_charge_request(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.sum_user_point_ledger(uuid) IS
  'Phase 4 Slice 2: Member Point SSOT = SUM(point_ledger.amount).';
COMMENT ON FUNCTION public.project_user_point_balance_from_ledger(uuid) IS
  'Phase 4 Slice 2: project profiles.points cache from ledger SUM.';

COMMIT;
