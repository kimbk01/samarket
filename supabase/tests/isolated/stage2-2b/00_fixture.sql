-- Isolated fixture for stage 2-B (FIN-03 option A gift rail payout, GFT-02 sale Coin cap, FIN-13 percent block).
-- NOT for Supabase projects. Runs on a throwaway local PostgreSQL 16 database only.
-- Runner: supabase/tests/isolated/stage2-2b/run.sh <pg_host_or_socket_dir> <pg_port>
-- Column definitions copied from production information_schema (read-only, 2026-10-21), trimmed to the
-- columns the functions under test touch. Helper functions copied from the production bodies:
-- block_client_role_direct_writes, internal.is_platform_admin, ensure_store_economic_point_account,
-- gift_certificate_redemption_recognized_net / _is_recognized, gift_certificate_recognize_revenue_for_completed_order.

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

CREATE TABLE public.admin_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL,
  status text NOT NULL
);

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

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type text NOT NULL CHECK (actor_type = ANY (ARRAY['admin','user','system'])),
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

CREATE TABLE public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  store_name text NOT NULL DEFAULT 'store'
);

CREATE TABLE public.store_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no text NOT NULL,
  buyer_user_id uuid NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores(id),
  order_status text NOT NULL DEFAULT 'pending',
  total_amount bigint NOT NULL DEFAULT 0,
  discount_amount bigint NOT NULL DEFAULT 0,
  payment_amount bigint NOT NULL DEFAULT 0,
  delivery_fee_amount bigint NOT NULL DEFAULT 0,
  store_funded_amount numeric NOT NULL DEFAULT 0,
  platform_funded_amount numeric NOT NULL DEFAULT 0,
  gift_redemption_amount integer NOT NULL DEFAULT 0,
  buyer_payment_method text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.store_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  order_id uuid NOT NULL UNIQUE,
  settlement_amount bigint NOT NULL DEFAULT 0,
  settlement_status text NOT NULL DEFAULT 'scheduled'
    CHECK (settlement_status = ANY (ARRAY['scheduled','processing','paid','held','cancelled'])),
  net_settlement_amount integer NOT NULL DEFAULT 0
);

CREATE TABLE public.store_economic_point_accounts (
  store_id uuid PRIMARY KEY,
  balance integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_store_economic_point_accounts_block_client_role_writes
  BEFORE INSERT OR DELETE OR UPDATE ON public.store_economic_point_accounts
  FOR EACH ROW EXECUTE FUNCTION public.block_client_role_direct_writes();

CREATE TABLE public.store_economic_point_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
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

CREATE TABLE public.gift_certificate_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.store_orders(id),
  store_id uuid NOT NULL REFERENCES public.stores(id),
  redeemed_amount integer NOT NULL CHECK (redeemed_amount > 0),
  platform_fee_amount integer NOT NULL CHECK (platform_fee_amount >= 0),
  merchant_net_amount integer NOT NULL CHECK (merchant_net_amount >= 0),
  reversed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gift_certificate_redemptions_fee_split_chk CHECK ((platform_fee_amount + merchant_net_amount) = redeemed_amount)
);

CREATE TABLE public.gift_certificate_revenue_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  redemption_id uuid REFERENCES public.gift_certificate_redemptions(id) ON DELETE SET NULL,
  entry_type text NOT NULL,
  amount integer NOT NULL,
  related_type text NOT NULL DEFAULT '',
  related_id text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gift_certificate_revenue_ledger_related_entry_uq UNIQUE (related_type, related_id, entry_type)
);
CREATE TRIGGER trg_gift_certificate_revenue_ledger_block_client_role_writes
  BEFORE INSERT OR DELETE OR UPDATE ON public.gift_certificate_revenue_ledger
  FOR EACH ROW EXECUTE FUNCTION public.block_client_role_direct_writes();

CREATE TABLE public.gift_certificate_conversion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  amount integer NOT NULL,
  status text NOT NULL DEFAULT 'REQUESTED'
);

CREATE OR REPLACE FUNCTION public.gift_certificate_redemption_recognized_net(p_redemption_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(SUM(rl.amount), 0)::integer
    FROM public.gift_certificate_revenue_ledger rl
   WHERE rl.redemption_id = p_redemption_id
     AND rl.entry_type IN ('REVENUE_AVAILABLE', 'RECOGNITION_CORRECTION', 'REVERSED');
$function$;

CREATE OR REPLACE FUNCTION public.gift_certificate_redemption_is_recognized(p_redemption_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.gift_certificate_redemption_recognized_net(p_redemption_id) > 0;
$function$;

CREATE OR REPLACE FUNCTION public.gift_certificate_recognize_revenue_for_completed_order(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.store_orders%ROWTYPE;
  v_red public.gift_certificate_redemptions%ROWTYPE;
  v_recognized_count integer := 0;
  v_skipped_count integer := 0;
  v_inserted integer;
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
    IF public.gift_certificate_redemption_is_recognized(v_red.id) THEN
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.gift_certificate_revenue_ledger (
      store_id, redemption_id, entry_type, amount, related_type, related_id
    ) VALUES (
      v_red.store_id, v_red.id, 'REVENUE_AVAILABLE', v_red.merchant_net_amount,
      'redemption', v_red.id::text || ':available'
    )
    ON CONFLICT (related_type, related_id, entry_type) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted > 0 THEN
      v_recognized_count := v_recognized_count + 1;
    ELSE
      v_skipped_count := v_skipped_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'recognized_count', v_recognized_count,
    'skipped_count', v_skipped_count,
    'coin_mint', 'deferred_to_sale_coin'
  );
END;
$function$;

-- Commission tables read by store_commission_integrity_report (trimmed).
CREATE TABLE public.store_sale_fee_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  order_id uuid NOT NULL UNIQUE,
  fee_due_minor bigint NOT NULL DEFAULT 0,
  fee_paid_minor bigint NOT NULL DEFAULT 0,
  fee_outstanding_minor bigint NOT NULL DEFAULT 0,
  original_fee_due_minor bigint,
  status text NOT NULL DEFAULT 'open',
  adjustment_status text NOT NULL DEFAULT 'none'
);
CREATE TABLE public.store_commission_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id uuid NOT NULL,
  approved_minor bigint
);
CREATE TABLE public.business_cash_accounts (
  store_id uuid PRIMARY KEY,
  balance_minor bigint NOT NULL DEFAULT 0
);
CREATE TABLE public.business_cash_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  entry_kind text NOT NULL,
  direction text NOT NULL,
  amount_minor bigint NOT NULL,
  related_type text NOT NULL DEFAULT '',
  related_id text NOT NULL DEFAULT ''
);

-- Fee policies (trimmed; prod has no CHECK on delivery_fee_mode before 20270603120300).
CREATE TABLE public.store_fee_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_name text NOT NULL,
  store_id uuid,
  fee_percent numeric NOT NULL DEFAULT 0,
  fixed_fee integer NOT NULL DEFAULT 0,
  delivery_fee_mode text NOT NULL DEFAULT 'none',
  delivery_fee_percent numeric NOT NULL DEFAULT 0
);

-- Supabase default privileges (new public objects are granted to the API roles) - mirrored so the
-- migrations' REVOKE statements are what keeps anon/authenticated out.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
