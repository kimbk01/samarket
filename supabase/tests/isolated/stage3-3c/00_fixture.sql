-- Isolated fixture for stage 3-C (IA-04 / IA-05 / ADS-23 / ADS-24) - coupon campaign state, reissue idempotency.
-- NOT for Supabase projects. Runs on a throwaway local PostgreSQL 16 database only.
-- Runner: supabase/tests/isolated/stage3-3c/run.sh <pg_host> <pg_port>
-- store_coupon_campaigns / coupon_audit_events columns, defaults, constraints and indexes copied from production
-- information_schema + pg_constraint + pg_indexes (read-only, 2026-10-21). No triggers exist on the campaign table.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE TABLE public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL
);

CREATE TABLE public.store_coupon_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  title text NOT NULL,
  discount_type text NOT NULL CHECK (discount_type = ANY (ARRAY['percent'::text, 'fixed_amount'::text])),
  discount_value numeric NOT NULL CHECK (discount_value > (0)::numeric),
  min_order_amount numeric CHECK (min_order_amount IS NULL OR min_order_amount >= (0)::numeric),
  terms_copy text,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid,
  updated_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  lifecycle_state text NOT NULL DEFAULT 'active'::text,
  funding_mode text NOT NULL DEFAULT 'STORE_FUNDED'::text,
  store_funded_amount numeric,
  issue_limit integer,
  issued_count integer NOT NULL DEFAULT 0,
  spend_budget_php numeric,
  reserved_spend_php numeric NOT NULL DEFAULT 0,
  max_discount numeric,
  first_order_scope text,
  max_uses_per_user integer NOT NULL DEFAULT 1,
  restore_on_full_refund boolean NOT NULL DEFAULT true,
  requires_admin_approval boolean NOT NULL DEFAULT false,
  usage_end_at timestamptz,
  claim_valid_days integer,
  issuer_role text,
  campaign_purpose text,
  CONSTRAINT store_coupon_campaigns_funding_mode_chk CHECK (funding_mode = ANY (ARRAY['STORE_FUNDED'::text, 'PLATFORM_FUNDED'::text, 'SHARED_FUNDED'::text])),
  CONSTRAINT store_coupon_campaigns_issuer_role_chk CHECK (issuer_role IS NULL OR issuer_role = ANY (ARRAY['owner'::text, 'admin'::text, 'system'::text])),
  CONSTRAINT store_coupon_campaigns_lifecycle_chk CHECK (lifecycle_state = ANY (ARRAY['draft'::text, 'requested'::text, 'approved'::text, 'rejected'::text, 'scheduled'::text, 'active'::text, 'paused'::text, 'ended'::text, 'revoked'::text])),
  CONSTRAINT store_coupon_campaigns_purpose_chk CHECK (campaign_purpose IS NULL OR campaign_purpose = ANY (ARRAY['new_customer_acquisition'::text, 'repeat_purchase'::text, 'new_menu_promotion'::text, 'store_promotion'::text, 'platform_event'::text])),
  CONSTRAINT store_coupon_campaigns_window_chk CHECK (end_at > start_at)
);
CREATE INDEX store_coupon_campaigns_active_window_idx ON public.store_coupon_campaigns USING btree (is_active, start_at, end_at) WHERE (is_active = true);
CREATE INDEX store_coupon_campaigns_created_id_idx ON public.store_coupon_campaigns USING btree (created_at DESC, id DESC);

CREATE TABLE public.coupon_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.store_coupon_campaigns(id) ON DELETE SET NULL,
  entitlement_id uuid,
  actor_user_id uuid,
  action text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.store_coupon_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_audit_events ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.store_coupon_campaigns, public.coupon_audit_events TO service_role;

INSERT INTO public.stores (id, owner_user_id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111');

-- Legacy rows mirroring the production shapes (must stay byte-identical through the migration + auto end).
INSERT INTO public.store_coupon_campaigns (id, store_id, title, discount_type, discount_value, start_at, end_at, is_active, lifecycle_state, updated_at)
VALUES
  ('c0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'legacy expired active', 'fixed_amount', 50, '2026-08-01', '2026-09-25 03:40:00+00', true, 'active', '2026-09-01'),
  ('c0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'legacy active inactive', 'fixed_amount', 50, '2026-08-01', '2026-09-20', false, 'active', '2026-09-01'),
  ('c0000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'legacy paused', 'fixed_amount', 50, '2026-08-01', '2026-09-20', false, 'paused', '2026-09-01'),
  ('c0000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'legacy ended', 'fixed_amount', 50, '2026-08-01', '2026-09-20', false, 'ended', '2026-09-01'),
  ('c0000000-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'legacy revoked', 'fixed_amount', 50, '2026-08-01', '2026-09-20', false, 'revoked', '2026-09-01');
-- Legacy row with max_uses_per_user 2 (none in prod; proves NOT VALID leaves old rows alone).
INSERT INTO public.store_coupon_campaigns (id, store_id, title, discount_type, discount_value, start_at, end_at, is_active, lifecycle_state, max_uses_per_user, updated_at)
VALUES ('c0000000-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', 'legacy multi use', 'fixed_amount', 50, '2026-08-01', '2026-09-20', false, 'ended', 2, '2026-09-01');

-- Snapshot of the business columns of every legacy row (compared after migration + auto end).
CREATE TABLE public.t_legacy_snapshot AS
  SELECT id, md5(concat_ws('|', lifecycle_state, is_active, end_at, updated_at, max_uses_per_user, title)) AS h
    FROM public.store_coupon_campaigns;
