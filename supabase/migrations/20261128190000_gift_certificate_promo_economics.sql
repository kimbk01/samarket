-- Gift Certificate — Ledger C (Policy C): promo accrual / recognition / settlement
-- Three-ledger model: promo writers NEVER touch gift_certificate_revenue_ledger.

-- ---------------------------------------------------------------------------
-- 1) Instance economics snapshot + promo tables
-- ---------------------------------------------------------------------------
ALTER TABLE public.gift_certificate_instances
  ADD COLUMN IF NOT EXISTS purchase_discount_amount integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_funding_party_snapshot text NOT NULL DEFAULT 'UNKNOWN_LEGACY',
  ADD COLUMN IF NOT EXISTS platform_fee_rate_snapshot integer NOT NULL DEFAULT 0;

ALTER TABLE public.gift_certificate_instances
  DROP CONSTRAINT IF EXISTS gift_certificate_instances_funding_snapshot_check;

ALTER TABLE public.gift_certificate_instances
  ADD CONSTRAINT gift_certificate_instances_funding_snapshot_check
  CHECK (discount_funding_party_snapshot IN ('NONE', 'PLATFORM', 'MERCHANT', 'SHARED', 'UNKNOWN_LEGACY'));

CREATE TABLE IF NOT EXISTS public.gift_promo_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES public.gift_certificate_instances(id) ON DELETE CASCADE,
  store_id uuid NULL REFERENCES public.stores(id),
  party text NOT NULL CHECK (party IN ('OWNER', 'DIBAY')),
  contracted_amount integer NOT NULL CHECK (contracted_amount >= 0),
  recognized_amount integer NOT NULL DEFAULT 0 CHECK (recognized_amount >= 0),
  settled_amount integer NOT NULL DEFAULT 0 CHECK (settled_amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instance_id, party),
  CHECK (recognized_amount <= contracted_amount),
  CHECK (settled_amount <= recognized_amount)
);

CREATE INDEX IF NOT EXISTS gift_promo_obligations_store_party_idx
  ON public.gift_promo_obligations (store_id, party)
  WHERE store_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.gift_promo_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES public.gift_certificate_instances(id) ON DELETE CASCADE,
  obligation_id uuid NOT NULL REFERENCES public.gift_promo_obligations(id) ON DELETE CASCADE,
  redemption_id uuid NULL REFERENCES public.gift_certificate_redemptions(id),
  order_id uuid NULL,
  store_id uuid NULL,
  party text NOT NULL CHECK (party IN ('OWNER', 'DIBAY')),
  entry_type text NOT NULL CHECK (
    entry_type IN ('PROMO_ACCRUAL', 'PROMO_RECOGNITION', 'PROMO_SETTLEMENT', 'PROMO_REVERSAL')
  ),
  amount integer NOT NULL,
  related_type text NOT NULL,
  related_id text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (related_type, related_id, entry_type)
);

CREATE INDEX IF NOT EXISTS gift_promo_ledger_instance_idx
  ON public.gift_promo_ledger (instance_id, created_at);

CREATE INDEX IF NOT EXISTS gift_promo_ledger_redemption_idx
  ON public.gift_promo_ledger (redemption_id)
  WHERE redemption_id IS NOT NULL;

-- Legacy rows: face = purchase → NONE snapshot; unknown gap without product funding → UNKNOWN_LEGACY
UPDATE public.gift_certificate_instances i
   SET purchase_discount_amount = GREATEST(0, i.face_value - i.purchase_price),
       discount_funding_party_snapshot = CASE
         WHEN i.face_value = i.purchase_price THEN 'NONE'
         ELSE 'UNKNOWN_LEGACY'
       END
 WHERE i.discount_funding_party_snapshot = 'UNKNOWN_LEGACY'
   AND i.purchase_discount_amount = 0;

-- ---------------------------------------------------------------------------
-- 2) C1 — Purchase accrual (contractual obligation only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gift_certificate_promo_accrue_for_instance(
  p_instance_id uuid,
  p_store_id uuid,
  p_gap integer,
  p_owner_units integer,
  p_dibay_units integer,
  p_funding_party text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner integer := GREATEST(0, coalesce(p_owner_units, 0));
  v_dibay integer := GREATEST(0, coalesce(p_dibay_units, 0));
  v_gap integer := GREATEST(0, coalesce(p_gap, 0));
  v_obl_id uuid;
  v_inserted integer;
BEGIN
  IF p_instance_id IS NULL OR v_gap <= 0 OR coalesce(p_funding_party, 'NONE') = 'NONE' THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'no_promo_gap');
  END IF;
  IF v_owner + v_dibay <> v_gap THEN
    RETURN jsonb_build_object('ok', false, 'error', 'funding_units_mismatch');
  END IF;

  IF v_owner > 0 THEN
    INSERT INTO public.gift_promo_obligations (
      instance_id, store_id, party, contracted_amount
    ) VALUES (
      p_instance_id, p_store_id, 'OWNER', v_owner
    )
    ON CONFLICT (instance_id, party) DO NOTHING
    RETURNING id INTO v_obl_id;

    IF v_obl_id IS NULL THEN
      SELECT id INTO v_obl_id
        FROM public.gift_promo_obligations
       WHERE instance_id = p_instance_id
         AND party = 'OWNER';
    END IF;

    INSERT INTO public.gift_promo_ledger (
      instance_id, obligation_id, store_id, party, entry_type, amount,
      related_type, related_id, description
    ) VALUES (
      p_instance_id, v_obl_id, p_store_id, 'OWNER', 'PROMO_ACCRUAL', v_owner,
      'gift_certificate_purchase', p_idempotency_key || ':owner_accrual',
      'Owner promo contractual accrual at purchase'
    )
    ON CONFLICT (related_type, related_id, entry_type) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  END IF;

  IF v_dibay > 0 THEN
    v_obl_id := NULL;
    INSERT INTO public.gift_promo_obligations (
      instance_id, store_id, party, contracted_amount
    ) VALUES (
      p_instance_id, NULL, 'DIBAY', v_dibay
    )
    ON CONFLICT (instance_id, party) DO NOTHING
    RETURNING id INTO v_obl_id;

    IF v_obl_id IS NULL THEN
      SELECT id INTO v_obl_id
        FROM public.gift_promo_obligations
       WHERE instance_id = p_instance_id
         AND party = 'DIBAY';
    END IF;

    INSERT INTO public.gift_promo_ledger (
      instance_id, obligation_id, store_id, party, entry_type, amount,
      related_type, related_id, description
    ) VALUES (
      p_instance_id, v_obl_id, NULL, 'DIBAY', 'PROMO_ACCRUAL', v_dibay,
      'gift_certificate_purchase', p_idempotency_key || ':dibay_accrual',
      'DIBAY promo contractual accrual at purchase'
    )
    ON CONFLICT (related_type, related_id, entry_type) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('ok', true, 'owner_units', v_owner, 'dibay_units', v_dibay);
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) C2 — Order-completion promo recognition (proportional; final slice remainder)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gift_certificate_promo_recognize_for_redemption(
  p_redemption_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_red public.gift_certificate_redemptions%ROWTYPE;
  v_inst public.gift_certificate_instances%ROWTYPE;
  v_obl public.gift_promo_obligations%ROWTYPE;
  v_cumulative integer;
  v_is_final boolean;
  v_slice integer;
  v_related_id text;
  v_inserted integer;
  v_recognized_count integer := 0;
BEGIN
  IF p_redemption_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  SELECT * INTO v_red
    FROM public.gift_certificate_redemptions
   WHERE id = p_redemption_id
   FOR UPDATE;
  IF NOT FOUND OR v_red.reversed THEN
    RETURN jsonb_build_object('ok', false, 'error', 'redemption_not_found');
  END IF;

  SELECT * INTO v_inst
    FROM public.gift_certificate_instances
   WHERE id = v_red.instance_id;
  IF NOT FOUND OR v_inst.face_value <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'no_instance');
  END IF;

  SELECT coalesce(sum(redeemed_amount), 0)::integer INTO v_cumulative
    FROM public.gift_certificate_redemptions
   WHERE instance_id = v_inst.id
     AND reversed = false;

  v_is_final := (v_cumulative = v_inst.face_value);

  FOR v_obl IN
    SELECT * FROM public.gift_promo_obligations
     WHERE instance_id = v_inst.id
       AND contracted_amount > 0
     FOR UPDATE
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.gift_promo_ledger pl
       WHERE pl.redemption_id = p_redemption_id
         AND pl.obligation_id = v_obl.id
         AND pl.entry_type = 'PROMO_RECOGNITION'
    ) THEN
      CONTINUE;
    END IF;

    IF v_is_final THEN
      v_slice := v_obl.contracted_amount - v_obl.recognized_amount;
    ELSE
      v_slice := floor((v_obl.contracted_amount::numeric * v_red.redeemed_amount) / v_inst.face_value)::integer;
    END IF;

    v_slice := GREATEST(0, LEAST(v_slice, v_obl.contracted_amount - v_obl.recognized_amount));
    IF v_slice <= 0 THEN
      CONTINUE;
    END IF;

    v_related_id := p_redemption_id::text || ':' || lower(v_obl.party) || ':recognition';

    INSERT INTO public.gift_promo_ledger (
      instance_id, obligation_id, redemption_id, order_id, store_id, party,
      entry_type, amount, related_type, related_id, description
    ) VALUES (
      v_inst.id, v_obl.id, p_redemption_id, v_red.order_id, v_obl.store_id, v_obl.party,
      'PROMO_RECOGNITION', v_slice, 'promo_recognition', v_related_id,
      'Promo recognition on completed order'
    )
    ON CONFLICT (related_type, related_id, entry_type) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted > 0 THEN
      UPDATE public.gift_promo_obligations
         SET recognized_amount = recognized_amount + v_slice,
             updated_at = now()
       WHERE id = v_obl.id;
      v_recognized_count := v_recognized_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'redemption_id', p_redemption_id,
    'recognized_obligations', v_recognized_count,
    'is_final_slice', v_is_final
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) Promo reversal on refund (sync Ledger C with gift reversal)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 5) C3 — Promo settlement (separate authority; never touches Ledger B)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gift_certificate_promo_settle(
  p_obligation_id uuid,
  p_amount integer,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_obl public.gift_promo_obligations%ROWTYPE;
  v_amount integer := GREATEST(0, coalesce(p_amount, 0));
  v_outstanding integer;
  v_inserted integer;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_obligation_id IS NULL OR v_key IS NULL OR v_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  SELECT * INTO v_obl
    FROM public.gift_promo_obligations
   WHERE id = p_obligation_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'obligation_not_found');
  END IF;

  v_outstanding := v_obl.recognized_amount - v_obl.settled_amount;
  IF v_amount > v_outstanding THEN
    RETURN jsonb_build_object('ok', false, 'error', 'exceeds_outstanding', 'outstanding', v_outstanding);
  END IF;

  INSERT INTO public.gift_promo_ledger (
    instance_id, obligation_id, store_id, party, entry_type, amount,
    related_type, related_id, description
  ) VALUES (
    v_obl.instance_id, v_obl.id, v_obl.store_id, v_obl.party, 'PROMO_SETTLEMENT', v_amount,
    'promo_settlement', v_key, 'Promo settlement'
  )
  ON CONFLICT (related_type, related_id, entry_type) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    SELECT settled_amount INTO v_obl.settled_amount
      FROM public.gift_promo_obligations WHERE id = v_obl.id;
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'obligation_id', v_obl.id,
      'settled_amount', v_obl.settled_amount
    );
  END IF;

  UPDATE public.gift_promo_obligations
     SET settled_amount = settled_amount + v_amount,
         updated_at = now()
   WHERE id = v_obl.id
  RETURNING settled_amount INTO v_obl.settled_amount;

  RETURN jsonb_build_object(
    'ok', true,
    'obligation_id', v_obl.id,
    'amount', v_amount,
    'settled_amount', v_obl.settled_amount
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6) Purchase: snapshot economics + C1 accrual
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
    face_value, purchase_price, remaining_balance, status, version, purchased_at, created_at,
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
    v_now,
    v_now,
    v_gap,
    v_funding,
    coalesce(v_product.platform_fee_rate, 0)
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
      'purchase_discount_amount', v_gap,
      'discount_funding_party', v_funding
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
    'face_value', v_product.face_value,
    'purchase_price', v_product.purchase_price,
    'purchase_discount_amount', v_gap,
    'discount_funding_party', v_funding,
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
END;
$$;

-- ---------------------------------------------------------------------------
-- 7) Order completion recognition: Ledger B unchanged + C2 promo hook
-- ---------------------------------------------------------------------------
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
  v_promo_count integer := 0;
  v_inserted integer;
  v_related_id text;
  v_had_available boolean;
  v_promo jsonb;
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
    IF public.gift_certificate_redemption_recognized_net(v_red.id) > 0 THEN
      v_skipped_count := v_skipped_count + 1;
      -- Still attempt promo recognition if revenue was recognized earlier without promo
      v_promo := public.gift_certificate_promo_recognize_for_redemption(v_red.id);
      IF coalesce((v_promo->>'recognized_obligations')::integer, 0) > 0 THEN
        v_promo_count := v_promo_count + 1;
      END IF;
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.gift_certificate_revenue_ledger rl
       WHERE rl.redemption_id = v_red.id
         AND rl.entry_type = 'REVENUE_AVAILABLE'
    ) INTO v_had_available;

    IF v_had_available THEN
      v_related_id := v_red.id::text || ':available:after_correction';
    ELSE
      v_related_id := v_red.id::text || ':available';
    END IF;

    INSERT INTO public.gift_certificate_revenue_ledger (
      store_id, redemption_id, entry_type, amount, related_type, related_id
    ) VALUES (
      v_red.store_id, v_red.id, 'REVENUE_AVAILABLE', v_red.merchant_net_amount,
      'redemption', v_related_id
    )
    ON CONFLICT (related_type, related_id, entry_type) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted > 0 THEN
      v_recognized_count := v_recognized_count + 1;
      v_promo := public.gift_certificate_promo_recognize_for_redemption(v_red.id);
      IF coalesce((v_promo->>'recognized_obligations')::integer, 0) > 0 THEN
        v_promo_count := v_promo_count + 1;
      END IF;
    ELSE
      v_skipped_count := v_skipped_count + 1;
      v_promo := public.gift_certificate_promo_recognize_for_redemption(v_red.id);
      IF coalesce((v_promo->>'recognized_obligations')::integer, 0) > 0 THEN
        v_promo_count := v_promo_count + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'recognized_count', v_recognized_count,
    'skipped_count', v_skipped_count,
    'promo_recognized_count', v_promo_count
  );
END;
$$;

COMMENT ON FUNCTION public.gift_certificate_recognize_revenue_for_completed_order(uuid) IS
  'Idempotent Ledger B recognition on completed orders; hooks Ledger C promo recognition.';

-- ---------------------------------------------------------------------------
-- 8) Redemption reverse: sync Ledger C promo reversal
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gift_certificate_redemption_reverse(
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_order_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
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

    v_restored := v_inst.remaining_balance + v_red.redeemed_amount;
    IF v_restored > v_inst.face_value THEN
      RAISE EXCEPTION 'gift_reverse_restore_overflow redemption=%', v_red.id;
    END IF;
    IF v_restored = v_inst.face_value THEN
      v_new_status := 'ACTIVE';
    ELSIF v_restored > 0 THEN
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

    PERFORM public.gift_certificate_promo_reverse_for_redemption(v_red.id);

    IF EXISTS (
      SELECT 1 FROM public.gift_certificate_revenue_ledger rl
       WHERE rl.redemption_id = v_red.id
         AND rl.entry_type = 'REVENUE_AVAILABLE'
    ) THEN
      v_avail_before := public.gift_certificate_store_revenue_available(v_red.store_id);

      INSERT INTO public.gift_certificate_revenue_ledger (
        store_id, redemption_id, entry_type, amount, related_type, related_id
      ) VALUES (
        v_red.store_id, v_red.id, 'REVERSED', -v_red.merchant_net_amount,
        'redemption_reverse', v_red.id::text
      );

      IF v_avail_before < v_red.merchant_net_amount THEN
      v_shortfall := v_red.merchant_net_amount - GREATEST(v_avail_before, 0);

      INSERT INTO public.store_cash_accounts (store_id, balance)
      VALUES (v_red.store_id, 0)
      ON CONFLICT (store_id) DO NOTHING;

      SELECT balance INTO v_cash_balance
        FROM public.store_cash_accounts
       WHERE store_id = v_red.store_id
       FOR UPDATE;

      v_debit := LEAST(coalesce(v_cash_balance, 0), v_shortfall);
      IF v_debit > 0 THEN
        v_new_cash := coalesce(v_cash_balance, 0) - v_debit;
        UPDATE public.store_cash_accounts
           SET balance = v_new_cash,
               updated_at = now()
         WHERE store_id = v_red.store_id;
        INSERT INTO public.store_cash_ledger (
          store_id, amount, balance_after, source_type, related_type, related_id
        ) VALUES (
          v_red.store_id, -v_debit, v_new_cash,
          'GIFT_REDEMPTION_REVERSAL', 'redemption', v_red.id::text
        );
      END IF;

      IF v_shortfall - v_debit > 0 THEN
        INSERT INTO public.store_cash_recovery_obligations (
          store_id, redemption_id, amount_original, amount_remaining, status
        ) VALUES (
          v_red.store_id, v_red.id, v_shortfall - v_debit, v_shortfall - v_debit, 'OPEN'
        )
        ON CONFLICT (redemption_id) DO NOTHING
        RETURNING id INTO v_obligation_id;
      END IF;
    END IF;
    END IF;
  END LOOP;

  IF v_count = 0 THEN
    RETURN jsonb_build_object('ok', true, 'reversed_count', 0, 'idempotent', true);
  END IF;

  UPDATE public.store_orders so
     SET gift_redemption_amount = GREATEST(
       0,
       coalesce(so.gift_redemption_amount, 0) - coalesce((
         SELECT SUM(r.redeemed_amount)
           FROM public.gift_certificate_redemptions r
          WHERE r.order_id = p_order_id
            AND r.reversed = true
            AND r.reversed_at IS NOT NULL
            AND r.reversed_at >= now() - interval '1 second'
       ), 0)
     )
   WHERE so.id = p_order_id;

  UPDATE public.store_orders so
     SET gift_redemption_amount = coalesce((
       SELECT SUM(r.redeemed_amount)::integer
         FROM public.gift_certificate_redemptions r
        WHERE r.order_id = p_order_id
          AND r.reversed = false
     ), 0)
   WHERE so.id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'reversed_count', v_count);
END;
$$;

-- ---------------------------------------------------------------------------
-- 9) RLS (read-only for owner/admin; writes via service_role RPC)
-- ---------------------------------------------------------------------------
ALTER TABLE public.gift_promo_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_promo_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gift_promo_obligations_select ON public.gift_promo_obligations;
CREATE POLICY gift_promo_obligations_select
  ON public.gift_promo_obligations
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.stores s
       WHERE s.id = gift_promo_obligations.store_id
         AND s.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS gift_promo_ledger_select ON public.gift_promo_ledger;
CREATE POLICY gift_promo_ledger_select
  ON public.gift_promo_ledger
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.stores s
       WHERE s.id = gift_promo_ledger.store_id
         AND s.owner_user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 10) Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.gift_certificate_promo_accrue_for_instance(uuid, uuid, integer, integer, integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gift_certificate_promo_recognize_for_redemption(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gift_certificate_promo_reverse_for_redemption(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gift_certificate_promo_settle(uuid, integer, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.gift_certificate_promo_accrue_for_instance(uuid, uuid, integer, integer, integer, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gift_certificate_promo_recognize_for_redemption(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.gift_certificate_promo_reverse_for_redemption(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.gift_certificate_promo_settle(uuid, integer, text) TO service_role;

GRANT SELECT ON public.gift_promo_obligations TO authenticated;
GRANT SELECT ON public.gift_promo_ledger TO authenticated;
GRANT ALL ON public.gift_promo_obligations TO service_role;
GRANT ALL ON public.gift_promo_ledger TO service_role;

COMMENT ON TABLE public.gift_promo_obligations IS
  'Ledger C contractual promo obligations per instance/party (C1 accrual authority).';
COMMENT ON TABLE public.gift_promo_ledger IS
  'Ledger C promo entries: PROMO_ACCRUAL, PROMO_RECOGNITION, PROMO_SETTLEMENT, PROMO_REVERSAL. Never touches revenue_ledger.';
