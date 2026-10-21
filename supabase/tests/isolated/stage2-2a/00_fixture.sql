-- Isolated fixture for stage 2-A (FIN-02 / FIN-12 / FIN-04 / N-4B / FIN-08 / FIN-11).
-- NOT for Supabase projects. Runs on a throwaway local PostgreSQL 16 database only.
-- Runner: supabase/tests/isolated/stage2-2a/run.sh <pg_host_or_socket_dir> <pg_port>
-- Table columns / constraints / triggers / grants copied from production (read-only information_schema,
-- pg_constraint, pg_trigger, role_table_grants, 2026-10-21), trimmed to what the functions under test touch.
-- Helper functions marked "prod" are the live pg_get_functiondef bodies. Notification helpers are STUBS.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS internal;
-- Supabase auth.role() reads the JWT role claim; here a session GUC stands in for it.
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('test.jwt_role', true), ''), 'anon')
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA internal TO service_role;

CREATE TABLE auth.users (id uuid PRIMARY KEY);

CREATE TABLE public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  store_name text
);

CREATE TABLE public.store_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no text NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores(id),
  order_status text NOT NULL DEFAULT 'pending',
  platform_funded_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.admin_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL,
  status text NOT NULL
);

CREATE TABLE public.admin_settings (
  key text PRIMARY KEY,
  value_json jsonb,
  updated_at timestamptz DEFAULT now(),
  updated_by_admin_id uuid
);

CREATE TABLE public.audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_type text NOT NULL CHECK (actor_type = ANY (ARRAY['admin'::text, 'user'::text, 'system'::text])),
  actor_id uuid,
  target_type text NOT NULL,
  target_id text NOT NULL,
  action text NOT NULL,
  before_json jsonb,
  after_json jsonb,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- prod
CREATE OR REPLACE FUNCTION public.block_client_role_direct_writes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'client_role_direct_write_forbidden:%', TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TABLE public.business_cash_accounts (
  store_id uuid NOT NULL PRIMARY KEY REFERENCES public.stores(id) ON DELETE RESTRICT,
  balance_minor bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_cash_accounts_balance_nonneg_chk CHECK ((balance_minor >= 0))
);

CREATE TABLE public.business_cash_ledger (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  entry_kind text NOT NULL CHECK ((entry_kind = ANY (ARRAY['TOP_UP'::text, 'CONVERT_FROM_STORE_POINTS'::text, 'AD_SPEND'::text, 'AD_REFUND'::text, 'PARTNER_SPEND'::text, 'PARTNER_REFUND'::text, 'SALE_FEE'::text, 'SALE_FEE_SETTLEMENT'::text, 'SALE_FEE_REVERSAL'::text, 'ADMIN_ADJUST'::text, 'SYSTEM'::text]))),
  direction text NOT NULL CHECK ((direction = ANY (ARRAY['credit'::text, 'debit'::text]))),
  amount_minor bigint NOT NULL CHECK ((amount_minor > 0)),
  balance_after_minor bigint NOT NULL,
  related_type text NOT NULL DEFAULT ''::text,
  related_id text NOT NULL DEFAULT ''::text,
  idempotency_key text NOT NULL,
  actor_type text NOT NULL DEFAULT 'system'::text,
  actor_user_id uuid,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_cash_ledger_idem_uidx UNIQUE (idempotency_key)
);
-- prod
CREATE OR REPLACE FUNCTION public.business_cash_ledger_forbid_mutate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RAISE EXCEPTION 'business_cash_ledger is immutable';
END;
$function$;
CREATE TRIGGER business_cash_ledger_no_update BEFORE DELETE OR UPDATE ON public.business_cash_ledger
  FOR EACH ROW EXECUTE FUNCTION public.business_cash_ledger_forbid_mutate();

CREATE TABLE public.business_cash_charge_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_minor bigint NOT NULL CHECK ((amount_minor > 0)),
  status text NOT NULL DEFAULT 'PENDING'::text
    CHECK ((status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'REJECTED'::text, 'CANCELLED'::text]))),
  idempotency_key text NOT NULL,
  admin_user_id uuid,
  decided_at timestamptz,
  reject_reason text,
  credit_ledger_id uuid REFERENCES public.business_cash_ledger(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_cash_charge_requests_idem_uidx UNIQUE (idempotency_key)
);
CREATE INDEX business_cash_charge_requests_store_idx
  ON public.business_cash_charge_requests USING btree (store_id, status, created_at DESC);
CREATE TRIGGER trg_business_cash_charge_requests_block_client_role_writes
  BEFORE INSERT OR DELETE OR UPDATE ON public.business_cash_charge_requests
  FOR EACH ROW EXECUTE FUNCTION public.block_client_role_direct_writes();

CREATE TABLE public.store_sale_fee_obligations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES public.store_orders(id) ON DELETE RESTRICT,
  settlement_id uuid,
  confirmed_revenue_php integer NOT NULL CHECK ((confirmed_revenue_php >= 0)),
  fee_due_minor bigint NOT NULL CHECK ((fee_due_minor >= 0)),
  fee_paid_minor bigint NOT NULL DEFAULT 0 CHECK ((fee_paid_minor >= 0)),
  fee_outstanding_minor bigint NOT NULL CHECK ((fee_outstanding_minor >= 0)),
  status text NOT NULL DEFAULT 'open'::text CHECK ((status = ANY (ARRAY['open'::text, 'settled'::text, 'waived'::text]))),
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  charge_stage text NOT NULL DEFAULT 'completed'::text,
  fee_snapshot jsonb,
  adjustment_status text NOT NULL DEFAULT 'none'::text
    CHECK ((adjustment_status = ANY (ARRAY['none'::text, 'review_required'::text, 'refunded'::text, 'kept'::text]))),
  adjustment_trigger text,
  review_flagged_at timestamptz,
  original_fee_due_minor bigint,
  CONSTRAINT store_sale_fee_obligations_amounts_chk CHECK (((fee_paid_minor + fee_outstanding_minor) = fee_due_minor)),
  CONSTRAINT store_sale_fee_obligations_idem_uq UNIQUE (idempotency_key),
  CONSTRAINT store_sale_fee_obligations_order_uq UNIQUE (order_id),
  CONSTRAINT store_sale_fee_obligations_original_chk CHECK (((original_fee_due_minor IS NULL) OR (original_fee_due_minor >= fee_due_minor)))
);

CREATE TABLE public.store_commission_adjustments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  obligation_id uuid NOT NULL REFERENCES public.store_sale_fee_obligations(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES public.store_orders(id) ON DELETE RESTRICT,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK ((decision = ANY (ARRAY['approve'::text, 'reject'::text, 'legacy_auto'::text]))),
  trigger_status text NOT NULL,
  fee_charged_minor bigint NOT NULL,
  fee_paid_minor_before bigint NOT NULL,
  fee_outstanding_minor_before bigint NOT NULL,
  approved_minor bigint NOT NULL,
  cash_refund_minor bigint NOT NULL,
  outstanding_cancel_minor bigint NOT NULL,
  reason text NOT NULL,
  admin_user_id uuid,
  cash_ledger_id uuid REFERENCES public.business_cash_ledger(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_commission_adjustments_idem_uq UNIQUE (idempotency_key),
  CONSTRAINT store_commission_adjustments_one_per_obligation UNIQUE (obligation_id),
  CONSTRAINT store_commission_adjustments_split_chk CHECK ((approved_minor = (cash_refund_minor + outstanding_cancel_minor))),
  CONSTRAINT store_commission_adjustments_ledger_chk CHECK (((cash_refund_minor > 0) = (cash_ledger_id IS NOT NULL)))
);

CREATE TABLE public.store_economic_point_accounts (
  store_id uuid NOT NULL PRIMARY KEY REFERENCES public.stores(id) ON DELETE RESTRICT,
  balance integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_store_economic_point_accounts_block_client_role_writes
  BEFORE INSERT OR DELETE OR UPDATE ON public.store_economic_point_accounts
  FOR EACH ROW EXECUTE FUNCTION public.block_client_role_direct_writes();

CREATE TABLE public.store_economic_point_ledger (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  entry_kind text NOT NULL CHECK ((entry_kind = ANY (ARRAY['ECONOMIC_INFLOW'::text, 'SALE_EARN'::text, 'GIFT_REDEMPTION_EARN'::text, 'REVERSAL'::text, 'CONVERT_TO_BUSINESS_CASH'::text, 'WITHDRAWAL'::text, 'WITHDRAWAL_REQUEST'::text, 'WITHDRAWAL_COMPLETE'::text, 'WITHDRAWAL_REJECT'::text, 'WITHDRAWAL_RELEASE'::text, 'ADMIN_ADJUST'::text, 'SYSTEM'::text]))),
  amount integer NOT NULL,
  balance_after integer NOT NULL,
  related_type text NOT NULL DEFAULT ''::text,
  related_id text NOT NULL DEFAULT ''::text,
  idempotency_key text NOT NULL,
  actor_type text NOT NULL DEFAULT 'system'::text,
  actor_user_id uuid,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_economic_point_ledger_idem_uidx UNIQUE (idempotency_key)
);
-- prod
CREATE OR REPLACE FUNCTION public.store_economic_point_ledger_forbid_mutate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RAISE EXCEPTION 'store_economic_point_ledger is immutable';
END;
$function$;
CREATE TRIGGER store_economic_point_ledger_no_update BEFORE DELETE OR UPDATE ON public.store_economic_point_ledger
  FOR EACH ROW EXECUTE FUNCTION public.store_economic_point_ledger_forbid_mutate();

-- prod grants (role_table_grants 2026-10-21)
GRANT SELECT, REFERENCES, TRIGGER ON public.business_cash_accounts, public.business_cash_ledger,
  public.store_economic_point_accounts, public.store_economic_point_ledger TO anon, authenticated, service_role;
GRANT SELECT, REFERENCES, TRIGGER ON public.business_cash_charge_requests TO anon, authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, REFERENCES, TRIGGER ON public.business_cash_charge_requests TO service_role;
GRANT SELECT ON public.stores, public.store_orders, public.store_sale_fee_obligations TO service_role;

-- prod
CREATE OR REPLACE FUNCTION public.ensure_business_cash_account(p_store_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.business_cash_accounts (store_id, balance_minor)
  VALUES (p_store_id, 0)
  ON CONFLICT (store_id) DO NOTHING;
END;
$function$;

-- prod
CREATE OR REPLACE FUNCTION public.ensure_store_economic_point_account(p_store_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.store_economic_point_accounts (store_id, balance)
  VALUES (p_store_id, 0)
  ON CONFLICT (store_id) DO NOTHING;
END;
$function$;

-- prod
CREATE OR REPLACE FUNCTION internal.is_platform_admin(check_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT check_uid IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.admin_memberships m
      WHERE m.user_id = check_uid
        AND m.status = 'active'
        AND m.role IN ('admin', 'super_admin')
    );
$function$;

-- prod
CREATE OR REPLACE FUNCTION public.is_platform_admin(check_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'internal'
AS $function$
  SELECT internal.is_platform_admin(check_uid);
$function$;

-- prod
CREATE OR REPLACE FUNCTION public.store_cash_order_gate_mode()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN (SELECT value_json->>'value' FROM public.admin_settings WHERE key = 'store_cash_order_gate')
         = 'block_when_not_positive'
      THEN 'block_when_not_positive'
    ELSE 'off'
  END;
$function$;

-- STUBS for the exception scan: notifications are captured by source_key (dedup like the outbox).
CREATE TABLE public.admin_notification_outbox (source_key text PRIMARY KEY, kind text, payload jsonb);
CREATE OR REPLACE FUNCTION public.store_commission_notify_admin(
  p_source_key text, p_kind text, p_severity text, p_title text, p_body text, p_href text, p_entity_type text, p_entity_id text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.admin_notification_outbox(source_key, kind, payload)
  VALUES (p_source_key, p_kind, jsonb_build_object('title', p_title, 'body', p_body))
  ON CONFLICT (source_key) DO NOTHING;
  RETURN FOUND;
END $$;
CREATE OR REPLACE FUNCTION public.store_commission_notify_review(p_obligation_id uuid) RETURNS boolean
LANGUAGE sql AS $$ SELECT false $$;
CREATE OR REPLACE FUNCTION public.store_commission_php_text(p_minor bigint) RETURNS text
LANGUAGE sql AS $$ SELECT 'PHP ' || (p_minor / 100)::text $$;
CREATE TABLE public.test_payable_rows (row jsonb);
CREATE OR REPLACE FUNCTION public.store_platform_payable_page(
  p_store_ids uuid[], p_from timestamptz, p_to timestamptz, p_tab text, p_limit integer, p_offset integer)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('rows', coalesce((SELECT jsonb_agg(row) FROM public.test_payable_rows), '[]'::jsonb))
$$;
