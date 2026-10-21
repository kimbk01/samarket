-- PRODUCTION function bodies for the final ND-3 isolated regression (46 functions).
-- Each block is the latest repo migration definition of the function (source file named above it), except
-- set_updated_at / ensure_store_sales_permission_row which are copied from prod pg_get_functiondef (CRLF body kept).
-- run.sh compares md5(prosrc) of every function here against prod_md5.txt (prod read-only, 2026-10-21).
SET check_function_bodies = off;

-- from 20270509120000_admin_notification_delivery_recovery.sql
create or replace function public.admin_notification_backoff(p_attempts integer)
returns interval
language sql
immutable
as $$
  select least(interval '6 hours', make_interval(mins => power(2, greatest(p_attempts - 1, 0))::int));
$$;

-- from 20270509120000_admin_notification_delivery_recovery.sql
create or replace function public.admin_notification_outbox_enqueue(
  p_source_key text,
  p_kind text,
  p_payload jsonb,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_source_key is null or length(trim(p_source_key)) = 0 then
    raise exception 'invalid_source_key';
  end if;
  insert into public.admin_notification_outbox (source_key, kind, payload, last_error, attempts, next_attempt_at)
  values (
    p_source_key, p_kind, p_payload, left(p_error, 1000),
    case when p_error is null then 0 else 1 end,
    case when p_error is null then now() else now() + public.admin_notification_backoff(1) end
  )
  on conflict (source_key) do nothing
  returning id into v_id;
  return v_id is not null;
end;
$$;

-- from 20270602100000_delivery_owner_p0_store_write_lock.sql
CREATE OR REPLACE FUNCTION public.block_client_role_direct_writes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'client_role_direct_write_forbidden:%', TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$fn$;

-- from 20261201300000_delivery_ads_canonical_finance_ast004_ast005.sql
CREATE OR REPLACE FUNCTION public.business_cash_ledger_forbid_mutate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'business_cash_ledger is immutable';
END;
$$;

-- from 20270604110100_create_store_order_atomic_ops08_loc004.sql
CREATE OR REPLACE FUNCTION public.create_store_order_atomic(p_buyer_user_id uuid, p_store_id uuid, p_client_order_key text, p_order jsonb, p_lines jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $fn$
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
  v_gift_forfeited integer := 0;
  v_campaign record;
  v_entitlement record;
  v_store_funded numeric := 0;
  v_platform_funded numeric := 0;
  v_commission_base numeric := 0;
  v_items_subtotal numeric := 0;
  v_delivery_fee_auth numeric := 0;
  v_payload_delivery_fee numeric := 0;
  v_payload_total numeric := 0;
  v_payload_payment numeric := 0;
  v_payload_discount numeric := 0;
  v_discount_auth numeric := 0;
  v_min_order_php numeric := NULL;
  v_hours jsonb;
  v_fulfillment text;
  v_auth_total numeric := 0;
  v_pct numeric;
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
    store_name,
    business_hours_json,
    pickup_available,
    delivery_available
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
      options_json,
      admin_review_status,
      menu_section_id
    INTO v_product
    FROM public.store_products
    WHERE id = v_product_id
    FOR UPDATE;

    IF NOT FOUND OR v_product.store_id IS DISTINCT FROM p_store_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_product', 'http_status', 400);
    END IF;

    -- PRD-03: admin review rejected / re-review pending products are not sellable
    IF coalesce(v_product.admin_review_status, 'none') IN ('rejected', 'pending') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'product_not_available', 'http_status', 400);
    END IF;

    -- PRD-05: product in a hidden menu section is not visible, so not orderable
    IF v_product.menu_section_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.store_menu_sections ms
       WHERE ms.id = v_product.menu_section_id
         AND ms.is_hidden IS TRUE
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'product_not_available', 'http_status', 400);
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

    -- ROOT A: line money from verified unit (not client subtotal trust)
    v_subtotal := round(v_unit * v_qty);
    IF v_line ? 'subtotal'
       AND abs(coalesce((v_line->>'subtotal')::numeric, -1) - v_subtotal) >= 1 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'price_changed', 'http_status', 400);
    END IF;
    v_items_subtotal := v_items_subtotal + v_subtotal;

    IF coalesce(v_product.track_inventory, false) IS TRUE
       AND coalesce(v_product.stock_qty, 0) < v_qty THEN
      RETURN jsonb_build_object('ok', false, 'error', 'insufficient_stock', 'http_status', 409);
    END IF;
  END LOOP;

  -- CUT-1: store min_order_php authority
  -- App contract (validateStoreOrderCheckout): items subtotal only (before delivery fee /
  -- coupon / gift). null/<=0 min = no constraint. Equal-to-min ALLOW; below REJECT.
  v_hours := coalesce(v_store.business_hours_json, '{}'::jsonb);
  BEGIN
    v_min_order_php := round(coalesce(
      (v_hours->>'min_order_php')::numeric,
      (v_hours->>'minOrderPhp')::numeric
    ));
  EXCEPTION WHEN others THEN
    v_min_order_php := NULL;
  END;
  IF v_min_order_php IS NOT NULL AND v_min_order_php > 0
     AND round(v_items_subtotal) < v_min_order_php THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'below_min_order',
      'http_status', 400,
      'min_order_php', v_min_order_php
    );
  END IF;

  -- Stores A: coupon authority lock + redemption exclusivity (same TX as order)
  -- CUT-2: discount_amount is NOT authoritative; recompute from campaign after lock.
  v_payload_discount := round(coalesce((p_order->>'discount_amount')::numeric, 0));
  v_discount := 0;
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

  IF v_payload_discount > 0 AND (v_coupon_id IS NULL OR v_user_coupon_id IS NULL) THEN
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
    -- Canonical: Coupon Instance required - campaign-only checkout DELETED
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
      max_discount,
      start_at,
      end_at,
      is_active,
      lifecycle_state,
      funding_mode,
      store_funded_amount
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

    -- Coupon min_order on item gross (same as resolveStoreCouponEligibility itemGrossPhp)
    IF v_campaign.min_order_amount IS NOT NULL
       AND v_campaign.min_order_amount > 0
       AND floor(v_items_subtotal) < floor(v_campaign.min_order_amount) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'coupon_min_order',
        'http_status', 400,
        'min_order_amount', floor(v_campaign.min_order_amount)
      );
    END IF;

    -- Authoritative discount = computeCouponDiscountPhp / computeStoreCouponDiscountPhp
    IF v_campaign.discount_type = 'percent' THEN
      v_pct := least(100::numeric, greatest(0::numeric, coalesce(v_campaign.discount_value, 0)));
      v_discount_auth := least(
        floor(v_items_subtotal),
        floor(floor(v_items_subtotal) * v_pct / 100)
      );
      IF v_campaign.max_discount IS NOT NULL AND v_campaign.max_discount > 0 THEN
        v_discount_auth := least(v_discount_auth, floor(v_campaign.max_discount));
      END IF;
    ELSIF v_campaign.discount_type = 'fixed_amount' THEN
      v_discount_auth := least(
        floor(v_items_subtotal),
        floor(coalesce(v_campaign.discount_value, 0))
      );
    ELSE
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_discount', 'http_status', 400);
    END IF;

    IF v_discount_auth <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_discount', 'http_status', 400);
    END IF;

    -- Fail-closed on payload mismatch (inflate AND shrink)
    IF abs(v_payload_discount - v_discount_auth) >= 1 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_discount', 'http_status', 400);
    END IF;

    v_discount := round(v_discount_auth);
  ELSIF v_payload_discount <> 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_discount', 'http_status', 400);
  END IF;


  -- Gift Certificate: parse instance ids (max 1). Amounts computed server-side.
  v_gift_ids := coalesce(p_order->'gift_instance_ids', '[]'::jsonb);
  IF jsonb_typeof(v_gift_ids) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_gift_instance_ids', 'http_status', 400);
  END IF;
  IF jsonb_array_length(v_gift_ids) > 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'gift_max_one_per_order', 'http_status', 400);
  END IF;

  -- ROOT A: authoritative items + delivery fee; fail-closed on payload mismatch
  -- v_discount already authoritative (0 or campaign-recomputed)
  v_fulfillment := coalesce(nullif(btrim(p_order->>'fulfillment_type'), ''), 'pickup');
  v_delivery_fee_auth := public.store_charged_delivery_fee_php(
    v_store.business_hours_json,
    v_items_subtotal,
    v_fulfillment
  );
  v_payload_delivery_fee := round(coalesce((p_order->>'delivery_fee_amount')::numeric, 0));
  IF abs(v_payload_delivery_fee - v_delivery_fee_auth) >= 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'price_changed', 'http_status', 400);
  END IF;

  v_auth_total := round(v_items_subtotal + v_delivery_fee_auth);
  v_payload_total := round(coalesce((p_order->>'total_amount')::numeric, 0));
  IF abs(v_payload_total - v_auth_total) >= 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'price_changed', 'http_status', 400);
  END IF;

  v_amount_before_gift := greatest(0, round(v_auth_total - v_discount)::integer);
  IF nullif(btrim(coalesce(p_order->>'amount_before_gift', '')), '') IS NOT NULL THEN
    IF abs(round((p_order->>'amount_before_gift')::numeric) - v_amount_before_gift) >= 1 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'price_changed', 'http_status', 400);
    END IF;
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
    IF v_gift_inst.status IS DISTINCT FROM 'ACTIVE' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'gift_invalid_status', 'http_status', 400);
    END IF;
    IF coalesce(v_gift_inst.remaining_balance, 0) <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'gift_insufficient_remaining', 'http_status', 400);
    END IF;
    -- SSOT-19 F-06: validity window (Asia/Manila date, inclusive).
    IF public.gift_certificate_instance_is_expired(v_gift_inst.valid_until) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'gift_expired', 'http_status', 400);
    END IF;
    IF v_gift_inst.valid_from IS NOT NULL
       AND v_gift_inst.valid_from > public.gift_certificate_issue_date(now()) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'gift_not_yet_valid', 'http_status', 400);
    END IF;
    v_gift_total := least(v_gift_due, v_gift_inst.remaining_balance);
    v_gift_count := 1;
  END IF;

  -- ROOT A: payment authority before mutate (fail-closed; no partial order)
  v_payload_payment := round(coalesce((p_order->>'payment_amount')::numeric, 0));
  IF v_gift_count > 0 THEN
    v_payment_amount := greatest(0, v_amount_before_gift - v_gift_total);
  ELSE
    v_payment_amount := v_amount_before_gift;
    v_gift_total := 0;
  END IF;
  IF abs(v_payload_payment - v_payment_amount) >= 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'price_changed', 'http_status', 400);
  END IF;

  -- OPS-08: effective opening state + fulfillment availability re-check under the store lock
  -- (= resolveStoreFrontOpen / validateStoreOrderCheckout; added last, existing checks unchanged)
  IF NOT public.store_front_commerce_open(v_store.business_hours_json, v_store.is_open, now()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_closed', 'http_status', 400);
  END IF;
  IF v_fulfillment = 'pickup' AND v_store.pickup_available IS FALSE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_pickup_disabled', 'http_status', 400);
  END IF;
  IF v_fulfillment = 'local_delivery' AND v_store.delivery_available IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_delivery_disabled', 'http_status', 400);
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
               END,
               sold_out_reason = CASE
                 WHEN stock_qty - v_qty <= 0 THEN 'stock'
                 ELSE sold_out_reason
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
    -- payment_amount already authoritative (asserted before Pass 2)
    -- ADS-22: coupon cost split is server authority (= splitCouponFunding in
    -- lib/stores/store-coupon-funding-math.ts). Payload store/platform_funded_amount
    -- is ignored (corrected, not rejected). No coupon -> both 0.
    IF v_coupon_id IS NOT NULL THEN
      IF v_campaign.funding_mode = 'STORE_FUNDED' THEN
        v_store_funded := floor(v_discount);
        v_platform_funded := 0;
      ELSIF v_campaign.funding_mode = 'PLATFORM_FUNDED' THEN
        v_store_funded := 0;
        v_platform_funded := floor(v_discount);
      ELSE
        v_store_funded := least(
          floor(v_discount),
          greatest(0::numeric, floor(coalesce(v_campaign.store_funded_amount, 0)))
        );
        v_platform_funded := floor(v_discount) - v_store_funded;
      END IF;
    ELSE
      v_store_funded := 0;
      v_platform_funded := 0;
    END IF;
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
      checkout_store_latitude,
      checkout_store_longitude,
      checkout_serviceability_eligible,
      checkout_serviceability_max_km,
      checkout_serviceability_reason,
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
      round(v_auth_total),
      round(v_discount),
      round(v_payment_amount),
      round(v_delivery_fee_auth),
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
      -- LOC-004: order-time serviceability snapshot (same INSERT, immutable evidence)
      CASE WHEN jsonb_typeof(p_order->'checkout_store_latitude') = 'number'
        THEN (p_order->>'checkout_store_latitude')::double precision ELSE NULL END,
      CASE WHEN jsonb_typeof(p_order->'checkout_store_longitude') = 'number'
        THEN (p_order->>'checkout_store_longitude')::double precision ELSE NULL END,
      CASE WHEN jsonb_typeof(p_order->'checkout_serviceability_eligible') = 'boolean'
        THEN (p_order->>'checkout_serviceability_eligible')::boolean ELSE NULL END,
      CASE WHEN jsonb_typeof(p_order->'checkout_serviceability_max_km') = 'number'
        THEN (p_order->>'checkout_serviceability_max_km')::double precision ELSE NULL END,
      nullif(p_order->>'checkout_serviceability_reason', ''),
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
         OR v_gift_inst.status IS DISTINCT FROM 'ACTIVE'
         OR public.gift_certificate_instance_is_expired(v_gift_inst.valid_until)
         OR (v_gift_inst.valid_from IS NOT NULL
             AND v_gift_inst.valid_from > public.gift_certificate_issue_date(now())) THEN
        RAISE EXCEPTION 'gift_redeem_invariant_failed';
      END IF;

      -- Live-compat gift fee (pre-unapplied fee-snapshot helper).
      -- Use gift_certificate_products.platform_fee_rate until fee-snapshot helper is live.
      SELECT platform_fee_rate INTO v_gift_fee_rate
        FROM public.gift_certificate_products
       WHERE id = v_gift_inst.product_id;
      v_gift_fee_rate := coalesce(v_gift_fee_rate, 0);
      v_gift_fee := floor(v_gift_total::numeric * v_gift_fee_rate / 100)::integer;
      v_gift_merchant := v_gift_total - v_gift_fee;
      v_gift_redemption_id := gen_random_uuid();

      -- One-time full consumption: unused face value is forfeited (not merchant revenue).
      v_gift_forfeited := greatest(0, v_gift_inst.remaining_balance - v_gift_total);

      INSERT INTO public.gift_certificate_redemptions (
        id, order_id, instance_id, store_id, buyer_user_id,
        redeemed_amount, platform_fee_amount, merchant_net_amount,
        platform_fee_rate_snapshot, forfeited_amount, reversed, idempotency_key
      ) VALUES (
        v_gift_redemption_id, v_order_id, v_gift_id, p_store_id, p_buyer_user_id,
        v_gift_total, v_gift_fee, v_gift_merchant, v_gift_fee_rate, v_gift_forfeited, false,
        'order:' || v_order_id::text || ':gift:1'
      );

      v_gift_remaining := 0;
      v_gift_status := 'FULLY_REDEEMED';

      UPDATE public.gift_certificate_instances
         SET remaining_balance = v_gift_remaining,
             status = v_gift_status,
             version = version + 1,
             fully_redeemed_at = now()
       WHERE id = v_gift_id;

      INSERT INTO public.gift_certificate_ledger (
        instance_id, store_id, user_id, entry_type, amount,
        related_type, related_id, description, actor_type
      ) VALUES (
        v_gift_id, p_store_id, p_buyer_user_id, 'REDEEM', -v_gift_total,
        'gift_certificate_redemption', v_gift_redemption_id::text, 'Redeemed against order', 'user'
      );

      IF v_gift_forfeited > 0 THEN
        INSERT INTO public.gift_certificate_ledger (
          instance_id, store_id, user_id, entry_type, amount,
          related_type, related_id, description, actor_type
        ) VALUES (
          v_gift_id, p_store_id, p_buyer_user_id, 'FORFEIT', -v_gift_forfeited,
          'gift_certificate_redemption', v_gift_redemption_id::text,
          'Unused face value extinguished at one-time redeem (not merchant revenue)', 'system'
        );
      END IF;

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
$fn$;

-- from 20261201300000_delivery_ads_canonical_finance_ast004_ast005.sql
CREATE OR REPLACE FUNCTION public.ensure_business_cash_account(p_store_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.business_cash_accounts (store_id, balance_minor)
  VALUES (p_store_id, 0)
  ON CONFLICT (store_id) DO NOTHING;
END;
$$;

-- from 20261201300000_delivery_ads_canonical_finance_ast004_ast005.sql
CREATE OR REPLACE FUNCTION public.ensure_store_economic_point_account(p_store_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.store_economic_point_accounts (store_id, balance)
  VALUES (p_store_id, 0)
  ON CONFLICT (store_id) DO NOTHING;
END;
$$;

-- prod pg_get_functiondef (CRLF body preserved)
CREATE OR REPLACE FUNCTION public.ensure_store_sales_permission_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.store_sales_permissions (store_id) VALUES (NEW.id)
  ON CONFLICT (store_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- from 20270101130000_gift_certificate_cancel_order_restore.sql
CREATE OR REPLACE FUNCTION public.gift_certificate_cancel_order_restore(
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.store_orders%ROWTYPE;
  v_reverse jsonb;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_order_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  SELECT * INTO v_order
    FROM public.store_orders
   WHERE id = p_order_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  -- Only restore gift for cancelled (or payment-failure mapped cancel) terminals.
  IF v_order.order_status IS DISTINCT FROM 'cancelled'
     AND coalesce(v_order.payment_status, '') IS DISTINCT FROM 'failed' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'order_not_cancelled',
      'order_status', v_order.order_status
    );
  END IF;

  v_reverse := public.gift_certificate_redemption_reverse(p_order_id);
  IF coalesce(v_reverse->>'ok', 'false') <> 'true' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', coalesce(v_reverse->>'error', 'gift_reverse_failed'),
      'gift_reverse', v_reverse
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'idempotent', coalesce((v_reverse->>'idempotent')::boolean, false)
      OR coalesce((v_reverse->>'reversed_count')::int, 0) = 0,
    'gift_reverse', v_reverse
  );
END;
$$;

-- from 20261128180000_gift_certificate_scope_platform.sql
CREATE OR REPLACE FUNCTION public.gift_certificate_instance_allows_checkout_store(
  p_gift_scope text,
  p_instance_store_id uuid,
  p_checkout_store_id uuid
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_checkout_store_id IS NULL THEN false
    WHEN coalesce(p_gift_scope, 'STORE') = 'STORE' THEN
      p_instance_store_id IS NOT NULL AND p_instance_store_id IS NOT DISTINCT FROM p_checkout_store_id
    WHEN coalesce(p_gift_scope, 'STORE') = 'PLATFORM' THEN
      true
    ELSE false
  END;
$$;

-- from 20261128200000_gift_certificate_instance_validity.sql
CREATE OR REPLACE FUNCTION public.gift_certificate_instance_is_expired(p_valid_until date)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT p_valid_until IS NOT NULL
     AND p_valid_until < public.gift_certificate_issue_date(now());
$$;

-- from 20261128200000_gift_certificate_instance_validity.sql
CREATE OR REPLACE FUNCTION public.gift_certificate_issue_date(p_at timestamptz DEFAULT now())
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT (coalesce(p_at, now()) AT TIME ZONE 'Asia/Manila')::date;
$$;

-- from 20261128190000_gift_certificate_promo_economics.sql
CREATE OR REPLACE FUNCTION public.gift_certificate_promo_reverse_for_redemption(
  p_redemption_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_inserted integer;
  v_count integer := 0;
BEGIN
  IF p_redemption_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  FOR v_row IN
    SELECT pl.*, o.contracted_amount, o.recognized_amount, o.settled_amount
      FROM public.gift_promo_ledger pl
      JOIN public.gift_promo_obligations o ON o.id = pl.obligation_id
     WHERE pl.redemption_id = p_redemption_id
       AND pl.entry_type = 'PROMO_RECOGNITION'
       AND pl.amount > 0
     FOR UPDATE OF o
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.gift_promo_ledger rev
       WHERE rev.related_type = 'promo_reversal'
         AND rev.related_id = p_redemption_id::text || ':' || lower(v_row.party) || ':reversal'
         AND rev.entry_type = 'PROMO_REVERSAL'
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.gift_promo_ledger (
      instance_id, obligation_id, redemption_id, order_id, store_id, party,
      entry_type, amount, related_type, related_id, description
    ) VALUES (
      v_row.instance_id, v_row.obligation_id, p_redemption_id, v_row.order_id, v_row.store_id,
      v_row.party, 'PROMO_REVERSAL', -v_row.amount,
      'promo_reversal', p_redemption_id::text || ':' || lower(v_row.party) || ':reversal',
      'Promo recognition reversed on refund'
    )
    ON CONFLICT (related_type, related_id, entry_type) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted > 0 THEN
      UPDATE public.gift_promo_obligations
         SET recognized_amount = GREATEST(0, recognized_amount - v_row.amount),
             settled_amount = LEAST(
               GREATEST(0, recognized_amount - v_row.amount),
               settled_amount
             ),
             updated_at = now()
       WHERE id = v_row.obligation_id;
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'reversed_count', v_count);
END;
$$;

-- from 20261202110000_currency_cut_c_sale_coin_ssot.sql
CREATE OR REPLACE FUNCTION public.gift_certificate_recognize_revenue_for_completed_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.store_orders%ROWTYPE;
  v_red public.gift_certificate_redemptions%ROWTYPE;
  v_recognized_count integer := 0;
  v_skipped_count integer := 0;
  v_inserted integer;
BEGIN
  IF p_order_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  SELECT * INTO v_order
    FROM public.store_orders
   WHERE id = p_order_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;
  IF v_order.order_status IS DISTINCT FROM 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_completed');
  END IF;

  FOR v_red IN
    SELECT * FROM public.gift_certificate_redemptions
     WHERE order_id = p_order_id
       AND reversed = false
     ORDER BY created_at
     FOR UPDATE
  LOOP
    IF public.gift_certificate_redemption_is_recognized(v_red.id) THEN
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.gift_certificate_revenue_ledger (
      store_id, redemption_id, entry_type, amount, related_type, related_id
    ) VALUES (
      v_red.store_id, v_red.id, 'REVENUE_AVAILABLE', v_red.merchant_net_amount,
      'redemption', v_red.id::text || ':available'
    )
    ON CONFLICT (related_type, related_id, entry_type) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted > 0 THEN
      v_recognized_count := v_recognized_count + 1;
    ELSE
      v_skipped_count := v_skipped_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'recognized_count', v_recognized_count,
    'skipped_count', v_skipped_count,
    'coin_mint', 'deferred_to_sale_coin'
  );
END;
$$;

-- from 20261128150000_gift_certificate_recognition_correction.sql
CREATE OR REPLACE FUNCTION public.gift_certificate_redemption_is_recognized(p_redemption_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.gift_certificate_redemption_recognized_net(p_redemption_id) > 0;
$$;

-- from 20261128150000_gift_certificate_recognition_correction.sql
CREATE OR REPLACE FUNCTION public.gift_certificate_redemption_recognized_net(p_redemption_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(rl.amount), 0)::integer
    FROM public.gift_certificate_revenue_ledger rl
   WHERE rl.redemption_id = p_redemption_id
     AND rl.entry_type IN ('REVENUE_AVAILABLE', 'RECOGNITION_CORRECTION', 'REVERSED');
$$;

-- from 20270603140000_gift_redemption_reverse_terminal_guard.sql
CREATE OR REPLACE FUNCTION public.gift_certificate_redemption_reverse(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_red public.gift_certificate_redemptions%ROWTYPE;
  v_inst public.gift_certificate_instances%ROWTYPE;
  v_avail_before integer;
  v_shortfall integer;
  v_cash_balance integer;
  v_debit integer;
  v_new_cash integer;
  v_restored integer;
  v_new_status text;
  v_count integer := 0;
  v_obligation_id uuid;
  v_has_coin_credit boolean;
  v_order_status text;
  v_payment_status text;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_order_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  -- GFT-01: reverse only for terminal orders. refund_requested = G10 refund wrapper (reverse before its refunded UPDATE).
  SELECT so.order_status, so.payment_status
    INTO v_order_status, v_payment_status
    FROM public.store_orders so
   WHERE so.id = p_order_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;
  IF v_order_status NOT IN ('cancelled', 'refunded', 'refund_requested')
     AND coalesce(v_payment_status, '') IS DISTINCT FROM 'failed' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'order_not_terminal',
      'order_status', v_order_status,
      'payment_status', v_payment_status
    );
  END IF;

  FOR v_red IN
    SELECT * FROM public.gift_certificate_redemptions
     WHERE order_id = p_order_id
       AND reversed = false
     ORDER BY created_at
     FOR UPDATE
  LOOP
    v_count := v_count + 1;

    SELECT * INTO v_inst
      FROM public.gift_certificate_instances
     WHERE id = v_red.instance_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'gift_reverse_instance_not_found redemption=%', v_red.id;
    END IF;

    -- Restore redeemed + forfeited face (one-time extinguish reversed on cancel).
    v_restored := least(
      v_inst.face_value,
      v_inst.remaining_balance
        + v_red.redeemed_amount
        + coalesce(v_red.forfeited_amount, 0)
    );
    IF v_restored = v_inst.face_value THEN
      v_new_status := 'ACTIVE';
    ELSIF v_restored > 0 THEN
      -- Historical compat only (new redeem path never leaves PARTIALLY_REDEEMED).
      v_new_status := 'PARTIALLY_REDEEMED';
    ELSE
      v_new_status := 'FULLY_REDEEMED';
    END IF;

    UPDATE public.gift_certificate_instances
       SET remaining_balance = v_restored,
           status = CASE
             WHEN status = 'GIFT_LOCKED' THEN 'GIFT_LOCKED'
             ELSE v_new_status
           END,
           version = version + 1,
           fully_redeemed_at = CASE WHEN v_restored > 0 THEN NULL ELSE fully_redeemed_at END
     WHERE id = v_inst.id;

    UPDATE public.gift_certificate_redemptions
       SET reversed = true,
           reversed_at = now()
     WHERE id = v_red.id;

    INSERT INTO public.gift_certificate_ledger (
      instance_id, store_id, user_id, entry_type, amount,
      related_type, related_id, description, actor_type
    ) VALUES (
      v_red.instance_id, v_red.store_id, v_red.buyer_user_id, 'REDEEM_REVERSE', v_red.redeemed_amount,
      'gift_certificate_redemption_reverse', v_red.id::text, 'Redemption reversed', 'system'
    );

    IF coalesce(v_red.forfeited_amount, 0) > 0 THEN
      INSERT INTO public.gift_certificate_ledger (
        instance_id, store_id, user_id, entry_type, amount,
        related_type, related_id, description, actor_type
      ) VALUES (
        v_red.instance_id, v_red.store_id, v_red.buyer_user_id, 'FORFEIT_REVERSE',
        v_red.forfeited_amount,
        'gift_certificate_redemption_reverse', v_red.id::text,
        'Forfeiture reversed', 'system'
      );
    END IF;

    PERFORM public.gift_certificate_promo_reverse_for_redemption(v_red.id);

    IF EXISTS (
      SELECT 1 FROM public.gift_certificate_revenue_ledger rl
       WHERE rl.redemption_id = v_red.id
         AND rl.entry_type = 'REVENUE_AVAILABLE'
    ) THEN
      INSERT INTO public.gift_certificate_revenue_ledger (
        store_id, redemption_id, entry_type, amount, related_type, related_id
      ) VALUES (
        v_red.store_id, v_red.id, 'REVERSED', -v_red.merchant_net_amount,
        'redemption_reverse', v_red.id::text
      );

      SELECT EXISTS (
        SELECT 1
          FROM public.store_economic_point_ledger l
         WHERE l.store_id = v_red.store_id
           AND l.entry_kind = 'GIFT_REDEMPTION_EARN'
           AND l.related_type = 'gift_redemption'
           AND l.related_id = v_red.id::text
           AND l.amount > 0
      ) INTO v_has_coin_credit;

      -- SSOT-19 F-10: Coin clawback is order-level (reverse_coin_credits_for_order).
      -- Archived Store Cash tables are never written here.
    END IF;
  END LOOP;

  IF v_count = 0 THEN
    RETURN jsonb_build_object('ok', true, 'reversed_count', 0, 'idempotent', true);
  END IF;

  UPDATE public.store_orders so
     SET gift_redemption_amount = coalesce((
       SELECT SUM(r.redeemed_amount)::integer
         FROM public.gift_certificate_redemptions r
        WHERE r.order_id = p_order_id
          AND r.reversed = false
     ), 0)
   WHERE so.id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'reversed_count', v_count, 'order_id', p_order_id);
END;
$function$;

-- from 20270603130000_stage2_2c_cancel_refund_money_atomic.sql
CREATE OR REPLACE FUNCTION public.gift_certificate_refund_order_atomic(p_order_id uuid, p_actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.store_orders%ROWTYPE;
  v_reverse jsonb;
  v_coin jsonb;
  v_coupon jsonb;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_order_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  SELECT * INTO v_order
    FROM public.store_orders
   WHERE id = p_order_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  IF v_order.order_status = 'refunded' THEN
    v_reverse := public.gift_certificate_redemption_reverse(p_order_id);
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'order_id', p_order_id,
      'gift_reverse', v_reverse
    );
  END IF;

  IF v_order.order_status IS DISTINCT FROM 'refund_requested' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'unexpected_from_status',
      'order_status', v_order.order_status
    );
  END IF;

  -- Gift reverse FIRST in same TX. Failure => RAISE => refund not terminal.
  v_reverse := public.gift_certificate_redemption_reverse(p_order_id);
  IF coalesce(v_reverse->>'ok', 'false') <> 'true' THEN
    RAISE EXCEPTION 'gift_reverse_failed: %', coalesce(v_reverse->>'error', 'unknown');
  END IF;

  UPDATE public.store_orders
     SET order_status = 'refunded',
         payment_status = 'refunded',
         refunded_at = coalesce(refunded_at, now()),
         refund_approved_at = coalesce(refund_approved_at, now()),
         updated_at = now()
   WHERE id = p_order_id
     AND order_status = 'refund_requested';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gift_refund_status_race';
  END IF;

  UPDATE public.store_payments
     SET status = 'refunded'
   WHERE order_id = p_order_id
     AND status = 'succeeded';

  -- FIN-05: Coin clawback of exactly what the coin ledger credited for this order (idempotent key).
  v_coin := public.reverse_coin_credits_for_order(p_order_id, 'coin_reversal:order:' || p_order_id::text, 'order_refund');
  IF coalesce(v_coin->>'ok', 'false') <> 'true' THEN
    RAISE EXCEPTION 'coin_reversal_failed: %', coalesce(v_coin->>'error', 'unknown');
  END IF;

  -- ADS-21: coupon restore (refund policy: restore_on_full_refund / first-order scope).
  v_coupon := public.restore_store_coupon_entitlement(p_order_id, true);
  IF coalesce(v_coupon->>'ok', 'false') <> 'true' THEN
    RAISE EXCEPTION 'coupon_restore_failed: %', coalesce(v_coupon->>'error', 'unknown');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'gift_reverse', v_reverse,
    'coin_reversal', v_coin,
    'coupon_restore', v_coupon
  );
END;
$function$;

-- from 20270603130000_stage2_2c_cancel_refund_money_atomic.sql
CREATE OR REPLACE FUNCTION public.restore_store_coupon_entitlement(p_order_id uuid, p_allow_after_completed boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ent record;
  v_campaign record;
  v_budget_restored boolean := false;
BEGIN
  SELECT e.*
    INTO v_ent
    FROM public.coupon_user_entitlements e
   WHERE e.redeemed_order_id = p_order_id
     AND e.status = 'redeemed'
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'restored', false);
  END IF;

  SELECT restore_on_full_refund, first_order_scope, lifecycle_state
    INTO v_campaign
    FROM public.store_coupon_campaigns
   WHERE id = v_ent.campaign_id;

  IF p_allow_after_completed IS TRUE THEN
    IF v_campaign.first_order_scope IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'restored', false, 'reason', 'first_order_no_restore');
    END IF;
    IF v_campaign.restore_on_full_refund IS NOT TRUE THEN
      RETURN jsonb_build_object('ok', true, 'restored', false, 'reason', 'policy_no_restore');
    END IF;
  END IF;

  -- One usable entitlement per (buyer, campaign): never raise inside the cancel/refund TX for it.
  IF EXISTS (
    SELECT 1 FROM public.coupon_user_entitlements x
     WHERE x.buyer_user_id = v_ent.buyer_user_id
       AND x.campaign_id = v_ent.campaign_id
       AND x.id <> v_ent.id
       AND x.status IN ('available', 'restored')
  ) THEN
    RETURN jsonb_build_object('ok', true, 'restored', false, 'reason', 'active_entitlement_exists');
  END IF;

  UPDATE public.coupon_user_entitlements
     SET status = 'restored',
         redeemed_order_id = NULL,
         updated_at = now()
   WHERE id = v_ent.id;

  -- ADS-25: budget goes back only to a campaign that can still spend it.
  IF v_campaign.lifecycle_state = 'active' THEN
    UPDATE public.store_coupon_campaigns
       SET reserved_spend_php = reserved_spend_php + v_ent.reserved_php,
           updated_at = now()
     WHERE id = v_ent.campaign_id;
    v_budget_restored := true;
  END IF;

  -- ADS-25: keep the redemption history; mark it reversed instead of deleting it.
  UPDATE public.store_coupon_redemptions
     SET reversed_at = now(),
         reversed_reason = CASE WHEN p_allow_after_completed IS TRUE THEN 'order_refund' ELSE 'order_cancel' END
   WHERE order_id = p_order_id
     AND reversed_at IS NULL;

  RETURN jsonb_build_object('ok', true, 'restored', true, 'budget_restored', v_budget_restored);
END;
$function$;

-- from 20261202100000_currency_cut_b_coin_reversal.sql
CREATE OR REPLACE FUNCTION public.reverse_coin_credits_for_order(
  p_order_id uuid,
  p_idempotency_key text,
  p_reason text DEFAULT 'order_refund'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_order public.store_orders%ROWTYPE;
  v_store_id uuid;
  v_credited integer := 0;
  v_already_reversed integer := 0;
  v_to_reverse integer := 0;
  v_bal_before integer := 0;
  v_bal_after integer := 0;
  v_reversal_id uuid;
  v_existing uuid;
  v_original_ids uuid[] := ARRAY[]::uuid[];
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_order_id IS NULL OR v_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  SELECT id INTO v_existing
    FROM public.store_economic_point_ledger
   WHERE idempotency_key = v_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'reversal_ledger_id', v_existing,
      'order_id', p_order_id
    );
  END IF;

  SELECT * INTO v_order
    FROM public.store_orders
   WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;
  v_store_id := v_order.store_id;

  SELECT COALESCE(SUM(l.amount), 0)::integer,
         COALESCE(array_agg(l.id ORDER BY l.created_at), ARRAY[]::uuid[])
    INTO v_credited, v_original_ids
    FROM public.store_economic_point_ledger l
    LEFT JOIN public.store_settlements s
      ON l.related_type = 'store_settlement'
     AND l.related_id = s.id::text
    LEFT JOIN public.gift_certificate_redemptions r
      ON l.related_type = 'gift_redemption'
     AND l.related_id = r.id::text
   WHERE l.store_id = v_store_id
     AND l.entry_kind IN ('SALE_EARN', 'GIFT_REDEMPTION_EARN')
     AND l.amount > 0
     AND (
       coalesce(l.meta->>'order_id', '') = p_order_id::text
       OR s.order_id = p_order_id
       OR r.order_id = p_order_id
     );

  SELECT COALESCE(SUM(ABS(l.amount)), 0)::integer
    INTO v_already_reversed
    FROM public.store_economic_point_ledger l
   WHERE l.store_id = v_store_id
     AND l.entry_kind = 'REVERSAL'
     AND coalesce(l.meta->>'order_id', '') = p_order_id::text;

  v_to_reverse := GREATEST(0, v_credited - v_already_reversed);

  IF v_to_reverse <= 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reversed_amount', 0,
      'order_id', p_order_id,
      'credited_amount', v_credited,
      'already_reversed', v_already_reversed
    );
  END IF;

  PERFORM public.ensure_store_economic_point_account(v_store_id);

  SELECT balance INTO v_bal_before
    FROM public.store_economic_point_accounts
   WHERE store_id = v_store_id
   FOR UPDATE;

  v_bal_after := coalesce(v_bal_before, 0) - v_to_reverse;

  UPDATE public.store_economic_point_accounts
     SET balance = v_bal_after,
         updated_at = now()
   WHERE store_id = v_store_id;

  INSERT INTO public.store_economic_point_ledger (
    store_id, entry_kind, amount, balance_after, related_type, related_id,
    idempotency_key, actor_type, meta
  ) VALUES (
    v_store_id, 'REVERSAL', -v_to_reverse, v_bal_after,
    'store_order', p_order_id::text,
    v_key, 'system',
    jsonb_build_object(
      'order_id', p_order_id,
      'reason', coalesce(v_reason, 'order_refund'),
      'reversed_amount', v_to_reverse,
      'original_ledger_ids', to_jsonb(v_original_ids),
      'balance_before', coalesce(v_bal_before, 0),
      'balance_after', v_bal_after
    )
  ) RETURNING id INTO v_reversal_id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'reversal_ledger_id', v_reversal_id,
    'reversed_amount', v_to_reverse,
    'order_id', p_order_id,
    'original_ledger_ids', to_jsonb(v_original_ids),
    'balance_before', coalesce(v_bal_before, 0),
    'balance_after', v_bal_after
  );
END;
$$;

-- prod pg_get_functiondef (CRLF body preserved)
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

-- from 20270510120000_store_commission_cash_ssot.sql
CREATE OR REPLACE FUNCTION public.store_cash_order_gate_mode()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN (SELECT value_json->>'value' FROM public.admin_settings WHERE key = 'store_cash_order_gate')
         = 'block_when_not_positive'
      THEN 'block_when_not_positive'
    ELSE 'off'
  END;
$$;

-- from 20270603110300_stage2a_fin11_store_cash_position_open_count.sql
CREATE OR REPLACE FUNCTION public.store_cash_position(p_store_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_balance bigint := 0;
  v_outstanding bigint := 0;
  v_open_count bigint := 0;
  v_mode text := public.store_cash_order_gate_mode();
  v_net bigint;
BEGIN
  SELECT coalesce(balance_minor, 0) INTO v_balance FROM public.business_cash_accounts WHERE store_id = p_store_id;
  SELECT coalesce(sum(fee_outstanding_minor), 0), count(*) INTO v_outstanding, v_open_count
    FROM public.store_sale_fee_obligations WHERE store_id = p_store_id AND status = 'open';
  v_net := coalesce(v_balance, 0) - coalesce(v_outstanding, 0);
  RETURN jsonb_build_object(
    'store_id', p_store_id,
    'balance_minor', coalesce(v_balance, 0),
    'outstanding_minor', coalesce(v_outstanding, 0),
    'open_count', coalesce(v_open_count, 0),
    'net_minor', v_net,
    'gate_mode', v_mode,
    'orderable', (v_mode = 'off' OR v_net > 0)
  );
END;
$function$;

-- from 20261216120000_create_store_order_atomic_money_authority.sql
CREATE OR REPLACE FUNCTION public.store_charged_delivery_fee_php(
  p_business_hours_json jsonb,
  p_items_subtotal numeric,
  p_fulfillment text
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_mode text;
  v_fee numeric;
  v_free_over numeric;
  v_fulfillment text := coalesce(nullif(btrim(p_fulfillment), ''), 'pickup');
  v_o jsonb := coalesce(p_business_hours_json, '{}'::jsonb);
BEGIN
  IF v_fulfillment IS DISTINCT FROM 'local_delivery' THEN
    RETURN 0;
  END IF;

  v_mode := lower(nullif(btrim(coalesce(v_o->>'delivery_fee_mode', v_o->>'deliveryFeeMode', '')), ''));
  BEGIN
    v_fee := round(coalesce((v_o->>'delivery_fee_php')::numeric, (v_o->>'deliveryFeePhp')::numeric));
  EXCEPTION WHEN others THEN
    v_fee := NULL;
  END;
  BEGIN
    v_free_over := (v_o->>'free_delivery_over_php')::numeric;
  EXCEPTION WHEN others THEN
    BEGIN
      v_free_over := (v_o->>'freeDeliveryOverPhp')::numeric;
    EXCEPTION WHEN others THEN
      v_free_over := NULL;
    END;
  END;

  -- Infer mode when absent (same as parseCommerceExtrasFromHoursJson)
  IF v_mode IS NULL OR v_mode = '' THEN
    IF v_fee IS NOT NULL AND v_fee > 0 THEN
      v_mode := 'self';
    ELSIF nullif(btrim(coalesce(v_o->>'delivery_courier_label', v_o->>'deliveryCourierLabel', '')), '') IS NOT NULL THEN
      v_mode := 'courier';
    ELSIF v_fee = 0 THEN
      v_mode := 'self';
    ELSE
      v_mode := NULL;
    END IF;
  END IF;

  IF v_mode = 'courier' OR v_mode = 'self_free_promo' THEN
    RETURN 0;
  END IF;
  IF v_mode IS DISTINCT FROM 'self' THEN
    RETURN 0;
  END IF;

  v_fee := coalesce(v_fee, 0);
  IF v_fee < 0 THEN
    v_fee := 0;
  END IF;
  IF v_free_over IS NOT NULL AND v_free_over > 0 AND coalesce(p_items_subtotal, 0) >= v_free_over THEN
    RETURN 0;
  END IF;
  RETURN v_fee;
END;
$$;

-- from 20270510120000_store_commission_cash_ssot.sql
CREATE OR REPLACE FUNCTION public.store_commission_charge_order_internal(p_order_id uuid, p_stage text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_existing uuid;
  v_policy jsonb;
  v_base bigint;
  v_delivery bigint;
  v_pct numeric;
  v_fixed bigint;
  v_percent_fee bigint;
  v_platform bigint;
  v_delivery_income bigint := 0;
  v_fee_php bigint;
BEGIN
  SELECT id INTO v_existing FROM public.store_sale_fee_obligations WHERE order_id = p_order_id;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'obligation_id', v_existing);
  END IF;

  SELECT id, store_id, payment_amount, gift_redemption_amount, platform_funded_amount, delivery_fee_amount
    INTO v_order FROM public.store_orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  v_base := GREATEST(0, trunc(coalesce(v_order.payment_amount, 0)))::bigint
          + GREATEST(0, trunc(coalesce(v_order.gift_redemption_amount, 0)))::bigint
          + GREATEST(0, trunc(coalesce(v_order.platform_funded_amount, 0)))::bigint;
  IF v_base <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'zero_base');
  END IF;

  v_policy := public.store_commission_resolve_policy(v_order.store_id);
  IF v_policy IS NULL THEN
    RAISE EXCEPTION 'store_commission_policy_missing store=%', v_order.store_id USING ERRCODE = 'P0001';
  END IF;

  v_delivery := GREATEST(0, trunc(coalesce(v_order.delivery_fee_amount, 0)))::bigint;
  v_pct := (v_policy->>'fee_percent')::numeric;
  v_fixed := (v_policy->>'fixed_fee')::bigint;
  v_percent_fee := LEAST(v_base, floor(v_base * v_pct / 100))::bigint;
  v_platform := LEAST(v_base, v_percent_fee + v_fixed);
  IF v_policy->>'delivery_fee_mode' = 'percent' THEN
    v_delivery_income := LEAST(v_delivery, floor(v_delivery * (v_policy->>'delivery_fee_percent')::numeric / 100))::bigint;
  END IF;
  v_fee_php := v_platform + v_delivery_income;

  RETURN public.store_commission_debit_internal(
    v_order.store_id, p_order_id, NULL, v_base, v_fee_php * 100,
    'sale_fee:order:' || p_order_id::text, p_stage,
    jsonb_build_object(
      'policy_id', v_policy->'policy_id',
      'policy', v_policy - 'policy_id',
      'commission_base_php', v_base,
      'delivery_fee_php', v_delivery,
      'fee_percent', v_pct,
      'platform_fee_php', v_percent_fee,
      'fixed_fee_php', v_platform - v_percent_fee,
      'delivery_income_php', v_delivery_income,
      'fee_due_php', v_fee_php,
      'charged_on_status', p_stage
    )
  );
END;
$$;

-- from 20270510120000_store_commission_cash_ssot.sql
CREATE OR REPLACE FUNCTION public.store_commission_debit_internal(
  p_store_id uuid,
  p_order_id uuid,
  p_settlement_id uuid,
  p_commission_base_php bigint,
  p_fee_due_minor bigint,
  p_idempotency_key text,
  p_charge_stage text,
  p_fee_snapshot jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.store_sale_fee_obligations%ROWTYPE;
  v_cash_avail bigint := 0;
  v_cash_paid bigint := 0;
  v_outstanding bigint := 0;
  v_bc_bal bigint;
  v_ledger uuid;
  v_ob uuid;
BEGIN
  IF p_store_id IS NULL OR p_order_id IS NULL OR nullif(btrim(coalesce(p_idempotency_key, '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  SELECT * INTO v_existing FROM public.store_sale_fee_obligations
   WHERE idempotency_key = p_idempotency_key OR order_id = p_order_id
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true, 'idempotent', true, 'obligation_id', v_existing.id,
      'fee_due_minor', v_existing.fee_due_minor, 'fee_paid_minor', v_existing.fee_paid_minor,
      'fee_outstanding_minor', v_existing.fee_outstanding_minor
    );
  END IF;

  IF coalesce(p_fee_due_minor, 0) <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'fee_due_minor', 0);
  END IF;

  PERFORM public.ensure_business_cash_account(p_store_id);
  SELECT balance_minor INTO v_cash_avail FROM public.business_cash_accounts WHERE store_id = p_store_id FOR UPDATE;

  v_cash_paid := LEAST(GREATEST(coalesce(v_cash_avail, 0), 0), p_fee_due_minor);
  v_outstanding := p_fee_due_minor - v_cash_paid;

  INSERT INTO public.store_sale_fee_obligations (
    store_id, order_id, settlement_id, confirmed_revenue_php,
    fee_due_minor, fee_paid_minor, fee_outstanding_minor, status, idempotency_key, settled_at,
    charge_stage, fee_snapshot, original_fee_due_minor
  ) VALUES (
    p_store_id, p_order_id, p_settlement_id, GREATEST(0, coalesce(p_commission_base_php, 0))::integer,
    p_fee_due_minor, v_cash_paid, v_outstanding,
    CASE WHEN v_outstanding <= 0 THEN 'settled' ELSE 'open' END,
    p_idempotency_key,
    CASE WHEN v_outstanding <= 0 THEN now() ELSE NULL END,
    coalesce(p_charge_stage, 'completed'), p_fee_snapshot, p_fee_due_minor
  ) RETURNING id INTO v_ob;

  IF v_cash_paid > 0 THEN
    UPDATE public.business_cash_accounts
       SET balance_minor = balance_minor - v_cash_paid, updated_at = now()
     WHERE store_id = p_store_id
     RETURNING balance_minor INTO v_bc_bal;

    INSERT INTO public.business_cash_ledger (
      store_id, entry_kind, direction, amount_minor, balance_after_minor,
      related_type, related_id, idempotency_key, actor_type, meta
    ) VALUES (
      p_store_id, 'SALE_FEE', 'debit', v_cash_paid, v_bc_bal,
      'store_order', p_order_id::text, p_idempotency_key || ':cash', 'system',
      jsonb_build_object('order_id', p_order_id, 'obligation_id', v_ob, 'settlement_id', p_settlement_id,
                         'confirmed_revenue_php', p_commission_base_php, 'charge_stage', p_charge_stage,
                         'fee_due_minor', p_fee_due_minor, 'fee_outstanding_minor', v_outstanding)
    ) RETURNING id INTO v_ledger;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'idempotent', false, 'obligation_id', v_ob,
    'fee_due_minor', p_fee_due_minor, 'fee_paid_minor', v_cash_paid,
    'fee_outstanding_minor', v_outstanding, 'cash_ledger_id', v_ledger
  );
END;
$$;

-- from 20270510120000_store_commission_cash_ssot.sql
CREATE OR REPLACE FUNCTION public.store_commission_notify_admin(
  p_source_key text,
  p_kind text,
  p_severity text,
  p_title text,
  p_body text,
  p_link text,
  p_work_table text,
  p_work_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF to_regprocedure('public.admin_notification_outbox_enqueue(text,text,jsonb,text)') IS NULL THEN
    RETURN false;
  END IF;
  -- Best effort inside the caller's transaction: a notification failure must never block the
  -- order status change (the review queue row itself is the durable record; the scan replays it).
  BEGIN
    -- Go-live baseline (section 12 only): financial exceptions that already exist when alerts go live
    -- are recorded under their source_key as handled ('delivered', payload.baseline) — never pushed to
    -- admins, and the same event can never alert later. They stay visible on the 금융 예외 tab.
    -- delivered_at stays NULL: no send happened, so delivery history is not inflated.
    IF p_kind = 'settlement_financial_exception'
       AND current_setting('dibay.settlement_alert_baseline', true) = 'on' THEN
      INSERT INTO public.admin_notification_outbox (source_key, kind, payload, status, delivered_at, last_error)
      VALUES (p_source_key, p_kind,
              jsonb_build_object('baseline', true, 'title', p_title, 'body', p_body, 'linkUrl', p_link),
              'delivered', NULL, 'baseline_preexisting')
      ON CONFLICT (source_key) DO NOTHING;
      RETURN false;
    END IF;
    RETURN public.admin_notification_outbox_enqueue(
      p_source_key,
      p_kind,
      jsonb_build_object(
        'broadcastPermission', 'business',
        'requiredPermission', 'business',
        'kind', p_kind,
        'severity', p_severity,
        'title', p_title,
        'body', p_body,
        'linkUrl', p_link,
        'workRef', CASE WHEN p_work_id IS NULL THEN NULL ELSE jsonb_build_object('table', p_work_table, 'id', p_work_id) END,
        'dedupeKey', p_source_key,
        'push', true
      ),
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'store_commission_notify_admin failed: % (%)', SQLERRM, p_source_key;
    RETURN false;
  END;
END;
$$;

-- from 20270510120000_store_commission_cash_ssot.sql
CREATE OR REPLACE FUNCTION public.store_commission_notify_review(p_obligation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v record;
BEGIN
  SELECT ob.id, ob.order_id, ob.fee_paid_minor, ob.fee_outstanding_minor, ob.adjustment_trigger,
         coalesce(ob.original_fee_due_minor, ob.fee_due_minor) AS charged,
         o.order_no, s.store_name
    INTO v
    FROM public.store_sale_fee_obligations ob
    JOIN public.store_orders o ON o.id = ob.order_id
    JOIN public.stores s ON s.id = ob.store_id
   WHERE ob.id = p_obligation_id AND ob.adjustment_status = 'review_required';
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  RETURN public.store_commission_notify_admin(
    'settlement_review:' || v.id::text,
    'settlement_commission_review',
    'warning',
    '[취소·환불 수수료 검토] ' || coalesce(v.store_name, '') || ' · #' || coalesce(v.order_no, v.order_id::text),
    CASE WHEN v.adjustment_trigger = 'refunded' THEN '환불' ELSE '조리 후 취소' END
      || ' · 부과 ' || public.store_commission_php_text(v.charged)
      || ' (캐시 차감 ' || public.store_commission_php_text(v.fee_paid_minor)
      || ' · 미납 ' || public.store_commission_php_text(v.fee_outstanding_minor) || ') · 환급 승인·거절 검토 대상',
    '/admin/store-settlements?tab=ledger&order_no=' || coalesce(v.order_no, '') || '&open=' || v.id::text,
    'store_sale_fee_obligations',
    v.id::text
  );
END;
$$;

-- from 20270510120000_store_commission_cash_ssot.sql
CREATE OR REPLACE FUNCTION public.store_commission_php_text(p_minor bigint)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT '₱' || to_char(coalesce(p_minor, 0) / 100.0, 'FM999,999,999,990.00');
$$;

-- from 20270510120000_store_commission_cash_ssot.sql
CREATE OR REPLACE FUNCTION public.store_commission_resolve_policy(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cat uuid;
  v_topic uuid;
  v_row public.store_fee_policies%ROWTYPE;
  v_scope text;
BEGIN
  SELECT store_category_id, store_topic_id INTO v_cat, v_topic FROM public.stores WHERE id = p_store_id;

  SELECT * INTO v_row FROM public.store_fee_policies p
   WHERE p.is_active AND NOT coalesce(p.is_archived, false)
     AND (p.starts_at IS NULL OR p.starts_at <= now()) AND (p.ends_at IS NULL OR p.ends_at > now())
     AND p.store_id = p_store_id
   ORDER BY p.priority ASC, p.starts_at DESC NULLS FIRST, p.created_at DESC LIMIT 1;
  IF FOUND THEN v_scope := 'store'; END IF;

  IF v_scope IS NULL AND v_topic IS NOT NULL THEN
    SELECT * INTO v_row FROM public.store_fee_policies p
     WHERE p.is_active AND NOT coalesce(p.is_archived, false)
       AND (p.starts_at IS NULL OR p.starts_at <= now()) AND (p.ends_at IS NULL OR p.ends_at > now())
       AND p.store_id IS NULL AND p.topic_id = v_topic
     ORDER BY p.priority ASC, p.starts_at DESC NULLS FIRST, p.created_at DESC LIMIT 1;
    IF FOUND THEN v_scope := 'topic'; END IF;
  END IF;

  IF v_scope IS NULL AND v_cat IS NOT NULL THEN
    SELECT * INTO v_row FROM public.store_fee_policies p
     WHERE p.is_active AND NOT coalesce(p.is_archived, false)
       AND (p.starts_at IS NULL OR p.starts_at <= now()) AND (p.ends_at IS NULL OR p.ends_at > now())
       AND p.store_id IS NULL AND p.topic_id IS NULL AND p.category_id = v_cat
     ORDER BY p.priority ASC, p.starts_at DESC NULLS FIRST, p.created_at DESC LIMIT 1;
    IF FOUND THEN v_scope := 'category'; END IF;
  END IF;

  IF v_scope IS NULL THEN
    SELECT * INTO v_row FROM public.store_fee_policies p
     WHERE p.is_active AND NOT coalesce(p.is_archived, false)
       AND (p.starts_at IS NULL OR p.starts_at <= now()) AND (p.ends_at IS NULL OR p.ends_at > now())
       AND p.store_id IS NULL AND p.topic_id IS NULL AND p.category_id IS NULL
     ORDER BY p.priority ASC, p.starts_at DESC NULLS FIRST, p.created_at DESC LIMIT 1;
    IF FOUND THEN v_scope := 'default'; END IF;
  END IF;

  IF v_scope IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'policy_id', v_row.id,
    'policy_name', v_row.policy_name,
    'fee_percent', LEAST(100, GREATEST(0, coalesce(v_row.fee_percent, 0))),
    'fixed_fee', GREATEST(0, round(coalesce(v_row.fixed_fee, 0))),
    'delivery_fee_mode', coalesce(v_row.delivery_fee_mode, 'none'),
    'delivery_fee_percent', LEAST(100, GREATEST(0, coalesce(v_row.delivery_fee_percent, 0))),
    'scope', v_scope,
    'source', 'store_fee_policies',
    'raw', to_jsonb(v_row)
  );
END;
$$;

-- from 20261201300000_delivery_ads_canonical_finance_ast004_ast005.sql
CREATE OR REPLACE FUNCTION public.store_economic_point_ledger_forbid_mutate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'store_economic_point_ledger is immutable';
END;
$$;

-- from 20270604120200_store_front_commerce_open_weekly_closed_dates.sql
CREATE OR REPLACE FUNCTION public.store_front_commerce_open(p_business_hours_json jsonb, p_is_open boolean, p_now timestamptz)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path = public
AS $fn$
DECLARE
  v_h jsonb := p_business_hours_json;
  v_a jsonb;
  v_b jsonb;
  v_tz text := 'Asia/Manila';
  v_tmp text;
  v_now_m integer;
  v_open_m integer;
  v_close_m integer;
  v_within boolean := true;
  v_bs integer;
  v_be integer;
  v_legacy text;
  v_seg text[];
  v_tail text;
  v_local timestamp;
  v_ymd text;
  v_prev_ymd text;
  v_dow integer;
  v_closed text[];
  v_iv record;
BEGIN
  -- isStoreDbOpenForCommerce: only explicit false closes
  IF p_is_open IS FALSE THEN
    RETURN false;
  END IF;

  -- coerceBusinessHoursRecord
  IF v_h IS NOT NULL AND jsonb_typeof(v_h) = 'string' THEN
    BEGIN
      v_tmp := regexp_replace(v_h #>> '{}', '^[[:space:]]+|[[:space:]]+$', '', 'g');
      v_h := CASE WHEN v_tmp = '' THEN NULL ELSE v_tmp::jsonb END;
    EXCEPTION WHEN others THEN
      v_h := NULL;
    END;
  END IF;
  IF v_h IS NULL OR jsonb_typeof(v_h) <> 'object' THEN
    v_h := '{}'::jsonb;
  END IF;

  -- readStoreFrontTimeZone
  v_a := v_h->'auto_business_hours';
  IF v_a IS NOT NULL AND jsonb_typeof(v_a) = 'object'
     AND jsonb_typeof(v_a->'timezone') = 'string' THEN
    v_tmp := regexp_replace(v_a->>'timezone', '^[[:space:]]+|[[:space:]]+$', '', 'g');
    IF v_tmp <> '' THEN
      v_tz := v_tmp;
    END IF;
  END IF;

  BEGIN
    v_local := coalesce(p_now, now()) AT TIME ZONE v_tz;
    v_now_m := extract(hour FROM v_local)::integer * 60 + extract(minute FROM v_local)::integer;
  EXCEPTION WHEN others THEN
    v_local := NULL;
    v_now_m := NULL;
  END;

  -- readAutoBusinessHoursConfig + evaluateStoreSchedule (OPS-03 weekly / closed_dates)
  IF v_a IS NOT NULL AND jsonb_typeof(v_a) = 'object'
     AND (v_a->'enabled') = 'true'::jsonb
     AND (v_a->'schedule_enforced') = 'true'::jsonb THEN
    v_open_m := CASE WHEN jsonb_typeof(v_a->'open') = 'string'
                     THEN public.store_front_hhmm_to_minutes(v_a->>'open') END;
    v_close_m := CASE WHEN jsonb_typeof(v_a->'close') = 'string'
                      THEN public.store_front_hhmm_to_minutes(v_a->>'close') END;
    IF v_open_m IS NOT NULL AND v_close_m IS NOT NULL AND v_open_m <> v_close_m THEN
      v_within := false;
      IF v_now_m IS NOT NULL THEN
        IF jsonb_typeof(v_a->'closed_dates') = 'array' THEN
          SELECT array_agg(d ORDER BY d) INTO v_closed FROM (
            SELECT DISTINCT d FROM (
              SELECT regexp_replace(e #>> '{}', '^[[:space:]]+|[[:space:]]+$', '', 'g') AS d
              FROM jsonb_array_elements(v_a->'closed_dates') AS x(e)
              WHERE jsonb_typeof(e) = 'string'
            ) s
            WHERE CASE
              WHEN d !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN false
              WHEN substr(d, 1, 4)::integer < 100 OR substr(d, 6, 2)::integer NOT BETWEEN 1 AND 12 THEN false
              ELSE substr(d, 9, 2)::integer BETWEEN 1 AND extract(day FROM (
                     make_date(substr(d, 1, 4)::integer, substr(d, 6, 2)::integer, 1)
                     + interval '1 month' - interval '1 day'))::integer
            END
            ORDER BY d DESC
            LIMIT 120
          ) k;
        END IF;
        v_ymd := to_char(v_local, 'YYYY-MM-DD');
        v_prev_ymd := to_char(v_local - interval '1 day', 'YYYY-MM-DD');
        v_dow := extract(dow FROM v_local)::integer;
        FOR v_iv IN SELECT * FROM public.store_front_day_intervals(v_a, v_closed, v_ymd, v_dow, v_open_m, v_close_m) LOOP
          IF (v_iv.open_m < v_iv.close_m AND v_now_m >= v_iv.open_m AND v_now_m < v_iv.close_m)
             OR (v_iv.open_m > v_iv.close_m AND v_now_m >= v_iv.open_m) THEN
            v_within := true;
            EXIT;
          END IF;
        END LOOP;
        IF NOT v_within THEN
          FOR v_iv IN SELECT * FROM public.store_front_day_intervals(v_a, v_closed, v_prev_ymd, v_dow + 6, v_open_m, v_close_m) LOOP
            IF v_iv.open_m > v_iv.close_m AND v_now_m < v_iv.close_m THEN
              v_within := true;
              EXIT;
            END IF;
          END LOOP;
        END IF;
      END IF;
    END IF;
  END IF;

  IF NOT v_within THEN
    RETURN false;
  END IF;

  -- readBreakHoursFormFields + readNormalizedBreakInterval
  v_b := v_h->'break_hours';
  IF v_b IS NOT NULL AND jsonb_typeof(v_b) = 'object' THEN
    v_bs := CASE
      WHEN jsonb_typeof(v_b->'start') = 'string' THEN public.store_front_hhmm_to_minutes(v_b->>'start')
      WHEN jsonb_typeof(v_b->'open') = 'string' THEN public.store_front_hhmm_to_minutes(v_b->>'open')
    END;
    v_be := CASE
      WHEN jsonb_typeof(v_b->'end') = 'string' THEN public.store_front_hhmm_to_minutes(v_b->>'end')
      WHEN jsonb_typeof(v_b->'close') = 'string' THEN public.store_front_hhmm_to_minutes(v_b->>'close')
    END;
    IF v_bs IS NULL OR v_be IS NULL OR v_bs = v_be THEN
      v_bs := NULL;
      v_be := NULL;
    END IF;
  END IF;

  IF v_bs IS NULL THEN
    -- legacy String(break_time ?? breakTime ?? "").trim(); "none" text has no separator -> no break
    IF v_h ? 'break_time' AND jsonb_typeof(v_h->'break_time') <> 'null' THEN
      v_legacy := v_h->>'break_time';
    ELSIF v_h ? 'breakTime' AND jsonb_typeof(v_h->'breakTime') <> 'null' THEN
      v_legacy := v_h->>'breakTime';
    END IF;
    v_legacy := regexp_replace(coalesce(v_legacy, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
    IF v_legacy <> '' THEN
      v_seg := regexp_split_to_array(v_legacy, '[~' || chr(8211) || chr(12316) || '-]');
      IF coalesce(array_length(v_seg, 1), 0) >= 2 THEN
        v_tail := (regexp_split_to_array(
          regexp_replace(v_seg[2], '^[[:space:]]+|[[:space:]]+$', '', 'g'), '[[:space:]]+'))[1];
        v_bs := public.store_front_hhmm_to_minutes(v_seg[1]);
        v_be := public.store_front_hhmm_to_minutes(v_tail);
        IF v_bs IS NULL OR v_be IS NULL OR v_bs = v_be THEN
          v_bs := NULL;
          v_be := NULL;
        END IF;
      END IF;
    END IF;
  END IF;

  -- isNowWithinBreakWindow (same timezone as schedule)
  IF v_bs IS NOT NULL AND v_be IS NOT NULL AND v_now_m IS NOT NULL THEN
    IF v_bs < v_be THEN
      IF v_now_m >= v_bs AND v_now_m < v_be THEN
        RETURN false;
      END IF;
    ELSIF v_now_m >= v_bs OR v_now_m < v_be THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$fn$;

-- from 20270604120200_store_front_commerce_open_weekly_closed_dates.sql
CREATE OR REPLACE FUNCTION public.store_front_day_intervals(
  p_auto jsonb,
  p_closed text[],
  p_ymd text,
  p_dow integer,
  p_default_open integer,
  p_default_close integer
)
 RETURNS TABLE(open_m integer, close_m integer)
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path = public
AS $fn$
DECLARE
  v_weekly jsonb;
  v_key text;
  v_day jsonb;
  v_item jsonb;
  v_o integer;
  v_c integer;
  v_n integer := 0;
  v_has_weekly boolean := false;
BEGIN
  IF p_closed IS NOT NULL AND p_ymd = ANY (p_closed) THEN
    RETURN;
  END IF;

  v_key := (ARRAY['sun','mon','tue','wed','thu','fri','sat'])[((p_dow % 7) + 7) % 7 + 1];
  v_weekly := p_auto->'weekly';
  IF v_weekly IS NOT NULL AND jsonb_typeof(v_weekly) = 'object' THEN
    v_has_weekly := (v_weekly ?| ARRAY['sun','mon','tue','wed','thu','fri','sat']);
  END IF;

  IF NOT v_has_weekly OR NOT (v_weekly ? v_key) THEN
    open_m := p_default_open;
    close_m := p_default_close;
    RETURN NEXT;
    RETURN;
  END IF;

  v_day := v_weekly->v_key;
  IF v_day IS NULL OR jsonb_typeof(v_day) <> 'array' THEN
    RETURN;
  END IF;

  FOR v_item IN SELECT e FROM jsonb_array_elements(v_day) WITH ORDINALITY AS t(e, i) ORDER BY i LOOP
    EXIT WHEN v_n >= 3;
    CONTINUE WHEN jsonb_typeof(v_item) <> 'object';
    v_o := CASE WHEN jsonb_typeof(v_item->'open') = 'string'
                THEN public.store_front_hhmm_to_minutes(v_item->>'open') END;
    v_c := CASE WHEN jsonb_typeof(v_item->'close') = 'string'
                THEN public.store_front_hhmm_to_minutes(v_item->>'close') END;
    CONTINUE WHEN v_o IS NULL OR v_c IS NULL OR v_o = v_c;
    open_m := v_o;
    close_m := v_c;
    v_n := v_n + 1;
    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$fn$;

-- from 20270604110000_store_front_commerce_open_sql_twin.sql
CREATE OR REPLACE FUNCTION public.store_front_hhmm_to_minutes(p_raw text)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path = public
AS $fn$
DECLARE
  v_t text;
  v_m text[];
BEGIN
  IF p_raw IS NULL THEN
    RETURN NULL;
  END IF;
  v_t := regexp_replace(p_raw, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_m := regexp_match(v_t, '^([01]?[0-9]|2[0-3]):([0-5][0-9])$');
  IF v_m IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN v_m[1]::integer * 60 + v_m[2]::integer;
END;
$fn$;

-- from 20270603130000_stage2_2c_cancel_refund_money_atomic.sql
CREATE OR REPLACE FUNCTION public.store_order_apply_cancel_side_effects(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
  v_coupon jsonb;
  v_gift jsonb;
  v_restored_expired boolean;
  v_delivery_closed integer := 0;
BEGIN
  SELECT order_status INTO v_status
    FROM public.store_orders
   WHERE id = p_order_id
   FOR UPDATE;
  IF v_status IS DISTINCT FROM 'cancelled' THEN
    RAISE EXCEPTION 'store_order_cancel_side_effects_not_cancelled:%', coalesce(v_status, 'missing');
  END IF;

  -- Coupon (ADS-21): cancel restore, never after-completed policy.
  v_coupon := public.restore_store_coupon_entitlement(p_order_id, false);
  IF coalesce(v_coupon->>'ok', 'false') <> 'true' THEN
    RAISE EXCEPTION 'coupon_restore_failed: %', coalesce(v_coupon->>'error', 'unknown');
  END IF;

  -- GFT-05: keep restoring an expired certificate (D-20 default), but flag it for admin review.
  SELECT EXISTS (
    SELECT 1
      FROM public.gift_certificate_redemptions r
      JOIN public.gift_certificate_instances i ON i.id = r.instance_id
     WHERE r.order_id = p_order_id
       AND r.reversed = false
       AND public.gift_certificate_instance_is_expired(i.valid_until)
  ) INTO v_restored_expired;

  v_gift := public.gift_certificate_cancel_order_restore(p_order_id);
  IF coalesce(v_gift->>'ok', 'false') <> 'true' THEN
    RAISE EXCEPTION 'gift_cancel_restore_failed: %', coalesce(v_gift->>'error', 'unknown');
  END IF;

  -- DLV-02 (3): the order closed -> an open delivery row leaves the dispatch queue.
  UPDATE public.store_order_deliveries
     SET delivery_status = 'delivery_failed',
         failure_note = 'order_cancelled',
         failed_at = now()
   WHERE order_id = p_order_id
     AND delivery_status IN ('waiting_rider', 'rider_assigned', 'pickup_in_progress', 'delivering');
  GET DIAGNOSTICS v_delivery_closed = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'coupon_restore', v_coupon,
    'gift_restore', v_gift,
    'restored_expired', coalesce(v_restored_expired, false),
    'delivery_closed', v_delivery_closed > 0
  );
END;
$function$;

-- from 20270512120000_store_order_buyer_cancel_request_atomic.sql
CREATE OR REPLACE FUNCTION public.store_order_buyer_cancel_request_atomic(
  p_order_id uuid,
  p_buyer_user_id uuid,
  p_expected_status text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.store_orders%ROWTYPE;
  v_delivery_status text;
  v_request_id uuid;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_order_id IS NULL OR p_buyer_user_id IS NULL OR coalesce(btrim(p_reason), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  -- Lock order: delivery row first, then order row — the same order the pickup guard below takes
  -- (pickup UPDATE locks the delivery row, then its trigger locks the order row), so no deadlock.
  SELECT delivery_status INTO v_delivery_status
    FROM public.store_order_deliveries
   WHERE order_id = p_order_id
   FOR SHARE;

  SELECT * INTO v_order
    FROM public.store_orders
   WHERE id = p_order_id AND buyer_user_id = p_buyer_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  IF coalesce(v_order.admin_locked, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_admin_locked');
  END IF;
  IF v_order.order_status IS DISTINCT FROM p_expected_status THEN
    RETURN jsonb_build_object('ok', false, 'error', 'transition_conflict', 'order_status', v_order.order_status);
  END IF;
  IF v_order.order_status NOT IN ('accepted', 'preparing', 'ready_for_pickup', 'delivering', 'arrived') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_transition', 'order_status', v_order.order_status);
  END IF;
  IF v_delivery_status IN ('pickup_in_progress', 'delivering', 'delivered', 'delivery_failed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'picked_up', 'delivery_status', v_delivery_status);
  END IF;

  BEGIN
    INSERT INTO public.store_order_cancel_requests (
      order_id, previous_order_status, requested_by, requested_role, reason, status, refund_status
    ) VALUES (
      p_order_id, v_order.order_status, p_buyer_user_id, 'buyer', btrim(p_reason), 'pending', 'pending'
    )
    RETURNING id INTO v_request_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cancel_request_pending');
  END;

  UPDATE public.store_orders
     SET order_status = 'cancel_requested',
         auto_complete_at = NULL,
         updated_at = now()
   WHERE id = p_order_id
     AND order_status = p_expected_status;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'store_order_buyer_cancel_request_race';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'request_id', v_request_id,
    'previous_order_status', v_order.order_status
  );
END;
$$;

-- from 20270603130000_stage2_2c_cancel_refund_money_atomic.sql
CREATE OR REPLACE FUNCTION public.store_order_cancel_direct_atomic(
  p_order_id uuid,
  p_expected_status text,
  p_payment_status text,
  p_actor text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.store_orders%ROWTYPE;
  v_side jsonb;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_order_id IS NULL
     OR p_payment_status NOT IN ('cancelled', 'failed')
     OR p_actor NOT IN ('CUSTOMER', 'OWNER', 'ADMIN', 'SYSTEM')
     OR p_expected_status NOT IN ('pending', 'accepted', 'preparing', 'ready_for_pickup', 'delivering', 'arrived', 'cancel_requested') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  -- Lock order: delivery row first, then order row (same order as the pickup guard trigger).
  PERFORM 1
     FROM public.store_order_deliveries
    WHERE order_id = p_order_id
    FOR NO KEY UPDATE;

  SELECT * INTO v_order
    FROM public.store_orders
   WHERE id = p_order_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;
  IF v_order.order_status IS DISTINCT FROM p_expected_status THEN
    RETURN jsonb_build_object('ok', false, 'error', 'transition_conflict', 'order_status', v_order.order_status);
  END IF;

  UPDATE public.store_orders
     SET order_status = 'cancelled',
         payment_status = p_payment_status,
         auto_complete_at = NULL,
         needs_admin_attention = false,
         updated_at = now()
   WHERE id = p_order_id
     AND order_status = p_expected_status;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'store_order_cancel_direct_race';
  END IF;

  v_side := public.store_order_apply_cancel_side_effects(p_order_id);

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'previous_order_status', v_order.order_status,
    'side_effects', v_side
  );
END;
$function$;

-- from 20270603130000_stage2_2c_cancel_refund_money_atomic.sql
CREATE OR REPLACE FUNCTION public.store_order_cancel_request_decide_atomic(p_order_id uuid, p_store_id uuid, p_actor_user_id uuid, p_actor_role text, p_expected_status text, p_decision text, p_restore_status text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_auto_complete_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.store_orders%ROWTYPE;
  v_owner uuid;
  v_req public.store_order_cancel_requests%ROWTYPE;
  v_to text;
  v_side jsonb;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_order_id IS NULL OR p_store_id IS NULL OR p_actor_user_id IS NULL
     OR p_actor_role NOT IN ('owner', 'admin')
     OR p_decision NOT IN ('approve', 'reject') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;
  IF p_decision = 'reject' AND coalesce(btrim(p_reason), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;

  -- Lock order: delivery row first, then order row (approve closes the delivery row in this TX).
  PERFORM 1
     FROM public.store_order_deliveries
    WHERE order_id = p_order_id
    FOR NO KEY UPDATE;

  SELECT * INTO v_order
    FROM public.store_orders
   WHERE id = p_order_id AND store_id = p_store_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  IF p_actor_role = 'owner' THEN
    SELECT owner_user_id INTO v_owner FROM public.stores WHERE id = p_store_id;
    IF v_owner IS DISTINCT FROM p_actor_user_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
    END IF;
    IF coalesce(v_order.admin_locked, false) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'order_admin_locked');
    END IF;
  END IF;

  IF v_order.order_status IS DISTINCT FROM p_expected_status THEN
    RETURN jsonb_build_object('ok', false, 'error', 'transition_conflict', 'order_status', v_order.order_status);
  END IF;
  IF v_order.order_status IS DISTINCT FROM 'cancel_requested' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_transition', 'order_status', v_order.order_status);
  END IF;

  SELECT * INTO v_req
    FROM public.store_order_cancel_requests
   WHERE order_id = p_order_id AND status = 'pending'
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cancel_request_not_found');
  END IF;

  IF p_decision = 'approve' THEN
    v_to := 'cancelled';
    UPDATE public.store_orders
       SET order_status = 'cancelled',
           payment_status = 'cancelled',
           auto_complete_at = NULL,
           needs_admin_attention = false,
           updated_at = now()
     WHERE id = p_order_id
       AND order_status = 'cancel_requested';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'store_order_cancel_decide_race';
    END IF;
    UPDATE public.store_order_cancel_requests
       SET status = 'approved',
           approved_by = p_actor_user_id,
           approved_at = now(),
           refund_status = 'pending'
     WHERE id = v_req.id
       AND status = 'pending';
  ELSE
    v_to := v_req.previous_order_status;
    IF v_to IS NULL
       OR v_to NOT IN ('accepted', 'preparing', 'ready_for_pickup', 'delivering', 'arrived')
       OR v_to IS DISTINCT FROM p_restore_status THEN
      RETURN jsonb_build_object(
        'ok', false, 'error', 'restore_status_mismatch',
        'previous_order_status', v_req.previous_order_status
      );
    END IF;
    UPDATE public.store_orders
       SET order_status = v_to,
           auto_complete_at = p_auto_complete_at,
           needs_admin_attention = false,
           updated_at = now()
     WHERE id = p_order_id
       AND order_status = 'cancel_requested';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'store_order_cancel_decide_race';
    END IF;
    UPDATE public.store_order_cancel_requests
       SET status = 'rejected',
           rejected_at = now(),
           rejected_reason = left(btrim(p_reason), 500),
           refund_status = 'not_applicable'
     WHERE id = v_req.id
       AND status = 'pending';
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'store_order_cancel_ledger_race';
  END IF;

  -- FIN-05 / ADS-21 / GFT-05: approve -> coupon + gift restore + delivery close in this TX.
  IF p_decision = 'approve' THEN
    v_side := public.store_order_apply_cancel_side_effects(p_order_id);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'request_id', v_req.id,
    'previous_order_status', v_req.previous_order_status,
    'order_status', v_to,
    'side_effects', v_side
  );
END;
$function$;

-- from 20270512120000_store_order_buyer_cancel_request_atomic.sql
CREATE OR REPLACE FUNCTION public.store_order_deliveries_pickup_requires_dispatch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF NEW.delivery_status IN ('pickup_in_progress', 'delivering')
     AND OLD.delivery_status NOT IN ('pickup_in_progress', 'delivering', 'delivered', 'delivery_failed') THEN
    SELECT order_status INTO v_status
      FROM public.store_orders
     WHERE id = NEW.order_id
     FOR SHARE;
    IF v_status IS NULL OR v_status NOT IN ('ready_for_pickup', 'delivering', 'arrived') THEN
      RAISE EXCEPTION 'order_status_blocks_dispatch:%', coalesce(v_status, 'missing') USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- from 20270603130000_stage2_2c_cancel_refund_money_atomic.sql
CREATE OR REPLACE FUNCTION public.store_order_owner_cancel_atomic(p_order_id uuid, p_store_id uuid, p_owner_user_id uuid, p_expected_status text, p_reason text, p_detail text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.store_orders%ROWTYPE;
  v_delivery_status text;
  v_owner uuid;
  v_request_id uuid;
  v_side jsonb;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_order_id IS NULL OR p_store_id IS NULL OR p_owner_user_id IS NULL
     OR coalesce(btrim(p_reason), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  -- Lock order: delivery row first, then order row (same order as the pickup guard trigger).
  -- NO KEY UPDATE (not SHARE): the cancel side effects close this row in the same TX.
  SELECT delivery_status INTO v_delivery_status
    FROM public.store_order_deliveries
   WHERE order_id = p_order_id
   FOR NO KEY UPDATE;

  SELECT * INTO v_order
    FROM public.store_orders
   WHERE id = p_order_id AND store_id = p_store_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  SELECT owner_user_id INTO v_owner FROM public.stores WHERE id = p_store_id;
  IF v_owner IS DISTINCT FROM p_owner_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF coalesce(v_order.admin_locked, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_admin_locked');
  END IF;
  IF v_order.order_status IS DISTINCT FROM p_expected_status THEN
    RETURN jsonb_build_object('ok', false, 'error', 'transition_conflict', 'order_status', v_order.order_status);
  END IF;
  IF v_order.order_status NOT IN ('pending', 'accepted', 'preparing', 'ready_for_pickup', 'delivering', 'arrived') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_transition', 'order_status', v_order.order_status);
  END IF;
  IF v_delivery_status IN ('pickup_in_progress', 'delivering', 'delivered', 'delivery_failed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'picked_up', 'delivery_status', v_delivery_status);
  END IF;

  UPDATE public.store_orders
     SET order_status = 'cancelled',
         payment_status = 'cancelled',
         auto_complete_at = NULL,
         needs_admin_attention = false,
         updated_at = now()
   WHERE id = p_order_id
     AND order_status = p_expected_status;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'store_order_owner_cancel_race';
  END IF;

  INSERT INTO public.store_order_cancel_requests (
    order_id, previous_order_status, requested_by, requested_role, reason, detail_reason,
    status, approved_by, approved_at, refund_status
  ) VALUES (
    p_order_id, v_order.order_status, p_owner_user_id, 'owner', left(btrim(p_reason), 500),
    nullif(left(btrim(coalesce(p_detail, '')), 500), ''),
    'approved', p_owner_user_id, now(), 'not_applicable'
  )
  RETURNING id INTO v_request_id;

  -- FIN-05 / ADS-21 / GFT-05: coupon + gift restore + delivery close in this TX.
  v_side := public.store_order_apply_cancel_side_effects(p_order_id);

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'request_id', v_request_id,
    'previous_order_status', v_order.order_status,
    'side_effects', v_side
  );
END;
$function$;

-- from 20270602100100_store_commission_trigger_reenable_no_backcharge.sql
CREATE OR REPLACE FUNCTION public.store_orders_commission_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_res jsonb;
  v_flagged uuid;
  c_charge_from constant timestamptz := '2026-10-20 20:30:00+00';
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.order_status IS NOT DISTINCT FROM OLD.order_status THEN
    RETURN NULL;
  END IF;

  IF NEW.order_status IN ('preparing', 'ready_for_pickup', 'delivering', 'arrived', 'completed') THEN
    IF NEW.created_at < c_charge_from THEN
      RETURN NULL;
    END IF;
    v_res := public.store_commission_charge_order_internal(NEW.id, NEW.order_status);
    IF coalesce(v_res->>'ok', 'false') IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'store_commission_charge_failed:%', coalesce(v_res->>'error', 'unknown')
        USING ERRCODE = 'P0001';
    END IF;
  ELSIF NEW.order_status IN ('cancelled', 'refunded') THEN
    UPDATE public.store_sale_fee_obligations
       SET adjustment_status = 'review_required',
           adjustment_trigger = NEW.order_status,
           review_flagged_at = now()
     WHERE order_id = NEW.id
       AND adjustment_status = 'none'
       AND status <> 'waived'
       AND fee_due_minor > 0
    RETURNING id INTO v_flagged;
    IF v_flagged IS NOT NULL THEN
      PERFORM public.store_commission_notify_review(v_flagged);
    END IF;
  END IF;
  RETURN NULL;
END;
$fn$;

-- from 20270510120000_store_commission_cash_ssot.sql
CREATE OR REPLACE FUNCTION public.store_orders_enforce_cash_order_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pos jsonb;
BEGIN
  IF public.store_cash_order_gate_mode() = 'off' THEN
    RETURN NEW;
  END IF;
  v_pos := public.store_cash_position(NEW.store_id);
  IF coalesce((v_pos->>'orderable')::boolean, true) IS NOT TRUE THEN
    RAISE EXCEPTION 'store_cash_insufficient'
      USING ERRCODE = 'P0001', DETAIL = 'net_minor=' || coalesce(v_pos->>'net_minor', '0');
  END IF;
  RETURN NEW;
END;
$$;

-- from 20270421120000_finance_ssot19_d1_member_write_lock.sql
CREATE OR REPLACE FUNCTION public.store_settlements_block_paid_when_coin_recognized()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.settlement_status = 'paid'
     AND (TG_OP = 'INSERT' OR OLD.settlement_status IS DISTINCT FROM 'paid')
     AND NEW.order_id IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM public.store_economic_point_ledger l
        WHERE l.idempotency_key = 'sale_coin:' || NEW.order_id::text
     ) THEN
    RAISE EXCEPTION 'settlement_paid_blocked_coin_recognized order=%', NEW.order_id
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

-- from 20270604100000_stores_guard_delivery_requires_geo.sql
CREATE OR REPLACE FUNCTION public.stores_guard_delivery_requires_geo()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.delivery_available IS TRUE AND (NEW.lat IS NULL OR NEW.lng IS NULL) THEN
    IF TG_OP = 'INSERT'
       OR NEW.delivery_available IS DISTINCT FROM OLD.delivery_available
       OR NEW.lat IS DISTINCT FROM OLD.lat
       OR NEW.lng IS DISTINCT FROM OLD.lng THEN
      RAISE EXCEPTION 'store_delivery_requires_canonical_geo'
        USING ERRCODE = 'P0001', HINT = 'delivery_store_coords_required';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- from 20270604120000_stores_first_listed_at_approved_only.sql
CREATE OR REPLACE FUNCTION public.stores_protect_first_listed_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.first_listed_at IS NOT NULL THEN
    NEW.first_listed_at := OLD.first_listed_at;
    RETURN NEW;
  END IF;

  IF NEW.is_visible IS TRUE
     AND COALESCE(OLD.is_visible, false) IS DISTINCT FROM TRUE
     AND NEW.approval_status = 'approved'
     AND NEW.first_listed_at IS NULL THEN
    NEW.first_listed_at := now();
  END IF;

  RETURN NEW;
END;
$function$;

-- from 20261128140000_gift_certificate_order_completion_revenue.sql
CREATE OR REPLACE FUNCTION public.trg_store_orders_gift_revenue_on_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NEW.order_status = 'completed'
     AND (TG_OP = 'INSERT' OR OLD.order_status IS DISTINCT FROM 'completed') THEN
    v_result := public.gift_certificate_recognize_revenue_for_completed_order(NEW.id);
    IF coalesce(v_result->>'ok', 'false') <> 'true' THEN
      RAISE EXCEPTION 'gift_revenue_recognition_failed: %', coalesce(v_result->>'error', 'unknown');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

RESET check_function_bodies;
