-- Presentation content fields for interruptive Platform Popup A–D.
-- Local migration only — NO Production apply in this close.
-- Extends existing campaign SSOT; does not create a second popup engine.

BEGIN;

ALTER TABLE public.platform_popup_campaigns
  ADD COLUMN IF NOT EXISTS cta_label text NULL;

ALTER TABLE public.platform_popup_campaigns
  ADD COLUMN IF NOT EXISTS title text NULL;

ALTER TABLE public.platform_popup_campaigns
  ADD COLUMN IF NOT EXISTS body text NULL;

COMMENT ON COLUMN public.platform_popup_campaigns.cta_label IS
  'Primary CTA button label. Null = image tap only (no button chrome).';
COMMENT ON COLUMN public.platform_popup_campaigns.title IS
  'Optional presentation title (Artwork card / Card / Sheet / Benefit).';
COMMENT ON COLUMN public.platform_popup_campaigns.body IS
  'Optional presentation body/subcopy. Empty = no blank container.';

COMMIT;
