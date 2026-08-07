-- Phase F: Member content promotion atomic purchase + entitlement columns.
-- Additive only. Does NOT drop history or alter D-Point ledger SSOT.
-- Asset: AST-001 only. No Business Credit (AST-002).

BEGIN;

ALTER TABLE public.point_promotion_orders
  ADD COLUMN IF NOT EXISTS product_id text,
  ADD COLUMN IF NOT EXISTS domain text NOT NULL DEFAULT 'trade',
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_point_promotion_orders_idempotency
  ON public.point_promotion_orders (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND length(trim(idempotency_key)) > 0;

CREATE INDEX IF NOT EXISTS idx_point_promotion_orders_active_product
  ON public.point_promotion_orders (target_type, order_status, end_at)
  WHERE order_status = 'active' AND target_type = 'product';

COMMENT ON COLUMN public.point_promotion_orders.product_id IS
  'Member promotion product SSOT id (e.g. trade_promote_7). price_asset=D_POINT only.';
COMMENT ON COLUMN public.point_promotion_orders.domain IS
  'Promotion domain: trade (member content). Not Business Credit.';

CREATE OR REPLACE FUNCTION public.purchase_member_content_promotion(
  p_user_id uuid,
  p_target_id text,
  p_product_id text,
  p_point_cost integer,
  p_duration_days integer,
  p_placement text,
  p_domain text,
  p_idempotency_key text,
  p_user_nickname text DEFAULT '',
  p_target_title text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post record;
  v_sum integer;
  v_cache integer;
  v_balance_after integer;
  v_order_id uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_existing_id uuid;
  v_title text;
  v_nick text;
  v_key text;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  v_key := trim(coalesce(p_idempotency_key, ''));
  IF p_user_id IS NULL OR coalesce(trim(p_target_id), '') = '' OR v_key = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  IF coalesce(trim(p_product_id), '') = '' OR p_point_cost IS NULL OR p_point_cost < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_product');
  END IF;

  IF p_duration_days IS NULL OR p_duration_days < 1 OR p_duration_days > 90 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_duration');
  END IF;

  -- Idempotent replay (same key → same entitlement, no second debit)
  SELECT id INTO v_existing_id
    FROM public.point_promotion_orders
   WHERE user_id = p_user_id
     AND idempotency_key = v_key
   LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'order_id', v_existing_id,
      'balance_after', public.project_user_point_balance_from_ledger(p_user_id)
    );
  END IF;

  SELECT id, title, user_id, status
    INTO v_post
    FROM public.posts
   WHERE id::text = trim(p_target_id)
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'target_not_found');
  END IF;
  IF v_post.user_id IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF lower(coalesce(v_post.status, 'active')) IN (
    'deleted', 'hidden', 'sold', 'suspended', 'blocked', 'blinded'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'target_unavailable');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.point_promotion_orders
     WHERE target_type = 'product'
       AND target_id = trim(p_target_id)
       AND order_status = 'active'
       AND end_at >= now()
     LIMIT 1
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_active_promotion');
  END IF;

  SELECT points INTO v_cache
    FROM public.profiles
   WHERE id = p_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  v_sum := public.sum_user_point_ledger(p_user_id);
  IF coalesce(v_cache, 0) IS DISTINCT FROM GREATEST(0, v_sum) THEN
    PERFORM public.project_user_point_balance_from_ledger(p_user_id);
    v_sum := public.sum_user_point_ledger(p_user_id);
  END IF;

  IF GREATEST(0, v_sum) < p_point_cost THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'insufficient_balance',
      'code', 'insufficient_balance'
    );
  END IF;

  v_balance_after := GREATEST(0, v_sum) - p_point_cost;
  v_order_id := gen_random_uuid();
  v_start := now();
  v_end := v_start + make_interval(days => p_duration_days);
  v_title := coalesce(nullif(trim(p_target_title), ''), nullif(trim(v_post.title), ''), '');
  v_nick := coalesce(nullif(trim(p_user_nickname), ''), '');

  INSERT INTO public.point_ledger (
    user_id, entry_type, amount, balance_after,
    related_type, related_id, description, actor_type
  ) VALUES (
    p_user_id,
    'spend',
    -p_point_cost,
    v_balance_after,
    'promotion_order',
    v_order_id::text,
    left('프로모션 구매 (' || trim(p_product_id) || ', ' || p_duration_days || '일)', 500),
    'user'
  );

  INSERT INTO public.point_promotion_orders (
    id, user_id, user_nickname, target_type, target_id, target_title,
    placement, duration_days, point_cost, order_status, start_at, end_at,
    product_id, domain, idempotency_key
  ) VALUES (
    v_order_id,
    p_user_id,
    v_nick,
    'product',
    trim(p_target_id),
    v_title,
    coalesce(nullif(trim(p_placement), ''), 'feed_boost'),
    p_duration_days,
    p_point_cost,
    'active',
    v_start,
    v_end,
    trim(p_product_id),
    coalesce(nullif(trim(p_domain), ''), 'trade'),
    v_key
  );

  PERFORM public.project_user_point_balance_from_ledger(p_user_id);

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', v_order_id,
    'balance_after', v_balance_after,
    'start_at', v_start,
    'end_at', v_end,
    'point_cost', p_point_cost,
    'product_id', trim(p_product_id)
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT id INTO v_existing_id
      FROM public.point_promotion_orders
     WHERE user_id = p_user_id
       AND idempotency_key = v_key
     LIMIT 1;
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'order_id', v_existing_id,
      'balance_after', public.project_user_point_balance_from_ledger(p_user_id)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_member_content_promotion(
  uuid, text, text, integer, integer, text, text, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purchase_member_content_promotion(
  uuid, text, text, integer, integer, text, text, text, text, text
) TO service_role;

COMMENT ON FUNCTION public.purchase_member_content_promotion IS
  'Atomic Member content promotion: AST-001 debit + entitlement. No AST-002.';

COMMIT;
