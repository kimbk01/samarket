-- Gift Certificate CUT 1 — financial snapshot authority
-- Redeem/checkout: gift_certificate_instance_redeem_fee_rate (NOT live product).
-- Legacy backfill: redemption row evidence ONLY (no current product fee inference).

BEGIN;

-- ---------------------------------------------------------------------------
-- 0) Legacy backfill — authoritative redemption evidence only
-- ---------------------------------------------------------------------------
UPDATE public.gift_certificate_instances i
   SET platform_fee_rate_snapshot = sub.rate
  FROM (
    SELECT DISTINCT ON (r.instance_id)
           r.instance_id,
           r.platform_fee_rate_snapshot AS rate
      FROM public.gift_certificate_redemptions r
     WHERE r.reversed = false
     ORDER BY r.instance_id, r.created_at ASC
  ) sub
 WHERE i.id = sub.instance_id
   AND i.platform_fee_rate_snapshot = 0;

-- NOTE: Unresolved legacy rows (snapshot=0, no purchase payload key, no redemption)
-- remain at 0; redeem/checkout fail-closed via gift_certificate_instance_redeem_fee_rate.


-- ---------------------------------------------------------------------------
-- Fee rate authority for redeem/checkout (fail-closed on unresolved legacy 0)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gift_certificate_instance_redeem_fee_rate(
  p_inst public.gift_certificate_instances
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_red_rate integer;
BEGIN
  IF p_inst.platform_fee_rate_snapshot > 0 THEN
    RETURN p_inst.platform_fee_rate_snapshot;
  END IF;

  -- Post-CUT1 purchase records explicit zero in ownership payload.
  IF EXISTS (
    SELECT 1
      FROM public.gift_certificate_ownership_events e
     WHERE e.instance_id = p_inst.id
       AND e.event_type = 'PURCHASED'
       AND (e.payload ? 'platform_fee_rate_snapshot')
  ) THEN
    RETURN 0;
  END IF;

  -- Authoritative historical redeem fee (includes proven 0%).
  SELECT r.platform_fee_rate_snapshot
    INTO v_red_rate
    FROM public.gift_certificate_redemptions r
   WHERE r.instance_id = p_inst.id
     AND r.reversed = false
   ORDER BY r.created_at ASC
   LIMIT 1;
  IF FOUND THEN
    RETURN v_red_rate;
  END IF;

  RAISE EXCEPTION 'legacy_fee_snapshot_unresolved instance=%', p_inst.id;
END;
$$;

COMMENT ON FUNCTION public.gift_certificate_instance_redeem_fee_rate(public.gift_certificate_instances) IS
  'Redeem fee % from instance snapshot; fail-closed when legacy DEFAULT 0 lacks authoritative proof.';

REVOKE ALL ON FUNCTION public.gift_certificate_instance_redeem_fee_rate(public.gift_certificate_instances) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gift_certificate_instance_redeem_fee_rate(public.gift_certificate_instances) TO service_role;

-- ---------------------------------------------------------------------------
-- 1) Purchase — validity + promo economics snapshot contract
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gift_certificate_purchase(
  p_buyer_user_id uuid,
  p_product_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_product public.gift_certificate_products%ROWTYPE;
  v_cache integer;
  v_sum integer;
  v_balance_after integer;
  v_instance_id uuid;
  v_public_gift_number text;
  v_existing_instance_id uuid;
  v_now timestamptz := now();
  v_scope text;
  v_issue_date date;
  v_valid_from date;
  v_valid_until date;
  v_gap integer;
  v_store_id uuid;
  v_funding text;
  v_promo jsonb;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_buyer_user_id IS NULL OR p_product_id IS NULL OR v_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  SELECT * INTO v_product
    FROM public.gift_certificate_products
   WHERE id = p_product_id
     AND active = true
     AND archived_at IS NULL
     AND sales_starts_at <= v_now
     AND (sales_ends_at IS NULL OR sales_ends_at > v_now)
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'product_not_found');
  END IF;
  IF v_product.max_issuance IS NOT NULL
     AND coalesce(v_product.issued_count, 0) >= v_product.max_issuance THEN
    RETURN jsonb_build_object('ok', false, 'error', 'max_issuance_reached');
  END IF;
  IF v_product.purchase_price < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_price');
  END IF;

  v_scope := coalesce(v_product.gift_scope, 'STORE');
  IF v_scope = 'STORE' AND v_product.store_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_product_scope');
  END IF;
  IF v_scope = 'PLATFORM' AND v_product.store_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_product_scope');
  END IF;

  v_store_id := CASE WHEN v_scope = 'PLATFORM' THEN NULL ELSE v_product.store_id END;
  v_gap := GREATEST(0, v_product.face_value - v_product.purchase_price);
  v_funding := CASE
    WHEN v_gap = 0 THEN 'NONE'
    ELSE coalesce(v_product.discount_funding_party, 'NONE')
  END;

  v_issue_date := public.gift_certificate_issue_date(v_now);
  SELECT r.valid_from, r.valid_until
    INTO v_valid_from, v_valid_until
    FROM public.gift_certificate_resolve_validity_at_issue(
      coalesce(v_product.expiry_policy, 'NO_EXPIRY'),
      v_product.validity_days,
      v_product.fixed_valid_until,
      v_issue_date
    ) r;

  SELECT points INTO v_cache
    FROM public.profiles
   WHERE id = p_buyer_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  v_sum := public.sum_user_point_ledger(p_buyer_user_id);
  IF coalesce(v_cache, 0) IS DISTINCT FROM GREATEST(0, v_sum) THEN
    PERFORM public.project_user_point_balance_from_ledger(p_buyer_user_id);
    v_sum := public.sum_user_point_ledger(p_buyer_user_id);
  END IF;

  IF GREATEST(0, v_sum) < v_product.purchase_price THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance', 'code', 'insufficient_balance');
  END IF;

  v_balance_after := GREATEST(0, v_sum) - v_product.purchase_price;

  INSERT INTO public.point_ledger (
    user_id, entry_type, amount, balance_after,
    related_type, related_id, description, actor_type
  ) VALUES (
    p_buyer_user_id,
    'spend',
    -v_product.purchase_price,
    v_balance_after,
    'gift_certificate_purchase',
    v_key,
    left('상품권 구매: ' || coalesce(v_product.title, ''), 500),
    'user'
  );

  PERFORM public.project_user_point_balance_from_ledger(p_buyer_user_id);

  v_instance_id := gen_random_uuid();
  v_public_gift_number := public.generate_gift_public_number();
  INSERT INTO public.gift_certificate_instances (
    id, public_gift_number, product_id, store_id, gift_scope,
    purchaser_user_id, current_owner_user_id,
    face_value, purchase_price, remaining_balance, status, version,
    valid_from, valid_until,
    purchased_at, created_at,
    purchase_discount_amount, discount_funding_party_snapshot, platform_fee_rate_snapshot
  ) VALUES (
    v_instance_id,
    v_public_gift_number,
    v_product.id,
    v_store_id,
    v_scope,
    p_buyer_user_id,
    p_buyer_user_id,
    v_product.face_value,
    v_product.purchase_price,
    v_product.face_value,
    'ACTIVE',
    1,
    v_valid_from,
    v_valid_until,
    v_now,
    v_now,
    v_gap,
    v_funding,
    v_product.platform_fee_rate
  );

  INSERT INTO public.gift_certificate_ownership_events (
    instance_id, seq, event_type, from_user_id, to_user_id, actor_user_id, payload
  ) VALUES (
    v_instance_id,
    1,
    'PURCHASED',
    NULL,
    p_buyer_user_id,
    p_buyer_user_id,
    jsonb_build_object(
      'product_id', v_product.id,
      'idempotency_key', v_key,
      'gift_scope', v_scope,
      'valid_from', v_valid_from,
      'valid_until', v_valid_until,
      'purchase_discount_amount', v_gap,
      'discount_funding_party', v_funding,
      'platform_fee_rate_snapshot', v_product.platform_fee_rate
    )
  );

  INSERT INTO public.gift_certificate_ledger (
    instance_id, store_id, user_id, entry_type, amount,
    related_type, related_id, description, actor_type
  ) VALUES (
    v_instance_id,
    v_store_id,
    p_buyer_user_id,
    'ISSUED',
    v_product.face_value,
    'gift_certificate_purchase',
    v_key,
    'Gift certificate purchased',
    'user'
  );


  v_promo := public.gift_certificate_promo_accrue_for_instance(
    v_instance_id,
    v_store_id,
    v_gap,
    v_product.merchant_funded_units,
    v_product.platform_funded_units,
    v_funding,
    v_key
  );

  UPDATE public.gift_certificate_products
     SET issued_count = coalesce(issued_count, 0) + 1,
         updated_at = v_now
   WHERE id = v_product.id;

  RETURN jsonb_build_object(
    'ok', true,
    'instance_id', v_instance_id,
    'public_gift_number', v_public_gift_number,
    'gift_scope', v_scope,
    'valid_from', v_valid_from,
    'valid_until', v_valid_until,
    'face_value', v_product.face_value,
    'purchase_price', v_product.purchase_price,
    'purchase_discount_amount', v_gap,
    'discount_funding_party', v_funding,
    'platform_fee_rate_snapshot', v_product.platform_fee_rate,
    'promo', v_promo,
    'balance_after', v_balance_after
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT gl.instance_id INTO v_existing_instance_id
      FROM public.gift_certificate_ledger gl
     WHERE gl.related_type = 'gift_certificate_purchase'
       AND gl.related_id = v_key
       AND gl.entry_type = 'ISSUED'
     LIMIT 1;
    SELECT i.public_gift_number INTO v_public_gift_number
      FROM public.gift_certificate_instances i
     WHERE i.id = v_existing_instance_id;
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'instance_id', v_existing_instance_id,
      'public_gift_number', v_public_gift_number
    );
  WHEN OTHERS THEN
    IF SQLERRM LIKE 'invalid_%' OR SQLERRM LIKE 'fixed_%' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_product_expiry_policy');
    END IF;
    RAISE;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2) Standalone redeem
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gift_certificate_redeem(
  p_buyer_user_id uuid,
  p_order_id uuid,
  p_store_id uuid,
  p_redemptions jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_item jsonb;
  v_instance_id uuid;
  v_amount integer;
  v_inst public.gift_certificate_instances%ROWTYPE;
  v_fee_rate integer;
  v_fee integer;
  v_merchant integer;
  v_redemption_id uuid;
  v_new_remaining integer;
  v_new_status text;
  v_results jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_idx integer := 0;
  v_item_key text;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_buyer_user_id IS NULL OR p_order_id IS NULL OR p_store_id IS NULL
     OR p_redemptions IS NULL OR jsonb_typeof(p_redemptions) <> 'array' OR v_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.gift_certificate_redemptions r
     WHERE r.idempotency_key = v_key
        OR r.idempotency_key LIKE v_key || ':%'
  ) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'order_id', p_order_id,
      'redemptions', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'redemption_id', r.id,
          'instance_id', r.instance_id,
          'redeemed_amount', r.redeemed_amount
        )), '[]'::jsonb)
        FROM public.gift_certificate_redemptions r
        WHERE r.idempotency_key = v_key
           OR r.idempotency_key LIKE v_key || ':%'
      )
    );
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_redemptions)
  LOOP
    v_idx := v_idx + 1;
    v_instance_id := nullif(btrim(coalesce(v_item->>'instance_id', '')), '')::uuid;
    v_amount := coalesce((v_item->>'amount')::integer, 0);
    IF v_instance_id IS NULL OR v_amount <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_redemption_item', 'index', v_idx);
    END IF;

    SELECT * INTO v_inst
      FROM public.gift_certificate_instances
     WHERE id = v_instance_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'instance_not_found', 'instance_id', v_instance_id);
    END IF;
    IF v_inst.current_owner_user_id IS DISTINCT FROM p_buyer_user_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_owner', 'instance_id', v_instance_id);
    END IF;
    IF NOT public.gift_certificate_instance_allows_checkout_store(
         coalesce(v_inst.gift_scope, 'STORE'),
         v_inst.store_id,
         p_store_id
       ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'store_mismatch', 'instance_id', v_instance_id);
    END IF;
    IF public.gift_certificate_instance_is_expired(v_inst.valid_until) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'gift_expired', 'instance_id', v_instance_id);
    END IF;
    IF v_inst.status NOT IN ('ACTIVE', 'PARTIALLY_REDEEMED') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_status', 'instance_id', v_instance_id);
    END IF;
    IF v_inst.remaining_balance < v_amount THEN
      RETURN jsonb_build_object('ok', false, 'error', 'insufficient_remaining', 'instance_id', v_instance_id);
    END IF;
  END LOOP;

  IF v_idx = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'empty_redemptions');
  END IF;

  v_idx := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_redemptions)
  LOOP
    v_idx := v_idx + 1;
    v_instance_id := nullif(btrim(coalesce(v_item->>'instance_id', '')), '')::uuid;
    v_amount := coalesce((v_item->>'amount')::integer, 0);

    SELECT * INTO v_inst
      FROM public.gift_certificate_instances
     WHERE id = v_instance_id
     FOR UPDATE;
    IF NOT FOUND OR v_inst.remaining_balance < v_amount
       OR v_inst.current_owner_user_id IS DISTINCT FROM p_buyer_user_id
       OR v_inst.status NOT IN ('ACTIVE', 'PARTIALLY_REDEEMED')
       OR public.gift_certificate_instance_is_expired(v_inst.valid_until) THEN
      RAISE EXCEPTION 'gift_redeem_invariant_failed instance=%', v_instance_id;
    END IF;

    v_fee_rate := public.gift_certificate_instance_redeem_fee_rate(v_inst);
    v_fee := floor(v_amount::numeric * v_fee_rate / 100)::integer;
    v_merchant := v_amount - v_fee;

    v_item_key := v_key || ':' || v_idx::text;
    v_redemption_id := gen_random_uuid();

    INSERT INTO public.gift_certificate_redemptions (
      id, order_id, instance_id, store_id, buyer_user_id,
      redeemed_amount, platform_fee_amount, merchant_net_amount,
      platform_fee_rate_snapshot, reversed, idempotency_key
    ) VALUES (
      v_redemption_id, p_order_id, v_instance_id, p_store_id, p_buyer_user_id,
      v_amount, v_fee, v_merchant, v_fee_rate, false, v_item_key
    );

    v_new_remaining := v_inst.remaining_balance - v_amount;
    IF v_new_remaining = 0 THEN
      v_new_status := 'FULLY_REDEEMED';
    ELSE
      v_new_status := 'PARTIALLY_REDEEMED';
    END IF;

    UPDATE public.gift_certificate_instances
       SET remaining_balance = v_new_remaining,
           status = v_new_status,
           version = version + 1,
           fully_redeemed_at = CASE WHEN v_new_remaining = 0 THEN now() ELSE fully_redeemed_at END
     WHERE id = v_instance_id;

    INSERT INTO public.gift_certificate_ledger (
      instance_id, store_id, user_id, entry_type, amount,
      related_type, related_id, description, actor_type
    ) VALUES (
      v_instance_id,
      v_inst.store_id,
      p_buyer_user_id,
      'REDEEMED',
      -v_amount,
      'gift_certificate_redemption',
      v_redemption_id::text,
      'Gift redeemed on order',
      'user'
    );

    v_results := v_results || jsonb_build_object(
      'redemption_id', v_redemption_id,
      'instance_id', v_instance_id,
      'redeemed_amount', v_amount
    );
    v_total := v_total + v_amount;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'total_redeemed', v_total,
    'redemptions', v_results
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) Checkout atomic redeem
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_store_order_atomic(p_buyer_user_id uuid, p_store_id uuid, p_client_order_key text, p_order jsonb, p_lines jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $$
DECLARE
  v_key text := nullif(btrim(coalesce(p_client_order_key, '')), '');
  v_existing record;
  v_store record;
  v_line jsonb;
  v_product record;
  v_product_id uuid;
  v_qty integer;
  v_title text;
  v_unit numeric;
  v_subtotal numeric;
  v_options jsonb;
  v_base numeric;
  v_opt_delta numeric;
  v_expected_options jsonb;
  v_live_base numeric;
  v_price numeric;
  v_disc numeric;
  v_new_stock integer;
  v_order_id uuid;
  v_order_no text;
  v_payment_amount numeric;
  v_item_id uuid;
  v_opt jsonb;
  v_sold_out jsonb := '[]'::jsonb;
  v_line_count integer := 0;
  v_event_id uuid;
  v_result jsonb;
  v_track boolean;
  v_coupon_id uuid;
  v_user_coupon_id uuid;
  v_discount numeric;
  v_amount_before_gift integer := 0;
  v_gift_total integer := 0;
  v_gift_ids jsonb := '[]'::jsonb;
  v_gift_id uuid;
  v_gift_inst public.gift_certificate_instances%ROWTYPE;
  v_gift_fee_rate integer;
  v_gift_fee integer;
  v_gift_merchant integer;
  v_gift_redemption_id uuid;
  v_gift_remaining integer;
  v_gift_status text;
  v_gift_due integer;
  v_gift_count integer := 0;
  v_campaign record;
  v_entitlement record;
  v_store_funded numeric := 0;
  v_platform_funded numeric := 0;
  v_commission_base numeric := 0;
BEGIN
  IF p_buyer_user_id IS NULL OR p_store_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_ids', 'http_status', 400);
  END IF;

  IF p_order IS NULL OR jsonb_typeof(p_order) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_order_payload', 'http_status', 400);
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_and_items_required', 'http_status', 400);
  END IF;

  -- Idempotency: serialize same buyer+key, then return existing if present
  IF v_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtext(p_buyer_user_id::text || chr(1) || v_key)
    );
    SELECT id, order_no, payment_amount
      INTO v_existing
      FROM public.store_orders
     WHERE buyer_user_id = p_buyer_user_id
       AND client_order_key = v_key
     LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'order', jsonb_build_object(
          'id', v_existing.id,
          'order_no', coalesce(v_existing.order_no, ''),
          'payment_amount', coalesce(v_existing.payment_amount, 0)
        ),
        'sold_out_products', '[]'::jsonb,
        'order_created_event_id', null
      );
    END IF;
  END IF;

  -- Store authority lock + revalidation (TOCTOU)
  SELECT
    id,
    owner_user_id,
    approval_status,
    is_visible,
    is_open,
    point_commerce_blocked,
    store_name
  INTO v_store
  FROM public.stores
  WHERE id = p_store_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_unavailable', 'http_status', 400);
  END IF;

  IF v_store.approval_status IS DISTINCT FROM 'approved' OR v_store.is_visible IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_unavailable', 'http_status', 400);
  END IF;

  IF v_store.is_open IS FALSE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_closed', 'http_status', 400);
  END IF;

  IF coalesce(v_store.point_commerce_blocked, false) IS TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_point_blocked', 'http_status', 400);
  END IF;

  IF to_regclass('public.store_sales_permissions') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.store_sales_permissions sp
      WHERE sp.store_id = p_store_id
        AND sp.allowed_to_sell IS TRUE
        AND sp.sales_status = 'approved'
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'store_not_selling', 'http_status', 400);
    END IF;
  END IF;

  -- Pass 1: lock products + revalidate (no stock mutation yet)
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_line_count := v_line_count + 1;
    BEGIN
      v_product_id := nullif(btrim(coalesce(v_line->>'product_id', '')), '')::uuid;
    EXCEPTION WHEN others THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_product', 'http_status', 400);
    END;
    IF v_product_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_product', 'http_status', 400);
    END IF;

    v_qty := floor(coalesce((v_line->>'qty')::numeric, 0));
    IF v_qty < 1 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_line', 'http_status', 400);
    END IF;

    v_unit := coalesce((v_line->>'unit')::numeric, -1);
    v_base := coalesce((v_line->>'base_unit_after_discount')::numeric, -1);
    v_opt_delta := coalesce((v_line->>'unit_options_delta')::numeric, 0);
    v_expected_options := v_line->'expected_options_json';

    SELECT
      id,
      store_id,
      price,
      discount_price,
      stock_qty,
      track_inventory,
      product_status,
      options_json
    INTO v_product
    FROM public.store_products
    WHERE id = v_product_id
    FOR UPDATE;

    IF NOT FOUND OR v_product.store_id IS DISTINCT FROM p_store_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_product', 'http_status', 400);
    END IF;

    IF v_product.product_status = 'sold_out' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'product_sold_out', 'http_status', 400);
    END IF;

    IF v_product.product_status IS DISTINCT FROM 'active' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'product_not_available', 'http_status', 400);
    END IF;

    IF v_expected_options IS NOT NULL
       AND v_product.options_json IS DISTINCT FROM v_expected_options THEN
      RETURN jsonb_build_object('ok', false, 'error', 'price_changed', 'http_status', 400);
    END IF;

    v_price := coalesce(v_product.price, 0)::numeric;
    v_disc := v_product.discount_price;
    IF v_disc IS NOT NULL
       AND v_disc::numeric >= 0
       AND v_disc::numeric < v_price THEN
      v_live_base := v_disc::numeric;
    ELSE
      v_live_base := v_price;
    END IF;

    IF abs(v_live_base - v_base) >= 1 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'price_changed', 'http_status', 400);
    END IF;

    IF abs((v_live_base + v_opt_delta) - v_unit) >= 1 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'price_changed', 'http_status', 400);
    END IF;

    IF coalesce(v_product.track_inventory, false) IS TRUE
       AND coalesce(v_product.stock_qty, 0) < v_qty THEN
      RETURN jsonb_build_object('ok', false, 'error', 'insufficient_stock', 'http_status', 409);
    END IF;
  END LOOP;

  -- Stores A: coupon authority lock + redemption exclusivity (same TX as order)
  v_discount := round(coalesce((p_order->>'discount_amount')::numeric, 0));
  v_coupon_id := NULL;
  v_user_coupon_id := NULL;
  IF nullif(btrim(coalesce(p_order->>'user_coupon_id', '')), '') IS NOT NULL THEN
    BEGIN
      v_user_coupon_id := (p_order->>'user_coupon_id')::uuid;
    EXCEPTION
      WHEN invalid_text_representation THEN
        RETURN jsonb_build_object('ok', false, 'error', 'coupon_not_found', 'http_status', 400);
    END;
  END IF;
  IF nullif(btrim(coalesce(p_order->>'coupon_campaign_id', '')), '') IS NOT NULL THEN
    BEGIN
      v_coupon_id := (p_order->>'coupon_campaign_id')::uuid;
    EXCEPTION
      WHEN invalid_text_representation THEN
        RETURN jsonb_build_object('ok', false, 'error', 'coupon_not_found', 'http_status', 400);
    END;
  END IF;

  IF v_discount > 0 AND (v_coupon_id IS NULL OR v_user_coupon_id IS NULL) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', CASE
        WHEN v_coupon_id IS NULL THEN 'coupon_required_for_discount'
        ELSE 'coupon_entitlement_required'
      END,
      'http_status', 400
    );
  END IF;

  IF v_coupon_id IS NOT NULL THEN
    IF v_discount <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_discount', 'http_status', 400);
    END IF;
    -- Canonical: Coupon Instance required — campaign-only checkout DELETED
    IF v_user_coupon_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'coupon_entitlement_required', 'http_status', 400);
    END IF;

    PERFORM pg_advisory_xact_lock(
      hashtext(p_buyer_user_id::text || chr(1) || 'coupon' || chr(1) || v_coupon_id::text)
    );

    SELECT
      id,
      store_id,
      discount_type,
      discount_value,
      min_order_amount,
      start_at,
      end_at,
      is_active,
      lifecycle_state
    INTO v_campaign
    FROM public.store_coupon_campaigns
    WHERE id = v_coupon_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'coupon_not_found', 'http_status', 404);
    END IF;

    IF v_campaign.store_id IS DISTINCT FROM p_store_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'coupon_wrong_store', 'http_status', 400);
    END IF;

    SELECT *
      INTO v_entitlement
      FROM public.coupon_user_entitlements
     WHERE id = v_user_coupon_id
       AND buyer_user_id = p_buyer_user_id
       AND campaign_id = v_coupon_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'coupon_not_found', 'http_status', 404);
    END IF;
    IF v_entitlement.status NOT IN ('available', 'restored') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'coupon_already_redeemed', 'http_status', 409);
    END IF;
    IF v_entitlement.expires_at <= clock_timestamp() THEN
      RETURN jsonb_build_object('ok', false, 'error', 'coupon_expired', 'http_status', 400);
    END IF;
    IF v_campaign.lifecycle_state = 'revoked' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'COUPON_REVOKED', 'http_status', 400);
    END IF;
  END IF;


  -- Gift Certificate: parse instance ids (max 1). Amounts computed server-side.
  v_gift_ids := coalesce(p_order->'gift_instance_ids', '[]'::jsonb);
  IF jsonb_typeof(v_gift_ids) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_gift_instance_ids', 'http_status', 400);
  END IF;
  IF jsonb_array_length(v_gift_ids) > 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'gift_max_one_per_order', 'http_status', 400);
  END IF;

  v_amount_before_gift := greatest(0, round(coalesce((p_order->>'total_amount')::numeric, 0) - coalesce((p_order->>'discount_amount')::numeric, 0))::integer);
  IF nullif(btrim(coalesce(p_order->>'amount_before_gift', '')), '') IS NOT NULL THEN
    v_amount_before_gift := greatest(0, round((p_order->>'amount_before_gift')::numeric)::integer);
  END IF;

  v_gift_due := v_amount_before_gift;
  IF jsonb_array_length(v_gift_ids) = 1 THEN
    BEGIN
      v_gift_id := (v_gift_ids->>0)::uuid;
    EXCEPTION WHEN others THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_gift_instance_id', 'http_status', 400);
    END;
    SELECT * INTO v_gift_inst
      FROM public.gift_certificate_instances
     WHERE id = v_gift_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'gift_instance_not_found', 'http_status', 400);
    END IF;
    IF v_gift_inst.current_owner_user_id IS DISTINCT FROM p_buyer_user_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'gift_not_owner', 'http_status', 403);
    END IF;
    IF NOT public.gift_certificate_instance_allows_checkout_store(
         coalesce(v_gift_inst.gift_scope, 'STORE'),
         v_gift_inst.store_id,
         p_store_id
       ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'gift_store_mismatch', 'http_status', 400);
    END IF;
    IF v_gift_inst.status NOT IN ('ACTIVE', 'PARTIALLY_REDEEMED') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'gift_invalid_status', 'http_status', 400);
    END IF;
    IF coalesce(v_gift_inst.remaining_balance, 0) <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'gift_insufficient_remaining', 'http_status', 400);
    END IF;
    v_gift_total := least(v_gift_due, v_gift_inst.remaining_balance);
    v_gift_count := 1;
  END IF;

  -- Pass 2+: mutate inside subtransaction (unique_violation rolls back all mutations)
  BEGIN
    FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
    LOOP
      v_product_id := (v_line->>'product_id')::uuid;
      v_qty := floor((v_line->>'qty')::numeric);
      v_title := coalesce(v_line->>'title', '');

      SELECT coalesce(track_inventory, false)
        INTO v_track
        FROM public.store_products
       WHERE id = v_product_id;

      IF v_track IS TRUE THEN
        UPDATE public.store_products
           SET stock_qty = stock_qty - v_qty,
               product_status = CASE
                 WHEN stock_qty - v_qty <= 0 THEN 'sold_out'
                 ELSE product_status
               END
         WHERE id = v_product_id
           AND coalesce(track_inventory, false) IS TRUE
           AND stock_qty >= v_qty
        RETURNING stock_qty INTO v_new_stock;

        IF NOT FOUND THEN
          -- Concurrent race after pass-1; abort mutations via exception semantics
          RAISE EXCEPTION 'insufficient_stock'
            USING ERRCODE = 'P0001';
        END IF;

        IF v_new_stock <= 0 THEN
          v_sold_out := v_sold_out || jsonb_build_array(
            jsonb_build_object(
              'productId', v_product_id,
              'productTitle', nullif(btrim(v_title), '')
            )
          );
        END IF;
      END IF;
    END LOOP;

    v_order_no := coalesce(
      nullif(btrim(p_order->>'order_no'), ''),
      'SO' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS')
    );
    v_payment_amount := coalesce((p_order->>'payment_amount')::numeric, 0);
    -- Gift-aware authoritative payment
    IF v_gift_count > 0 THEN
      v_payment_amount := greatest(0, v_amount_before_gift - v_gift_total);
    ELSE
      v_amount_before_gift := greatest(0, round(v_payment_amount)::integer);
      v_gift_total := 0;
    END IF;
    v_store_funded := round(coalesce((p_order->>'store_funded_amount')::numeric, 0));
    v_platform_funded := round(coalesce((p_order->>'platform_funded_amount')::numeric, 0));
    v_commission_base := round(coalesce((p_order->>'commission_base_amount')::numeric, v_payment_amount + v_discount));

    INSERT INTO public.store_orders (
      order_no,
      buyer_user_id,
      store_id,
      total_amount,
      discount_amount,
      payment_amount,
      delivery_fee_amount,
      delivery_courier_label,
      payment_status,
      order_status,
      fulfillment_type,
      buyer_note,
      buyer_phone,
      buyer_payment_method,
      buyer_payment_method_detail,
      delivery_address_summary,
      delivery_address_detail,
      delivery_region,
      delivery_city,
      delivery_place_id,
      delivery_formatted_address,
      delivery_detail_address,
      delivery_note,
      delivery_latitude,
      delivery_longitude,
      delivery_user_address_id,
      client_order_key,
      checkout_prep_minutes,
      checkout_ride_minutes,
      checkout_eta_minutes,
      checkout_eta_computed_at,
      checkout_route_distance_meters,
      checkout_straight_distance_meters,
      coupon_campaign_id,
      user_coupon_id,
      store_funded_amount,
      platform_funded_amount,
      commission_base_amount,
      amount_before_gift,
      gift_redemption_amount
    )
    VALUES (
      v_order_no,
      p_buyer_user_id,
      p_store_id,
      round(coalesce((p_order->>'total_amount')::numeric, v_payment_amount)),
      round(coalesce((p_order->>'discount_amount')::numeric, 0)),
      round(v_payment_amount),
      round(coalesce((p_order->>'delivery_fee_amount')::numeric, 0)),
      nullif(p_order->>'delivery_courier_label', ''),
      coalesce(nullif(p_order->>'payment_status', ''), 'paid'),
      'pending',
      coalesce(nullif(p_order->>'fulfillment_type', ''), 'pickup'),
      nullif(p_order->>'buyer_note', ''),
      nullif(p_order->>'buyer_phone', ''),
      nullif(p_order->>'buyer_payment_method', ''),
      nullif(p_order->>'buyer_payment_method_detail', ''),
      nullif(p_order->>'delivery_address_summary', ''),
      nullif(p_order->>'delivery_address_detail', ''),
      nullif(p_order->>'delivery_region', ''),
      nullif(p_order->>'delivery_city', ''),
      nullif(p_order->>'delivery_place_id', ''),
      nullif(p_order->>'delivery_formatted_address', ''),
      nullif(p_order->>'delivery_detail_address', ''),
      nullif(p_order->>'delivery_note', ''),
      CASE WHEN p_order ? 'delivery_latitude' AND p_order->>'delivery_latitude' IS NOT NULL
        THEN (p_order->>'delivery_latitude')::double precision ELSE NULL END,
      CASE WHEN p_order ? 'delivery_longitude' AND p_order->>'delivery_longitude' IS NOT NULL
        THEN (p_order->>'delivery_longitude')::double precision ELSE NULL END,
      CASE WHEN nullif(p_order->>'delivery_user_address_id', '') IS NOT NULL
        THEN (p_order->>'delivery_user_address_id')::uuid ELSE NULL END,
      v_key,
      CASE WHEN p_order ? 'checkout_prep_minutes' THEN (p_order->>'checkout_prep_minutes')::integer ELSE NULL END,
      CASE WHEN p_order ? 'checkout_ride_minutes' THEN (p_order->>'checkout_ride_minutes')::integer ELSE NULL END,
      CASE WHEN p_order ? 'checkout_eta_minutes' THEN (p_order->>'checkout_eta_minutes')::integer ELSE NULL END,
      CASE WHEN nullif(p_order->>'checkout_eta_computed_at', '') IS NOT NULL
        THEN (p_order->>'checkout_eta_computed_at')::timestamptz ELSE NULL END,
      CASE WHEN p_order ? 'checkout_route_distance_meters'
        THEN (p_order->>'checkout_route_distance_meters')::integer ELSE NULL END,
      CASE WHEN p_order ? 'checkout_straight_distance_meters'
        THEN (p_order->>'checkout_straight_distance_meters')::integer ELSE NULL END,
      v_coupon_id,
      v_user_coupon_id,
      v_store_funded,
      v_platform_funded,
      v_commission_base,
      v_amount_before_gift,
      v_gift_total
    )
    RETURNING id INTO v_order_id;

    FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
    LOOP
      v_product_id := (v_line->>'product_id')::uuid;
      v_qty := floor((v_line->>'qty')::numeric);
      v_title := coalesce(v_line->>'title', '');
      v_unit := (v_line->>'unit')::numeric;
      v_subtotal := (v_line->>'subtotal')::numeric;
      v_base := (v_line->>'base_unit_after_discount')::numeric;
      v_opt_delta := coalesce((v_line->>'unit_options_delta')::numeric, 0);
      v_options := coalesce(v_line->'options_snapshot', '{}'::jsonb);

      INSERT INTO public.store_order_items (
        order_id,
        product_id,
        product_title_snapshot,
        price_snapshot,
        qty,
        subtotal,
        options_snapshot_json,
        base_price_snapshot,
        options_unit_delta_snapshot
      )
      VALUES (
        v_order_id,
        v_product_id,
        v_title,
        round(v_unit),
        v_qty,
        round(v_subtotal),
        v_options,
        round(v_base),
        round(v_opt_delta)
      )
      RETURNING id INTO v_item_id;

      IF coalesce((v_options->>'v')::int, 0) = 2 AND jsonb_typeof(v_options->'groups') = 'array' THEN
        FOR v_opt IN
          SELECT jsonb_build_object(
            'group_label', g->>'label',
            'name', ln->>'name',
            'price_delta_each', ln->>'price_delta_each',
            'qty', ln->>'qty',
            'line_extra', ln->>'line_extra'
          )
          FROM jsonb_array_elements(v_options->'groups') AS g
          CROSS JOIN LATERAL jsonb_array_elements(coalesce(g->'lines', '[]'::jsonb)) AS ln
        LOOP
          INSERT INTO public.store_order_item_options (
            order_item_id,
            option_group_name_snapshot,
            option_item_name_snapshot,
            price_delta_snapshot,
            quantity,
            line_extra_total
          )
          VALUES (
            v_item_id,
            coalesce(v_opt->>'group_label', ''),
            coalesce(v_opt->>'name', ''),
            round(coalesce((v_opt->>'price_delta_each')::numeric, 0)),
            greatest(1, floor(coalesce((v_opt->>'qty')::numeric, 1))),
            round(coalesce((v_opt->>'line_extra')::numeric, 0))
          );
        END LOOP;
      END IF;
    END LOOP;

    BEGIN
      INSERT INTO public.store_order_events (
        order_id,
        store_id,
        actor_user_id,
        actor_role,
        event_type,
        from_status,
        to_status,
        dedupe_key,
        metadata
      )
      VALUES (
        v_order_id,
        p_store_id,
        p_buyer_user_id,
        'buyer',
        'order_created',
        NULL,
        'pending',
        v_order_id::text || ':order_created',
        jsonb_build_object(
          'order_no', v_order_no,
          'payment_amount', round(v_payment_amount),
          'line_count', v_line_count,
          'fulfillment_type', coalesce(p_order->>'fulfillment_type', 'pickup'),
          'source', 'create_store_order_atomic'
        )
      )
      RETURNING id INTO v_event_id;
    EXCEPTION
      WHEN unique_violation THEN
        SELECT id INTO v_event_id
          FROM public.store_order_events
         WHERE dedupe_key = v_order_id::text || ':order_created'
         LIMIT 1;
    END;

    IF v_coupon_id IS NOT NULL THEN
      INSERT INTO public.store_coupon_redemptions (
        campaign_id,
        store_id,
        buyer_user_id,
        order_id,
        discount_amount_applied,
        user_coupon_id
      )
      VALUES (
        v_coupon_id,
        p_store_id,
        p_buyer_user_id,
        v_order_id,
        v_discount,
        v_user_coupon_id
      );

      IF v_user_coupon_id IS NOT NULL THEN
        UPDATE public.coupon_user_entitlements
           SET status = 'redeemed',
               redeemed_order_id = v_order_id,
               updated_at = now()
         WHERE id = v_user_coupon_id
           AND status IN ('available', 'restored');
        IF NOT FOUND THEN
          RAISE EXCEPTION 'coupon_already_redeemed'
            USING ERRCODE = '23505';
        END IF;
        UPDATE public.store_coupon_campaigns
           SET reserved_spend_php = GREATEST(0, reserved_spend_php - v_entitlement.reserved_php)
         WHERE id = v_coupon_id;
      END IF;
    END IF;


    -- Gift redeem in same TX as order (after order_id exists)
    IF v_gift_count = 1 AND v_gift_total > 0 THEN
      SELECT * INTO v_gift_inst
        FROM public.gift_certificate_instances
       WHERE id = v_gift_id
       FOR UPDATE;
      IF NOT FOUND OR v_gift_inst.remaining_balance < v_gift_total
         OR v_gift_inst.current_owner_user_id IS DISTINCT FROM p_buyer_user_id
         OR v_gift_inst.status NOT IN ('ACTIVE', 'PARTIALLY_REDEEMED') THEN
        RAISE EXCEPTION 'gift_redeem_invariant_failed';
      END IF;

      v_gift_fee_rate := public.gift_certificate_instance_redeem_fee_rate(v_gift_inst);
      v_gift_fee := floor(v_gift_total::numeric * v_gift_fee_rate / 100)::integer;
      v_gift_merchant := v_gift_total - v_gift_fee;
      v_gift_redemption_id := gen_random_uuid();

      INSERT INTO public.gift_certificate_redemptions (
        id, order_id, instance_id, store_id, buyer_user_id,
        redeemed_amount, platform_fee_amount, merchant_net_amount,
        platform_fee_rate_snapshot, reversed, idempotency_key
      ) VALUES (
        v_gift_redemption_id, v_order_id, v_gift_id, p_store_id, p_buyer_user_id,
        v_gift_total, v_gift_fee, v_gift_merchant, v_gift_fee_rate, false,
        'order:' || v_order_id::text || ':gift:1'
      );

      v_gift_remaining := v_gift_inst.remaining_balance - v_gift_total;
      IF v_gift_remaining = 0 THEN
        v_gift_status := 'FULLY_REDEEMED';
      ELSE
        v_gift_status := 'PARTIALLY_REDEEMED';
      END IF;

      UPDATE public.gift_certificate_instances
         SET remaining_balance = v_gift_remaining,
             status = v_gift_status,
             version = version + 1,
             fully_redeemed_at = CASE WHEN v_gift_remaining = 0 THEN now() ELSE fully_redeemed_at END
       WHERE id = v_gift_id;

      INSERT INTO public.gift_certificate_ledger (
        instance_id, store_id, user_id, entry_type, amount,
        related_type, related_id, description, actor_type
      ) VALUES (
        v_gift_id, p_store_id, p_buyer_user_id, 'REDEEM', -v_gift_total,
        'gift_certificate_redemption', v_gift_redemption_id::text, 'Redeemed against order', 'user'
      );

      INSERT INTO public.gift_certificate_revenue_ledger (
        store_id, redemption_id, entry_type, amount, related_type, related_id
      ) VALUES (
        p_store_id, v_gift_redemption_id, 'REVENUE_CREATE', v_gift_merchant,
        'redemption', v_gift_redemption_id::text
      );

    END IF;

    v_result := jsonb_build_object(
      'ok', true,
      'idempotent', false,
      'order', jsonb_build_object(
        'id', v_order_id,
        'order_no', v_order_no,
        'payment_amount', round(v_payment_amount)
      ),
      'sold_out_products', v_sold_out,
      'order_created_event_id', v_event_id,
      'store_name', v_store.store_name,
      'owner_user_id', v_store.owner_user_id
    );
  EXCEPTION
    WHEN unique_violation THEN
      -- Subtransaction rolled back: order+items+stock+redemption undone together.
      IF v_coupon_id IS NOT NULL AND EXISTS (
        SELECT 1
          FROM public.store_coupon_redemptions r
         WHERE r.buyer_user_id = p_buyer_user_id
           AND r.campaign_id = v_coupon_id
      ) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'coupon_already_redeemed', 'http_status', 409);
      END IF;
      IF v_key IS NOT NULL THEN
        SELECT id, order_no, payment_amount
          INTO v_existing
          FROM public.store_orders
         WHERE buyer_user_id = p_buyer_user_id
           AND client_order_key = v_key
         LIMIT 1;
        IF FOUND THEN
          RETURN jsonb_build_object(
            'ok', true,
            'idempotent', true,
            'order', jsonb_build_object(
              'id', v_existing.id,
              'order_no', coalesce(v_existing.order_no, ''),
              'payment_amount', coalesce(v_existing.payment_amount, 0)
            ),
            'sold_out_products', '[]'::jsonb,
            'order_created_event_id', null
          );
        END IF;
        RETURN jsonb_build_object('ok', false, 'error', 'order_idempotency_conflict', 'http_status', 409);
      END IF;
      RAISE;
    WHEN SQLSTATE 'P0001' THEN
      -- insufficient_stock race after pass-1; mutations in this block are rolled back
      RETURN jsonb_build_object('ok', false, 'error', 'insufficient_stock', 'http_status', 409);
  END;

  RETURN v_result;
END;
$$;

COMMIT;
