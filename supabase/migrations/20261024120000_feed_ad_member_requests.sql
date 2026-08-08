-- Member Feed Ad Request + campaign source + banner products + holds
-- CONTRACT: docs/dibay-paid-exposure-feed-ad-master-contract.md
-- Additive only. No drop of post_ads / trade_ad_point_holds.

BEGIN;

-- ── Campaign source (ADMIN_DIRECT | MEMBER_REQUESTED) ───────────────────────
ALTER TABLE public.feed_ad_campaigns
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'ADMIN_DIRECT';

ALTER TABLE public.feed_ad_campaigns
  DROP CONSTRAINT IF EXISTS feed_ad_campaigns_source_check;

ALTER TABLE public.feed_ad_campaigns
  ADD CONSTRAINT feed_ad_campaigns_source_check
  CHECK (source IN ('ADMIN_DIRECT', 'MEMBER_REQUESTED'));

ALTER TABLE public.feed_ad_campaigns
  ADD COLUMN IF NOT EXISTS request_id uuid;

COMMENT ON COLUMN public.feed_ad_campaigns.source IS
  'ADMIN_DIRECT = ops CMS (debit 0). MEMBER_REQUESTED = member D-Point capture.';

-- ── Banner product catalog (prices reused from existing ad_products seeds) ──
CREATE TABLE IF NOT EXISTS public.feed_ad_products (
  id text PRIMARY KEY,
  domain text NOT NULL CHECK (domain IN ('trade', 'community')),
  duration_days integer NOT NULL CHECK (duration_days > 0 AND duration_days <= 90),
  point_cost integer NOT NULL CHECK (point_cost > 0),
  title_ko text NOT NULL DEFAULT '',
  title_en text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.feed_ad_products (
  id, domain, duration_days, point_cost, title_ko, title_en, sort_order
) VALUES
  ('feed_banner_trade_3', 'trade', 3, 8000,
    '거래 피드 광고 3일', 'Trade feed ad 3 days', 10),
  ('feed_banner_trade_7', 'trade', 7, 15000,
    '거래 피드 광고 7일', 'Trade feed ad 7 days', 20),
  ('feed_banner_community_3', 'community', 3, 10000,
    '커뮤니티 피드 광고 3일', 'Community feed ad 3 days', 30),
  ('feed_banner_community_7', 'community', 7, 20000,
    '커뮤니티 피드 광고 7일', 'Community feed ad 7 days', 40)
ON CONFLICT (id) DO NOTHING;

-- ── Member requests ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.feed_ad_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES public.feed_ad_products(id),
  domain text NOT NULL CHECK (domain IN ('trade', 'community')),
  placement text NOT NULL CHECK (placement IN (
    'TRADE_HOME', 'TRADE_CATEGORY', 'COMMUNITY_HOME', 'COMMUNITY_TOPIC'
  )),
  target_category_id text,
  target_topic_slug text,
  destination_type text NOT NULL DEFAULT 'internal_page'
    CHECK (destination_type IN (
      'trade_listing', 'community_post', 'store', 'internal_page', 'external_url'
    )),
  destination_id text NOT NULL DEFAULT '',
  destination_url text NOT NULL DEFAULT '',
  duration_days integer NOT NULL CHECK (duration_days > 0),
  point_cost integer NOT NULL CHECK (point_cost > 0),
  status text NOT NULL DEFAULT 'pending_review'
    CHECK (status IN (
      'pending_review', 'approved', 'rejected', 'cancelled', 'active', 'ended'
    )),
  campaign_id uuid REFERENCES public.feed_ad_campaigns(id) ON DELETE SET NULL,
  hold_id uuid,
  review_reason text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  start_at timestamptz,
  end_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feed_ad_requests_user_created
  ON public.feed_ad_requests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_ad_requests_status
  ON public.feed_ad_requests (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.feed_ad_request_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.feed_ad_requests(id) ON DELETE CASCADE,
  sort_order integer NOT NULL CHECK (sort_order BETWEEN 1 AND 3),
  image_url text NOT NULL DEFAULT '',
  alt_text text NOT NULL DEFAULT '',
  headline text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, sort_order)
);

-- ── Point holds for feed ad requests (mirror trade_ad_point_holds pattern) ──
CREATE TABLE IF NOT EXISTS public.feed_ad_point_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES public.feed_ad_requests(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount >= 0),
  status text NOT NULL DEFAULT 'held'
    CHECK (status IN ('held', 'released', 'captured')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feed_ad_point_holds_request
  ON public.feed_ad_point_holds (request_id, status);
CREATE INDEX IF NOT EXISTS idx_feed_ad_point_holds_user
  ON public.feed_ad_point_holds (user_id);

-- FK campaign.request_id after requests exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'feed_ad_campaigns_request_id_fkey'
  ) THEN
    ALTER TABLE public.feed_ad_campaigns
      ADD CONSTRAINT feed_ad_campaigns_request_id_fkey
      FOREIGN KEY (request_id) REFERENCES public.feed_ad_requests(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.feed_ad_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_ad_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_ad_request_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_ad_point_holds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feed_ad_products_select_active ON public.feed_ad_products;
CREATE POLICY feed_ad_products_select_active
  ON public.feed_ad_products FOR SELECT
  TO authenticated, anon
  USING (is_active = true);

DROP POLICY IF EXISTS feed_ad_requests_select_own ON public.feed_ad_requests;
CREATE POLICY feed_ad_requests_select_own
  ON public.feed_ad_requests FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS feed_ad_requests_insert_own ON public.feed_ad_requests;
CREATE POLICY feed_ad_requests_insert_own
  ON public.feed_ad_requests FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS feed_ad_request_creatives_select_own ON public.feed_ad_request_creatives;
CREATE POLICY feed_ad_request_creatives_select_own
  ON public.feed_ad_request_creatives FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.feed_ad_requests r
      WHERE r.id = feed_ad_request_creatives.request_id AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS feed_ad_point_holds_select_own ON public.feed_ad_point_holds;
CREATE POLICY feed_ad_point_holds_select_own
  ON public.feed_ad_point_holds FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE public.feed_ad_requests IS
  'Member Feed Ad Request — HOLD on apply; CAPTURE+campaign on approve; RELEASE on reject.';
COMMENT ON TABLE public.feed_ad_products IS
  'Banner D-Point products. Costs reused from trade list_top / premium and plife top_fixed seeds.';

COMMIT;
