-- H-12 (2026-10-28 delivery audit §F) — capacity has ONE authority: code
-- `lib/ads/banner-placement-capacity-ssot.ts` (Owner LOCK, used by capacity gate + runtime clamp).
-- `delivery_ad_inventories.max_active_campaigns` is not read by runtime; align it to the code max
-- so the two values no longer disagree (HERO 10→5, CATEGORY_TOP 5→3, SEARCH_TOP 3→1).
UPDATE public.delivery_ad_inventories SET max_active_campaigns = 5, updated_at = now()
WHERE key = 'STORES_HOME_HERO' AND max_active_campaigns IS DISTINCT FROM 5;
UPDATE public.delivery_ad_inventories SET max_active_campaigns = 3, updated_at = now()
WHERE key = 'STORES_HOME_INLINE_1' AND max_active_campaigns IS DISTINCT FROM 3;
UPDATE public.delivery_ad_inventories SET max_active_campaigns = 3, updated_at = now()
WHERE key = 'STORES_CATEGORY_TOP' AND max_active_campaigns IS DISTINCT FROM 3;
UPDATE public.delivery_ad_inventories SET max_active_campaigns = 1, updated_at = now()
WHERE key = 'STORES_SEARCH_TOP' AND max_active_campaigns IS DISTINCT FROM 1;

COMMENT ON COLUMN public.delivery_ad_inventories.max_active_campaigns IS
  'Mirror of lib/ads/banner-placement-capacity-ssot.ts max (code is the authority; runtime does not read this column).';
