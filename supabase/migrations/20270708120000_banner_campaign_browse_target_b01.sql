-- B-01 (docs/audit/delivery-audit-2026-10-29.md §4-3 · Owner 승인 2026-10-29)
-- 배너 캠페인 업종 대상 — 업종 상단(stores_browse_top) 배너가 모든 업종에 같은 배너로 나오던 원인 제거.
-- 상위 노출(store_paid_ad_campaigns.browse_primary_slug / browse_secondary_slug)과 같은 컬럼명·의미.
-- NULL = 전체 업종 (기존 행 동작 그대로). 2차는 1차가 있을 때만.

ALTER TABLE public.store_banner_ad_campaigns
  ADD COLUMN IF NOT EXISTS browse_primary_slug text,
  ADD COLUMN IF NOT EXISTS browse_secondary_slug text;

ALTER TABLE public.store_banner_ad_campaigns
  DROP CONSTRAINT IF EXISTS store_banner_ad_campaigns_browse_target_check;
ALTER TABLE public.store_banner_ad_campaigns
  ADD CONSTRAINT store_banner_ad_campaigns_browse_target_check
  CHECK (browse_secondary_slug IS NULL OR browse_primary_slug IS NOT NULL);

COMMENT ON COLUMN public.store_banner_ad_campaigns.browse_primary_slug IS
  '업종 상단 배너 대상 1차 업종 slug. NULL = 전체 업종.';
COMMENT ON COLUMN public.store_banner_ad_campaigns.browse_secondary_slug IS
  '업종 상단 배너 대상 2차 업종 slug. NULL = 1차 전체.';
