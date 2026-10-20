-- Isolated (Production-separate) DB regression for P0-1/P0-2 and P0-5.
-- Runner: local PostgreSQL 16 (not Supabase):
--   createdb -h <sock> -p 55432 -U postgres iso_p0
--   psql -h <sock> -p 55432 -U postgres -d iso_p0 -v ON_ERROR_STOP=1 -f supabase/tests/isolated/p0/p0_write_lock_and_commission_cutoff.sql
-- The functions under test are copied verbatim from
--   supabase/migrations/20270602100000_delivery_owner_p0_store_write_lock.sql
--   supabase/migrations/20270602100100_store_commission_trigger_reenable_no_backcharge.sql
-- Fixture tables keep only the columns these functions touch. Every assertion RAISEs on failure.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;

DROP TABLE IF EXISTS public.store_sale_fee_obligations, public.store_orders, public.store_products, public.stores CASCADE;
CREATE TABLE public.stores (id uuid PRIMARY KEY, owner_user_id uuid, approval_status text, is_visible boolean);
CREATE TABLE public.store_products (id uuid PRIMARY KEY, store_id uuid, product_status text);
CREATE TABLE public.store_orders (id uuid PRIMARY KEY, store_id uuid, order_status text, created_at timestamptz);
CREATE TABLE public.store_sale_fee_obligations (
  order_id uuid UNIQUE, fee_due_minor bigint, status text DEFAULT 'open',
  adjustment_status text DEFAULT 'none', adjustment_trigger text, review_flagged_at timestamptz);
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON public.stores, public.store_products TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- stub: charge = insert one obligation (idempotent), mirrors store_commission_charge_order_internal contract
CREATE OR REPLACE FUNCTION public.store_commission_charge_order_internal(p_order_id uuid, p_stage text)
RETURNS jsonb LANGUAGE plpgsql AS $fn$
BEGIN
  INSERT INTO public.store_sale_fee_obligations(order_id, fee_due_minor) VALUES (p_order_id, 7300)
  ON CONFLICT (order_id) DO NOTHING;
  RETURN jsonb_build_object('ok', true);
END $fn$;
CREATE OR REPLACE FUNCTION public.store_commission_notify_review(p uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;

-- ===== P0-1/P0-2 (verbatim from 20270602100000) =====
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.stores FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.store_products FROM anon, authenticated;
CREATE OR REPLACE FUNCTION public.block_client_role_direct_writes()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'client_role_direct_write_forbidden:%', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER trg_stores_block_client_role_writes BEFORE INSERT OR UPDATE OR DELETE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.block_client_role_direct_writes();
CREATE TRIGGER trg_store_products_block_client_role_writes BEFORE INSERT OR UPDATE OR DELETE ON public.store_products
  FOR EACH ROW EXECUTE FUNCTION public.block_client_role_direct_writes();

INSERT INTO public.stores VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000aa', 'suspended', false);
INSERT INTO public.store_products VALUES ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'hidden');

-- T1 authenticated cannot self-unsuspend (grant revoked)
DO $$ BEGIN
  BEGIN
    SET LOCAL ROLE authenticated;
    UPDATE public.stores SET approval_status = 'approved';
    RAISE EXCEPTION 'T1 FAIL: authenticated updated stores';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
END $$;

-- T2 even if grants come back (e.g. a later GRANT ALL), trigger still blocks client roles
GRANT UPDATE ON public.store_products TO authenticated;
DO $$ BEGIN
  BEGIN
    SET LOCAL ROLE authenticated;
    UPDATE public.store_products SET product_status = 'active';
    RAISE EXCEPTION 'T2 FAIL: authenticated updated store_products despite trigger';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
END $$;
REVOKE UPDATE ON public.store_products FROM authenticated;

-- T3 service_role (server API) still writes
SET ROLE service_role;
UPDATE public.store_products SET product_status = 'hidden';
RESET ROLE;
DO $$ BEGIN
  IF (SELECT approval_status FROM public.stores) <> 'suspended' THEN RAISE EXCEPTION 'T3 FAIL'; END IF;
END $$;

-- ===== P0-5 cutoff (body verbatim from 20270602100100) =====
CREATE OR REPLACE FUNCTION public.store_orders_commission_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
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
      RAISE EXCEPTION 'store_commission_charge_failed:%', coalesce(v_res->>'error', 'unknown') USING ERRCODE = 'P0001';
    END IF;
  ELSIF NEW.order_status IN ('cancelled', 'refunded') THEN
    UPDATE public.store_sale_fee_obligations
       SET adjustment_status = 'review_required', adjustment_trigger = NEW.order_status, review_flagged_at = now()
     WHERE order_id = NEW.id AND adjustment_status = 'none' AND status <> 'waived' AND fee_due_minor > 0
    RETURNING order_id INTO v_flagged;
    IF v_flagged IS NOT NULL THEN
      PERFORM public.store_commission_notify_review(v_flagged);
    END IF;
  END IF;
  RETURN NULL;
END;
$fn$;
CREATE TRIGGER trg_store_orders_commission_lifecycle AFTER INSERT OR UPDATE OF order_status ON public.store_orders
  FOR EACH ROW EXECUTE FUNCTION public.store_orders_commission_lifecycle();

INSERT INTO public.store_orders VALUES
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000001', 'accepted', '2026-09-24 13:49:06+00'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000001', 'accepted', '2026-10-21 01:00:00+00');

-- T4 old order cooking/completing -> never charged (no backcharge)
UPDATE public.store_orders SET order_status = 'preparing' WHERE id = '00000000-0000-0000-0000-0000000000b1';
UPDATE public.store_orders SET order_status = 'completed' WHERE id = '00000000-0000-0000-0000-0000000000b1';
-- T5 new order cooking -> exactly one obligation, repeated transitions idempotent
UPDATE public.store_orders SET order_status = 'preparing' WHERE id = '00000000-0000-0000-0000-0000000000b2';
UPDATE public.store_orders SET order_status = 'delivering' WHERE id = '00000000-0000-0000-0000-0000000000b2';
-- T6 cancel after charge -> review flag
UPDATE public.store_orders SET order_status = 'cancelled' WHERE id = '00000000-0000-0000-0000-0000000000b2';
DO $$ BEGIN
  IF (SELECT count(*) FROM public.store_sale_fee_obligations WHERE order_id = '00000000-0000-0000-0000-0000000000b1') <> 0 THEN
    RAISE EXCEPTION 'T4 FAIL: old order charged'; END IF;
  IF (SELECT count(*) FROM public.store_sale_fee_obligations WHERE order_id = '00000000-0000-0000-0000-0000000000b2') <> 1 THEN
    RAISE EXCEPTION 'T5 FAIL: new order obligation count'; END IF;
  IF (SELECT adjustment_status FROM public.store_sale_fee_obligations WHERE order_id = '00000000-0000-0000-0000-0000000000b2') <> 'review_required' THEN
    RAISE EXCEPTION 'T6 FAIL: cancel review flag'; END IF;
END $$;

SELECT 'P0 isolated regression: ALL PASS' AS result;
