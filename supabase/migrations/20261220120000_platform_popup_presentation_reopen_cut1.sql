-- CUT 1 — Popup Presentation LOCK reopen (Owner 2026-09-20).
-- Additive only. Does NOT replace Ads / Notification / First Entry SSOTs.
-- Must run AFTER 20261202200000_platform_popup_ssot_cut1.
-- INLINE_BANNER / HERO_BANNER reserved for non-interruptive hosts (later CUT).

BEGIN;

ALTER TABLE public.platform_popup_campaigns
  ADD COLUMN IF NOT EXISTS presentation_type text NOT NULL DEFAULT 'bottom_sheet'
    CHECK (presentation_type IN (
      'center_modal',
      'bottom_sheet',
      'inline_banner',
      'hero_banner'
    ));

ALTER TABLE public.platform_popup_campaigns
  ADD COLUMN IF NOT EXISTS frequency_mode text NOT NULL DEFAULT 'once_per_session'
    CHECK (frequency_mode IN (
      'once_per_session',
      'once_per_day',
      'once_campaign',
      'close_only'
    ));

-- Existing rows keep prior CLOSE-only re-exposure until Admin updates frequency.
UPDATE public.platform_popup_campaigns
SET frequency_mode = 'close_only'
WHERE frequency_mode = 'once_per_session';

ALTER TABLE public.platform_popup_creatives
  ADD COLUMN IF NOT EXISTS creative_mode text NOT NULL DEFAULT 'card'
    CHECK (creative_mode IN ('card', 'artwork'));

-- ARTWORK may store intrinsic aspect; CARD remains 36:25.
ALTER TABLE public.platform_popup_creatives
  DROP CONSTRAINT IF EXISTS platform_popup_creatives_aspect_36_25;

ALTER TABLE public.platform_popup_creatives
  DROP CONSTRAINT IF EXISTS platform_popup_creatives_aspect_positive;

ALTER TABLE public.platform_popup_creatives
  ADD CONSTRAINT platform_popup_creatives_aspect_positive
  CHECK (aspect_w > 0 AND aspect_h > 0);

ALTER TABLE public.platform_popup_creatives
  DROP CONSTRAINT IF EXISTS platform_popup_creatives_card_aspect_36_25;

ALTER TABLE public.platform_popup_creatives
  ADD CONSTRAINT platform_popup_creatives_card_aspect_36_25
  CHECK (
    creative_mode <> 'card'
    OR (aspect_w = 36 AND aspect_h = 25)
  );

COMMENT ON COLUMN public.platform_popup_campaigns.presentation_type IS
  'Interruptive: center_modal|bottom_sheet. Non-interruptive reserved: inline_banner|hero_banner.';
COMMENT ON COLUMN public.platform_popup_campaigns.frequency_mode IS
  'Post-impression cap: once_per_session|once_per_day|once_campaign|close_only(legacy).';
COMMENT ON COLUMN public.platform_popup_creatives.creative_mode IS
  'card=36:25 opaque crop; artwork=alpha PNG/WebP contain overflow.';

COMMIT;
