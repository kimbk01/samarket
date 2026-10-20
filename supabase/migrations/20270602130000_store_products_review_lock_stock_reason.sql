-- 1-J 상품 — 검수·가격·노출·재고 (G-1 §4-J: PRD-03 · PRD-04 · PRD-05 · PRD-06 + Owner ND-1)
--
-- R-HL: create_store_order_atomic / restore_store_order_stock_atomic / get_store_menus_snapshot 를
--       이 마이그레이션 1회로 재정의한다 (HARD LOCK reopen — docs/dibay-delivery-product-hard-lock.md §Reopen 기록).
-- R-DB-1 기준 원문 (운영 ckdosyydvgzqwpbwuhon, 2026-10-20 읽기 전용 확인):
--   * create_store_order_atomic(uuid,uuid,text,jsonb,jsonb)  md5(prosrc)=4beb940ecb9c6ba343c9d9a8d358e57e
--       = 저장소 20270421120300_finance_ssot19_d2_gift.sql 정의와 동일 → 그 원문에 최소 diff 적용
--   * restore_store_order_stock_atomic(uuid)                 md5(prosrc)=3854bff5de3556bbcdc24847186639eb
--       = 저장소 20270101140000 정의와 동일
--   * get_store_menus_snapshot(text,uuid,text)               md5(prosrc)=42630144145c889d47b07395fe4aa7f7
--       = 저장소 20260525210000 과 다름(운영 드리프트: is_hidden·has_options·menu_sold_out_bottom·can_sell 포함)
--         → pg_get_functiondef 운영 원문을 기준으로 함
--
-- 변경
--   PRD-04  store_products_discount_lt_price CHECK (discount_price IS NULL OR price = 0 OR discount_price < price)
--           NOT VALID 로 추가 후, 위반 0건일 때만 VALIDATE (운영 위반 0 확인 · 기존 행 재작성 없음 — D-5)
--   PRD-06  store_products.sold_out_reason text NULL CHECK IN ('stock','manual','admin')
--           주문 RPC Pass2 재고 0 → 'stock' 기록, 복원 함수는 'stock' 일 때만 active 복귀 (+ reason NULL).
--           기존 sold_out 행은 NULL → 복원 시 자동 해제 안 함(보수적). 값 채우기 없음(D-5).
--   ND-1    store_products.admin_status_lock text NULL CHECK IN ('hidden','sold_out','blocked')
--           관리자 숨김·품절·차단 시 설정, 관리자 「판매 재개(activate)」로만 해제. 오너 PATCH 는 잠금 중 상태 변경 403.
--           (주문 경로는 상태값으로만 판단 — 잠금 상품은 active 가 아니므로 이미 주문 불가.)
--   PRD-03  주문 RPC Pass1 · 메뉴 스냅샷: admin_review_status IN ('rejected','pending') 상품 판매/노출 불가.
--   PRD-05  주문 RPC Pass1: 숨김 메뉴 구역(store_menu_sections.is_hidden) 상품 → product_not_available.
--           (메뉴 스냅샷은 구역 is_hidden 을 그대로 내리고 TS 조립이 걸러낸다 — 기존 계약 유지)
--   함수 본문은 ASCII 만 (운영 적용 도구 제약). 원문 295행 em dash 1개 → '-' 로 치환(주석).
--
-- 롤백 (역순, 운영 승인 후에만)
--   1) 세 함수: 위 기준 원문 재적용 (create = 20270421120300 정의, restore = 20270101140000 정의,
--      menus = 이 파일 머리의 운영 원문 — 본 파일의 get_store_menus_snapshot 에서
--      `AND coalesce(p.admin_review_status, 'none') NOT IN ('rejected', 'pending')` 한 줄 제거).
--      ※ create 를 먼저 롤백한 뒤 컬럼을 지워야 한다 (create 가 sold_out_reason 을 참조).
--   2) ALTER TABLE public.store_products DROP CONSTRAINT IF EXISTS store_products_discount_lt_price;
--   3) ALTER TABLE public.store_products DROP COLUMN IF EXISTS admin_status_lock, DROP COLUMN IF EXISTS sold_out_reason;
--      (웹 코드는 두 컬럼이 없으면 레거시 select 로 자동 폴백 — lib/stores/store-product-admin-lock.ts)
--
-- 격리 DB 검증: supabase/tests/isolated/store-products-1j/*.sql (러너 메모는 파일 머리)


ALTER TABLE public.store_products
  ADD COLUMN IF NOT EXISTS sold_out_reason text NULL,
  ADD COLUMN IF NOT EXISTS admin_status_lock text NULL;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.store_products'::regclass
       AND conname = 'store_products_sold_out_reason_check'
  ) THEN
    ALTER TABLE public.store_products
      ADD CONSTRAINT store_products_sold_out_reason_check
      CHECK (sold_out_reason IS NULL OR sold_out_reason IN ('stock', 'manual', 'admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.store_products'::regclass
       AND conname = 'store_products_admin_status_lock_check'
  ) THEN
    ALTER TABLE public.store_products
      ADD CONSTRAINT store_products_admin_status_lock_check
      CHECK (admin_status_lock IS NULL OR admin_status_lock IN ('hidden', 'sold_out', 'blocked'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.store_products'::regclass
       AND conname = 'store_products_discount_lt_price'
  ) THEN
    ALTER TABLE public.store_products
      ADD CONSTRAINT store_products_discount_lt_price
      CHECK (discount_price IS NULL OR price = 0 OR discount_price < price) NOT VALID;
  END IF;

  -- D-5: never rewrite old rows. Validate only when no historical row violates (prod: 0).
  IF NOT EXISTS (
    SELECT 1 FROM public.store_products
     WHERE discount_price IS NOT NULL AND price <> 0 AND discount_price >= price
  ) THEN
    ALTER TABLE public.store_products VALIDATE CONSTRAINT store_products_discount_lt_price;
  ELSE
    RAISE NOTICE 'store_products_discount_lt_price left NOT VALID (historical rows violate)';
  END IF;
END
$do$;

COMMENT ON COLUMN public.store_products.sold_out_reason IS
  'PRD-06: stock = inventory reached 0 (auto, restorable on cancel) | manual = owner | admin = platform admin. NULL = legacy/unknown (never auto-restored).';
COMMENT ON COLUMN public.store_products.admin_status_lock IS
  'ND-1: admin hide/sold_out/block lock. Owner cannot change product_status while set; cleared only by admin activate.';

-- PRD-03 / PRD-05 (Pass 1 gates) + PRD-06 (Pass 2 sold_out_reason = 'stock'). Base = LIVE prod body.
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
    point_commerce_blocked,
    store_name,
    business_hours_json
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

REVOKE ALL ON FUNCTION public.create_store_order_atomic(uuid, uuid, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_store_order_atomic(uuid, uuid, text, jsonb, jsonb) TO service_role;

-- PRD-06: only stock-driven sold_out returns to active on cancel restore.
CREATE OR REPLACE FUNCTION public.restore_store_order_stock_atomic(
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_claimed boolean := false;
  v_line record;
  v_restored integer := 0;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_order_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  INSERT INTO public.store_order_stock_restore_claims (order_id)
  VALUES (p_order_id)
  ON CONFLICT (order_id) DO NOTHING
  RETURNING true INTO v_claimed;

  IF v_claimed IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'restored_products', 0);
  END IF;

  FOR v_line IN
    SELECT product_id, sum(qty)::integer AS qty
      FROM public.store_order_items
     WHERE order_id = p_order_id
       AND product_id IS NOT NULL
     GROUP BY product_id
  LOOP
    IF v_line.qty IS NULL OR v_line.qty < 1 THEN
      CONTINUE;
    END IF;

    -- Quantity restore is unchanged. Status returns to active ONLY when the product was
    -- sold out by inventory (sold_out_reason = 'stock'), is not admin-locked and is not
    -- under rejected / pending admin review. manual / admin / NULL (legacy) keep sold_out.
    UPDATE public.store_products p
       SET stock_qty = p.stock_qty + v_line.qty,
           product_status = CASE
             WHEN p.product_status = 'sold_out'
                  AND p.sold_out_reason = 'stock'
                  AND p.admin_status_lock IS NULL
                  AND coalesce(p.admin_review_status, 'none') NOT IN ('rejected', 'pending')
                  AND (p.stock_qty + v_line.qty) > 0 THEN 'active'
             ELSE p.product_status
           END,
           sold_out_reason = CASE
             WHEN p.product_status = 'sold_out'
                  AND p.sold_out_reason = 'stock'
                  AND p.admin_status_lock IS NULL
                  AND coalesce(p.admin_review_status, 'none') NOT IN ('rejected', 'pending')
                  AND (p.stock_qty + v_line.qty) > 0 THEN NULL
             ELSE p.sold_out_reason
           END,
           updated_at = now()
     WHERE p.id = v_line.product_id
       AND coalesce(p.track_inventory, false) = true;

    IF FOUND THEN
      v_restored := v_restored + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'restored_products', v_restored,
    'order_id', p_order_id
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.restore_store_order_stock_atomic(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_store_order_stock_atomic(uuid) TO service_role;

-- PRD-03: rejected / re-review pending products are excluded from the buyer menu snapshot.
-- Base = LIVE prod definition (pg_get_functiondef 2026-10-20); only the product_rows WHERE changed.
CREATE OR REPLACE FUNCTION public.get_store_menus_snapshot(
  p_store_slug text,
  p_user_id uuid DEFAULT NULL::uuid,
  p_menu_version text DEFAULT 'default'::text
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  WITH slug AS (
    SELECT lower(trim(coalesce(p_store_slug, ''))) AS s
  ),
  store_row AS (
    SELECT st.id, st.slug, st.store_name, st.menu_sold_out_bottom
    FROM public.stores st, slug
    WHERE lower(trim(st.slug)) = slug.s
      AND st.approval_status = 'approved'
      AND st.is_visible = true
    LIMIT 1
  ),
  commerce_raw AS (
    SELECT coalesce(
      jsonb_object_agg(a.key, a.value_json) FILTER (WHERE a.key IS NOT NULL),
      '{}'::jsonb
    ) AS settings
    FROM public.admin_settings a
    WHERE a.key IN (
      'popular_menu_window_days',
      'popular_menu_min_qty',
      'popular_menu_top_n',
      'popular_menu_recommended_max'
    )
  ),
  commerce AS (
    SELECT
      greatest(1, least(365, coalesce((commerce_raw.settings->'popular_menu_window_days'->>'value')::int, 30))) AS window_days,
      greatest(1, least(10000, coalesce((commerce_raw.settings->'popular_menu_min_qty'->>'value')::int, 1))) AS min_qty,
      greatest(1, least(50, coalesce((commerce_raw.settings->'popular_menu_top_n'->>'value')::int, 5))) AS top_n,
      greatest(0, least(30, coalesce((commerce_raw.settings->'popular_menu_recommended_max'->>'value')::int, 10))) AS recommended_max
    FROM commerce_raw
  ),
  since_ts AS (
    SELECT (now() - ((SELECT window_days FROM commerce) || ' days')::interval) AS t
  ),
  product_rows AS (
    SELECT
      p.id,
      p.title,
      p.summary,
      p.price,
      p.discount_price,
      p.discount_percent,
      p.stock_qty,
      p.track_inventory,
      p.min_order_qty,
      p.max_order_qty,
      p.product_status,
      p.thumbnail_url,
      p.pickup_available,
      p.local_delivery_available,
      p.shipping_available,
      p.menu_section_id,
      p.item_type,
      p.is_featured,
      p.is_owner_recommended,
      p.is_representative,
      p.sort_order,
      p.has_options,
      CASE
        WHEN ms.id IS NOT NULL THEN jsonb_build_object(
          'id', ms.id,
          'name', ms.name,
          'sort_order', ms.sort_order,
          'is_hidden', ms.is_hidden
        )
        ELSE NULL
      END AS store_menu_sections
    FROM public.store_products p
    LEFT JOIN public.store_menu_sections ms ON ms.id = p.menu_section_id
    WHERE p.store_id = (SELECT id FROM store_row)
      AND p.product_status IN ('active', 'sold_out')
      AND coalesce(p.admin_review_status, 'none') NOT IN ('rejected', 'pending')
    ORDER BY p.sort_order ASC NULLS LAST, p.id ASC
    LIMIT 120
  ),
  products_arr AS (
    SELECT coalesce(jsonb_agg(to_jsonb(pr) ORDER BY pr.sort_order ASC NULLS LAST, pr.id ASC), '[]'::jsonb) AS products
    FROM product_rows pr
  ),
  popular_rows AS (
    SELECT ps.product_id, ps.total_qty, ps.last_ordered_at
    FROM store_row sr
    CROSS JOIN commerce c
    CROSS JOIN since_ts st
    CROSS JOIN LATERAL public.get_store_popular_product_stats(sr.id, st.t, c.top_n) ps
  ),
  popular_arr AS (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'product_id', pr.product_id,
          'total_qty', pr.total_qty,
          'last_ordered_at', pr.last_ordered_at
        )
      ),
      '[]'::jsonb
    ) AS popular_stats
    FROM popular_rows pr
  ),
  since90 AS (
    SELECT (now() - interval '90 days') AS t
  ),
  meta_row AS (
    SELECT
      coalesce((SELECT count(*)::int FROM public.store_favorites sf WHERE sf.store_id = sr.id), 0) AS favorite_count,
      coalesce((
        SELECT count(*)::int
        FROM public.store_orders so
        WHERE so.store_id = sr.id
          AND so.created_at >= (SELECT t FROM since90)
          AND so.order_status IN (
            'pending', 'accepted', 'preparing', 'ready_for_pickup',
            'delivering', 'arrived', 'completed', 'refund_requested'
          )
      ), 0) AS recent_order_count,
      CASE
        WHEN p_user_id IS NULL THEN false
        ELSE EXISTS (
          SELECT 1 FROM public.store_favorites vf
          WHERE vf.store_id = sr.id AND vf.user_id = p_user_id
        )
      END AS viewer_favorited,
      coalesce(
        (
          SELECT sp.allowed_to_sell = true AND sp.sales_status = 'approved'
          FROM public.store_sales_permissions sp
          WHERE sp.store_id = sr.id
          LIMIT 1
        ),
        false
      ) AS can_sell
    FROM store_row sr
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM store_row) THEN NULL::jsonb
    ELSE jsonb_build_object(
      'store', (
        SELECT jsonb_build_object(
          'id', sr.id,
          'slug', sr.slug,
          'store_name', sr.store_name,
          'menu_sold_out_bottom', coalesce(sr.menu_sold_out_bottom, false)
        )
        FROM store_row sr
      ),
      'products', (SELECT products FROM products_arr),
      'popular_stats', (SELECT popular_stats FROM popular_arr),
      'commerce', (
        SELECT jsonb_build_object(
          'popular_menu_window_days', c.window_days,
          'popular_menu_min_qty', c.min_qty,
          'popular_menu_top_n', c.top_n,
          'popular_menu_recommended_max', c.recommended_max
        )
        FROM commerce c
      ),
      'meta', (
        SELECT jsonb_build_object(
          'favorite_count', m.favorite_count,
          'recent_order_count', m.recent_order_count,
          'viewer_favorited', m.viewer_favorited,
          'can_sell', m.can_sell
        )
        FROM meta_row m
      ),
      'menu_version', coalesce(nullif(trim(p_menu_version), ''), 'default'),
      'updated_at', now()
    )
  END;
$fn$;

REVOKE ALL ON FUNCTION public.get_store_menus_snapshot(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_store_menus_snapshot(text, uuid, text) TO service_role;

