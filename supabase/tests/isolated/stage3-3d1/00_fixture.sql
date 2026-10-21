-- Isolated fixture for stage 3-D1 (ADS-01 / ADS-11 / ADS-12 / ADS-02) - ad lifecycle period + snapshot binding.
-- NOT for Supabase projects. Runs on a throwaway local PostgreSQL 16 database only.
-- Runner: supabase/tests/isolated/stage3-3d1/run.sh <pg_host> <pg_port>
-- Column definitions / constraints copied from production information_schema + pg_constraint (read-only, 2026-10-21),
-- trimmed to the columns the functions under test touch. Trigger mirrored: business_cash_ledger_no_update.

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
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE SCHEMA IF NOT EXISTS internal;
CREATE TABLE internal.t_admins (id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION internal.is_platform_admin(check_uid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM internal.t_admins WHERE id = check_uid)
$$;
-- prod body: SELECT internal.is_platform_admin(check_uid);
CREATE OR REPLACE FUNCTION public.is_platform_admin(check_uid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT internal.is_platform_admin(check_uid);
$$;

CREATE TABLE public.store_categories (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text);
CREATE TABLE public.store_topics (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text);
CREATE TABLE public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  store_name text NOT NULL DEFAULT 'store',
  approval_status text NOT NULL DEFAULT 'approved',
  is_visible boolean NOT NULL DEFAULT true,
  store_category_id uuid,
  store_topic_id uuid
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
CREATE OR REPLACE FUNCTION public.business_cash_ledger_forbid_mutate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'business_cash_ledger is append-only'; END $$;
CREATE TRIGGER business_cash_ledger_no_update BEFORE DELETE OR UPDATE ON public.business_cash_ledger
  FOR EACH ROW EXECUTE FUNCTION public.business_cash_ledger_forbid_mutate();

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
CREATE TABLE public.delivery_ad_store_cash_spends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  product_kind text NOT NULL,
  status text NOT NULL
);
CREATE TABLE public.platform_popup_owner_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid, store_id uuid, request_status text, price_minor bigint
);

CREATE TABLE public.delivery_ad_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_status text NOT NULL DEFAULT 'PENDING',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.store_paid_ad_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  placement text NOT NULL DEFAULT 'stores_home' CHECK (placement = ANY (ARRAY['stores_home','stores_browse'])),
  title text NOT NULL DEFAULT 't',
  headline text NOT NULL DEFAULT '',
  body_copy text,
  image_url text,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid,
  updated_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  product_key text NOT NULL DEFAULT 'store_sponsored',
  owner_user_id uuid,
  lifecycle_status text NOT NULL DEFAULT 'ACTIVE' CHECK (lifecycle_status = ANY (ARRAY['DRAFT','SUBMITTED','UNDER_REVIEW','CHANGES_REQUESTED','APPROVED','SCHEDULED','ACTIVE','PAUSED_OWNER','PAUSED_ADMIN','EXHAUSTED','REJECTED','ENDED','TERMINATED','ARCHIVED'])),
  review_status text NOT NULL DEFAULT 'APPROVED' CHECK (review_status = ANY (ARRAY['NOT_SUBMITTED','PENDING','IN_REVIEW','CHANGES_REQUESTED','APPROVED','REJECTED'])),
  pricing_model text,
  submitted_at timestamptz, reviewed_at timestamptz, approved_at timestamptz, activated_at timestamptz,
  paused_at timestamptz, ended_at timestamptz, archived_at timestamptz,
  review_notes text,
  owner_client_request_id text,
  campaign_source text NOT NULL DEFAULT 'OWNER_PAID' CHECK (campaign_source = ANY (ARRAY['OWNER_PAID','DIBAY_FIRST_PARTY'])),
  browse_target_kind text, browse_primary_slug text, browse_secondary_slug text,
  CONSTRAINT store_paid_ad_campaigns_window_chk CHECK (end_at > start_at)
);
CREATE TABLE public.store_banner_ad_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  surface text NOT NULL DEFAULT 'stores_home_hero',
  title text, subtitle text,
  image_url text NOT NULL DEFAULT 'delivery-ads/x.png' CHECK (length(btrim(image_url)) > 0),
  cta_href text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid, updated_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  product_key text NOT NULL DEFAULT 'banner',
  owner_user_id uuid,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  creative_id uuid REFERENCES public.delivery_ad_creatives(id) ON DELETE SET NULL,
  lifecycle_status text NOT NULL DEFAULT 'ACTIVE' CHECK (lifecycle_status = ANY (ARRAY['DRAFT','SUBMITTED','UNDER_REVIEW','CHANGES_REQUESTED','APPROVED','SCHEDULED','ACTIVE','PAUSED_OWNER','PAUSED_ADMIN','EXHAUSTED','REJECTED','ENDED','TERMINATED','ARCHIVED'])),
  review_status text NOT NULL DEFAULT 'APPROVED' CHECK (review_status = ANY (ARRAY['NOT_SUBMITTED','PENDING','IN_REVIEW','CHANGES_REQUESTED','APPROVED','REJECTED'])),
  pricing_model text,
  submitted_at timestamptz, reviewed_at timestamptz, approved_at timestamptz, activated_at timestamptz,
  paused_at timestamptz, ended_at timestamptz, archived_at timestamptz,
  review_notes text,
  owner_client_request_id text,
  campaign_source text NOT NULL DEFAULT 'OWNER_PAID' CHECK (campaign_source = ANY (ARRAY['OWNER_PAID','DIBAY_FIRST_PARTY'])),
  CONSTRAINT store_banner_ad_campaigns_window_chk CHECK (end_at > start_at)
);

CREATE TABLE public.delivery_ad_inventories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  product_kind text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.delivery_banner_campaign_inventories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.store_banner_ad_campaigns(id) ON DELETE CASCADE,
  inventory_id uuid NOT NULL REFERENCES public.delivery_ad_inventories(id) ON DELETE RESTRICT,
  priority integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, inventory_id)
);
CREATE TABLE public.delivery_store_sponsored_campaign_inventories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  inventory_id uuid NOT NULL REFERENCES public.delivery_ad_inventories(id),
  priority integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.delivery_ad_campaign_commercial_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  product_kind text NOT NULL CHECK (product_kind = ANY (ARRAY['store_sponsored','banner'])),
  campaign_source text NOT NULL DEFAULT 'OWNER_PAID',
  inventory_key text NOT NULL,
  package_id uuid, package_code text, package_display_name text,
  duration_days_snapshot integer CHECK (duration_days_snapshot IS NULL OR duration_days_snapshot > 0),
  base_price_minor_snapshot bigint,
  partner_membership_id uuid,
  partner_discount_percent_snapshot integer NOT NULL DEFAULT 0,
  partner_benefit_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  final_payable_minor bigint,
  currency text NOT NULL DEFAULT 'PHP',
  priced_at timestamptz,
  commercial_status text NOT NULL DEFAULT 'LEGACY_UNPRICED',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, product_kind)
);

CREATE TABLE public.delivery_ad_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_kind text NOT NULL CHECK (product_kind = ANY (ARRAY['store_sponsored','banner'])),
  campaign_id uuid NOT NULL,
  actor_type text NOT NULL CHECK (actor_type = ANY (ARRAY['owner','admin','system'])),
  actor_user_id uuid,
  action text NOT NULL,
  before_json jsonb, after_json jsonb, reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.delivery_ad_operations_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_kind text, store_sponsored_campaign_id uuid, banner_campaign_id uuid,
  owner_user_id uuid, status text, updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- seed + helpers
INSERT INTO internal.t_admins VALUES ('99999999-9999-9999-9999-999999999999');
INSERT INTO public.stores (id, owner_user_id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111');
INSERT INTO public.business_cash_accounts (store_id, balance_minor) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 1000000);
INSERT INTO public.delivery_ad_inventories (key, product_kind) VALUES
  ('STORES_HOME_FEED', 'store_sponsored'), ('STORES_CATEGORY_FEED', 'store_sponsored'), ('STORES_HOME_HERO', 'banner');

-- New OWNER_PAID sponsored campaign (DRAFT) priced 12000 minor for p_days days on HOME_FEED; window given.
CREATE OR REPLACE FUNCTION public.t_sponsored(p_start timestamptz, p_end timestamptz, p_days integer,
  p_lifecycle text DEFAULT 'DRAFT', p_keys text[] DEFAULT ARRAY['STORES_HOME_FEED'])
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v uuid;
BEGIN
  INSERT INTO public.store_paid_ad_campaigns (store_id, owner_user_id, start_at, end_at, lifecycle_status, review_status, is_active)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', p_start, p_end, p_lifecycle, 'NOT_SUBMITTED', false)
  RETURNING id INTO v;
  INSERT INTO public.delivery_store_sponsored_campaign_inventories (campaign_id, inventory_id)
    SELECT v, i.id FROM public.delivery_ad_inventories i WHERE i.key = ANY (p_keys);
  INSERT INTO public.delivery_ad_campaign_commercial_snapshots (campaign_id, product_kind, inventory_key, duration_days_snapshot,
    final_payable_minor, commercial_status, priced_at)
  VALUES (v, 'store_sponsored', 'STORES_HOME_FEED', p_days, 12000, 'PRICED', now());
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.t_banner(p_start timestamptz, p_end timestamptz, p_days integer, p_lifecycle text DEFAULT 'DRAFT')
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v uuid; c uuid;
BEGIN
  INSERT INTO public.delivery_ad_creatives DEFAULT VALUES RETURNING id INTO c;
  INSERT INTO public.store_banner_ad_campaigns (store_id, owner_user_id, start_at, end_at, lifecycle_status, review_status, is_active, creative_id)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', p_start, p_end, p_lifecycle, 'NOT_SUBMITTED', false, c)
  RETURNING id INTO v;
  INSERT INTO public.delivery_banner_campaign_inventories (campaign_id, inventory_id)
    SELECT v, i.id FROM public.delivery_ad_inventories i WHERE i.key = 'STORES_HOME_HERO';
  INSERT INTO public.delivery_ad_campaign_commercial_snapshots (campaign_id, product_kind, inventory_key, duration_days_snapshot,
    final_payable_minor, commercial_status, priced_at)
  VALUES (v, 'banner', 'STORES_HOME_HERO', p_days, 12000, 'PRICED', now());
  RETURN v;
END $$;
