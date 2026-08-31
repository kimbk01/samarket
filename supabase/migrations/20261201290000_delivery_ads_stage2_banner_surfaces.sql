-- Stage 2 — Banner physical surfaces + inventory activation
-- HOME before-rest (STORES_HOME_INLINE_1) + BROWSE top (STORES_CATEGORY_TOP)
-- SEARCH_TOP remains schema-only / NOT_SELLABLE for launch.
-- No finance changes. No Business Cash.
-- Column names match Production delivery_ad_inventories
-- (aspect_ratio_width / aspect_ratio_height; no notes column).

BEGIN;

-- Expand banner campaign surface CHECK
ALTER TABLE public.store_banner_ad_campaigns
  DROP CONSTRAINT IF EXISTS store_banner_ad_campaigns_surface_check;

ALTER TABLE public.store_banner_ad_campaigns
  ADD CONSTRAINT store_banner_ad_campaigns_surface_check
  CHECK (surface IN (
    'stores_home_hero',
    'stores_search',
    'stores_home_inline',
    'stores_browse_top'
  ));

COMMENT ON COLUMN public.store_banner_ad_campaigns.surface IS
  'Stage 2: stores_home_hero | stores_search | stores_home_inline | stores_browse_top';

-- Activate physical inventories (commercial sell may stay NOT_SELLABLE until Stage 3+)
UPDATE public.delivery_ad_inventories
SET
  aspect_ratio_width = 2,
  aspect_ratio_height = 1,
  ratio_source = 'CURRENT_RUNTIME_MEASURED',
  runtime_status = 'ACTIVE',
  is_active = true,
  updated_at = now()
WHERE key = 'STORES_HOME_INLINE_1';

UPDATE public.delivery_ad_inventories
SET
  aspect_ratio_width = 2,
  aspect_ratio_height = 1,
  ratio_source = 'CURRENT_RUNTIME_MEASURED',
  runtime_status = 'ACTIVE',
  is_active = true,
  updated_at = now()
WHERE key = 'STORES_CATEGORY_TOP';

-- Keep INLINE rejected for Stage 2
UPDATE public.delivery_ad_inventories
SET
  runtime_status = 'FUTURE',
  is_active = false,
  updated_at = now()
WHERE key = 'STORES_CATEGORY_INLINE';

COMMIT;
