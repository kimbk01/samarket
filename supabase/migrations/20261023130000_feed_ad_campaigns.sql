-- Feed Advertisement Campaign SSOT (Admin-operated; no D-Point / Business Credit debit).
-- Creative slides 1..3. Placement + category/topic targeting.

BEGIN;

CREATE TABLE IF NOT EXISTS public.feed_ad_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  domain text NOT NULL CHECK (domain IN ('trade', 'community')),
  placement text NOT NULL CHECK (placement IN (
    'TRADE_HOME', 'TRADE_CATEGORY', 'COMMUNITY_HOME', 'COMMUNITY_TOPIC'
  )),
  target_category_id text,
  target_topic_slug text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'active', 'paused', 'ended')),
  priority integer NOT NULL DEFAULT 100,
  start_at timestamptz,
  end_at timestamptz,
  destination_type text NOT NULL DEFAULT 'internal_page'
    CHECK (destination_type IN (
      'trade_listing', 'community_post', 'store', 'internal_page', 'external_url'
    )),
  destination_id text NOT NULL DEFAULT '',
  destination_url text NOT NULL DEFAULT '',
  impression_count integer NOT NULL DEFAULT 0,
  click_count integer NOT NULL DEFAULT 0,
  admin_memo text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feed_ad_campaigns_active_window
  ON public.feed_ad_campaigns (domain, placement, status, start_at, end_at);

CREATE TABLE IF NOT EXISTS public.feed_ad_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.feed_ad_campaigns(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 1 CHECK (sort_order BETWEEN 1 AND 3),
  image_url text NOT NULL DEFAULT '',
  alt_text text NOT NULL DEFAULT '',
  headline text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  cta_label text NOT NULL DEFAULT '',
  destination_type text,
  destination_id text,
  destination_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, sort_order)
);

CREATE INDEX IF NOT EXISTS idx_feed_ad_creatives_campaign
  ON public.feed_ad_creatives (campaign_id, sort_order);

ALTER TABLE public.feed_ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_ad_creatives ENABLE ROW LEVEL SECURITY;

-- Public read of active campaigns (feed projection via service role preferred)
DROP POLICY IF EXISTS feed_ad_campaigns_select_active ON public.feed_ad_campaigns;
CREATE POLICY feed_ad_campaigns_select_active
  ON public.feed_ad_campaigns FOR SELECT
  TO authenticated, anon
  USING (
    status = 'active'
    AND (start_at IS NULL OR start_at <= now())
    AND (end_at IS NULL OR end_at >= now())
  );

DROP POLICY IF EXISTS feed_ad_creatives_select_active ON public.feed_ad_creatives;
CREATE POLICY feed_ad_creatives_select_active
  ON public.feed_ad_creatives FOR SELECT
  TO authenticated, anon
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.feed_ad_campaigns c
      WHERE c.id = feed_ad_creatives.campaign_id
        AND c.status = 'active'
        AND (c.start_at IS NULL OR c.start_at <= now())
        AND (c.end_at IS NULL OR c.end_at >= now())
    )
  );

COMMENT ON TABLE public.feed_ad_campaigns IS
  'Admin Feed Advertisement campaigns. No AST-001/AST-002 debit in v1.';
COMMENT ON TABLE public.feed_ad_creatives IS
  'Up to 3 slides per campaign. Blank slides omitted at projection.';

COMMIT;
