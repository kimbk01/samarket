-- PTR Reveal Banner — Platform Popup 비간섭 프레젠테이션 `ptr_reveal` + 띠 이미지 소재 `ptr_band`
-- + 기기 변형(variant: default=휴대폰, tablet=태블릿).
-- 기존 팝업(center_modal·bottom_sheet·benefit_dialog) 동작은 변경하지 않는다.
-- 재실행 안전(IF EXISTS / IF NOT EXISTS) — 제약이 누락된 환경(스키마 드리프트)에서도 적용 가능.

BEGIN;

-- 1) presentation_type 에 ptr_reveal 추가
ALTER TABLE public.platform_popup_campaigns
  DROP CONSTRAINT IF EXISTS platform_popup_campaigns_presentation_type_check;

ALTER TABLE public.platform_popup_campaigns
  ADD CONSTRAINT platform_popup_campaigns_presentation_type_check
  CHECK (presentation_type IN (
    'center_modal',
    'bottom_sheet',
    'benefit_dialog',
    'inline_banner',
    'hero_banner',
    'ptr_reveal'
  ));

COMMENT ON COLUMN public.platform_popup_campaigns.presentation_type IS
  'Interruptive: center_modal|bottom_sheet|benefit_dialog. Non-interruptive: ptr_reveal (당겨서 새로고침 띠 배너). Reserved: inline_banner|hero_banner.';

-- 2) creative_mode 에 ptr_band 추가
ALTER TABLE public.platform_popup_creatives
  DROP CONSTRAINT IF EXISTS platform_popup_creatives_creative_mode_check;

ALTER TABLE public.platform_popup_creatives
  ADD CONSTRAINT platform_popup_creatives_creative_mode_check
  CHECK (creative_mode IN ('card', 'artwork', 'ptr_band'));

-- 3) 소재 변형 — default(휴대폰·기존 팝업 전부) / tablet(태블릿 띠) / logo(광고주 로고) — tablet·logo 는 ptr_band 전용
ALTER TABLE public.platform_popup_creatives
  ADD COLUMN IF NOT EXISTS variant text NOT NULL DEFAULT 'default';

ALTER TABLE public.platform_popup_creatives
  DROP CONSTRAINT IF EXISTS platform_popup_creatives_variant_check;

ALTER TABLE public.platform_popup_creatives
  ADD CONSTRAINT platform_popup_creatives_variant_check
  CHECK (variant IN ('default', 'tablet', 'logo'));

ALTER TABLE public.platform_popup_creatives
  DROP CONSTRAINT IF EXISTS platform_popup_creatives_variant_requires_ptr_band;

ALTER TABLE public.platform_popup_creatives
  ADD CONSTRAINT platform_popup_creatives_variant_requires_ptr_band
  CHECK (variant = 'default' OR creative_mode = 'ptr_band');

-- 비율 토큰: 휴대폰 띠 4:1, 태블릿 띠 8:1, 로고 1:1 (잠정 — 실기기 검증 후 Owner 확정)
ALTER TABLE public.platform_popup_creatives
  DROP CONSTRAINT IF EXISTS platform_popup_creatives_ptr_band_aspect;

ALTER TABLE public.platform_popup_creatives
  ADD CONSTRAINT platform_popup_creatives_ptr_band_aspect
  CHECK (
    creative_mode <> 'ptr_band'
    OR (variant = 'default' AND aspect_w = 4 AND aspect_h = 1)
    OR (variant = 'tablet' AND aspect_w = 8 AND aspect_h = 1)
    OR (variant = 'logo' AND aspect_w = 1 AND aspect_h = 1)
  );

-- 4) 캠페인당 ready 소재 1개 → (캠페인, 변형)당 1개
--    제약 완화가 아닌 동치 치환: 팝업 소재는 variant_requires_ptr_band 로 항상 'default' 이므로
--    팝업 캠페인의 "ready 1개" 보장은 그대로이고, PTR 캠페인만 변형별(휴대폰·태블릿·로고) 1개씩 허용된다.
--    롤백: supabase/rollback/20270501120000_platform_popup_ptr_reveal_rollback.sql
DROP INDEX IF EXISTS public.platform_popup_creatives_one_ready_per_campaign_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS platform_popup_creatives_one_ready_per_variant_uidx
  ON public.platform_popup_creatives (campaign_id, variant)
  WHERE status = 'ready';

COMMENT ON COLUMN public.platform_popup_creatives.variant IS
  'default=휴대폰(모든 프레젠테이션), tablet=태블릿 전용 띠, logo=광고주 로고(ptr_band). 태블릿 띠가 없으면 태블릿에는 PTR 배너 미노출.';

COMMIT;
