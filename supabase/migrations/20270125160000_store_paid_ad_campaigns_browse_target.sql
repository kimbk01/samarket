-- FD2: store_paid_ad_campaigns browse target columns ONLY.
-- Authority: product contract in load-store-insertion-campaigns /
-- owner-store-sponsored-writer (browse_target_kind / primary / secondary slugs).
--
-- Does NOT apply 20261201270000 wholesale (that file also creates
-- delivery_ad_business_cash_charge_requests). Cash charge table remains
-- local-only until a dedicated Owner phase; browse cols are independent.
-- Later apply of 20261201270000 is safe: ADD COLUMN IF NOT EXISTS no-ops.

BEGIN;

ALTER TABLE public.store_paid_ad_campaigns
  ADD COLUMN IF NOT EXISTS browse_target_kind text NULL
    CHECK (browse_target_kind IS NULL OR browse_target_kind IN ('primary', 'secondary')),
  ADD COLUMN IF NOT EXISTS browse_primary_slug text NULL,
  ADD COLUMN IF NOT EXISTS browse_secondary_slug text NULL;

COMMENT ON COLUMN public.store_paid_ad_campaigns.browse_target_kind IS
  'Product recovery: primary = 1st-level browse (sub=all); secondary = 2nd-level topic. NULL = legacy unscoped.';
COMMENT ON COLUMN public.store_paid_ad_campaigns.browse_primary_slug IS
  'Canonical primary category slug for browse targeting.';
COMMENT ON COLUMN public.store_paid_ad_campaigns.browse_secondary_slug IS
  'Canonical secondary topic slug when browse_target_kind = secondary.';

CREATE INDEX IF NOT EXISTS store_paid_ad_campaigns_browse_target_idx
  ON public.store_paid_ad_campaigns (placement, browse_target_kind, browse_primary_slug)
  WHERE placement = 'stores_browse';

COMMIT;
