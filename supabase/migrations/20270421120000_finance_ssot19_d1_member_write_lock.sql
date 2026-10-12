-- DIBAY Finance SSOT-19 · D1 — member write lock, legacy Coin mint revoke,
-- charge snapshot protection, settlement/Coin double-payout guard.
--
-- Defects: F-01/F-02 (member INSERT on paid-exposure tables), F-03 (member
-- INSERT/UPDATE on point_charge_requests), F-12 (legacy Coin mint functions),
-- F-08 (settlement 'paid' must never coexist with a sale_coin Coin credit).
--
-- Normal writers of these tables are service-role server routes (RLS bypass);
-- no member flow depends on the dropped policies (audit 2026-10-12).
-- No data is modified by this migration.

BEGIN;

-- ---------------------------------------------------------------------------
-- F-01 / F-02 · member direct INSERT on paid-exposure tables
-- (post_ads_insert_auth was applied manually from docs/ads-schema.sql)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS post_ads_insert_own ON public.post_ads;
DROP POLICY IF EXISTS post_ads_insert_auth ON public.post_ads;
DROP POLICY IF EXISTS point_promotion_orders_insert_own ON public.point_promotion_orders;
DROP POLICY IF EXISTS trade_post_ads_insert_own ON public.trade_post_ads;

-- ---------------------------------------------------------------------------
-- F-03 · member direct INSERT/UPDATE on point_charge_requests
-- SELECT policies (member own + admin) are kept (realtime admin alerts use them).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS point_charge_requests_insert_own ON public.point_charge_requests;
DROP POLICY IF EXISTS point_charge_requests_update_own ON public.point_charge_requests;

ALTER TABLE public.point_charge_requests
  DROP CONSTRAINT IF EXISTS point_charge_requests_point_amount_positive_chk;
ALTER TABLE public.point_charge_requests
  ADD CONSTRAINT point_charge_requests_point_amount_positive_chk
  CHECK (point_amount > 0) NOT VALID;
ALTER TABLE public.point_charge_requests
  VALIDATE CONSTRAINT point_charge_requests_point_amount_positive_chk;

ALTER TABLE public.point_charge_requests
  DROP CONSTRAINT IF EXISTS point_charge_requests_payment_amount_positive_chk;
ALTER TABLE public.point_charge_requests
  ADD CONSTRAINT point_charge_requests_payment_amount_positive_chk
  CHECK (payment_amount > 0) NOT VALID;
ALTER TABLE public.point_charge_requests
  VALIDATE CONSTRAINT point_charge_requests_payment_amount_positive_chk;

-- Snapshot columns are immutable after creation; an approved request never
-- leaves 'approved'. Applies to every role (defence in depth for service code).
CREATE OR REPLACE FUNCTION public.point_charge_requests_freeze_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.plan_id IS DISTINCT FROM OLD.plan_id
     OR NEW.payment_amount IS DISTINCT FROM OLD.payment_amount
     OR NEW.point_amount IS DISTINCT FROM OLD.point_amount
     OR NEW.applied_rate IS DISTINCT FROM OLD.applied_rate
     OR NEW.rate_version IS DISTINCT FROM OLD.rate_version THEN
    RAISE EXCEPTION 'point_charge_snapshot_immutable'
      USING ERRCODE = 'P0001';
  END IF;
  IF OLD.request_status = 'approved' AND NEW.request_status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'point_charge_approved_is_terminal'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.point_charge_requests_freeze_snapshot() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_point_charge_requests_freeze_snapshot ON public.point_charge_requests;
CREATE TRIGGER trg_point_charge_requests_freeze_snapshot
  BEFORE UPDATE ON public.point_charge_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.point_charge_requests_freeze_snapshot();

-- ---------------------------------------------------------------------------
-- F-12 · legacy Coin mint functions (sole inflow = credit_coin_from_confirmed_sale)
-- Functions are kept for history; execution is revoked from every role.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.credit_coin_from_settlement(uuid, uuid, uuid, integer, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.credit_store_economic_points_inflow(uuid, integer, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- F-08 · a settlement may become 'paid' only when the same order has no
-- sale_coin Coin credit. Paired with credit_coin_from_confirmed_sale, which locks
-- the order's settlement row and refuses to mint when it is 'paid' (D2).
-- store_settlements.order_id is UNIQUE, so the settlement row is the order lock.
-- ---------------------------------------------------------------------------
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

REVOKE ALL ON FUNCTION public.store_settlements_block_paid_when_coin_recognized() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_store_settlements_block_paid_when_coin_recognized ON public.store_settlements;
CREATE TRIGGER trg_store_settlements_block_paid_when_coin_recognized
  BEFORE INSERT OR UPDATE OF settlement_status ON public.store_settlements
  FOR EACH ROW
  EXECUTE FUNCTION public.store_settlements_block_paid_when_coin_recognized();

COMMIT;
