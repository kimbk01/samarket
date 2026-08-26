-- FREE COUPON FINAL — entitlement checkout canonical (LIVE/AUG authority)
-- Gate 4 PROVEN: Production LIVE body ≈ 20260825121000.
-- FORBIDDEN: apply 20261024170000 alone (entitlement regression).
-- Changes vs LIVE:
--   1) discount > 0 => user_coupon_id REQUIRED (campaign-only branch DELETED)
--   2) partial UNIQUE(user_coupon_id) WHERE NOT NULL (legacy unresolved rows preserved)
--   3) v3.2 schema catch-up IF NOT EXISTS (coupon_number / issuer_role / campaign_purpose)
--   4) claim_store_coupon + generate_coupon_serial catch-up (live claim lacked coupon_number)
-- NO global user_coupon_id NOT NULL (GATE 2: 2 unresolved legacy rows).

BEGIN;

-- v3.2 schema catch-up (idempotent)
ALTER TABLE public.store_coupon_campaigns
  ADD COLUMN IF NOT EXISTS issuer_role text NULL,
  ADD COLUMN IF NOT EXISTS campaign_purpose text NULL;

ALTER TABLE public.store_coupon_campaigns
  DROP CONSTRAINT IF EXISTS store_coupon_campaigns_issuer_role_chk;
ALTER TABLE public.store_coupon_campaigns
  ADD CONSTRAINT store_coupon_campaigns_issuer_role_chk
  CHECK (issuer_role IS NULL OR issuer_role IN ('owner', 'admin', 'system'));

ALTER TABLE public.store_coupon_campaigns
  DROP CONSTRAINT IF EXISTS store_coupon_campaigns_purpose_chk;
ALTER TABLE public.store_coupon_campaigns
  ADD CONSTRAINT store_coupon_campaigns_purpose_chk
  CHECK (
    campaign_purpose IS NULL OR campaign_purpose IN (
      'new_customer_acquisition',
      'repeat_purchase',
      'new_menu_promotion',
      'store_promotion',
      'platform_event'
    )
  );

ALTER TABLE public.coupon_user_entitlements
  ADD COLUMN IF NOT EXISTS coupon_number text NULL;

CREATE UNIQUE INDEX IF NOT EXISTS coupon_user_entitlements_coupon_number_uidx
  ON public.coupon_user_entitlements (coupon_number)
  WHERE coupon_number IS NOT NULL;

-- Forward redemptions may share restore cycles; at most one active row per entitlement.
CREATE UNIQUE INDEX IF NOT EXISTS store_coupon_redemptions_user_coupon_uidx
  ON public.store_coupon_redemptions (user_coupon_id)
  WHERE user_coupon_id IS NOT NULL;


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
      commission_base_amount
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
      v_commission_base
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

COMMENT ON FUNCTION public.create_store_order_atomic(uuid, uuid, text, jsonb, jsonb) IS
  'FREE COUPON canonical: atomic order + entitlement redeem (LIVE/AUG). Campaign-only checkout deleted.';

REVOKE ALL ON FUNCTION public.create_store_order_atomic(uuid, uuid, text, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_store_order_atomic(uuid, uuid, text, jsonb, jsonb) TO service_role;

-- v3.2 claim catch-up: live claim_store_coupon lacked coupon_number / generate_coupon_serial
CREATE OR REPLACE FUNCTION public.generate_coupon_serial()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_chars constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_date text;
  v_part text := '';
  v_seq int;
  i int;
BEGIN
  v_date := to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYMMDD');
  v_seq := floor(random() * 100)::int;
  FOR i IN 1..5 LOOP
    v_part := v_part || substr(v_chars, (floor(random() * length(v_chars))::int + 1), 1);
  END LOOP;
  RETURN 'CP-' || v_date || '-' || v_part || '-' || lpad(v_seq::text, 2, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_store_coupon(
  p_buyer_user_id uuid,
  p_campaign_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign record;
  v_reserve numeric;
  v_id uuid;
  v_expires timestamptz;
  v_ttl timestamptz;
  v_lifetime_count int;
  v_coupon_number text;
  v_attempt int;
  v_insert_ok boolean;
BEGIN
  IF p_buyer_user_id IS NULL OR p_campaign_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_ids', 'http_status', 400);
  END IF;

  SELECT *
    INTO v_campaign
    FROM public.store_coupon_campaigns
   WHERE id = p_campaign_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'coupon_not_found', 'http_status', 404);
  END IF;

  IF v_campaign.lifecycle_state = 'revoked' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'coupon_revoked', 'http_status', 400);
  END IF;

  IF v_campaign.lifecycle_state NOT IN ('active', 'scheduled')
     OR v_campaign.is_active IS NOT TRUE
     OR v_campaign.start_at > clock_timestamp()
     OR v_campaign.end_at <= clock_timestamp() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'coupon_inactive', 'http_status', 400);
  END IF;

  IF v_campaign.first_order_scope = 'STORE' THEN
    IF EXISTS (
      SELECT 1 FROM public.store_orders o
       WHERE o.store_id = v_campaign.store_id
         AND o.buyer_user_id = p_buyer_user_id
         AND o.order_status = 'completed'
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'first_order_ineligible', 'http_status', 403);
    END IF;
  ELSIF v_campaign.first_order_scope = 'PLATFORM' THEN
    IF EXISTS (
      SELECT 1 FROM public.store_orders o
       WHERE o.buyer_user_id = p_buyer_user_id
         AND o.order_status = 'completed'
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'first_order_ineligible', 'http_status', 403);
    END IF;
  END IF;

  SELECT count(*)::int INTO v_lifetime_count
    FROM public.coupon_user_entitlements e
   WHERE e.buyer_user_id = p_buyer_user_id
     AND e.campaign_id = p_campaign_id;

  IF v_lifetime_count >= coalesce(v_campaign.max_uses_per_user, 1) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_claimed', 'http_status', 409);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.coupon_user_entitlements e
     WHERE e.buyer_user_id = p_buyer_user_id
       AND e.campaign_id = p_campaign_id
       AND e.status IN ('available', 'restored')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_claimed', 'http_status', 409);
  END IF;

  IF v_campaign.issue_limit IS NOT NULL AND v_campaign.issued_count >= v_campaign.issue_limit THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ISSUE_LIMIT_REACHED', 'http_status', 409);
  END IF;

  IF v_campaign.discount_type = 'percent' THEN
    IF v_campaign.spend_budget_php IS NOT NULL AND v_campaign.max_discount IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'max_discount_required', 'http_status', 400);
    END IF;
    v_reserve := coalesce(v_campaign.max_discount, 0);
    IF v_reserve <= 0 THEN
      v_reserve := 0;
    END IF;
  ELSE
    v_reserve := v_campaign.discount_value;
  END IF;

  IF v_campaign.spend_budget_php IS NOT NULL
     AND (v_campaign.reserved_spend_php + v_reserve) > v_campaign.spend_budget_php THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ISSUE_LIMIT_REACHED', 'http_status', 409);
  END IF;

  v_expires := coalesce(v_campaign.usage_end_at, v_campaign.end_at);
  IF v_campaign.claim_valid_days IS NOT NULL AND v_campaign.claim_valid_days > 0 THEN
    v_ttl := clock_timestamp() + make_interval(days => v_campaign.claim_valid_days);
    IF v_ttl < v_expires THEN
      v_expires := v_ttl;
    END IF;
  END IF;

  v_insert_ok := false;
  FOR v_attempt IN 1..12 LOOP
    v_coupon_number := public.generate_coupon_serial();
    BEGIN
      INSERT INTO public.coupon_user_entitlements (
        campaign_id, store_id, buyer_user_id, status, reserved_php, expires_at, coupon_number
      ) VALUES (
        v_campaign.id,
        v_campaign.store_id,
        p_buyer_user_id,
        'available',
        v_reserve,
        v_expires,
        v_coupon_number
      )
      RETURNING id INTO v_id;
      v_insert_ok := true;
      EXIT;
    EXCEPTION
      WHEN unique_violation THEN
        IF v_attempt >= 12 THEN
          RAISE;
        END IF;
    END;
  END LOOP;

  IF NOT v_insert_ok OR v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'serial_collision', 'http_status', 500);
  END IF;

  UPDATE public.store_coupon_campaigns
     SET issued_count = issued_count + 1,
         reserved_spend_php = reserved_spend_php + v_reserve,
         updated_at = now()
   WHERE id = v_campaign.id;

  INSERT INTO public.coupon_audit_events (campaign_id, entitlement_id, actor_user_id, action, payload)
  VALUES (
    v_campaign.id, v_id, p_buyer_user_id, 'claim',
    jsonb_build_object(
      'reserved_php', v_reserve,
      'expires_at', v_expires,
      'coupon_number', v_coupon_number
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'entitlement', jsonb_build_object(
      'id', v_id,
      'campaign_id', v_campaign.id,
      'reserved_php', v_reserve,
      'expires_at', v_expires,
      'coupon_number', v_coupon_number
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_coupon_serial() TO authenticated, service_role;

COMMIT;
