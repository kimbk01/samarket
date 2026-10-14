-- Rollback: 20270501120000_platform_popup_ptr_reveal.sql
-- 기존 팝업 제약·인덱스를 마이그레이션 직전 정의로 되돌린다.
-- 안전장치: PTR 띠 광고 데이터(ptr_reveal 캠페인 · ptr_band/비-default 소재)가 남아 있으면 중단한다.
--   (기존 CHECK 를 다시 걸면 그 행들이 위반되므로 — 먼저 관리자에서 종료·삭제하거나 운영자가 명시적으로 정리)

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.platform_popup_campaigns WHERE presentation_type = 'ptr_reveal')
     OR EXISTS (SELECT 1 FROM public.platform_popup_creatives WHERE creative_mode = 'ptr_band' OR variant <> 'default') THEN
    RAISE EXCEPTION 'ptr_reveal data exists — clean up PTR campaigns/creatives before rollback';
  END IF;
END $$;

DROP INDEX IF EXISTS public.platform_popup_creatives_one_ready_per_variant_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS platform_popup_creatives_one_ready_per_campaign_uidx
  ON public.platform_popup_creatives (campaign_id)
  WHERE status = 'ready';

ALTER TABLE public.platform_popup_creatives
  DROP CONSTRAINT IF EXISTS platform_popup_creatives_ptr_band_aspect,
  DROP CONSTRAINT IF EXISTS platform_popup_creatives_variant_requires_ptr_band,
  DROP CONSTRAINT IF EXISTS platform_popup_creatives_variant_check;

ALTER TABLE public.platform_popup_creatives DROP COLUMN IF EXISTS variant;

ALTER TABLE public.platform_popup_creatives
  DROP CONSTRAINT IF EXISTS platform_popup_creatives_creative_mode_check;
ALTER TABLE public.platform_popup_creatives
  ADD CONSTRAINT platform_popup_creatives_creative_mode_check
  CHECK (creative_mode IN ('card', 'artwork'));

ALTER TABLE public.platform_popup_campaigns
  DROP CONSTRAINT IF EXISTS platform_popup_campaigns_presentation_type_check;
ALTER TABLE public.platform_popup_campaigns
  ADD CONSTRAINT platform_popup_campaigns_presentation_type_check
  CHECK (presentation_type IN ('center_modal', 'bottom_sheet', 'benefit_dialog', 'inline_banner', 'hero_banner'));

COMMENT ON COLUMN public.platform_popup_campaigns.presentation_type IS
  'Interruptive: center_modal|bottom_sheet|benefit_dialog. Non-interruptive reserved: inline_banner|hero_banner.';

COMMIT;
