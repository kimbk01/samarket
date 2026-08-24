-- CUT 5 — Stores HOME Hero BANNER_AD authority (NOT store_banners / feed_ad_campaigns / my_page_banners / STORE_PAID_AD).
-- Existing schema cannot represent stores_home_hero creative campaigns:
--   store_banners = per-store detail hero
--   feed_ad_campaigns = trade/community feed only
--   my_page_banners = mypage/general CMS (home_top ≠ Delivery HOME hero)
--   STORES_HOME_HERO_SLIDES = static text/gradient (not image campaign authority)

BEGIN;

CREATE TABLE IF NOT EXISTS public.store_banner_ad_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  surface text NOT NULL
    CHECK (surface IN ('stores_home_hero')),
  title text NULL,
  subtitle text NULL,
  image_url text NOT NULL,
  cta_href text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid NULL,
  updated_by_user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_banner_ad_campaigns_window_chk CHECK (end_at > start_at),
  CONSTRAINT store_banner_ad_campaigns_image_chk CHECK (length(trim(image_url)) > 0)
);

COMMENT ON TABLE public.store_banner_ad_campaigns IS
  'CUT 5 BANNER_AD — Stores HOME hero only (stores_home_hero). Visible = is_active AND window AND image_url. Not store_paid_ad_campaigns / store_banners / feed_ad_campaigns.';

CREATE INDEX IF NOT EXISTS store_banner_ad_campaigns_active_window_idx
  ON public.store_banner_ad_campaigns (surface, is_active, sort_order, start_at, end_at)
  WHERE is_active = true;

ALTER TABLE public.store_banner_ad_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_banner_ad_campaigns_select_active ON public.store_banner_ad_campaigns;
CREATE POLICY store_banner_ad_campaigns_select_active
  ON public.store_banner_ad_campaigns
  FOR SELECT
  TO authenticated, anon
  USING (
    is_active = true
    AND start_at <= now()
    AND end_at > now()
    AND length(trim(image_url)) > 0
  );

COMMIT;
