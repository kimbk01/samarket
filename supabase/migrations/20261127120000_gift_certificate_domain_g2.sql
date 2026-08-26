-- DIBAY Paid Gift Certificate G2
-- Integer money only · no instance expires_at · separate from coupon tables · Store Cash NEW tables
-- Money mutation RPCs: SECURITY DEFINER + service_role EXECUTE only

BEGIN;

-- ---------------------------------------------------------------------------
-- store_orders: gift redemption amount (separate from discount_amount)
-- ---------------------------------------------------------------------------
ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS gift_redemption_amount integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.store_orders.gift_redemption_amount IS
  'Paid gift certificate redemption total on order (integer). Separate from coupon discount_amount.';

-- ---------------------------------------------------------------------------
-- 1. gift_certificate_applications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gift_certificate_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title text NOT NULL,
  requested_face_value integer NOT NULL CHECK (requested_face_value > 0),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'suspended')),
  design_notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.gift_certificate_applications IS
  'G2 owner apply for paid gift certificate products (not coupons).';

CREATE INDEX IF NOT EXISTS gift_certificate_applications_store_idx
  ON public.gift_certificate_applications (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gift_certificate_applications_owner_idx
  ON public.gift_certificate_applications (owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gift_certificate_applications_status_idx
  ON public.gift_certificate_applications (status);

DROP TRIGGER IF EXISTS trg_gift_certificate_applications_updated_at
  ON public.gift_certificate_applications;
CREATE TRIGGER trg_gift_certificate_applications_updated_at
  BEFORE UPDATE ON public.gift_certificate_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. gift_certificate_products
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gift_certificate_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  application_id uuid NULL REFERENCES public.gift_certificate_applications (id) ON DELETE SET NULL,
  title text NOT NULL,
  face_value integer NOT NULL CHECK (face_value > 0),
  purchase_price integer NOT NULL CHECK (purchase_price >= 0),
  platform_fee_rate integer NOT NULL DEFAULT 0 CHECK (platform_fee_rate >= 0 AND platform_fee_rate <= 100),
  discount_funding_party text NOT NULL DEFAULT 'NONE'
    CHECK (discount_funding_party IN ('NONE', 'PLATFORM', 'MERCHANT', 'SHARED')),
  platform_funded_units integer NOT NULL DEFAULT 0 CHECK (platform_funded_units >= 0),
  merchant_funded_units integer NOT NULL DEFAULT 0 CHECK (merchant_funded_units >= 0),
  transferable boolean NOT NULL DEFAULT true,
  sales_starts_at timestamptz NOT NULL DEFAULT now(),
  sales_ends_at timestamptz NULL,
  active boolean NOT NULL DEFAULT true,
  image_url text NULL,
  created_by_admin_user_id uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  fee_policy_version integer NOT NULL DEFAULT 1,
  max_issuance integer NULL CHECK (max_issuance IS NULL OR max_issuance > 0),
  issued_count integer NOT NULL DEFAULT 0 CHECK (issued_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gift_certificate_products_price_lte_face_chk
    CHECK (purchase_price <= face_value),
  CONSTRAINT gift_certificate_products_funding_chk CHECK (
    (
      purchase_price = face_value
      AND discount_funding_party = 'NONE'
      AND platform_funded_units = 0
      AND merchant_funded_units = 0
    )
    OR (
      purchase_price < face_value
      AND discount_funding_party <> 'NONE'
      AND (
        (
          discount_funding_party = 'PLATFORM'
          AND platform_funded_units = (face_value - purchase_price)
          AND merchant_funded_units = 0
        )
        OR (
          discount_funding_party = 'MERCHANT'
          AND merchant_funded_units = (face_value - purchase_price)
          AND platform_funded_units = 0
        )
        OR (
          discount_funding_party = 'SHARED'
          AND (platform_funded_units + merchant_funded_units) = (face_value - purchase_price)
        )
      )
    )
  )
);

COMMENT ON TABLE public.gift_certificate_products IS
  'G2 sellable paid gift certificate products. Integer face/purchase; funding CHECK enforced.';

CREATE INDEX IF NOT EXISTS gift_certificate_products_store_idx
  ON public.gift_certificate_products (store_id, active, created_at DESC);
CREATE INDEX IF NOT EXISTS gift_certificate_products_application_idx
  ON public.gift_certificate_products (application_id)
  WHERE application_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_gift_certificate_products_updated_at
  ON public.gift_certificate_products;
CREATE TRIGGER trg_gift_certificate_products_updated_at
  BEFORE UPDATE ON public.gift_certificate_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. gift_certificate_instances (NO expires_at)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gift_certificate_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.gift_certificate_products (id) ON DELETE RESTRICT,
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  purchaser_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  current_owner_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  face_value integer NOT NULL CHECK (face_value > 0),
  purchase_price integer NOT NULL CHECK (purchase_price >= 0),
  remaining_balance integer NOT NULL CHECK (remaining_balance >= 0),
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'GIFT_LOCKED', 'PARTIALLY_REDEEMED', 'FULLY_REDEEMED', 'SUSPENDED')),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  purchased_at timestamptz NOT NULL DEFAULT now(),
  last_transferred_at timestamptz NULL,
  fully_redeemed_at timestamptz NULL,
  cancelled_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gift_certificate_instances_remaining_lte_face_chk
    CHECK (remaining_balance <= face_value)
);

COMMENT ON TABLE public.gift_certificate_instances IS
  'G2 gift certificate instances. No expires_at / value expiry by product contract.';

CREATE INDEX IF NOT EXISTS gift_certificate_instances_owner_idx
  ON public.gift_certificate_instances (current_owner_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS gift_certificate_instances_store_idx
  ON public.gift_certificate_instances (store_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS gift_certificate_instances_product_idx
  ON public.gift_certificate_instances (product_id);
CREATE INDEX IF NOT EXISTS gift_certificate_instances_purchaser_idx
  ON public.gift_certificate_instances (purchaser_user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. gift_certificate_ownership_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gift_certificate_ownership_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES public.gift_certificate_instances (id) ON DELETE CASCADE,
  seq integer NOT NULL CHECK (seq >= 1),
  event_type text NOT NULL,
  from_user_id uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  to_user_id uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  actor_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gift_certificate_ownership_events_instance_seq_uq UNIQUE (instance_id, seq)
);

COMMENT ON TABLE public.gift_certificate_ownership_events IS
  'Append-only ownership timeline for gift certificate instances.';

CREATE INDEX IF NOT EXISTS gift_certificate_ownership_events_instance_idx
  ON public.gift_certificate_ownership_events (instance_id, seq);

-- ---------------------------------------------------------------------------
-- 5. gift_certificate_transfers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gift_certificate_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES public.gift_certificate_instances (id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  recipient_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  room_id uuid NULL,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED')),
  idempotency_key text NOT NULL,
  messenger_message_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL,
  CONSTRAINT gift_certificate_transfers_idempotency_uq UNIQUE (idempotency_key)
);

COMMENT ON TABLE public.gift_certificate_transfers IS
  'G2 peer gift offers (messenger-friendly). One PENDING per instance via partial unique index.';

CREATE UNIQUE INDEX IF NOT EXISTS gift_certificate_transfers_one_pending_per_instance_uidx
  ON public.gift_certificate_transfers (instance_id)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS gift_certificate_transfers_recipient_idx
  ON public.gift_certificate_transfers (recipient_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS gift_certificate_transfers_sender_idx
  ON public.gift_certificate_transfers (sender_user_id, status, created_at DESC);

-- ---------------------------------------------------------------------------
-- 6. gift_certificate_ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gift_certificate_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NULL REFERENCES public.gift_certificate_instances (id) ON DELETE SET NULL,
  store_id uuid NULL REFERENCES public.stores (id) ON DELETE SET NULL,
  user_id uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  entry_type text NOT NULL,
  amount integer NOT NULL,
  related_type text NOT NULL DEFAULT '',
  related_id text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  actor_type text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gift_certificate_ledger_related_entry_uq UNIQUE (related_type, related_id, entry_type)
);

COMMENT ON TABLE public.gift_certificate_ledger IS
  'G2 append-only instance/user money event ledger (integer signed amounts).';

CREATE INDEX IF NOT EXISTS gift_certificate_ledger_instance_idx
  ON public.gift_certificate_ledger (instance_id, created_at DESC)
  WHERE instance_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS gift_certificate_ledger_store_idx
  ON public.gift_certificate_ledger (store_id, created_at DESC)
  WHERE store_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS gift_certificate_ledger_user_idx
  ON public.gift_certificate_ledger (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 7. gift_certificate_redemptions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gift_certificate_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.store_orders (id) ON DELETE CASCADE,
  instance_id uuid NOT NULL REFERENCES public.gift_certificate_instances (id) ON DELETE RESTRICT,
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  buyer_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  redeemed_amount integer NOT NULL CHECK (redeemed_amount > 0),
  platform_fee_amount integer NOT NULL CHECK (platform_fee_amount >= 0),
  merchant_net_amount integer NOT NULL CHECK (merchant_net_amount >= 0),
  platform_fee_rate_snapshot integer NOT NULL CHECK (platform_fee_rate_snapshot >= 0 AND platform_fee_rate_snapshot <= 100),
  reversed boolean NOT NULL DEFAULT false,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz NULL,
  CONSTRAINT gift_certificate_redemptions_idempotency_uq UNIQUE (idempotency_key),
  CONSTRAINT gift_certificate_redemptions_fee_split_chk
    CHECK (platform_fee_amount + merchant_net_amount = redeemed_amount)
);

COMMENT ON TABLE public.gift_certificate_redemptions IS
  'G2 order redemptions against gift instances. Fee snapshot at redeem time.';

CREATE INDEX IF NOT EXISTS gift_certificate_redemptions_order_idx
  ON public.gift_certificate_redemptions (order_id, created_at);
CREATE INDEX IF NOT EXISTS gift_certificate_redemptions_instance_idx
  ON public.gift_certificate_redemptions (instance_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gift_certificate_redemptions_store_idx
  ON public.gift_certificate_redemptions (store_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 8. gift_certificate_revenue_ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gift_certificate_revenue_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  redemption_id uuid NULL REFERENCES public.gift_certificate_redemptions (id) ON DELETE SET NULL,
  entry_type text NOT NULL,
  amount integer NOT NULL,
  related_type text NOT NULL DEFAULT '',
  related_id text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gift_certificate_revenue_ledger_related_entry_uq UNIQUE (related_type, related_id, entry_type)
);

COMMENT ON TABLE public.gift_certificate_revenue_ledger IS
  'G2 store gift revenue (REVENUE_CREATE|REVENUE_AVAILABLE|CONVERSION_*|REVERSED). Integer signed.';

CREATE INDEX IF NOT EXISTS gift_certificate_revenue_ledger_store_idx
  ON public.gift_certificate_revenue_ledger (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gift_certificate_revenue_ledger_redemption_idx
  ON public.gift_certificate_revenue_ledger (redemption_id)
  WHERE redemption_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 9. gift_certificate_conversion_requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gift_certificate_conversion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  amount integer NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'REQUESTED'
    CHECK (status IN ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED')),
  idempotency_key text NOT NULL,
  approved_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  approved_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gift_certificate_conversion_requests_idempotency_uq UNIQUE (idempotency_key)
);

COMMENT ON TABLE public.gift_certificate_conversion_requests IS
  'G2 owner requests to convert available gift revenue into Store Cash.';

CREATE INDEX IF NOT EXISTS gift_certificate_conversion_requests_store_idx
  ON public.gift_certificate_conversion_requests (store_id, status, created_at DESC);

-- ---------------------------------------------------------------------------
-- 10. store_cash_accounts (NEW — not stores.point_balance / store_settlements)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_cash_accounts (
  store_id uuid PRIMARY KEY REFERENCES public.stores (id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_cash_accounts_balance_nonneg_chk CHECK (balance >= 0)
);

COMMENT ON TABLE public.store_cash_accounts IS
  'G2 Store Cash balance per store. Separate from store points and settlements. balance >= 0 invariant.';

DROP TRIGGER IF EXISTS trg_store_cash_accounts_updated_at ON public.store_cash_accounts;
CREATE TRIGGER trg_store_cash_accounts_updated_at
  BEFORE UPDATE ON public.store_cash_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 11. store_cash_ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_cash_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  amount integer NOT NULL,
  balance_after integer NOT NULL,
  source_type text NOT NULL
    CHECK (source_type IN ('GIFT_REVENUE_CONVERSION', 'GIFT_REDEMPTION_REVERSAL', 'RECOVERY_CLEAR')),
  related_type text NOT NULL DEFAULT '',
  related_id text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_cash_ledger_source_related_uq UNIQUE (source_type, related_type, related_id)
);

COMMENT ON TABLE public.store_cash_ledger IS
  'G2 Store Cash append-only ledger. Integer signed amounts.';

CREATE INDEX IF NOT EXISTS store_cash_ledger_store_idx
  ON public.store_cash_ledger (store_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 12. store_cash_recovery_obligations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_cash_recovery_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  redemption_id uuid NOT NULL REFERENCES public.gift_certificate_redemptions (id) ON DELETE RESTRICT,
  amount_original integer NOT NULL CHECK (amount_original > 0),
  amount_remaining integer NOT NULL CHECK (amount_remaining >= 0),
  status text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'PARTIALLY_CLEARED', 'CLEARED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_cash_recovery_obligations_redemption_uq UNIQUE (redemption_id),
  CONSTRAINT store_cash_recovery_obligations_remaining_lte_original_chk
    CHECK (amount_remaining <= amount_original)
);

COMMENT ON TABLE public.store_cash_recovery_obligations IS
  'G2 recovery when gift redemption reverse cannot fully debit Store Cash.';

CREATE INDEX IF NOT EXISTS store_cash_recovery_obligations_store_idx
  ON public.store_cash_recovery_obligations (store_id, status, created_at DESC);

DROP TRIGGER IF EXISTS trg_store_cash_recovery_obligations_updated_at
  ON public.store_cash_recovery_obligations;
CREATE TRIGGER trg_store_cash_recovery_obligations_updated_at
  BEFORE UPDATE ON public.store_cash_recovery_obligations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Point ledger idempotency for gift purchases
CREATE UNIQUE INDEX IF NOT EXISTS uq_point_ledger_gift_certificate_purchase
  ON public.point_ledger (user_id, related_type, related_id)
  WHERE related_type = 'gift_certificate_purchase';

-- ---------------------------------------------------------------------------
-- Helper: available store gift revenue
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gift_certificate_store_revenue_available(p_store_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(r.amount), 0)::integer
  FROM public.gift_certificate_revenue_ledger r
  WHERE r.store_id = p_store_id
    AND r.entry_type IN ('REVENUE_AVAILABLE', 'CONVERSION_APPROVE', 'REVERSED');
$$;

COMMENT ON FUNCTION public.gift_certificate_store_revenue_available(uuid) IS
  'Sum of REVENUE_AVAILABLE + CONVERSION_APPROVE + REVERSED for a store (integer).';

REVOKE ALL ON FUNCTION public.gift_certificate_store_revenue_available(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gift_certificate_store_revenue_available(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.gift_certificate_store_revenue_available(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Internal: next ownership seq
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gift_certificate_next_ownership_seq(p_instance_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(MAX(e.seq), 0)::integer + 1
  FROM public.gift_certificate_ownership_events e
  WHERE e.instance_id = p_instance_id;
$$;

REVOKE ALL ON FUNCTION public.gift_certificate_next_ownership_seq(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gift_certificate_next_ownership_seq(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- RPC 1: gift_certificate_purchase
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
  v_existing_instance_id uuid;
  v_now timestamptz := now();
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_buyer_user_id IS NULL OR p_product_id IS NULL OR v_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  -- Idempotent: prior point spend for this key
  IF EXISTS (
    SELECT 1 FROM public.point_ledger pl
     WHERE pl.user_id = p_buyer_user_id
       AND pl.related_type = 'gift_certificate_purchase'
       AND pl.related_id = v_key
  ) THEN
    SELECT gl.instance_id INTO v_existing_instance_id
      FROM public.gift_certificate_ledger gl
     WHERE gl.related_type = 'gift_certificate_purchase'
       AND gl.related_id = v_key
       AND gl.entry_type = 'ISSUED'
     LIMIT 1;
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'instance_id', v_existing_instance_id
    );
  END IF;

  SELECT * INTO v_product
    FROM public.gift_certificate_products
   WHERE id = p_product_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'product_not_found');
  END IF;
  IF NOT coalesce(v_product.active, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'product_inactive');
  END IF;
  IF v_product.sales_starts_at IS NOT NULL AND v_product.sales_starts_at > v_now THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sales_not_started');
  END IF;
  IF v_product.sales_ends_at IS NOT NULL AND v_product.sales_ends_at < v_now THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sales_ended');
  END IF;
  IF v_product.max_issuance IS NOT NULL
     AND coalesce(v_product.issued_count, 0) >= v_product.max_issuance THEN
    RETURN jsonb_build_object('ok', false, 'error', 'max_issuance_reached');
  END IF;
  IF v_product.purchase_price < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_price');
  END IF;

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
  INSERT INTO public.gift_certificate_instances (
    id, product_id, store_id, purchaser_user_id, current_owner_user_id,
    face_value, purchase_price, remaining_balance, status, version, purchased_at, created_at
  ) VALUES (
    v_instance_id,
    v_product.id,
    v_product.store_id,
    p_buyer_user_id,
    p_buyer_user_id,
    v_product.face_value,
    v_product.purchase_price,
    v_product.face_value,
    'ACTIVE',
    1,
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
    jsonb_build_object('product_id', v_product.id, 'idempotency_key', v_key)
  );

  INSERT INTO public.gift_certificate_ledger (
    instance_id, store_id, user_id, entry_type, amount,
    related_type, related_id, description, actor_type
  ) VALUES (
    v_instance_id,
    v_product.store_id,
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

  -- Owner revenue 0 at sale (no revenue ledger rows)

  RETURN jsonb_build_object(
    'ok', true,
    'instance_id', v_instance_id,
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
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'instance_id', v_existing_instance_id
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC 2: gift_certificate_offer
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

  -- Soft blocked check (skip if pattern missing — table exists)
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
-- RPC 3: gift_certificate_accept
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gift_certificate_accept(
  p_recipient_user_id uuid,
  p_transfer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tr public.gift_certificate_transfers%ROWTYPE;
  v_inst public.gift_certificate_instances%ROWTYPE;
  v_new_status text;
  v_seq integer;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_recipient_user_id IS NULL OR p_transfer_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  -- Lock transfer while PENDING; do NOT terminal ACCEPTED until ownership moves.
  SELECT * INTO v_tr
    FROM public.gift_certificate_transfers
   WHERE id = p_transfer_id
     AND status = 'PENDING'
     AND recipient_user_id = p_recipient_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'transfer_not_pending');
  END IF;

  SELECT * INTO v_inst
    FROM public.gift_certificate_instances
   WHERE id = v_tr.instance_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'instance_not_found');
  END IF;
  IF v_inst.status IS DISTINCT FROM 'GIFT_LOCKED' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'instance_not_locked');
  END IF;
  IF v_inst.current_owner_user_id IS DISTINCT FROM v_tr.sender_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'owner_mismatch');
  END IF;

  IF v_inst.remaining_balance < v_inst.face_value AND v_inst.remaining_balance > 0 THEN
    v_new_status := 'PARTIALLY_REDEEMED';
  ELSIF v_inst.remaining_balance <= 0 THEN
    v_new_status := 'FULLY_REDEEMED';
  ELSE
    v_new_status := 'ACTIVE';
  END IF;

  UPDATE public.gift_certificate_instances
     SET current_owner_user_id = p_recipient_user_id,
         status = v_new_status,
         version = version + 1,
         last_transferred_at = now()
   WHERE id = v_inst.id;

  v_seq := public.gift_certificate_next_ownership_seq(v_inst.id);
  INSERT INTO public.gift_certificate_ownership_events (
    instance_id, seq, event_type, from_user_id, to_user_id, actor_user_id, payload
  ) VALUES (
    v_inst.id,
    v_seq,
    'GIFT_ACCEPTED',
    v_tr.sender_user_id,
    p_recipient_user_id,
    p_recipient_user_id,
    jsonb_build_object('transfer_id', v_tr.id)
  );

  INSERT INTO public.gift_certificate_ledger (
    instance_id, store_id, user_id, entry_type, amount,
    related_type, related_id, description, actor_type
  ) VALUES (
    v_inst.id,
    v_inst.store_id,
    p_recipient_user_id,
    'GIFT_ACCEPT',
    0,
    'gift_certificate_transfer',
    v_tr.id::text || ':accept',
    'Gift accepted',
    'user'
  );

  -- Terminal transfer status LAST (after ownership + ledgers).
  UPDATE public.gift_certificate_transfers
     SET status = 'ACCEPTED',
         resolved_at = now()
   WHERE id = v_tr.id
     AND status = 'PENDING';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gift_accept_race: transfer % no longer PENDING', v_tr.id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'transfer_id', v_tr.id,
    'instance_id', v_inst.id,
    'status', v_new_status
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC 4a: gift_certificate_reject
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gift_certificate_reject(
  p_recipient_user_id uuid,
  p_transfer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tr public.gift_certificate_transfers%ROWTYPE;
  v_inst public.gift_certificate_instances%ROWTYPE;
  v_new_status text;
  v_seq integer;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE public.gift_certificate_transfers
     SET status = 'REJECTED',
         resolved_at = now()
   WHERE id = p_transfer_id
     AND status = 'PENDING'
     AND recipient_user_id = p_recipient_user_id
  RETURNING * INTO v_tr;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'transfer_not_pending');
  END IF;

  SELECT * INTO v_inst
    FROM public.gift_certificate_instances
   WHERE id = v_tr.instance_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'instance_not_found');
  END IF;

  IF v_inst.remaining_balance < v_inst.face_value AND v_inst.remaining_balance > 0 THEN
    v_new_status := 'PARTIALLY_REDEEMED';
  ELSIF v_inst.remaining_balance <= 0 THEN
    v_new_status := 'FULLY_REDEEMED';
  ELSE
    v_new_status := 'ACTIVE';
  END IF;

  IF v_inst.status = 'GIFT_LOCKED' THEN
    UPDATE public.gift_certificate_instances
       SET status = v_new_status,
           version = version + 1
     WHERE id = v_inst.id;
  END IF;

  v_seq := public.gift_certificate_next_ownership_seq(v_inst.id);
  INSERT INTO public.gift_certificate_ownership_events (
    instance_id, seq, event_type, from_user_id, to_user_id, actor_user_id, payload
  ) VALUES (
    v_inst.id,
    v_seq,
    'GIFT_REJECTED',
    v_tr.sender_user_id,
    p_recipient_user_id,
    p_recipient_user_id,
    jsonb_build_object('transfer_id', v_tr.id)
  );

  INSERT INTO public.gift_certificate_ledger (
    instance_id, store_id, user_id, entry_type, amount,
    related_type, related_id, description, actor_type
  ) VALUES (
    v_inst.id,
    v_inst.store_id,
    p_recipient_user_id,
    'GIFT_REJECT',
    0,
    'gift_certificate_transfer',
    v_tr.id::text || ':reject',
    'Gift rejected',
    'user'
  );

  RETURN jsonb_build_object('ok', true, 'transfer_id', v_tr.id, 'status', v_new_status);
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC 4b: gift_certificate_cancel
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gift_certificate_cancel(
  p_sender_user_id uuid,
  p_transfer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tr public.gift_certificate_transfers%ROWTYPE;
  v_inst public.gift_certificate_instances%ROWTYPE;
  v_new_status text;
  v_seq integer;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE public.gift_certificate_transfers
     SET status = 'CANCELLED',
         resolved_at = now()
   WHERE id = p_transfer_id
     AND status = 'PENDING'
     AND sender_user_id = p_sender_user_id
  RETURNING * INTO v_tr;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'transfer_not_pending');
  END IF;

  SELECT * INTO v_inst
    FROM public.gift_certificate_instances
   WHERE id = v_tr.instance_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'instance_not_found');
  END IF;

  IF v_inst.remaining_balance < v_inst.face_value AND v_inst.remaining_balance > 0 THEN
    v_new_status := 'PARTIALLY_REDEEMED';
  ELSIF v_inst.remaining_balance <= 0 THEN
    v_new_status := 'FULLY_REDEEMED';
  ELSE
    v_new_status := 'ACTIVE';
  END IF;

  IF v_inst.status = 'GIFT_LOCKED' THEN
    UPDATE public.gift_certificate_instances
       SET status = v_new_status,
           version = version + 1
     WHERE id = v_inst.id;
  END IF;

  v_seq := public.gift_certificate_next_ownership_seq(v_inst.id);
  INSERT INTO public.gift_certificate_ownership_events (
    instance_id, seq, event_type, from_user_id, to_user_id, actor_user_id, payload
  ) VALUES (
    v_inst.id,
    v_seq,
    'GIFT_CANCELLED',
    p_sender_user_id,
    v_tr.recipient_user_id,
    p_sender_user_id,
    jsonb_build_object('transfer_id', v_tr.id)
  );

  INSERT INTO public.gift_certificate_ledger (
    instance_id, store_id, user_id, entry_type, amount,
    related_type, related_id, description, actor_type
  ) VALUES (
    v_inst.id,
    v_inst.store_id,
    p_sender_user_id,
    'GIFT_CANCEL',
    0,
    'gift_certificate_transfer',
    v_tr.id::text || ':cancel',
    'Gift cancelled',
    'user'
  );

  RETURN jsonb_build_object('ok', true, 'transfer_id', v_tr.id, 'status', v_new_status);
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC 5: gift_certificate_redeem
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

  -- Pass 1: validate + lock all instances BEFORE any money write.
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
    IF v_inst.store_id IS DISTINCT FROM p_store_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'store_mismatch', 'instance_id', v_instance_id);
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

  -- Pass 2: mutate (any failure must RAISE → full TX rollback).
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
       OR v_inst.status NOT IN ('ACTIVE', 'PARTIALLY_REDEEMED') THEN
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
      v_instance_id, p_store_id, p_buyer_user_id, 'REDEEM', -v_amount,
      'gift_certificate_redemption', v_redemption_id::text, 'Redeemed against order', 'user'
    );

    INSERT INTO public.gift_certificate_revenue_ledger (
      store_id, redemption_id, entry_type, amount, related_type, related_id
    ) VALUES (
      p_store_id, v_redemption_id, 'REVENUE_CREATE', v_merchant,
      'redemption', v_redemption_id::text
    );

    INSERT INTO public.gift_certificate_revenue_ledger (
      store_id, redemption_id, entry_type, amount, related_type, related_id
    ) VALUES (
      p_store_id, v_redemption_id, 'REVENUE_AVAILABLE', v_merchant,
      'redemption', v_redemption_id::text || ':available'
    );

    v_total := v_total + v_amount;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'redemption_id', v_redemption_id,
      'instance_id', v_instance_id,
      'redeemed_amount', v_amount,
      'platform_fee_amount', v_fee,
      'merchant_net_amount', v_merchant,
      'remaining_balance', v_new_remaining,
      'status', v_new_status
    ));
  END LOOP;

  -- Parent idempotency marker (amount 0) so whole-call key is reserved
  INSERT INTO public.gift_certificate_ledger (
    instance_id, store_id, user_id, entry_type, amount,
    related_type, related_id, description, actor_type
  ) VALUES (
    NULL, p_store_id, p_buyer_user_id, 'REDEEM_BATCH', v_total,
    'gift_certificate_redeem_batch', v_key, 'Redeem batch', 'user'
  );

  UPDATE public.store_orders
     SET gift_redemption_amount = coalesce(gift_redemption_amount, 0) + v_total
   WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'total_redeemed', v_total,
    'redemptions', v_results
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'order_id', p_order_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC 6: gift_certificate_redemption_reverse
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

    v_avail_before := public.gift_certificate_store_revenue_available(v_red.store_id);

    -- Reverse available revenue (and audit create counterpart)
    INSERT INTO public.gift_certificate_revenue_ledger (
      store_id, redemption_id, entry_type, amount, related_type, related_id
    ) VALUES (
      v_red.store_id, v_red.id, 'REVERSED', -v_red.merchant_net_amount,
      'redemption_reverse', v_red.id::text
    );

    -- If revenue was already converted away, claw back cash or open recovery
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

  -- Simpler accurate reset from live non-reversed sum
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
$$;

-- ---------------------------------------------------------------------------
-- RPC 7: gift_certificate_conversion_request
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gift_certificate_conversion_request(
  p_owner_user_id uuid,
  p_store_id uuid,
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
  v_existing uuid;
  v_available integer;
  v_request_id uuid;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_owner_user_id IS NULL OR p_store_id IS NULL OR coalesce(p_amount, 0) <= 0 OR v_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  SELECT id INTO v_existing
    FROM public.gift_certificate_conversion_requests
   WHERE idempotency_key = v_key
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'request_id', v_existing);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.stores s
     WHERE s.id = p_store_id
       AND s.owner_user_id = p_owner_user_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_store_owner');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.store_cash_recovery_obligations o
     WHERE o.store_id = p_store_id
       AND o.status IN ('OPEN', 'PARTIALLY_CLEARED')
       AND o.amount_remaining > 0
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'open_recovery_obligation');
  END IF;

  v_available := public.gift_certificate_store_revenue_available(p_store_id);
  IF v_available < p_amount THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'insufficient_available_revenue',
      'available', v_available
    );
  END IF;

  INSERT INTO public.gift_certificate_conversion_requests (
    store_id, owner_user_id, amount, status, idempotency_key
  ) VALUES (
    p_store_id, p_owner_user_id, p_amount, 'REQUESTED', v_key
  )
  RETURNING id INTO v_request_id;

  INSERT INTO public.gift_certificate_revenue_ledger (
    store_id, redemption_id, entry_type, amount, related_type, related_id
  ) VALUES (
    p_store_id, NULL, 'CONVERSION_REQUEST', 0,
    'conversion_request', v_request_id::text
  );

  RETURN jsonb_build_object('ok', true, 'request_id', v_request_id, 'amount', p_amount);
EXCEPTION
  WHEN unique_violation THEN
    SELECT id INTO v_existing
      FROM public.gift_certificate_conversion_requests
     WHERE idempotency_key = v_key
     LIMIT 1;
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'request_id', v_existing);
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC 8: gift_certificate_conversion_approve
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gift_certificate_conversion_approve(
  p_admin_user_id uuid,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.gift_certificate_conversion_requests%ROWTYPE;
  v_available integer;
  v_cash_balance integer;
  v_new_cash integer;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_admin_user_id IS NULL OR p_request_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;
  IF NOT public.is_platform_admin(p_admin_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_admin');
  END IF;

  -- Lock request while REQUESTED; do NOT terminal APPROVED until cash+ledger succeed.
  SELECT * INTO v_req
    FROM public.gift_certificate_conversion_requests
   WHERE id = p_request_id
     AND status = 'REQUESTED'
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'request_not_pending');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.store_cash_recovery_obligations o
     WHERE o.store_id = v_req.store_id
       AND o.status IN ('OPEN', 'PARTIALLY_CLEARED')
       AND o.amount_remaining > 0
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'open_recovery_obligation');
  END IF;

  -- Serialize available revenue for this store (blocks concurrent overdraw).
  PERFORM pg_advisory_xact_lock(hashtext('gift_rev:' || v_req.store_id::text));

  v_available := public.gift_certificate_store_revenue_available(v_req.store_id);
  IF v_available < v_req.amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_available_revenue', 'available', v_available);
  END IF;

  INSERT INTO public.gift_certificate_revenue_ledger (
    store_id, redemption_id, entry_type, amount, related_type, related_id
  ) VALUES (
    v_req.store_id, NULL, 'CONVERSION_APPROVE', -v_req.amount,
    'conversion_request', v_req.id::text || ':approve'
  );

  INSERT INTO public.store_cash_accounts (store_id, balance)
  VALUES (v_req.store_id, 0)
  ON CONFLICT (store_id) DO NOTHING;

  SELECT balance INTO v_cash_balance
    FROM public.store_cash_accounts
   WHERE store_id = v_req.store_id
   FOR UPDATE;

  v_new_cash := coalesce(v_cash_balance, 0) + v_req.amount;
  UPDATE public.store_cash_accounts
     SET balance = v_new_cash,
         updated_at = now()
   WHERE store_id = v_req.store_id;

  INSERT INTO public.store_cash_ledger (
    store_id, amount, balance_after, source_type, related_type, related_id
  ) VALUES (
    v_req.store_id, v_req.amount, v_new_cash,
    'GIFT_REVENUE_CONVERSION', 'conversion_request', v_req.id::text
  );

  -- Terminal status LAST.
  UPDATE public.gift_certificate_conversion_requests
     SET status = 'APPROVED',
         approved_by = p_admin_user_id,
         approved_at = now()
   WHERE id = v_req.id
     AND status = 'REQUESTED';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gift_conversion_approve_race: request % no longer REQUESTED', v_req.id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'request_id', v_req.id,
    'amount', v_req.amount,
    'store_cash_balance', v_new_cash
  );
EXCEPTION
  WHEN unique_violation THEN
    -- Double approve / double cash ledger for same related_id
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'request_id', p_request_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC 9: store_cash_recovery_clear
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.store_cash_recovery_clear(
  p_admin_user_id uuid,
  p_obligation_id uuid,
  p_amount integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ob public.store_cash_recovery_obligations%ROWTYPE;
  v_clear integer;
  v_remaining integer;
  v_status text;
  v_cash_balance integer;
  v_new_cash integer;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_admin_user_id IS NULL OR p_obligation_id IS NULL OR coalesce(p_amount, 0) <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;
  IF NOT public.is_platform_admin(p_admin_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_admin');
  END IF;

  SELECT * INTO v_ob
    FROM public.store_cash_recovery_obligations
   WHERE id = p_obligation_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'obligation_not_found');
  END IF;
  IF v_ob.status = 'CLEARED' OR v_ob.amount_remaining <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_cleared');
  END IF;

  v_clear := LEAST(p_amount, v_ob.amount_remaining);

  INSERT INTO public.store_cash_accounts (store_id, balance)
  VALUES (v_ob.store_id, 0)
  ON CONFLICT (store_id) DO NOTHING;

  SELECT balance INTO v_cash_balance
    FROM public.store_cash_accounts
   WHERE store_id = v_ob.store_id
   FOR UPDATE;

  IF coalesce(v_cash_balance, 0) < v_clear THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'insufficient_store_cash',
      'balance', coalesce(v_cash_balance, 0)
    );
  END IF;

  v_new_cash := coalesce(v_cash_balance, 0) - v_clear;
  UPDATE public.store_cash_accounts
     SET balance = v_new_cash,
         updated_at = now()
   WHERE store_id = v_ob.store_id;

  INSERT INTO public.store_cash_ledger (
    store_id, amount, balance_after, source_type, related_type, related_id
  ) VALUES (
    v_ob.store_id, -v_clear, v_new_cash,
    'RECOVERY_CLEAR', 'recovery_obligation', p_obligation_id::text || ':' || gen_random_uuid()::text
  );

  v_remaining := v_ob.amount_remaining - v_clear;
  IF v_remaining = 0 THEN
    v_status := 'CLEARED';
  ELSE
    v_status := 'PARTIALLY_CLEARED';
  END IF;

  UPDATE public.store_cash_recovery_obligations
     SET amount_remaining = v_remaining,
         status = v_status,
         updated_at = now()
   WHERE id = p_obligation_id;

  RETURN jsonb_build_object(
    'ok', true,
    'obligation_id', p_obligation_id,
    'cleared', v_clear,
    'amount_remaining', v_remaining,
    'status', v_status,
    'store_cash_balance', v_new_cash
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- ACL: REVOKE PUBLIC; GRANT service_role only on money RPCs
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.gift_certificate_purchase(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gift_certificate_offer(uuid, uuid, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gift_certificate_accept(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gift_certificate_reject(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gift_certificate_cancel(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gift_certificate_redeem(uuid, uuid, uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gift_certificate_redemption_reverse(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gift_certificate_conversion_request(uuid, uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gift_certificate_conversion_approve(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.store_cash_recovery_clear(uuid, uuid, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.gift_certificate_purchase(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gift_certificate_offer(uuid, uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gift_certificate_accept(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.gift_certificate_reject(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.gift_certificate_cancel(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.gift_certificate_redeem(uuid, uuid, uuid, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gift_certificate_redemption_reverse(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.gift_certificate_conversion_request(uuid, uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gift_certificate_conversion_approve(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.store_cash_recovery_clear(uuid, uuid, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.gift_certificate_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_certificate_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_certificate_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_certificate_ownership_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_certificate_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_certificate_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_certificate_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_certificate_revenue_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_certificate_conversion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_cash_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_cash_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_cash_recovery_obligations ENABLE ROW LEVEL SECURITY;

-- applications SELECT
DROP POLICY IF EXISTS gift_certificate_applications_select ON public.gift_certificate_applications;
CREATE POLICY gift_certificate_applications_select
  ON public.gift_certificate_applications
  FOR SELECT
  TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.stores s
       WHERE s.id = gift_certificate_applications.store_id
         AND s.owner_user_id = auth.uid()
    )
  );

-- products SELECT: active for authenticated; owner/admin see all for store
DROP POLICY IF EXISTS gift_certificate_products_select_active ON public.gift_certificate_products;
CREATE POLICY gift_certificate_products_select_active
  ON public.gift_certificate_products
  FOR SELECT
  TO authenticated
  USING (
    (
      active = true
      AND (sales_starts_at IS NULL OR sales_starts_at <= now())
      AND (sales_ends_at IS NULL OR sales_ends_at >= now())
    )
    OR public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.stores s
       WHERE s.id = gift_certificate_products.store_id
         AND s.owner_user_id = auth.uid()
    )
  );

-- instances SELECT
DROP POLICY IF EXISTS gift_certificate_instances_select ON public.gift_certificate_instances;
CREATE POLICY gift_certificate_instances_select
  ON public.gift_certificate_instances
  FOR SELECT
  TO authenticated
  USING (
    current_owner_user_id = auth.uid()
    OR purchaser_user_id = auth.uid()
    OR public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.stores s
       WHERE s.id = gift_certificate_instances.store_id
         AND s.owner_user_id = auth.uid()
    )
  );

-- ownership events via instance visibility
DROP POLICY IF EXISTS gift_certificate_ownership_events_select ON public.gift_certificate_ownership_events;
CREATE POLICY gift_certificate_ownership_events_select
  ON public.gift_certificate_ownership_events
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.gift_certificate_instances i
       WHERE i.id = gift_certificate_ownership_events.instance_id
         AND (
           i.current_owner_user_id = auth.uid()
           OR i.purchaser_user_id = auth.uid()
           OR EXISTS (
             SELECT 1 FROM public.stores s
              WHERE s.id = i.store_id AND s.owner_user_id = auth.uid()
           )
         )
    )
  );

-- transfers: sender / recipient / admin
DROP POLICY IF EXISTS gift_certificate_transfers_select ON public.gift_certificate_transfers;
CREATE POLICY gift_certificate_transfers_select
  ON public.gift_certificate_transfers
  FOR SELECT
  TO authenticated
  USING (
    sender_user_id = auth.uid()
    OR recipient_user_id = auth.uid()
    OR public.is_platform_admin(auth.uid())
  );

-- gift ledger: own rows / store owner / admin
DROP POLICY IF EXISTS gift_certificate_ledger_select ON public.gift_certificate_ledger;
CREATE POLICY gift_certificate_ledger_select
  ON public.gift_certificate_ledger
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_platform_admin(auth.uid())
    OR (
      store_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.stores s
         WHERE s.id = gift_certificate_ledger.store_id
           AND s.owner_user_id = auth.uid()
      )
    )
  );

-- redemptions
DROP POLICY IF EXISTS gift_certificate_redemptions_select ON public.gift_certificate_redemptions;
CREATE POLICY gift_certificate_redemptions_select
  ON public.gift_certificate_redemptions
  FOR SELECT
  TO authenticated
  USING (
    buyer_user_id = auth.uid()
    OR public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.stores s
       WHERE s.id = gift_certificate_redemptions.store_id
         AND s.owner_user_id = auth.uid()
    )
  );

-- revenue ledger: store owner / admin
DROP POLICY IF EXISTS gift_certificate_revenue_ledger_select ON public.gift_certificate_revenue_ledger;
CREATE POLICY gift_certificate_revenue_ledger_select
  ON public.gift_certificate_revenue_ledger
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.stores s
       WHERE s.id = gift_certificate_revenue_ledger.store_id
         AND s.owner_user_id = auth.uid()
    )
  );

-- conversion requests
DROP POLICY IF EXISTS gift_certificate_conversion_requests_select ON public.gift_certificate_conversion_requests;
CREATE POLICY gift_certificate_conversion_requests_select
  ON public.gift_certificate_conversion_requests
  FOR SELECT
  TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.stores s
       WHERE s.id = gift_certificate_conversion_requests.store_id
         AND s.owner_user_id = auth.uid()
    )
  );

-- store cash account / ledger / recovery: owner / admin
DROP POLICY IF EXISTS store_cash_accounts_select ON public.store_cash_accounts;
CREATE POLICY store_cash_accounts_select
  ON public.store_cash_accounts
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.stores s
       WHERE s.id = store_cash_accounts.store_id
         AND s.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS store_cash_ledger_select ON public.store_cash_ledger;
CREATE POLICY store_cash_ledger_select
  ON public.store_cash_ledger
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.stores s
       WHERE s.id = store_cash_ledger.store_id
         AND s.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS store_cash_recovery_obligations_select ON public.store_cash_recovery_obligations;
CREATE POLICY store_cash_recovery_obligations_select
  ON public.store_cash_recovery_obligations
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.stores s
       WHERE s.id = store_cash_recovery_obligations.store_id
         AND s.owner_user_id = auth.uid()
    )
  );

-- No client INSERT/UPDATE/DELETE on money / domain tables (service_role bypasses RLS)
REVOKE ALL ON TABLE public.gift_certificate_applications FROM PUBLIC;
REVOKE ALL ON TABLE public.gift_certificate_products FROM PUBLIC;
REVOKE ALL ON TABLE public.gift_certificate_instances FROM PUBLIC;
REVOKE ALL ON TABLE public.gift_certificate_ownership_events FROM PUBLIC;
REVOKE ALL ON TABLE public.gift_certificate_transfers FROM PUBLIC;
REVOKE ALL ON TABLE public.gift_certificate_ledger FROM PUBLIC;
REVOKE ALL ON TABLE public.gift_certificate_redemptions FROM PUBLIC;
REVOKE ALL ON TABLE public.gift_certificate_revenue_ledger FROM PUBLIC;
REVOKE ALL ON TABLE public.gift_certificate_conversion_requests FROM PUBLIC;
REVOKE ALL ON TABLE public.store_cash_accounts FROM PUBLIC;
REVOKE ALL ON TABLE public.store_cash_ledger FROM PUBLIC;
REVOKE ALL ON TABLE public.store_cash_recovery_obligations FROM PUBLIC;

GRANT SELECT ON TABLE public.gift_certificate_applications TO authenticated;
GRANT SELECT ON TABLE public.gift_certificate_products TO authenticated;
GRANT SELECT ON TABLE public.gift_certificate_instances TO authenticated;
GRANT SELECT ON TABLE public.gift_certificate_ownership_events TO authenticated;
GRANT SELECT ON TABLE public.gift_certificate_transfers TO authenticated;
GRANT SELECT ON TABLE public.gift_certificate_ledger TO authenticated;
GRANT SELECT ON TABLE public.gift_certificate_redemptions TO authenticated;
GRANT SELECT ON TABLE public.gift_certificate_revenue_ledger TO authenticated;
GRANT SELECT ON TABLE public.gift_certificate_conversion_requests TO authenticated;
GRANT SELECT ON TABLE public.store_cash_accounts TO authenticated;
GRANT SELECT ON TABLE public.store_cash_ledger TO authenticated;
GRANT SELECT ON TABLE public.store_cash_recovery_obligations TO authenticated;

GRANT ALL ON TABLE public.gift_certificate_applications TO service_role;
GRANT ALL ON TABLE public.gift_certificate_products TO service_role;
GRANT ALL ON TABLE public.gift_certificate_instances TO service_role;
GRANT ALL ON TABLE public.gift_certificate_ownership_events TO service_role;
GRANT ALL ON TABLE public.gift_certificate_transfers TO service_role;
GRANT ALL ON TABLE public.gift_certificate_ledger TO service_role;
GRANT ALL ON TABLE public.gift_certificate_redemptions TO service_role;
GRANT ALL ON TABLE public.gift_certificate_revenue_ledger TO service_role;
GRANT ALL ON TABLE public.gift_certificate_conversion_requests TO service_role;
GRANT ALL ON TABLE public.store_cash_accounts TO service_role;
GRANT ALL ON TABLE public.store_cash_ledger TO service_role;
GRANT ALL ON TABLE public.store_cash_recovery_obligations TO service_role;

COMMIT;
