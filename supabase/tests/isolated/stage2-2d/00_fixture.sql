-- Isolated fixture for stage 2-D gift certificate (GFT-01 / GFT-07 / GFT-08).
-- NOT for Supabase projects. Runs on a throwaway local PostgreSQL 16 database only.
-- Runner: supabase/tests/isolated/stage2-2d/run.sh <pg_host> <pg_port>
-- Column definitions copied from production information_schema (read-only, 2026-10-21), trimmed to the
-- columns the functions under test touch. Unique indexes mirrored from prod (gift ledger related entry,
-- point_ledger gift purchase, ownership seq, public number, redemption idempotency). Helper functions copied
-- from prod (issue_date, resolve_validity_at_issue [NO_EXPIRY branch], sum/project point ledger); promo
-- functions are STUBS. The two wrappers (gift_certificate_cancel_order_restore / gift_certificate_refund_order_atomic)
-- are the production bodies (md5 d3b8126d739a4161edeafaf57f41cc49 / cb3267c206e2da28ee69aa5a3d31bef5), owned by postgres.

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
GRANT EXECUTE ON FUNCTION auth.role() TO anon, authenticated, service_role;

CREATE TABLE public.profiles (id uuid PRIMARY KEY, points integer NOT NULL DEFAULT 0);

CREATE TABLE public.store_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  buyer_user_id uuid NOT NULL,
  payment_status text NOT NULL DEFAULT 'pending',
  order_status text NOT NULL DEFAULT 'pending',
  gift_redemption_amount integer NOT NULL DEFAULT 0,
  refunded_at timestamptz,
  refund_approved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.store_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  status text NOT NULL
);

CREATE TABLE public.gift_certificate_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid,
  title text NOT NULL,
  face_value integer NOT NULL,
  purchase_price integer NOT NULL,
  platform_fee_rate integer NOT NULL DEFAULT 10,
  discount_funding_party text NOT NULL DEFAULT 'NONE',
  platform_funded_units integer NOT NULL DEFAULT 0,
  merchant_funded_units integer NOT NULL DEFAULT 0,
  sales_starts_at timestamptz NOT NULL DEFAULT now() - interval '1 day',
  sales_ends_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  max_issuance integer,
  issued_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  gift_scope text NOT NULL DEFAULT 'STORE',
  archived_at timestamptz,
  expiry_policy text NOT NULL DEFAULT 'NO_EXPIRY',
  validity_days integer,
  fixed_valid_until date,
  mall_visible boolean NOT NULL DEFAULT true
);

CREATE OR REPLACE FUNCTION public.generate_gift_public_number() RETURNS text LANGUAGE sql AS $$
  SELECT 'GFT-' || upper(substr(md5(gen_random_uuid()::text), 1, 10))
$$;

CREATE TABLE public.gift_certificate_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  store_id uuid,
  purchaser_user_id uuid NOT NULL,
  current_owner_user_id uuid NOT NULL,
  face_value integer NOT NULL,
  purchase_price integer NOT NULL,
  remaining_balance integer NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  version integer NOT NULL DEFAULT 1,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  fully_redeemed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  public_gift_number text NOT NULL DEFAULT public.generate_gift_public_number(),
  gift_scope text NOT NULL DEFAULT 'STORE',
  purchase_discount_amount integer NOT NULL DEFAULT 0,
  discount_funding_party_snapshot text NOT NULL DEFAULT 'UNKNOWN_LEGACY',
  platform_fee_rate_snapshot integer NOT NULL DEFAULT 0,
  valid_from date NOT NULL DEFAULT current_date,
  valid_until date
);
CREATE UNIQUE INDEX gift_certificate_instances_public_number_uq ON public.gift_certificate_instances (public_gift_number);

CREATE TABLE public.gift_certificate_ownership_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL,
  seq integer NOT NULL,
  event_type text NOT NULL,
  from_user_id uuid,
  to_user_id uuid,
  actor_user_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX gift_certificate_ownership_events_instance_seq_uq
  ON public.gift_certificate_ownership_events (instance_id, seq);

CREATE TABLE public.gift_certificate_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid,
  store_id uuid,
  user_id uuid,
  entry_type text NOT NULL,
  amount integer NOT NULL,
  related_type text NOT NULL DEFAULT '',
  related_id text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  actor_type text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX gift_certificate_ledger_related_entry_uq
  ON public.gift_certificate_ledger (related_type, related_id, entry_type);

CREATE TABLE public.gift_certificate_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  instance_id uuid NOT NULL,
  store_id uuid NOT NULL,
  buyer_user_id uuid NOT NULL,
  redeemed_amount integer NOT NULL,
  platform_fee_amount integer NOT NULL DEFAULT 0,
  merchant_net_amount integer NOT NULL DEFAULT 0,
  platform_fee_rate_snapshot integer NOT NULL DEFAULT 0,
  reversed boolean NOT NULL DEFAULT false,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz,
  forfeited_amount integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX gift_certificate_redemptions_idempotency_uq ON public.gift_certificate_redemptions (idempotency_key);

CREATE TABLE public.gift_certificate_revenue_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  redemption_id uuid,
  entry_type text NOT NULL,
  amount integer NOT NULL,
  related_type text NOT NULL DEFAULT '',
  related_id text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.store_economic_point_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  entry_kind text NOT NULL,
  amount integer NOT NULL,
  related_type text,
  related_id text
);

CREATE TABLE public.point_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entry_type text NOT NULL,
  amount integer NOT NULL,
  balance_after integer NOT NULL,
  related_type text NOT NULL DEFAULT 'admin_manual',
  related_id text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  actor_type text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text
);
CREATE UNIQUE INDEX uq_point_ledger_gift_certificate_purchase ON public.point_ledger (user_id, related_type, related_id)
  WHERE (related_type = 'gift_certificate_purchase');

-- prod helper bodies
CREATE OR REPLACE FUNCTION public.sum_user_point_ledger(p_user_id uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT COALESCE(SUM(amount), 0)::integer FROM public.point_ledger WHERE user_id = p_user_id;
$function$;

CREATE OR REPLACE FUNCTION public.project_user_point_balance_from_ledger(p_user_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_sum integer;
BEGIN
  IF p_user_id IS NULL THEN RETURN 0; END IF;
  v_sum := public.sum_user_point_ledger(p_user_id);
  UPDATE public.profiles SET points = v_sum WHERE id = p_user_id;
  RETURN v_sum;
END;
$function$;

CREATE OR REPLACE FUNCTION public.gift_certificate_issue_date(p_at timestamptz DEFAULT now()) RETURNS date
LANGUAGE sql STABLE SET search_path TO 'public' AS $function$
  SELECT (coalesce(p_at, now()) AT TIME ZONE 'Asia/Manila')::date;
$function$;

CREATE OR REPLACE FUNCTION public.gift_certificate_resolve_validity_at_issue(
  p_expiry_policy text, p_validity_days integer, p_fixed_valid_until date, p_issue_date date)
RETURNS TABLE(valid_from date, valid_until date) LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $function$
BEGIN
  IF p_issue_date IS NULL THEN RAISE EXCEPTION 'invalid_issue_date'; END IF;
  IF p_expiry_policy = 'NO_EXPIRY' THEN
    valid_from := p_issue_date; valid_until := NULL; RETURN NEXT; RETURN;
  END IF;
  RAISE EXCEPTION 'invalid_expiry_policy';
END;
$function$;

-- STUBS (promo economics out of scope)
CREATE OR REPLACE FUNCTION public.gift_certificate_promo_reverse_for_redemption(p_redemption_id uuid) RETURNS jsonb
LANGUAGE sql AS $$ SELECT jsonb_build_object('ok', true, 'stub', true) $$;
CREATE OR REPLACE FUNCTION public.gift_certificate_promo_accrue_for_instance(
  p_instance_id uuid, p_store_id uuid, p_gap integer, p_owner_units integer, p_dibay_units integer,
  p_funding_party text, p_idempotency_key text) RETURNS jsonb
LANGUAGE sql AS $$ SELECT jsonb_build_object('ok', true, 'stub', true) $$;

-- Pre-migration state of the GFT-01 function: prod ACL = postgres + service_role EXECUTE.
-- (placeholder body; the migration under test replaces it, grants persist like in prod)
CREATE OR REPLACE FUNCTION public.gift_certificate_redemption_reverse(p_order_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER AS $$ SELECT '{"ok":true,"placeholder":true}'::jsonb $$;
REVOKE ALL ON FUNCTION public.gift_certificate_redemption_reverse(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gift_certificate_redemption_reverse(uuid) TO service_role;

-- production wrapper bodies (unchanged by 2-D)
CREATE OR REPLACE FUNCTION public.gift_certificate_cancel_order_restore(p_order_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
  SELECT * INTO v_order FROM public.store_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;
  IF v_order.order_status IS DISTINCT FROM 'cancelled'
     AND coalesce(v_order.payment_status, '') IS DISTINCT FROM 'failed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_cancelled', 'order_status', v_order.order_status);
  END IF;
  v_reverse := public.gift_certificate_redemption_reverse(p_order_id);
  IF coalesce(v_reverse->>'ok', 'false') <> 'true' THEN
    RETURN jsonb_build_object('ok', false, 'error', coalesce(v_reverse->>'error', 'gift_reverse_failed'),
      'gift_reverse', v_reverse);
  END IF;
  RETURN jsonb_build_object('ok', true, 'order_id', p_order_id,
    'idempotent', coalesce((v_reverse->>'idempotent')::boolean, false)
      OR coalesce((v_reverse->>'reversed_count')::int, 0) = 0,
    'gift_reverse', v_reverse);
END;
$function$;

CREATE OR REPLACE FUNCTION public.gift_certificate_refund_order_atomic(p_order_id uuid, p_actor_user_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
  SELECT * INTO v_order FROM public.store_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;
  IF v_order.order_status = 'refunded' THEN
    v_reverse := public.gift_certificate_redemption_reverse(p_order_id);
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'order_id', p_order_id, 'gift_reverse', v_reverse);
  END IF;
  IF v_order.order_status IS DISTINCT FROM 'refund_requested' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unexpected_from_status', 'order_status', v_order.order_status);
  END IF;
  -- Gift reverse FIRST in same TX. Failure => RAISE => refund not terminal.
  v_reverse := public.gift_certificate_redemption_reverse(p_order_id);
  IF coalesce(v_reverse->>'ok', 'false') <> 'true' THEN
    RAISE EXCEPTION 'gift_reverse_failed: %', coalesce(v_reverse->>'error', 'unknown');
  END IF;
  UPDATE public.store_orders
     SET order_status = 'refunded', payment_status = 'refunded',
         refunded_at = coalesce(refunded_at, now()), refund_approved_at = coalesce(refund_approved_at, now()),
         updated_at = now()
   WHERE id = p_order_id AND order_status = 'refund_requested';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gift_refund_status_race';
  END IF;
  UPDATE public.store_payments SET status = 'refunded' WHERE order_id = p_order_id AND status = 'succeeded';
  RETURN jsonb_build_object('ok', true, 'order_id', p_order_id, 'gift_reverse', v_reverse);
END;
$function$;
REVOKE ALL ON FUNCTION public.gift_certificate_cancel_order_restore(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gift_certificate_refund_order_atomic(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gift_certificate_cancel_order_restore(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.gift_certificate_refund_order_atomic(uuid, uuid) TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
