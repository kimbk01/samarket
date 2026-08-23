-- P1-D B1 — Store period campaign discovery AUTHORITY only.
-- Consume (HOME shelf / composer / BROWSE / ranking): OUT.
-- store_banners / stores.is_featured / Ads: PRESERVE / OUT (do not reuse).

CREATE TABLE IF NOT EXISTS public.store_discovery_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  campaign_type text NOT NULL
    CHECK (campaign_type IN ('event', 'promo')),
  title text NOT NULL,
  body_copy text NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid NULL,
  updated_by_user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_discovery_campaigns_window_chk CHECK (end_at > start_at)
);

COMMENT ON TABLE public.store_discovery_campaigns IS
  'P1-D B1 SSOT: period store discovery campaign. Active = is_active AND start_at <= now() AND end_at > now(). Not store_banners / is_featured / ads.';

COMMENT ON COLUMN public.store_discovery_campaigns.campaign_type IS
  'Closed set: event | promo. Discovery taxonomy only — not paid placement.';

COMMENT ON COLUMN public.store_discovery_campaigns.is_active IS
  'Explicit owner active flag. False => excluded even inside window.';

CREATE INDEX IF NOT EXISTS store_discovery_campaigns_store_window_idx
  ON public.store_discovery_campaigns (store_id, is_active, start_at, end_at);

CREATE INDEX IF NOT EXISTS store_discovery_campaigns_active_window_idx
  ON public.store_discovery_campaigns (is_active, start_at, end_at)
  WHERE is_active = true;
