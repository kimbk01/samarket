-- DIBAY Gift Certificate instance validity (product policy → issued instance dates)
-- Inclusive valid_from .. valid_until · Asia/Manila date-only · immutable after issue

BEGIN;

-- ---------------------------------------------------------------------------
-- Product expiry policy
-- ---------------------------------------------------------------------------
ALTER TABLE public.gift_certificate_products
  ADD COLUMN IF NOT EXISTS expiry_policy text NOT NULL DEFAULT 'NO_EXPIRY',
  ADD COLUMN IF NOT EXISTS validity_days integer NULL,
  ADD COLUMN IF NOT EXISTS fixed_valid_until date NULL;

ALTER TABLE public.gift_certificate_products
  DROP CONSTRAINT IF EXISTS gift_certificate_products_expiry_policy_chk,
  ADD CONSTRAINT gift_certificate_products_expiry_policy_chk
    CHECK (expiry_policy IN ('FIXED_DAYS', 'FIXED_DATE', 'NO_EXPIRY'));

ALTER TABLE public.gift_certificate_products
  DROP CONSTRAINT IF EXISTS gift_certificate_products_expiry_fields_chk,
  ADD CONSTRAINT gift_certificate_products_expiry_fields_chk
    CHECK (
      (
        expiry_policy = 'NO_EXPIRY'
        AND validity_days IS NULL
        AND fixed_valid_until IS NULL
      )
      OR (
        expiry_policy = 'FIXED_DAYS'
        AND validity_days IS NOT NULL
        AND validity_days > 0
        AND fixed_valid_until IS NULL
      )
      OR (
        expiry_policy = 'FIXED_DATE'
        AND fixed_valid_until IS NOT NULL
        AND validity_days IS NULL
      )
    );

COMMENT ON COLUMN public.gift_certificate_products.expiry_policy IS
  'Issued instance validity policy: FIXED_DAYS | FIXED_DATE | NO_EXPIRY. Not sales window.';
COMMENT ON COLUMN public.gift_certificate_products.validity_days IS
  'FIXED_DAYS: inclusive validity length from issue date.';
COMMENT ON COLUMN public.gift_certificate_products.fixed_valid_until IS
  'FIXED_DATE: inclusive last valid calendar date for newly issued instances.';

-- ---------------------------------------------------------------------------
-- Instance authoritative validity dates
-- ---------------------------------------------------------------------------
ALTER TABLE public.gift_certificate_instances
  ADD COLUMN IF NOT EXISTS valid_from date NULL,
  ADD COLUMN IF NOT EXISTS valid_until date NULL;

UPDATE public.gift_certificate_instances
   SET valid_from = (coalesce(purchased_at, created_at, now()) AT TIME ZONE 'Asia/Manila')::date
 WHERE valid_from IS NULL;

UPDATE public.gift_certificate_instances
   SET valid_until = NULL
 WHERE valid_until IS NULL;

ALTER TABLE public.gift_certificate_instances
  ALTER COLUMN valid_from SET NOT NULL;

ALTER TABLE public.gift_certificate_instances
  DROP CONSTRAINT IF EXISTS gift_certificate_instances_validity_range_chk,
  ADD CONSTRAINT gift_certificate_instances_validity_range_chk
    CHECK (valid_until IS NULL OR valid_until >= valid_from);

COMMENT ON COLUMN public.gift_certificate_instances.valid_from IS
  'Authoritative inclusive validity start (date-only, Asia/Manila at issue). Immutable after issue.';
COMMENT ON COLUMN public.gift_certificate_instances.valid_until IS
  'Authoritative inclusive validity end. NULL = no expiry. Immutable after issue.';

-- ---------------------------------------------------------------------------
-- Canonical date helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gift_certificate_issue_date(p_at timestamptz DEFAULT now())
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT (coalesce(p_at, now()) AT TIME ZONE 'Asia/Manila')::date;
$$;

CREATE OR REPLACE FUNCTION public.gift_certificate_instance_is_expired(p_valid_until date)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT p_valid_until IS NOT NULL
     AND p_valid_until < public.gift_certificate_issue_date(now());
$$;

CREATE OR REPLACE FUNCTION public.gift_certificate_resolve_validity_at_issue(
  p_expiry_policy text,
  p_validity_days integer,
  p_fixed_valid_until date,
  p_issue_date date
)
RETURNS TABLE(valid_from date, valid_until date)
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_issue_date IS NULL THEN
    RAISE EXCEPTION 'invalid_issue_date';
  END IF;

  IF p_expiry_policy = 'NO_EXPIRY' THEN
    valid_from := p_issue_date;
    valid_until := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_expiry_policy = 'FIXED_DAYS' THEN
    IF p_validity_days IS NULL OR p_validity_days <= 0 THEN
      RAISE EXCEPTION 'invalid_validity_days';
    END IF;
    valid_from := p_issue_date;
    valid_until := p_issue_date + (p_validity_days - 1);
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_expiry_policy = 'FIXED_DATE' THEN
    IF p_fixed_valid_until IS NULL THEN
      RAISE EXCEPTION 'invalid_fixed_valid_until';
    END IF;
    IF p_fixed_valid_until < p_issue_date THEN
      RAISE EXCEPTION 'fixed_valid_until_before_issue';
    END IF;
    valid_from := p_issue_date;
    valid_until := p_fixed_valid_until;
    RETURN NEXT;
    RETURN;
  END IF;

  RAISE EXCEPTION 'invalid_expiry_policy';
END;
$$;

REVOKE ALL ON FUNCTION public.gift_certificate_issue_date(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gift_certificate_instance_is_expired(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gift_certificate_resolve_validity_at_issue(text, integer, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gift_certificate_issue_date(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.gift_certificate_instance_is_expired(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.gift_certificate_resolve_validity_at_issue(text, integer, date, date) TO service_role;

-- ---------------------------------------------------------------------------
-- RPC: gift_certificate_purchase — persist valid_from / valid_until at issue
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
    purchased_at, created_at
  ) VALUES (
    v_instance_id,
    v_public_gift_number,
    v_product.id,
    CASE WHEN v_scope = 'PLATFORM' THEN NULL ELSE v_product.store_id END,
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
    v_now
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
      'valid_until', v_valid_until
    )
  );

  INSERT INTO public.gift_certificate_ledger (
    instance_id, store_id, user_id, entry_type, amount,
    related_type, related_id, description, actor_type
  ) VALUES (
    v_instance_id,
    CASE WHEN v_scope = 'PLATFORM' THEN NULL ELSE v_product.store_id END,
    p_buyer_user_id,
    'ISSUED',
    v_product.face_value,
    'gift_certificate_purchase',
    v_key,
    'Gift certificate purchased',
    'user'
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
-- RPC: gift_certificate_offer — block expired instances
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gift_certificate_offer(
  p_sender_user_id uuid,
  p_instance_id uuid,
  p_recipient_user_id uuid,
  p_room_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_inst public.gift_certificate_instances%ROWTYPE;
  v_transferable boolean;
  v_transfer_id uuid;
  v_existing_id uuid;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_sender_user_id IS NULL OR p_instance_id IS NULL OR p_recipient_user_id IS NULL OR v_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;
  IF p_sender_user_id = p_recipient_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_gift_self');
  END IF;

  SELECT t.id INTO v_existing_id
    FROM public.gift_certificate_transfers t
   WHERE t.idempotency_key = v_key
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'transfer_id', v_existing_id);
  END IF;

  SELECT * INTO v_inst
    FROM public.gift_certificate_instances
   WHERE id = p_instance_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'instance_not_found');
  END IF;
  IF public.gift_certificate_instance_is_expired(v_inst.valid_until) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'gift_expired');
  END IF;
  IF v_inst.current_owner_user_id IS DISTINCT FROM p_sender_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_owner');
  END IF;
  IF v_inst.status NOT IN ('ACTIVE', 'PARTIALLY_REDEEMED') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;
  IF coalesce(v_inst.remaining_balance, 0) <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'zero_balance');
  END IF;

  SELECT coalesce(p.transferable, true) INTO v_transferable
    FROM public.gift_certificate_products p
   WHERE p.id = v_inst.product_id;
  IF NOT coalesce(v_transferable, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_transferable');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_social_relations r
     WHERE r.owner_user_id = p_sender_user_id
       AND r.target_user_id = p_recipient_user_id
       AND r.relation_type = 'friend'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_friend');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_social_relations r
     WHERE (
       (r.owner_user_id = p_sender_user_id AND r.target_user_id = p_recipient_user_id)
       OR (r.owner_user_id = p_recipient_user_id AND r.target_user_id = p_sender_user_id)
     )
       AND r.relation_type = 'blocked'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'blocked');
  END IF;

  INSERT INTO public.gift_certificate_transfers (
    instance_id, sender_user_id, recipient_user_id, room_id, status, idempotency_key
  ) VALUES (
    p_instance_id, p_sender_user_id, p_recipient_user_id, p_room_id, 'PENDING', v_key
  )
  RETURNING id INTO v_transfer_id;

  UPDATE public.gift_certificate_instances
     SET status = 'GIFT_LOCKED',
         version = version + 1
   WHERE id = p_instance_id;

  INSERT INTO public.gift_certificate_ledger (
    instance_id, store_id, user_id, entry_type, amount,
    related_type, related_id, description, actor_type
  ) VALUES (
    p_instance_id,
    v_inst.store_id,
    p_sender_user_id,
    'GIFT_OFFER',
    0,
    'gift_certificate_transfer',
    v_transfer_id::text,
    'Gift offer pending',
    'user'
  );

  RETURN jsonb_build_object('ok', true, 'transfer_id', v_transfer_id);
EXCEPTION
  WHEN unique_violation THEN
    SELECT t.id INTO v_existing_id
      FROM public.gift_certificate_transfers t
     WHERE t.idempotency_key = v_key
     LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('ok', true, 'idempotent', true, 'transfer_id', v_existing_id);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'pending_transfer_exists');
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: gift_certificate_redeem — server authority blocks expired instances
-- (Patch pass-1 validation only; pass-2 unchanged from scope_platform migration.)
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

    SELECT platform_fee_rate INTO v_fee_rate
      FROM public.gift_certificate_products
     WHERE id = v_inst.product_id;
    v_fee_rate := coalesce(v_fee_rate, 0);
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

COMMIT;
