-- Phase 1 — benefit_dialog interruptive presentation (Owner FINAL PROGRAM).
-- Additive CHECK expansion only. Do NOT apply to Production until Phase 7.
-- Local / Preview apply OK for Admin save of Type D.

BEGIN;

ALTER TABLE public.platform_popup_campaigns
  DROP CONSTRAINT IF EXISTS platform_popup_campaigns_presentation_type_check;

ALTER TABLE public.platform_popup_campaigns
  ADD CONSTRAINT platform_popup_campaigns_presentation_type_check
  CHECK (presentation_type IN (
    'center_modal',
    'bottom_sheet',
    'benefit_dialog',
    'inline_banner',
    'hero_banner'
  ));

COMMENT ON COLUMN public.platform_popup_campaigns.presentation_type IS
  'Interruptive: center_modal|bottom_sheet|benefit_dialog. Non-interruptive reserved: inline_banner|hero_banner.';

COMMENT ON COLUMN public.platform_popup_campaigns.frequency_mode IS
  'Dismiss suppress authority: once_per_session|once_per_day|once_campaign|close_only. Applied on X/Back/ESC — not on impression.';

COMMIT;
