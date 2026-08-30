-- P0-A — Delivery Ads commercial catalog (package × placement × product)
-- + Partner membership + immutable campaign/extension snapshots.
-- NO charge collection. CUT H billing stays disabled. No invented prices.
-- Seed packages: structure only, price_amount_minor NULL, enabled=false (NOT_CONFIGURED).

BEGIN;

-- ── Extend product commercial fields (keep key authority) ───────────────────
ALTER TABLE public.delivery_ad_products
  ADD COLUMN IF NOT EXISTS description text NULL,
  ADD COLUMN IF NOT EXISTS accepting_applications boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.delivery_ad_products.accepting_applications IS
  'P0-A: Admin sales control — when false, Owner cannot start new applications for this product.';

-- ── Placement commercial reference (NOT exposure max/interval) ──────────────
CREATE TABLE IF NOT EXISTS public.delivery_ad_placement_commercial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_kind text NOT NULL CHECK (product_kind IN ('store_sponsored', 'banner')),
  inventory_key text NOT NULL,
  sellable boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_ad_placement_commercial_product_inv_uidx
    UNIQUE (product_kind, inventory_key)
);

COMMENT ON TABLE public.delivery_ad_placement_commercial IS
  'P0-A commercial sellability for inventory_key. Does NOT own max/interval/interleave — exposure SSOT remains composition/browse policy.';

CREATE INDEX IF NOT EXISTS delivery_ad_placement_commercial_sellable_idx
  ON public.delivery_ad_placement_commercial (product_kind, sellable);

INSERT INTO public.delivery_ad_placement_commercial (product_kind, inventory_key, sellable)
VALUES
  ('store_sponsored', 'STORES_HOME_FEED', true),
  ('store_sponsored', 'STORES_CATEGORY_FEED', true),
  ('banner', 'STORES_HOME_HERO', true),
  ('banner', 'STORES_SEARCH_TOP', true)
ON CONFLICT (product_kind, inventory_key) DO NOTHING;

-- ── Package catalog = PRODUCT × PLACEMENT × PACKAGE ─────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_ad_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_kind text NOT NULL CHECK (product_kind IN ('store_sponsored', 'banner')),
  inventory_key text NOT NULL,
  code text NOT NULL,
  display_name text NOT NULL,
  duration_days integer NOT NULL CHECK (duration_days > 0 AND duration_days <= 365),
  price_amount_minor bigint NULL
    CHECK (price_amount_minor IS NULL OR price_amount_minor >= 0),
  currency text NOT NULL DEFAULT 'PHP',
  enabled boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_ad_packages_sku_uidx
    UNIQUE (product_kind, inventory_key, code)
);

COMMENT ON TABLE public.delivery_ad_packages IS
  'P0-A sellable duration packages. price_amount_minor NULL or enabled=false ⇒ NOT_CONFIGURED / not sellable. Admin SSOT — no app constant prices.';

CREATE INDEX IF NOT EXISTS delivery_ad_packages_lookup_idx
  ON public.delivery_ad_packages (product_kind, inventory_key, enabled, display_order);

-- Structure-only seed (7/15/30). NO invented peso amounts.
INSERT INTO public.delivery_ad_packages (
  product_kind, inventory_key, code, display_name, duration_days,
  price_amount_minor, currency, enabled, display_order
)
VALUES
  ('store_sponsored', 'STORES_HOME_FEED', '7_day', '7 days', 7, NULL, 'PHP', false, 10),
  ('store_sponsored', 'STORES_HOME_FEED', '15_day', '15 days', 15, NULL, 'PHP', false, 20),
  ('store_sponsored', 'STORES_HOME_FEED', '30_day', '30 days', 30, NULL, 'PHP', false, 30),
  ('store_sponsored', 'STORES_CATEGORY_FEED', '7_day', '7 days', 7, NULL, 'PHP', false, 10),
  ('store_sponsored', 'STORES_CATEGORY_FEED', '15_day', '15 days', 15, NULL, 'PHP', false, 20),
  ('store_sponsored', 'STORES_CATEGORY_FEED', '30_day', '30 days', 30, NULL, 'PHP', false, 30),
  ('banner', 'STORES_HOME_HERO', '7_day', '7 days', 7, NULL, 'PHP', false, 10),
  ('banner', 'STORES_HOME_HERO', '15_day', '15 days', 15, NULL, 'PHP', false, 20),
  ('banner', 'STORES_HOME_HERO', '30_day', '30 days', 30, NULL, 'PHP', false, 30),
  ('banner', 'STORES_SEARCH_TOP', '7_day', '7 days', 7, NULL, 'PHP', false, 10),
  ('banner', 'STORES_SEARCH_TOP', '15_day', '15 days', 15, NULL, 'PHP', false, 20),
  ('banner', 'STORES_SEARCH_TOP', '30_day', '30 days', 30, NULL, 'PHP', false, 30)
ON CONFLICT (product_kind, inventory_key, code) DO NOTHING;

-- ── Extension policy (singleton) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_ad_extension_policy (
  id text PRIMARY KEY DEFAULT 'default',
  extension_enabled boolean NOT NULL DEFAULT false,
  additional_day_price_minor bigint NULL
    CHECK (additional_day_price_minor IS NULL OR additional_day_price_minor >= 0),
  currency text NOT NULL DEFAULT 'PHP',
  minimum_extension_days integer NOT NULL DEFAULT 1 CHECK (minimum_extension_days > 0),
  maximum_extension_days integer NOT NULL DEFAULT 30 CHECK (maximum_extension_days > 0),
  extension_unit_days integer NOT NULL DEFAULT 1 CHECK (extension_unit_days > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_ad_extension_policy_minmax_chk
    CHECK (maximum_extension_days >= minimum_extension_days)
);

INSERT INTO public.delivery_ad_extension_policy (
  id, extension_enabled, additional_day_price_minor, currency,
  minimum_extension_days, maximum_extension_days, extension_unit_days
)
VALUES ('default', false, NULL, 'PHP', 1, 30, 1)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.delivery_ad_extension_policy IS
  'P0-A Admin extension commercial policy. Disabled / NULL day price ⇒ fail-closed.';

-- ── Partner catalog (NOT campaign / NOT organic) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_ad_partner_config (
  id text PRIMARY KEY DEFAULT 'default',
  enabled boolean NOT NULL DEFAULT false,
  monthly_fee_minor bigint NULL
    CHECK (monthly_fee_minor IS NULL OR monthly_fee_minor >= 0),
  currency text NOT NULL DEFAULT 'PHP',
  advertising_discount_percent integer NOT NULL DEFAULT 0
    CHECK (advertising_discount_percent >= 0 AND advertising_discount_percent <= 100),
  benefit_json jsonb NOT NULL DEFAULT '{"advertising_package_discount":true}'::jsonb,
  accepting_new_members boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.delivery_ad_partner_config (
  id, enabled, monthly_fee_minor, currency, advertising_discount_percent,
  benefit_json, accepting_new_members, version
)
VALUES (
  'default', false, NULL, 'PHP', 0,
  '{"advertising_package_discount":true}'::jsonb,
  false, 1
)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.delivery_ad_partner_config IS
  'P0-A Partner membership catalog. Must never modify organic ranking. Discount only when enabled + fee configured.';

-- ── Partner membership (store-scoped) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_ad_partner_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'NONE'
    CHECK (status IN ('NONE', 'ACTIVE', 'PAST_DUE', 'CANCEL_PENDING', 'ENDED')),
  period_start timestamptz NULL,
  period_end timestamptz NULL,
  fee_snapshot_minor bigint NULL
    CHECK (fee_snapshot_minor IS NULL OR fee_snapshot_minor >= 0),
  currency text NOT NULL DEFAULT 'PHP',
  benefit_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  advertising_discount_percent_snapshot integer NOT NULL DEFAULT 0
    CHECK (advertising_discount_percent_snapshot >= 0 AND advertising_discount_percent_snapshot <= 100),
  config_version_snapshot integer NULL,
  cancel_requested_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS delivery_ad_partner_memberships_store_status_idx
  ON public.delivery_ad_partner_memberships (store_id, status, period_end DESC);

COMMENT ON TABLE public.delivery_ad_partner_memberships IS
  'P0-A store Partner membership periods with fee/benefit snapshots. No organic ranking effect.';

-- ── Immutable campaign commercial snapshot (ONE owner) ──────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_ad_campaign_commercial_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  product_kind text NOT NULL CHECK (product_kind IN ('store_sponsored', 'banner')),
  campaign_source text NOT NULL DEFAULT 'OWNER_PAID'
    CHECK (campaign_source IN ('OWNER_PAID', 'DIBAY_FIRST_PARTY')),
  inventory_key text NOT NULL,
  package_id uuid NULL REFERENCES public.delivery_ad_packages (id),
  package_code text NULL,
  package_display_name text NULL,
  duration_days_snapshot integer NULL CHECK (duration_days_snapshot IS NULL OR duration_days_snapshot > 0),
  base_price_minor_snapshot bigint NULL
    CHECK (base_price_minor_snapshot IS NULL OR base_price_minor_snapshot >= 0),
  partner_membership_id uuid NULL REFERENCES public.delivery_ad_partner_memberships (id),
  partner_discount_percent_snapshot integer NOT NULL DEFAULT 0
    CHECK (partner_discount_percent_snapshot >= 0 AND partner_discount_percent_snapshot <= 100),
  partner_benefit_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  final_payable_minor bigint NULL
    CHECK (final_payable_minor IS NULL OR final_payable_minor >= 0),
  currency text NOT NULL DEFAULT 'PHP',
  priced_at timestamptz NULL,
  commercial_status text NOT NULL DEFAULT 'LEGACY_UNPRICED'
    CHECK (commercial_status IN ('PRICED', 'LEGACY_UNPRICED', 'FIRST_PARTY_NO_CHARGE', 'NOT_CONFIGURED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_ad_campaign_commercial_snapshots_campaign_uidx
    UNIQUE (campaign_id, product_kind)
);

COMMENT ON TABLE public.delivery_ad_campaign_commercial_snapshots IS
  'P0-A immutable commercial agreement at application/purchase. Catalog price edits MUST NOT mutate rows. LEGACY_UNPRICED for pre-P0-A campaigns.';

CREATE INDEX IF NOT EXISTS delivery_ad_campaign_commercial_snapshots_pkg_idx
  ON public.delivery_ad_campaign_commercial_snapshots (package_id);

-- ── Extension financial history ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_ad_extension_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  product_kind text NOT NULL CHECK (product_kind IN ('store_sponsored', 'banner')),
  extension_kind text NOT NULL
    CHECK (extension_kind IN ('PAID', 'ADMIN_FREE_COMPENSATION', 'ADMIN_OVERRIDE')),
  days_added integer NOT NULL CHECK (days_added > 0),
  unit_price_minor_snapshot bigint NULL
    CHECK (unit_price_minor_snapshot IS NULL OR unit_price_minor_snapshot >= 0),
  partner_discount_percent_snapshot integer NOT NULL DEFAULT 0
    CHECK (partner_discount_percent_snapshot >= 0 AND partner_discount_percent_snapshot <= 100),
  final_extension_amount_minor bigint NOT NULL DEFAULT 0
    CHECK (final_extension_amount_minor >= 0),
  currency text NOT NULL DEFAULT 'PHP',
  previous_end_at timestamptz NOT NULL,
  new_end_at timestamptz NOT NULL,
  actor_user_id uuid NULL,
  actor_type text NOT NULL DEFAULT 'system'
    CHECK (actor_type IN ('owner', 'admin', 'system')),
  reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS delivery_ad_extension_snapshots_campaign_idx
  ON public.delivery_ad_extension_snapshots (campaign_id, product_kind, created_at DESC);

COMMENT ON TABLE public.delivery_ad_extension_snapshots IS
  'P0-A immutable extension history. ADMIN_FREE_COMPENSATION distinguishable from PAID.';

-- ── Admin commercial override audit ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_ad_commercial_override_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL
    CHECK (entity_type IN (
      'package', 'placement_commercial', 'product', 'extension_policy',
      'partner_config', 'campaign_commercial', 'partner_membership'
    )),
  entity_id text NOT NULL,
  actor_user_id uuid NOT NULL,
  reason text NOT NULL,
  before_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS delivery_ad_commercial_override_audit_entity_idx
  ON public.delivery_ad_commercial_override_audit (entity_type, entity_id, created_at DESC);

-- ── Campaign source (minimal widen) ─────────────────────────────────────────
ALTER TABLE public.store_paid_ad_campaigns
  ADD COLUMN IF NOT EXISTS campaign_source text NOT NULL DEFAULT 'OWNER_PAID';

ALTER TABLE public.store_banner_ad_campaigns
  ADD COLUMN IF NOT EXISTS campaign_source text NOT NULL DEFAULT 'OWNER_PAID';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'store_paid_ad_campaigns_campaign_source_chk'
  ) THEN
    ALTER TABLE public.store_paid_ad_campaigns
      ADD CONSTRAINT store_paid_ad_campaigns_campaign_source_chk
      CHECK (campaign_source IN ('OWNER_PAID', 'DIBAY_FIRST_PARTY'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'store_banner_ad_campaigns_campaign_source_chk'
  ) THEN
    ALTER TABLE public.store_banner_ad_campaigns
      ADD CONSTRAINT store_banner_ad_campaigns_campaign_source_chk
      CHECK (campaign_source IN ('OWNER_PAID', 'DIBAY_FIRST_PARTY'));
  END IF;
END $$;

COMMENT ON COLUMN public.store_paid_ad_campaigns.campaign_source IS
  'P0-A: OWNER_PAID | DIBAY_FIRST_PARTY. First-party has no Owner payable.';
COMMENT ON COLUMN public.store_banner_ad_campaigns.campaign_source IS
  'P0-A: OWNER_PAID | DIBAY_FIRST_PARTY. First-party has no Owner payable.';

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.delivery_ad_placement_commercial ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_ad_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_ad_extension_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_ad_partner_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_ad_partner_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_ad_campaign_commercial_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_ad_extension_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_ad_commercial_override_audit ENABLE ROW LEVEL SECURITY;

-- Catalog: authenticated may read sellable-facing rows; writes via service_role / Admin APIs.
DROP POLICY IF EXISTS delivery_ad_placement_commercial_select ON public.delivery_ad_placement_commercial;
CREATE POLICY delivery_ad_placement_commercial_select
  ON public.delivery_ad_placement_commercial FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS delivery_ad_packages_select ON public.delivery_ad_packages;
CREATE POLICY delivery_ad_packages_select
  ON public.delivery_ad_packages FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS delivery_ad_extension_policy_select ON public.delivery_ad_extension_policy;
CREATE POLICY delivery_ad_extension_policy_select
  ON public.delivery_ad_extension_policy FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS delivery_ad_partner_config_select ON public.delivery_ad_partner_config;
CREATE POLICY delivery_ad_partner_config_select
  ON public.delivery_ad_partner_config FOR SELECT TO authenticated
  USING (true);

-- Membership: Owner of store only
DROP POLICY IF EXISTS delivery_ad_partner_memberships_owner_select ON public.delivery_ad_partner_memberships;
CREATE POLICY delivery_ad_partner_memberships_owner_select
  ON public.delivery_ad_partner_memberships FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_id AND s.owner_user_id = auth.uid()
    )
    OR public.is_platform_admin(auth.uid())
  );

-- Snapshots: Owner of campaign store / Admin
DROP POLICY IF EXISTS delivery_ad_campaign_commercial_snapshots_select
  ON public.delivery_ad_campaign_commercial_snapshots;
CREATE POLICY delivery_ad_campaign_commercial_snapshots_select
  ON public.delivery_ad_campaign_commercial_snapshots FOR SELECT TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.store_paid_ad_campaigns c
      JOIN public.stores s ON s.id = c.store_id
      WHERE c.id = campaign_id
        AND product_kind = 'store_sponsored'
        AND s.owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.store_banner_ad_campaigns c
      JOIN public.stores s ON s.id = c.store_id
      WHERE c.id = campaign_id
        AND product_kind = 'banner'
        AND s.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS delivery_ad_extension_snapshots_select ON public.delivery_ad_extension_snapshots;
CREATE POLICY delivery_ad_extension_snapshots_select
  ON public.delivery_ad_extension_snapshots FOR SELECT TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.store_paid_ad_campaigns c
      JOIN public.stores s ON s.id = c.store_id
      WHERE c.id = campaign_id
        AND product_kind = 'store_sponsored'
        AND s.owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.store_banner_ad_campaigns c
      JOIN public.stores s ON s.id = c.store_id
      WHERE c.id = campaign_id
        AND product_kind = 'banner'
        AND s.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS delivery_ad_commercial_override_audit_admin_select
  ON public.delivery_ad_commercial_override_audit;
CREATE POLICY delivery_ad_commercial_override_audit_admin_select
  ON public.delivery_ad_commercial_override_audit FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- No INSERT/UPDATE/DELETE policies for authenticated — service_role / Admin server only.
GRANT SELECT ON public.delivery_ad_placement_commercial TO authenticated;
GRANT SELECT ON public.delivery_ad_packages TO authenticated;
GRANT SELECT ON public.delivery_ad_extension_policy TO authenticated;
GRANT SELECT ON public.delivery_ad_partner_config TO authenticated;
GRANT SELECT ON public.delivery_ad_partner_memberships TO authenticated;
GRANT SELECT ON public.delivery_ad_campaign_commercial_snapshots TO authenticated;
GRANT SELECT ON public.delivery_ad_extension_snapshots TO authenticated;
GRANT SELECT ON public.delivery_ad_commercial_override_audit TO authenticated;

GRANT ALL ON public.delivery_ad_placement_commercial TO service_role;
GRANT ALL ON public.delivery_ad_packages TO service_role;
GRANT ALL ON public.delivery_ad_extension_policy TO service_role;
GRANT ALL ON public.delivery_ad_partner_config TO service_role;
GRANT ALL ON public.delivery_ad_partner_memberships TO service_role;
GRANT ALL ON public.delivery_ad_campaign_commercial_snapshots TO service_role;
GRANT ALL ON public.delivery_ad_extension_snapshots TO service_role;
GRANT ALL ON public.delivery_ad_commercial_override_audit TO service_role;

COMMIT;
