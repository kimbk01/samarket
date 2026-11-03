-- 금융 P0 격리 검증용 로컬 PostgreSQL 스키마 (운영 DB 와 무관 · 익명 합성 데이터만)
-- 운영과의 차이 (보고 대상):
--   * auth.role()/auth.uid() 는 request.jwt.claim.role 설정으로 흉내 낸 스텁
--   * profiles 는 id·points 만, 가드 트리거는 「service_role 이 아니면 points 변경 금지」 규칙만
--   * stores 는 id·owner_user_id 만, is_platform_admin 은 항상 false 스텁
--   * 테이블 열·기본값은 운영 information_schema 를 그대로 옮김 (2026-11-03 읽기 전용 조회)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN
  CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE OR REPLACE FUNCTION public.is_platform_admin(p uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;

CREATE TABLE public.profiles (id uuid PRIMARY KEY REFERENCES auth.users(id), points integer NOT NULL DEFAULT 0, nickname text);
CREATE OR REPLACE FUNCTION public.guard_profiles_points_stub() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND NEW.points IS DISTINCT FROM OLD.points THEN
    RAISE EXCEPTION 'profiles_points_direct_update_forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_profiles_guard BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_profiles_points_stub();

CREATE TABLE public.point_ledger (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_type text NOT NULL, amount integer NOT NULL, balance_after integer NOT NULL,
  related_type text NOT NULL DEFAULT 'admin_manual', related_id text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '', actor_type text NOT NULL DEFAULT 'system',
  earned_at timestamptz, expires_at timestamptz, expired_amount integer,
  created_at timestamptz NOT NULL DEFAULT now(), actor_id uuid, idempotency_key text
);
CREATE UNIQUE INDEX point_ledger_refund_release_once_uidx ON public.point_ledger (user_id, related_type, related_id, entry_type)
  WHERE entry_type IN ('ad_refund', 'ad_hold_release');
CREATE UNIQUE INDEX uq_point_ledger_promotion_order_once ON public.point_ledger (related_type, related_id, entry_type)
  WHERE related_type = 'promotion_order' AND entry_type IN ('spend', 'ad_hold', 'ad_purchase', 'ad_hold_release');

CREATE OR REPLACE FUNCTION public.sum_user_point_ledger(p_user_id uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT COALESCE(SUM(amount), 0)::integer FROM public.point_ledger WHERE user_id = p_user_id;
$function$;

CREATE TABLE public.stores (id uuid PRIMARY KEY, owner_user_id uuid);
CREATE TABLE public.business_cash_conversion_rate_policies (
  id text NOT NULL DEFAULT 'default' PRIMARY KEY, rate_pesos_per_point numeric(18,8) NOT NULL DEFAULT 1,
  version integer NOT NULL DEFAULT 1, effective_from timestamptz NOT NULL DEFAULT now(), updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(), conversion_enabled boolean NOT NULL DEFAULT true,
  minimum_coin_per_conversion integer NOT NULL DEFAULT 1, conversion_unit integer NOT NULL DEFAULT 1,
  maximum_conversions_per_day integer, maximum_conversions_per_week integer, maximum_conversions_per_month integer,
  minimum_interval_hours integer, daily_limit_coin integer, monthly_limit_coin integer
);
CREATE TABLE public.store_economic_point_accounts (store_id uuid PRIMARY KEY, balance integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.store_economic_point_ledger (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, store_id uuid NOT NULL, entry_kind text NOT NULL,
  amount integer NOT NULL, balance_after integer NOT NULL, related_type text NOT NULL DEFAULT '',
  related_id text NOT NULL DEFAULT '', idempotency_key text NOT NULL UNIQUE, actor_type text NOT NULL DEFAULT 'system',
  actor_user_id uuid, meta jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.business_cash_accounts (store_id uuid PRIMARY KEY, balance_minor bigint NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.business_cash_ledger (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, store_id uuid NOT NULL, entry_kind text NOT NULL,
  direction text NOT NULL, amount_minor bigint NOT NULL, balance_after_minor bigint NOT NULL,
  related_type text NOT NULL DEFAULT '', related_id text NOT NULL DEFAULT '', idempotency_key text NOT NULL UNIQUE,
  actor_type text NOT NULL DEFAULT 'system', actor_user_id uuid, meta jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.store_sale_fee_obligations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, store_id uuid NOT NULL, order_id uuid NOT NULL,
  settlement_id uuid, confirmed_revenue_php integer NOT NULL DEFAULT 0, fee_due_minor bigint NOT NULL,
  fee_paid_minor bigint NOT NULL DEFAULT 0, fee_outstanding_minor bigint NOT NULL, status text NOT NULL DEFAULT 'open',
  idempotency_key text NOT NULL DEFAULT gen_random_uuid()::text, created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);
CREATE OR REPLACE FUNCTION public.forbid_mutate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '% is immutable', TG_TABLE_NAME; END $$;
CREATE TRIGGER business_cash_ledger_no_update BEFORE UPDATE OR DELETE ON public.business_cash_ledger FOR EACH ROW EXECUTE FUNCTION public.forbid_mutate();
CREATE TRIGGER store_economic_point_ledger_no_update BEFORE UPDATE OR DELETE ON public.store_economic_point_ledger FOR EACH ROW EXECUTE FUNCTION public.forbid_mutate();

CREATE OR REPLACE FUNCTION public.ensure_business_cash_account(p_store_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN INSERT INTO public.business_cash_accounts (store_id, balance_minor) VALUES (p_store_id, 0) ON CONFLICT (store_id) DO NOTHING; END;
$function$;
CREATE OR REPLACE FUNCTION public.ensure_store_economic_point_account(p_store_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN INSERT INTO public.store_economic_point_accounts (store_id, balance) VALUES (p_store_id, 0) ON CONFLICT (store_id) DO NOTHING; END;
$function$;

-- P1 (DB 2건) 검증용 — 운영 열 구성 그대로 (2026-11-03 읽기 전용 조회)
CREATE TABLE public.point_action_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, action_type text NOT NULL, actor_type text NOT NULL,
  actor_id text NOT NULL DEFAULT '', actor_nickname text NOT NULL DEFAULT '', target_user_id uuid NOT NULL,
  target_user_nickname text NOT NULL DEFAULT '', related_id text NOT NULL DEFAULT '', note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.point_charge_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, user_id uuid NOT NULL, plan_id text NOT NULL DEFAULT '',
  plan_name text NOT NULL DEFAULT '', payment_method text NOT NULL DEFAULT 'manual_confirm', payment_amount integer NOT NULL DEFAULT 0,
  point_amount integer NOT NULL DEFAULT 0, request_status text NOT NULL DEFAULT 'pending', depositor_name text NOT NULL DEFAULT '',
  receipt_image_url text NOT NULL DEFAULT '', requested_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.point_expire_policies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, policy_name text NOT NULL, is_active boolean NOT NULL DEFAULT true,
  expire_after_days integer NOT NULL, min_balance_to_expire integer, exclude_entry_types text[] NOT NULL DEFAULT '{}',
  allow_user_view boolean NOT NULL DEFAULT true, auto_expire_enabled boolean NOT NULL DEFAULT true, run_cycle text NOT NULL DEFAULT 'daily',
  admin_memo text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.point_expire_executions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, execution_date date NOT NULL, policy_id uuid NOT NULL,
  target_user_id uuid NOT NULL, target_user_nickname text NOT NULL DEFAULT '', total_candidate_point integer NOT NULL DEFAULT 0,
  expired_point integer NOT NULL DEFAULT 0, remaining_point integer NOT NULL DEFAULT 0, execution_status text NOT NULL DEFAULT 'success',
  reason text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.point_expire_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, execution_id uuid NOT NULL, ledger_entry_id uuid NOT NULL,
  user_id uuid NOT NULL, user_nickname text NOT NULL DEFAULT '', expired_point integer NOT NULL, expires_at timestamptz NOT NULL,
  action_type text NOT NULL, actor_type text NOT NULL, note text, created_at timestamptz NOT NULL DEFAULT now()
);
