-- CUT D — Legacy post_ads catalog hygiene
-- Align ad_products.is_active with write/sellable authority
-- (post-ads-authority.ts: highlight/top_fixed/mid_insert NEW WRITES CLOSED).
--
-- Semantics (proven):
--   is_active=true  → currently offered / sellable in active catalogs
--   is_active=false → not currently offered; row + FK history retained
--
-- Safe for historical reads:
--   fetchAdProductById / post_ads embeds / trade_post_ads by-id do NOT require is_active=true
--   Service-role Admin lists still see inactive rows via fetchAllAdProductsFromDb
--
-- DO NOT DELETE rows. DO NOT DROP table. DO NOT alter post_ads.

UPDATE public.ad_products
SET
  is_active = false,
  updated_at = now()
WHERE ad_type IN ('highlight', 'top_fixed', 'mid_insert')
  AND is_active IS DISTINCT FROM false;

COMMENT ON COLUMN public.ad_products.is_active IS
  'Operational offer flag: true = currently sellable/offered in active product catalogs. '
  'false = not currently offered. Historical FK resolution (post_ads / trade_post_ads) '
  'must read by id without requiring is_active=true. CUT D 2026-09-19.';
