-- CUT B — Delivery Ad Platform Campaign / Inventory / Creative / Lifecycle / Audit SSOT
-- KEEP store_paid_ad_campaigns + store_banner_ad_campaigns separate (do not merge).
-- Billing / impression / click tables: OUT (CUT G/H).
-- Existing HOME/BROWSE/HERO runtime must keep working via is_active + placement/surface.

BEGIN;

-- ── Products ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_ad_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE
    CHECK (key IN ('store_sponsored', 'banner')),
  display_name text NOT NULL,
  campaign_authority text NOT NULL,
  creative_mode text NOT NULL
    CHECK (creative_mode IN ('STORE', 'IMAGE')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.delivery_ad_products IS
  'CUT B Delivery ad product registry. store_sponsored → store_paid_ad_campaigns; banner → store_banner_ad_campaigns.';

INSERT INTO public.delivery_ad_products (key, display_name, campaign_authority, creative_mode, is_active)
VALUES
  ('store_sponsored', 'Store sponsored', 'store_paid_ad_campaigns', 'STORE', true),
  ('banner', 'Banner', 'store_banner_ad_campaigns', 'IMAGE', true)
ON CONFLICT (key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  campaign_authority = EXCLUDED.campaign_authority,
  creative_mode = EXCLUDED.creative_mode,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- ── Inventories ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_ad_inventories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  product_kind text NOT NULL
    CHECK (product_kind IN ('store_sponsored', 'banner')),
  surface text NOT NULL,
  placement_type text NOT NULL,
  aspect_ratio_width integer NOT NULL CHECK (aspect_ratio_width > 0),
  aspect_ratio_height integer NOT NULL CHECK (aspect_ratio_height > 0),
  crop_policy text NOT NULL DEFAULT 'cover',
  object_position text NOT NULL DEFAULT 'center',
  safe_area_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  mobile_max_width integer NULL,
  tablet_max_width integer NULL,
  allowed_creative_type text NOT NULL
    CHECK (allowed_creative_type IN ('store_card', 'banner_image')),
  max_active_campaigns integer NULL,
  rotation_policy text NULL,
  frequency_cap integer NULL,
  ratio_source text NOT NULL
    CHECK (ratio_source IN ('CURRENT_RUNTIME_MEASURED', 'PRODUCT_DESIGN_LOCK', 'FUTURE')),
  runtime_status text NOT NULL
    CHECK (runtime_status IN ('ACTIVE', 'FUTURE', 'COMPATIBILITY')),
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_ad_inventories_active_runtime_chk CHECK (
    (is_active = true AND runtime_status IN ('ACTIVE', 'COMPATIBILITY'))
    OR (is_active = false)
  )
);

COMMENT ON TABLE public.delivery_ad_inventories IS
  'CUT B inventory SSOT. One ratio per inventory for iOS/APK/Web/Tablet — no per-device ratio columns. CUT E consumes; CUT K proves parity.';

CREATE INDEX IF NOT EXISTS delivery_ad_inventories_product_active_idx
  ON public.delivery_ad_inventories (product_kind, is_active, runtime_status);

-- HOME HERO: StoresHomeHeroBanner min-h-[140] max-h-[180] + container width.
-- Midpoint at ~390px width → 160px height → 39:16 (CURRENT_RUNTIME_MEASURED). Do NOT invent 16:9.
INSERT INTO public.delivery_ad_inventories (
  key, product_kind, surface, placement_type,
  aspect_ratio_width, aspect_ratio_height,
  crop_policy, object_position, safe_area_json,
  allowed_creative_type, max_active_campaigns,
  ratio_source, runtime_status, is_active
) VALUES
  (
    'STORES_HOME_HERO', 'banner', 'stores_home', 'hero',
    39, 16,
    'cover', 'center',
    '{"minHeightPx":140,"maxHeightPx":180,"widthMode":"container","source":"StoresHomeHeroBanner"}'::jsonb,
    'banner_image', 10,
    'CURRENT_RUNTIME_MEASURED', 'ACTIVE', true
  ),
  (
    'STORES_HOME_FEED', 'store_sponsored', 'stores_home', 'feed_insertion',
    4, 3,
    'cover', 'center',
    '{"source":"StoresHomeStoreHorizontalCard aspect-[4/3]"}'::jsonb,
    'store_card', NULL,
    'CURRENT_RUNTIME_MEASURED', 'ACTIVE', true
  ),
  (
    'STORES_CATEGORY_FEED', 'store_sponsored', 'stores_browse', 'feed_insertion',
    4, 3,
    'cover', 'center',
    '{"source":"browse organic card anatomy"}'::jsonb,
    'store_card', NULL,
    'CURRENT_RUNTIME_MEASURED', 'ACTIVE', true
  ),
  (
    'STORES_HOME_INLINE_1', 'banner', 'stores_home', 'inline',
    2, 1,
    'cover', 'center',
    '{}'::jsonb,
    'banner_image', 3,
    'FUTURE', 'FUTURE', false
  ),
  (
    'STORES_CATEGORY_TOP', 'banner', 'stores_browse', 'category_top',
    3, 1,
    'cover', 'center',
    '{}'::jsonb,
    'banner_image', 5,
    'FUTURE', 'FUTURE', false
  ),
  (
    'STORES_CATEGORY_INLINE', 'banner', 'stores_browse', 'inline',
    2, 1,
    'cover', 'center',
    '{}'::jsonb,
    'banner_image', 3,
    'FUTURE', 'FUTURE', false
  ),
  (
    'STORES_SEARCH_TOP', 'banner', 'stores_search', 'search_top',
    3, 1,
    'cover', 'center',
    '{}'::jsonb,
    'banner_image', 3,
    'FUTURE', 'FUTURE', false
  ),
  (
    'STORE_DETAIL_RECOMMENDATION_BANNER', 'banner', 'store_detail', 'recommendation',
    16, 9,
    'cover', 'center',
    '{}'::jsonb,
    'banner_image', 2,
    'FUTURE', 'FUTURE', false
  )
ON CONFLICT (key) DO UPDATE SET
  product_kind = EXCLUDED.product_kind,
  surface = EXCLUDED.surface,
  placement_type = EXCLUDED.placement_type,
  aspect_ratio_width = EXCLUDED.aspect_ratio_width,
  aspect_ratio_height = EXCLUDED.aspect_ratio_height,
  crop_policy = EXCLUDED.crop_policy,
  object_position = EXCLUDED.object_position,
  safe_area_json = EXCLUDED.safe_area_json,
  allowed_creative_type = EXCLUDED.allowed_creative_type,
  max_active_campaigns = EXCLUDED.max_active_campaigns,
  ratio_source = EXCLUDED.ratio_source,
  runtime_status = EXCLUDED.runtime_status,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- ── Creatives ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_ad_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_kind text NOT NULL
    CHECK (product_kind IN ('store_sponsored', 'banner')),
  owner_id uuid NULL,
  store_id uuid NULL REFERENCES public.stores (id) ON DELETE SET NULL,
  asset_path text NOT NULL DEFAULT '',
  asset_variant text NULL,
  source_width integer NULL,
  source_height integer NULL,
  source_aspect_ratio text NULL,
  headline text NULL,
  subcopy text NULL,
  cta_type text NULL
    CHECK (cta_type IS NULL OR cta_type IN ('store_detail', 'store_menu', 'store_promotion')),
  cta_target_id uuid NULL,
  cta_label text NULL,
  review_status text NOT NULL DEFAULT 'NOT_SUBMITTED'
    CHECK (review_status IN (
      'NOT_SUBMITTED', 'PENDING', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED'
    )),
  review_notes text NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  supersedes_creative_id uuid NULL REFERENCES public.delivery_ad_creatives (id) ON DELETE SET NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz NULL,
  CONSTRAINT delivery_ad_creatives_banner_asset_chk CHECK (
    product_kind <> 'banner' OR length(trim(asset_path)) > 0
  )
);

COMMENT ON TABLE public.delivery_ad_creatives IS
  'CUT B creative SSOT. Banner image via canonical storage asset_path — no arbitrary remote URL authority. CTA allowlist only.';

CREATE INDEX IF NOT EXISTS delivery_ad_creatives_store_idx
  ON public.delivery_ad_creatives (store_id, product_kind)
  WHERE archived_at IS NULL;

-- ── Campaign ALTER: store_paid_ad_campaigns ────────────────────────────────
ALTER TABLE public.store_paid_ad_campaigns
  ADD COLUMN IF NOT EXISTS product_key text NOT NULL DEFAULT 'store_sponsored',
  ADD COLUMN IF NOT EXISTS owner_user_id uuid NULL,
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN IF NOT EXISTS pricing_model text NULL,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS ended_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;

ALTER TABLE public.store_paid_ad_campaigns
  DROP CONSTRAINT IF EXISTS store_paid_ad_campaigns_product_key_chk;
ALTER TABLE public.store_paid_ad_campaigns
  ADD CONSTRAINT store_paid_ad_campaigns_product_key_chk
  CHECK (product_key = 'store_sponsored');

ALTER TABLE public.store_paid_ad_campaigns
  DROP CONSTRAINT IF EXISTS store_paid_ad_campaigns_lifecycle_chk;
ALTER TABLE public.store_paid_ad_campaigns
  ADD CONSTRAINT store_paid_ad_campaigns_lifecycle_chk
  CHECK (lifecycle_status IN (
    'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'APPROVED',
    'SCHEDULED', 'ACTIVE', 'PAUSED_OWNER', 'PAUSED_ADMIN', 'EXHAUSTED',
    'REJECTED', 'ENDED', 'TERMINATED', 'ARCHIVED'
  ));

ALTER TABLE public.store_paid_ad_campaigns
  DROP CONSTRAINT IF EXISTS store_paid_ad_campaigns_review_chk;
ALTER TABLE public.store_paid_ad_campaigns
  ADD CONSTRAINT store_paid_ad_campaigns_review_chk
  CHECK (review_status IN (
    'NOT_SUBMITTED', 'PENDING', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED'
  ));

ALTER TABLE public.store_paid_ad_campaigns
  DROP CONSTRAINT IF EXISTS store_paid_ad_campaigns_pricing_chk;
ALTER TABLE public.store_paid_ad_campaigns
  ADD CONSTRAINT store_paid_ad_campaigns_pricing_chk
  CHECK (
    pricing_model IS NULL OR pricing_model IN ('CPC', 'CPA_ORDER', 'ORDER_PERCENT', 'FIXED_PERIOD')
  );

UPDATE public.store_paid_ad_campaigns
SET
  lifecycle_status = CASE
    WHEN archived_at IS NOT NULL THEN 'ARCHIVED'
    WHEN is_active = false AND end_at <= now() THEN 'ENDED'
    WHEN is_active = false THEN 'PAUSED_ADMIN'
    WHEN start_at > now() THEN 'SCHEDULED'
    WHEN end_at <= now() THEN 'ENDED'
    ELSE 'ACTIVE'
  END,
  review_status = 'APPROVED',
  approved_at = COALESCE(approved_at, created_at),
  activated_at = CASE
    WHEN is_active = true AND start_at <= now() AND end_at > now()
    THEN COALESCE(activated_at, created_at)
    ELSE activated_at
  END,
  owner_user_id = COALESCE(owner_user_id, created_by_user_id),
  updated_at = now()
WHERE true;

-- ── Campaign ALTER: store_banner_ad_campaigns ───────────────────────────────
ALTER TABLE public.store_banner_ad_campaigns
  ADD COLUMN IF NOT EXISTS product_key text NOT NULL DEFAULT 'banner',
  ADD COLUMN IF NOT EXISTS owner_user_id uuid NULL,
  ADD COLUMN IF NOT EXISTS store_id uuid NULL REFERENCES public.stores (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS creative_id uuid NULL REFERENCES public.delivery_ad_creatives (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN IF NOT EXISTS pricing_model text NULL,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS ended_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;

ALTER TABLE public.store_banner_ad_campaigns
  DROP CONSTRAINT IF EXISTS store_banner_ad_campaigns_product_key_chk;
ALTER TABLE public.store_banner_ad_campaigns
  ADD CONSTRAINT store_banner_ad_campaigns_product_key_chk
  CHECK (product_key = 'banner');

ALTER TABLE public.store_banner_ad_campaigns
  DROP CONSTRAINT IF EXISTS store_banner_ad_campaigns_lifecycle_chk;
ALTER TABLE public.store_banner_ad_campaigns
  ADD CONSTRAINT store_banner_ad_campaigns_lifecycle_chk
  CHECK (lifecycle_status IN (
    'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'APPROVED',
    'SCHEDULED', 'ACTIVE', 'PAUSED_OWNER', 'PAUSED_ADMIN', 'EXHAUSTED',
    'REJECTED', 'ENDED', 'TERMINATED', 'ARCHIVED'
  ));

ALTER TABLE public.store_banner_ad_campaigns
  DROP CONSTRAINT IF EXISTS store_banner_ad_campaigns_review_chk;
ALTER TABLE public.store_banner_ad_campaigns
  ADD CONSTRAINT store_banner_ad_campaigns_review_chk
  CHECK (review_status IN (
    'NOT_SUBMITTED', 'PENDING', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED'
  ));

ALTER TABLE public.store_banner_ad_campaigns
  DROP CONSTRAINT IF EXISTS store_banner_ad_campaigns_pricing_chk;
ALTER TABLE public.store_banner_ad_campaigns
  ADD CONSTRAINT store_banner_ad_campaigns_pricing_chk
  CHECK (
    pricing_model IS NULL OR pricing_model IN ('CPC', 'CPA_ORDER', 'ORDER_PERCENT', 'FIXED_PERIOD')
  );

UPDATE public.store_banner_ad_campaigns
SET
  lifecycle_status = CASE
    WHEN archived_at IS NOT NULL THEN 'ARCHIVED'
    WHEN is_active = false AND end_at <= now() THEN 'ENDED'
    WHEN is_active = false THEN 'PAUSED_ADMIN'
    WHEN start_at > now() THEN 'SCHEDULED'
    WHEN end_at <= now() THEN 'ENDED'
    ELSE 'ACTIVE'
  END,
  review_status = 'APPROVED',
  approved_at = COALESCE(approved_at, created_at),
  activated_at = CASE
    WHEN is_active = true AND start_at <= now() AND end_at > now()
    THEN COALESCE(activated_at, created_at)
    ELSE activated_at
  END,
  owner_user_id = COALESCE(owner_user_id, created_by_user_id),
  updated_at = now()
WHERE true;

-- Backfill creatives from existing banner image_url (no data loss)
INSERT INTO public.delivery_ad_creatives (
  id, product_kind, owner_id, store_id, asset_path,
  headline, subcopy, review_status, version, created_by, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  'banner',
  b.created_by_user_id,
  b.store_id,
  b.image_url,
  b.title,
  b.subtitle,
  'APPROVED',
  1,
  b.created_by_user_id,
  b.created_at,
  b.updated_at
FROM public.store_banner_ad_campaigns b
WHERE b.creative_id IS NULL
  AND length(trim(b.image_url)) > 0;

UPDATE public.store_banner_ad_campaigns b
SET creative_id = c.id,
    updated_at = now()
FROM public.delivery_ad_creatives c
WHERE b.creative_id IS NULL
  AND c.product_kind = 'banner'
  AND c.asset_path = b.image_url
  AND c.headline IS NOT DISTINCT FROM b.title
  AND c.created_at = b.created_at;

-- ── Campaign ↔ inventory (product-specific junctions) ──────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_store_sponsored_campaign_inventories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.store_paid_ad_campaigns (id) ON DELETE CASCADE,
  inventory_id uuid NOT NULL REFERENCES public.delivery_ad_inventories (id) ON DELETE RESTRICT,
  priority integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, inventory_id)
);

CREATE TABLE IF NOT EXISTS public.delivery_banner_campaign_inventories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.store_banner_ad_campaigns (id) ON DELETE CASCADE,
  inventory_id uuid NOT NULL REFERENCES public.delivery_ad_inventories (id) ON DELETE RESTRICT,
  priority integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, inventory_id)
);

INSERT INTO public.delivery_store_sponsored_campaign_inventories (campaign_id, inventory_id, priority)
SELECT p.id, inv.id, 0
FROM public.store_paid_ad_campaigns p
JOIN public.delivery_ad_inventories inv
  ON inv.key = CASE p.placement
    WHEN 'stores_home' THEN 'STORES_HOME_FEED'
    WHEN 'stores_browse' THEN 'STORES_CATEGORY_FEED'
  END
WHERE NOT EXISTS (
  SELECT 1 FROM public.delivery_store_sponsored_campaign_inventories j
  WHERE j.campaign_id = p.id AND j.inventory_id = inv.id
);

INSERT INTO public.delivery_banner_campaign_inventories (campaign_id, inventory_id, priority)
SELECT b.id, inv.id, 0
FROM public.store_banner_ad_campaigns b
JOIN public.delivery_ad_inventories inv ON inv.key = 'STORES_HOME_HERO'
WHERE b.surface = 'stores_home_hero'
  AND NOT EXISTS (
    SELECT 1 FROM public.delivery_banner_campaign_inventories j
    WHERE j.campaign_id = b.id AND j.inventory_id = inv.id
  );

-- ── Audit (append-only intent) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_ad_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_kind text NOT NULL
    CHECK (product_kind IN ('store_sponsored', 'banner')),
  campaign_id uuid NOT NULL,
  actor_type text NOT NULL
    CHECK (actor_type IN ('owner', 'admin', 'system')),
  actor_user_id uuid NULL,
  action text NOT NULL,
  before_json jsonb NULL,
  after_json jsonb NULL,
  reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS delivery_ad_audit_logs_campaign_idx
  ON public.delivery_ad_audit_logs (product_kind, campaign_id, created_at DESC);

COMMENT ON TABLE public.delivery_ad_audit_logs IS
  'CUT B append-only audit foundation. No UPDATE/DELETE for app roles. Physical campaign delete ≠ audit purge.';

-- ── RLS foundation ─────────────────────────────────────────────────────────
ALTER TABLE public.delivery_ad_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_ad_inventories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_ad_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_store_sponsored_campaign_inventories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_banner_campaign_inventories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_ad_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS delivery_ad_products_select_all ON public.delivery_ad_products;
CREATE POLICY delivery_ad_products_select_all
  ON public.delivery_ad_products FOR SELECT TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS delivery_ad_inventories_select_active ON public.delivery_ad_inventories;
CREATE POLICY delivery_ad_inventories_select_active
  ON public.delivery_ad_inventories FOR SELECT TO authenticated, anon
  USING (is_active = true OR runtime_status = 'FUTURE');

DROP POLICY IF EXISTS delivery_ad_creatives_select_approved ON public.delivery_ad_creatives;
CREATE POLICY delivery_ad_creatives_select_approved
  ON public.delivery_ad_creatives FOR SELECT TO authenticated, anon
  USING (review_status = 'APPROVED' AND archived_at IS NULL);

DROP POLICY IF EXISTS delivery_sponsored_inv_select ON public.delivery_store_sponsored_campaign_inventories;
CREATE POLICY delivery_sponsored_inv_select
  ON public.delivery_store_sponsored_campaign_inventories FOR SELECT TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS delivery_banner_inv_select ON public.delivery_banner_campaign_inventories;
CREATE POLICY delivery_banner_inv_select
  ON public.delivery_banner_campaign_inventories FOR SELECT TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS delivery_ad_audit_logs_select_own ON public.delivery_ad_audit_logs;
CREATE POLICY delivery_ad_audit_logs_select_own
  ON public.delivery_ad_audit_logs FOR SELECT TO authenticated
  USING (actor_user_id = auth.uid());

COMMIT;
