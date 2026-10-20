-- Isolated fixture for ORD-06 / DLV-02 (store order cancel ledger atomic + delivery status CHECK).
-- NOT for Supabase projects. Runs on a throwaway local PostgreSQL 16 database only.
-- Runner: supabase/tests/isolated/store-orders/run.sh <pg_host> <pg_port>
-- Column definitions copied from production information_schema (read-only, 2026-10-21), trimmed to the
-- columns the functions under test touch. Triggers mirrored from prod: set_updated_at,
-- store_order_deliveries_pickup_requires_dispatch (prod definition), and a commission trigger STUB
-- (AFTER UPDATE OF order_status, can be forced to raise store_commission_charge_failed like prod).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
-- Supabase auth.role() reads the JWT role claim; here a session GUC stands in for it.
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('test.jwt_role', true), ''), 'anon')
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE TABLE public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL
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
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  auto_complete_at timestamptz,
  admin_locked boolean NOT NULL DEFAULT false,
  needs_admin_attention boolean NOT NULL DEFAULT false
);
CREATE TRIGGER store_orders_updated_at BEFORE UPDATE ON public.store_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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
CREATE INDEX idx_store_order_cancel_requests_order_id_created
  ON public.store_order_cancel_requests USING btree (order_id, created_at DESC);

CREATE TABLE public.store_order_deliveries (
  order_id uuid PRIMARY KEY REFERENCES public.store_orders(id) ON DELETE CASCADE,
  store_id uuid NOT NULL,
  buyer_user_id uuid NOT NULL,
  rider_id uuid,
  delivery_status text NOT NULL DEFAULT 'waiting_rider',
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

-- Commission trigger stub: records every status change it sees (same transaction) and raises like prod
-- when the order is listed in test_commission_fail.
CREATE TABLE public.test_commission_log (order_id uuid, from_status text, to_status text, at timestamptz DEFAULT clock_timestamp());
CREATE TABLE public.test_commission_fail (order_id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION public.store_orders_commission_lifecycle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.order_status IS NOT DISTINCT FROM OLD.order_status THEN RETURN NULL; END IF;
  INSERT INTO public.test_commission_log(order_id, from_status, to_status) VALUES (NEW.id, OLD.order_status, NEW.order_status);
  IF EXISTS (SELECT 1 FROM public.test_commission_fail WHERE order_id = NEW.id)
     AND NEW.order_status IN ('preparing','ready_for_pickup','delivering','arrived','completed') THEN
    RAISE EXCEPTION 'store_commission_charge_failed:%', 'test' USING ERRCODE = 'P0001';
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_store_orders_commission_lifecycle AFTER INSERT OR UPDATE OF order_status ON public.store_orders
  FOR EACH ROW EXECUTE FUNCTION public.store_orders_commission_lifecycle();

-- Ledger failure injector (test only): reason 'FORCE_LEDGER_FAIL' makes the ledger write fail.
CREATE OR REPLACE FUNCTION public.test_ledger_fail() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.reason = 'FORCE_LEDGER_FAIL' OR NEW.rejected_reason = 'FORCE_LEDGER_FAIL' THEN
    RAISE EXCEPTION 'forced_ledger_failure';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_test_ledger_fail BEFORE INSERT OR UPDATE ON public.store_order_cancel_requests
  FOR EACH ROW EXECUTE FUNCTION public.test_ledger_fail();

-- prod definition of the buyer request function (unchanged; used for end-to-end request -> decide)
CREATE OR REPLACE FUNCTION public.store_order_buyer_cancel_request_atomic(p_order_id uuid, p_buyer_user_id uuid, p_expected_status text, p_reason text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
  SELECT delivery_status INTO v_delivery_status FROM public.store_order_deliveries WHERE order_id = p_order_id FOR SHARE;
  SELECT * INTO v_order FROM public.store_orders WHERE id = p_order_id AND buyer_user_id = p_buyer_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'order_not_found'); END IF;
  IF coalesce(v_order.admin_locked, false) THEN RETURN jsonb_build_object('ok', false, 'error', 'order_admin_locked'); END IF;
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
    INSERT INTO public.store_order_cancel_requests (order_id, previous_order_status, requested_by, requested_role, reason, status, refund_status)
    VALUES (p_order_id, v_order.order_status, p_buyer_user_id, 'buyer', btrim(p_reason), 'pending', 'pending')
    RETURNING id INTO v_request_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cancel_request_pending');
  END;
  UPDATE public.store_orders SET order_status = 'cancel_requested', auto_complete_at = NULL, updated_at = now()
   WHERE id = p_order_id AND order_status = p_expected_status;
  IF NOT FOUND THEN RAISE EXCEPTION 'store_order_buyer_cancel_request_race'; END IF;
  RETURN jsonb_build_object('ok', true, 'order_id', p_order_id, 'request_id', v_request_id, 'previous_order_status', v_order.order_status);
END;
$function$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
