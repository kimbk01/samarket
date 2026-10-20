-- Isolated fixture for stage 2-C (FIN-05 / ADS-21 / GFT-05 / ADS-25) - cancel/refund money side effects atomic.
-- NOT for Supabase projects. Runs on a throwaway local PostgreSQL 16 database only.
-- Runner: supabase/tests/isolated/stage2-2c/run.sh <pg_host> <pg_port>
-- Modeled on supabase/tests/isolated/store-orders/00_fixture.sql. Column definitions / constraints / indexes copied
-- from production information_schema + pg_constraint + pg_indexes (read-only, 2026-10-21), trimmed to the columns
-- the functions under test touch. Triggers mirrored: set_updated_at, pickup guard (prod definition), commission
-- trigger STUB (records the status change in the same TX).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('test.jwt_role', true), ''), 'anon')
$$;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE TABLE public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  store_name text NOT NULL DEFAULT 'store'
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY, display_name text, nickname text, username text
);

CREATE TABLE public.store_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no text NOT NULL,
  buyer_user_id uuid NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores(id),
  payment_status text NOT NULL DEFAULT 'pending'
    CHECK (payment_status = ANY (ARRAY['pending','paid','failed','cancelled','refunded'])),
  order_status text NOT NULL DEFAULT 'pending'
    CHECK (order_status = ANY (ARRAY['pending','accepted','preparing','ready_for_pickup','delivering','arrived','completed','cancel_requested','cancelled','refund_requested','refunded'])),
  fulfillment_type text NOT NULL DEFAULT 'pickup'
    CHECK (fulfillment_type = ANY (ARRAY['pickup','local_delivery','shipping'])),
  payment_amount numeric NOT NULL DEFAULT 0,
  discount_amount bigint,
  store_funded_amount numeric,
  platform_funded_amount numeric,
  gift_redemption_amount integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  auto_complete_at timestamptz,
  admin_locked boolean NOT NULL DEFAULT false,
  needs_admin_attention boolean NOT NULL DEFAULT false,
  refund_approved_at timestamptz,
  refunded_at timestamptz
);
CREATE TRIGGER store_orders_updated_at BEFORE UPDATE ON public.store_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.store_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'stub',
  amount bigint NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- referenced by reverse_coin_credits_for_order (legacy LEFT JOIN only)
CREATE TABLE public.store_settlements (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid);

CREATE TABLE public.store_order_cancel_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.store_orders(id) ON DELETE CASCADE,
  previous_order_status text,
  requested_by uuid,
  requested_role text NOT NULL CHECK (requested_role = ANY (ARRAY['buyer','owner','admin','system'])),
  reason text NOT NULL DEFAULT '',
  detail_reason text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status = ANY (ARRAY['pending','approved','rejected','refunded','partial_refunded'])),
  approved_by uuid,
  approved_at timestamptz,
  rejected_at timestamptz,
  rejected_reason text,
  refund_status text NOT NULL DEFAULT 'not_started'
    CHECK (refund_status = ANY (ARRAY['not_started','pending','refunded','partial_refunded','not_applicable'])),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_store_order_cancel_requests_one_pending
  ON public.store_order_cancel_requests USING btree (order_id) WHERE (status = 'pending');

CREATE TABLE public.store_order_deliveries (
  order_id uuid PRIMARY KEY REFERENCES public.store_orders(id) ON DELETE CASCADE,
  store_id uuid NOT NULL,
  buyer_user_id uuid NOT NULL,
  rider_id uuid,
  delivery_status text NOT NULL DEFAULT 'waiting_rider'
    CHECK (delivery_status = ANY (ARRAY['waiting_rider','rider_assigned','pickup_in_progress','delivering','delivered','delivery_failed'])),
  picked_up_at timestamptz,
  delivered_at timestamptz,
  failure_note text,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_store_order_deliveries_updated_at BEFORE UPDATE ON public.store_order_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- prod definition (pg_get_functiondef, 2026-10-21)
CREATE OR REPLACE FUNCTION public.store_order_deliveries_pickup_requires_dispatch()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
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
$function$;
CREATE TRIGGER trg_store_order_deliveries_pickup_requires_dispatch
  BEFORE UPDATE OF delivery_status ON public.store_order_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.store_order_deliveries_pickup_requires_dispatch();

CREATE TABLE public.test_commission_log (order_id uuid, from_status text, to_status text, at timestamptz DEFAULT clock_timestamp());
CREATE OR REPLACE FUNCTION public.store_orders_commission_lifecycle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.order_status IS NOT DISTINCT FROM OLD.order_status THEN RETURN NULL; END IF;
  INSERT INTO public.test_commission_log(order_id, from_status, to_status) VALUES (NEW.id, OLD.order_status, NEW.order_status);
  RETURN NULL;
END $$;
CREATE TRIGGER trg_store_orders_commission_lifecycle AFTER INSERT OR UPDATE OF order_status ON public.store_orders
  FOR EACH ROW EXECUTE FUNCTION public.store_orders_commission_lifecycle();

-- ---- coupons (prod constraints / indexes) ----
CREATE TABLE public.store_coupon_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'c',
  funding_mode text NOT NULL DEFAULT 'STORE_FUNDED'
    CHECK (funding_mode = ANY (ARRAY['STORE_FUNDED','PLATFORM_FUNDED','SHARED_FUNDED'])),
  lifecycle_state text NOT NULL DEFAULT 'active'
    CHECK (lifecycle_state = ANY (ARRAY['draft','requested','approved','rejected','scheduled','active','paused','ended','revoked'])),
  reserved_spend_php numeric NOT NULL DEFAULT 0,
  first_order_scope text,
  restore_on_full_refund boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.coupon_user_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.store_coupon_campaigns(id) ON DELETE RESTRICT,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  buyer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'available'
    CHECK (status = ANY (ARRAY['available','redeemed','expired','revoked','restored'])),
  reserved_php numeric NOT NULL CHECK (reserved_php >= 0),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
  redeemed_order_id uuid REFERENCES public.store_orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX coupon_user_entitlements_active_buyer_campaign_uidx
  ON public.coupon_user_entitlements USING btree (buyer_user_id, campaign_id)
  WHERE (status = ANY (ARRAY['available'::text, 'restored'::text]));

CREATE TABLE public.store_coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.store_coupon_campaigns(id) ON DELETE RESTRICT,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  buyer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid NOT NULL UNIQUE REFERENCES public.store_orders(id) ON DELETE RESTRICT,
  discount_amount_applied numeric NOT NULL CHECK (discount_amount_applied > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_coupon_id uuid REFERENCES public.coupon_user_entitlements(id) ON DELETE RESTRICT,
  CONSTRAINT store_coupon_redemptions_buyer_campaign_unique UNIQUE (buyer_user_id, campaign_id)
);
CREATE UNIQUE INDEX store_coupon_redemptions_user_coupon_uidx
  ON public.store_coupon_redemptions USING btree (user_coupon_id) WHERE (user_coupon_id IS NOT NULL);
CREATE INDEX store_coupon_redemptions_campaign_idx
  ON public.store_coupon_redemptions USING btree (campaign_id, created_at DESC);

CREATE TABLE public.coupon_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid, actor_user_id uuid, action text, created_at timestamptz NOT NULL DEFAULT now()
);

-- ---- gift certificates ----
CREATE TABLE public.gift_certificate_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  current_owner_user_id uuid NOT NULL,
  face_value integer NOT NULL,
  remaining_balance integer NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  version integer NOT NULL DEFAULT 1,
  fully_redeemed_at timestamptz,
  valid_from date NOT NULL DEFAULT current_date,
  valid_until date
);
CREATE TABLE public.gift_certificate_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  instance_id uuid NOT NULL,
  store_id uuid NOT NULL,
  buyer_user_id uuid NOT NULL,
  redeemed_amount integer NOT NULL,
  platform_fee_amount integer NOT NULL DEFAULT 0,
  merchant_net_amount integer NOT NULL,
  platform_fee_rate_snapshot integer NOT NULL DEFAULT 0,
  reversed boolean NOT NULL DEFAULT false,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz,
  forfeited_amount integer NOT NULL DEFAULT 0
);
CREATE TABLE public.gift_certificate_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid, store_id uuid, user_id uuid, entry_type text NOT NULL, amount integer NOT NULL,
  related_type text NOT NULL DEFAULT '', related_id text NOT NULL DEFAULT '', description text NOT NULL DEFAULT '',
  actor_type text NOT NULL DEFAULT 'system', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.gift_certificate_revenue_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL, redemption_id uuid, entry_type text NOT NULL, amount integer NOT NULL,
  related_type text NOT NULL DEFAULT '', related_id text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
-- promo reverse: out of scope here (stub, no-op)
CREATE OR REPLACE FUNCTION public.gift_certificate_promo_reverse_for_redemption(p_redemption_id uuid)
RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;

-- ---- Coin (store economic points) ----
CREATE TABLE public.store_economic_point_accounts (
  store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE RESTRICT,
  balance integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.store_economic_point_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  entry_kind text NOT NULL CHECK (entry_kind = ANY (ARRAY['ECONOMIC_INFLOW','SALE_EARN','GIFT_REDEMPTION_EARN','REVERSAL','CONVERT_TO_BUSINESS_CASH','WITHDRAWAL','WITHDRAWAL_REQUEST','WITHDRAWAL_COMPLETE','WITHDRAWAL_REJECT','WITHDRAWAL_RELEASE','ADMIN_ADJUST','SYSTEM'])),
  amount integer NOT NULL,
  balance_after integer NOT NULL,
  related_type text NOT NULL DEFAULT '',
  related_id text NOT NULL DEFAULT '',
  idempotency_key text NOT NULL,
  actor_type text NOT NULL DEFAULT 'system',
  actor_user_id uuid,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_economic_point_ledger_idem_uidx UNIQUE (idempotency_key)
);

-- Coupon-restore failure injector (test only): an order listed here makes the redemption marking fail.
CREATE TABLE public.test_coupon_fail (order_id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION public.test_coupon_fail_trg() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.test_coupon_fail WHERE order_id = NEW.order_id) THEN
    RAISE EXCEPTION 'forced_coupon_restore_failure';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_test_coupon_fail BEFORE UPDATE ON public.store_coupon_redemptions
  FOR EACH ROW EXECUTE FUNCTION public.test_coupon_fail_trg();

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
