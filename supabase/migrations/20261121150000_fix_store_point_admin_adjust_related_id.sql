-- CONFIRMED BUG (QA 2026-08-21):
-- adjust_store_point_balance used related_id = admin_user_id.
-- Prod unique index uq_store_point_ledger_related_spend then blocks a second
-- admin_adjust by the same admin (grant OK, deduct 500 duplicate key).
--
-- Fix: each legitimate admin_adjust gets a fresh related_id (gen_random_uuid).
-- DO NOT drop/weaken uq_store_point_ledger_related_spend.
-- Order-fee / charge spend rows keep deterministic related_id (order_id / request_id)
-- so duplicate spend idempotency remains enforced by that index + order_fee unique.

BEGIN;

CREATE OR REPLACE FUNCTION public.adjust_store_point_balance(
  p_store_id uuid,
  p_delta integer,
  p_admin_user_id uuid,
  p_memo text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance integer;
  v_new_balance integer;
  v_delta integer;
  v_next_fee integer := 10;
  v_desc text;
  v_related_id text;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_store_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_store_id');
  END IF;
  v_delta := COALESCE(p_delta, 0);
  IF v_delta = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'delta_zero');
  END IF;

  SELECT point_balance INTO v_balance
    FROM public.stores
   WHERE id = p_store_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_not_found');
  END IF;

  v_new_balance := GREATEST(0, COALESCE(v_balance, 0) + v_delta);
  UPDATE public.stores SET point_balance = v_new_balance WHERE id = p_store_id;

  v_desc := NULLIF(trim(COALESCE(p_memo, '')), '');
  IF v_desc IS NULL THEN
    v_desc := CASE WHEN v_delta > 0 THEN 'Admin point grant' ELSE 'Admin point deduction' END;
  END IF;

  v_related_id := gen_random_uuid()::text;

  INSERT INTO public.store_point_ledger (
    store_id, order_id, entry_type, amount, balance_after,
    policy_snapshot, related_type, related_id, description, actor_type, actor_user_id
  ) VALUES (
    p_store_id,
    NULL,
    'admin_adjust',
    v_delta,
    v_new_balance,
    jsonb_build_object('admin_user_id', p_admin_user_id),
    'admin_adjust',
    v_related_id,
    left(v_desc, 500),
    'admin',
    p_admin_user_id
  );

  SELECT public.compute_store_point_fee_amount(
    COALESCE(p.fee_mode, 'fixed'),
    COALESCE(p.fixed_point, 10),
    COALESCE(p.percent_rate, 0),
    COALESCE(p.minimum_point, 0),
    COALESCE(p.maximum_point, 0),
    0
  ) INTO v_next_fee
  FROM public.store_point_policies p
  WHERE p.is_active = true AND p.is_archived = false
    AND p.store_id IS NULL AND p.category_id IS NULL
  ORDER BY p.priority ASC
  LIMIT 1;

  PERFORM public.evaluate_store_point_commerce_block(p_store_id, v_new_balance, COALESCE(v_next_fee, 10));

  RETURN jsonb_build_object(
    'ok', true,
    'store_id', p_store_id,
    'delta', v_delta,
    'balance_after', v_new_balance,
    'related_id', v_related_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_store_point_balance(uuid, integer, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_store_point_balance(uuid, integer, uuid, text) TO service_role;

COMMIT;
