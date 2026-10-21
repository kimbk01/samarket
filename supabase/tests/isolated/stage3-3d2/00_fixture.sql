-- Isolated fixture for stage 3-D part 2 (ADS-03 / ADS-04 / ADS-05 / ADS-13).
-- NOT for Supabase projects. Runs on a throwaway local PostgreSQL 16 database only.
-- Runner: supabase/tests/isolated/stage3-3d2/run.sh <pg_host> <pg_port>
-- Column definitions / constraints / indexes copied from production information_schema + pg_constraint +
-- pg_indexes (read-only, 2026-10-21), trimmed to the columns the functions under test touch.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);

-- Stub: prod is_platform_admin(uuid) delegates to internal.is_platform_admin.
CREATE TABLE public.t_admins (id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION public.is_platform_admin(check_uid uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT EXISTS (SELECT 1 FROM public.t_admins WHERE id = check_uid) $$;

CREATE TABLE public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  approval_status text NOT NULL DEFAULT 'approved',
  is_visible boolean NOT NULL DEFAULT true
);

CREATE TABLE public.business_cash_accounts (
  store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE RESTRICT,
  balance_minor bigint NOT NULL DEFAULT 0 CONSTRAINT business_cash_accounts_balance_nonneg_chk CHECK (balance_minor >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.business_cash_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  entry_kind text NOT NULL CHECK (entry_kind = ANY (ARRAY['TOP_UP','CONVERT_FROM_STORE_POINTS','AD_SPEND','AD_REFUND','PARTNER_SPEND','PARTNER_REFUND','SALE_FEE','SALE_FEE_SETTLEMENT','SALE_FEE_REVERSAL','ADMIN_ADJUST','SYSTEM'])),
  direction text NOT NULL CHECK (direction = ANY (ARRAY['credit','debit'])),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  balance_after_minor bigint NOT NULL,
  related_type text NOT NULL DEFAULT '',
  related_id text NOT NULL DEFAULT '',
  idempotency_key text NOT NULL CONSTRAINT business_cash_ledger_idem_uidx UNIQUE,
  actor_type text NOT NULL DEFAULT 'system',
  actor_user_id uuid,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.delivery_ad_canonical_bc_fundings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id),
  product_kind text NOT NULL CHECK (product_kind = ANY (ARRAY['store_sponsored','banner','partner','platform_popup'])),
  application_id uuid NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL DEFAULT 'PHP',
  spend_ledger_id uuid NOT NULL REFERENCES public.business_cash_ledger(id),
  refund_ledger_id uuid REFERENCES public.business_cash_ledger(id),
  status text NOT NULL CHECK (status = ANY (ARRAY['SECURED','REFUNDED'])),
  secured_at timestamptz NOT NULL DEFAULT now(),
  refunded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_ad_canonical_bc_fundings_app_uidx UNIQUE (product_kind, application_id)
);

-- Referenced by %ROWTYPE in the spend function (banner / sponsored branches unused here).
CREATE TABLE public.delivery_ad_campaign_commercial_snapshots (
  campaign_id uuid, product_kind text, campaign_source text, commercial_status text, final_payable_minor bigint
);
CREATE TABLE public.store_banner_ad_campaigns (
  id uuid PRIMARY KEY, store_id uuid, owner_user_id uuid, lifecycle_status text, campaign_source text
);
CREATE TABLE public.store_paid_ad_campaigns (
  id uuid PRIMARY KEY, store_id uuid, owner_user_id uuid, lifecycle_status text, campaign_source text
);

CREATE TABLE public.delivery_ad_partner_config (
  id text PRIMARY KEY DEFAULT 'default',
  enabled boolean NOT NULL DEFAULT false,
  monthly_fee_minor bigint,
  currency text NOT NULL DEFAULT 'PHP',
  advertising_discount_percent integer NOT NULL DEFAULT 0,
  benefit_json jsonb NOT NULL DEFAULT '{"advertising_package_discount": true}'::jsonb,
  accepting_new_members boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.delivery_ad_partner_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'NONE'
    CONSTRAINT delivery_ad_partner_memberships_status_check
    CHECK (status = ANY (ARRAY['NONE','PENDING_REVIEW','ACTIVE','PAST_DUE','CANCEL_PENDING','ENDED','REJECTED'])),
  period_start timestamptz,
  period_end timestamptz,
  fee_snapshot_minor bigint CHECK (fee_snapshot_minor IS NULL OR fee_snapshot_minor >= 0),
  currency text NOT NULL DEFAULT 'PHP',
  benefit_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  advertising_discount_percent_snapshot integer NOT NULL DEFAULT 0
    CHECK (advertising_discount_percent_snapshot >= 0 AND advertising_discount_percent_snapshot <= 100),
  config_version_snapshot integer,
  cancel_requested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX delivery_ad_partner_memberships_store_status_idx
  ON public.delivery_ad_partner_memberships (store_id, status, period_end DESC);

CREATE TABLE public.delivery_ad_commercial_override_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type = ANY (ARRAY['package','placement_commercial','product','extension_policy','partner_config','campaign_commercial','partner_membership'])),
  entity_id text NOT NULL,
  actor_user_id uuid NOT NULL,
  reason text NOT NULL,
  before_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.platform_popup_owner_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  request_status text NOT NULL DEFAULT 'draft'
    CHECK (request_status = ANY (ARRAY['draft','submitted','under_review','revision_required','approved','rejected','cancelled'])),
  payment_status text NOT NULL DEFAULT 'unfunded'
    CHECK (payment_status = ANY (ARRAY['unfunded','funded','refunded','failed'])),
  package_id uuid,
  price_minor bigint CHECK (price_minor IS NULL OR price_minor > 0),
  currency text NOT NULL DEFAULT 'BUSINESS_CASH',
  requested_surfaces text[] NOT NULL DEFAULT ARRAY['GLOBAL'],
  requested_start_at timestamptz,
  requested_end_at timestamptz,
  creative_asset_path text,
  creative_asset_url text,
  revision_reason text,
  submit_idempotency_key text CONSTRAINT platform_popup_owner_requests_submit_idem_uidx UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  CONSTRAINT platform_popup_owner_requests_window_check CHECK (requested_start_at IS NULL OR requested_end_at IS NULL OR requested_start_at < requested_end_at)
);

-- Seed: admin, owner, stores, partner config (fee 100.00 PHP = 10000 minor).
INSERT INTO public.t_admins VALUES ('99999999-9999-9999-9999-999999999999');
INSERT INTO public.stores (id, owner_user_id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111');
INSERT INTO public.business_cash_accounts (store_id, balance_minor) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 50000),
  ('aaaaaaaa-0000-0000-0000-000000000002', 50000),
  ('aaaaaaaa-0000-0000-0000-000000000003', 5000),
  ('aaaaaaaa-0000-0000-0000-000000000004', 50000);
INSERT INTO public.delivery_ad_partner_config (id, enabled, monthly_fee_minor, accepting_new_members, advertising_discount_percent, version)
VALUES ('default', true, 10000, true, 10, 3);

-- D-5 legacy row (mirrors prod): ACTIVE, period ended 2026-10-05, created 2026-09-05 (before c_apply_from).
INSERT INTO public.delivery_ad_partner_memberships (id, store_id, status, period_start, period_end, fee_snapshot_minor, created_at, updated_at)
VALUES ('bbbbbbbb-0000-0000-0000-00000000000e', 'aaaaaaaa-0000-0000-0000-000000000002', 'ACTIVE',
        '2026-09-05 03:37:57+00', '2026-10-05 03:37:57+00', 10000, '2026-09-05 03:37:50+00', '2026-09-05 03:37:57+00');

-- Helper: ledger row count / balance.
CREATE OR REPLACE FUNCTION public.t_bal(p uuid) RETURNS bigint LANGUAGE sql AS $$
  SELECT balance_minor FROM public.business_cash_accounts WHERE store_id = p $$;
