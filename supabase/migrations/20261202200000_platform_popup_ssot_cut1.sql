-- CUT 1 — Platform Popup Advertisement SSOT foundation.
-- Dedicated domain. NOT store_banner_ad_campaigns / delivery_ad_inventories /
-- store_paid_ad_campaigns / feed_ad_campaigns / my_page_banners / app_notices.
-- Writes: service_role / server only. Consumer reads go through server resolver APIs (later CUTs).

BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_popup_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft',
      'pending_review',
      'approved',
      'scheduled',
      'active',
      'paused',
      'ended',
      'rejected'
    )),
  approval_status text NOT NULL DEFAULT 'not_submitted'
    CHECK (approval_status IN (
      'not_submitted',
      'pending_review',
      'approved',
      'rejected'
    )),
  owner_request_id uuid NULL,
  owner_store_id uuid NULL REFERENCES public.stores (id) ON DELETE SET NULL,
  priority integer NOT NULL DEFAULT 0,
  start_at timestamptz NULL,
  end_at timestamptz NULL,
  timezone text NOT NULL DEFAULT 'Asia/Manila',
  suppression_mode text NOT NULL DEFAULT 'TODAY'
    CHECK (suppression_mode IN (
      'CLOSE',
      'SESSION',
      'TODAY',
      'DURATION',
      'CAMPAIGN'
    )),
  suppression_duration_seconds integer NULL
    CHECK (
      suppression_duration_seconds IS NULL
      OR suppression_duration_seconds > 0
    ),
  cta_type text NOT NULL DEFAULT 'internal_page'
    CHECK (cta_type IN (
      'trade_listing',
      'community_post',
      'store',
      'internal_page',
      'external_url'
    )),
  cta_target text NOT NULL DEFAULT '',
  external_url text NULL,
  created_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  approved_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  approved_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_popup_campaigns_window_check CHECK (
    start_at IS NULL OR end_at IS NULL OR start_at < end_at
  ),
  CONSTRAINT platform_popup_campaigns_active_requires_approval CHECK (
    status NOT IN ('scheduled', 'active')
    OR approval_status = 'approved'
  )
);

COMMENT ON TABLE public.platform_popup_campaigns IS
  'CUT 1 Platform Popup campaign SSOT. payment != approval; ACTIVE/SCHEDULED require approval_status=approved.';

CREATE INDEX IF NOT EXISTS platform_popup_campaigns_status_priority_idx
  ON public.platform_popup_campaigns (status, priority DESC, start_at ASC NULLS LAST, id);

CREATE INDEX IF NOT EXISTS platform_popup_campaigns_window_idx
  ON public.platform_popup_campaigns (start_at, end_at)
  WHERE status IN ('scheduled', 'active');

CREATE INDEX IF NOT EXISTS platform_popup_campaigns_owner_store_idx
  ON public.platform_popup_campaigns (owner_store_id)
  WHERE owner_store_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.platform_popup_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.platform_popup_campaigns (id) ON DELETE CASCADE,
  asset_path text NOT NULL,
  asset_url text NULL,
  aspect_w integer NOT NULL DEFAULT 36,
  aspect_h integer NOT NULL DEFAULT 25,
  alt_text text NULL,
  status text NOT NULL DEFAULT 'ready'
    CHECK (status IN ('draft', 'ready', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_popup_creatives_aspect_36_25 CHECK (
    aspect_w = 36 AND aspect_h = 25
  )
);

COMMENT ON TABLE public.platform_popup_creatives IS
  'CUT 1 Platform Popup creative authority. Aspect contract locked 36:25 (GEOMETRY CUT 0-D). No renderer in CUT 1.';

CREATE UNIQUE INDEX IF NOT EXISTS platform_popup_creatives_one_ready_per_campaign_uidx
  ON public.platform_popup_creatives (campaign_id)
  WHERE status = 'ready';

CREATE INDEX IF NOT EXISTS platform_popup_creatives_campaign_idx
  ON public.platform_popup_creatives (campaign_id);

CREATE TABLE IF NOT EXISTS public.platform_popup_campaign_surfaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.platform_popup_campaigns (id) ON DELETE CASCADE,
  surface text NOT NULL
    CHECK (surface IN (
      'GLOBAL',
      'COMMUNITY',
      'TRADE',
      'DELIVERY',
      'MYPAGE'
    )),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_popup_campaign_surfaces_unique UNIQUE (campaign_id, surface)
);

COMMENT ON TABLE public.platform_popup_campaign_surfaces IS
  'CUT 1 canonical surface targeting. GLOBAL expands in code to COMMUNITY+TRADE+DELIVERY+MYPAGE. No pathname SSOT.';

CREATE INDEX IF NOT EXISTS platform_popup_campaign_surfaces_surface_idx
  ON public.platform_popup_campaign_surfaces (surface);

CREATE TABLE IF NOT EXISTS public.platform_popup_campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.platform_popup_campaigns (id) ON DELETE CASCADE,
  creative_id uuid NULL REFERENCES public.platform_popup_creatives (id) ON DELETE SET NULL,
  user_id uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  anonymous_device_key text NULL,
  event_type text NOT NULL
    CHECK (event_type IN (
      'eligible',
      'impression',
      'click',
      'dismiss',
      'suppress',
      'landing_success',
      'landing_failure'
    )),
  surface text NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_popup_campaign_events_actor_check CHECK (
    user_id IS NOT NULL OR anonymous_device_key IS NOT NULL OR event_type = 'eligible'
  )
);

COMMENT ON TABLE public.platform_popup_campaign_events IS
  'CUT 1 analytics authority. resolver/API response != impression. Impression only from production renderer later.';

CREATE INDEX IF NOT EXISTS platform_popup_campaign_events_campaign_created_idx
  ON public.platform_popup_campaign_events (campaign_id, created_at DESC);

CREATE INDEX IF NOT EXISTS platform_popup_campaign_events_type_created_idx
  ON public.platform_popup_campaign_events (event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS public.platform_popup_user_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  anonymous_device_key text NULL,
  campaign_id uuid NOT NULL REFERENCES public.platform_popup_campaigns (id) ON DELETE CASCADE,
  mode text NOT NULL
    CHECK (mode IN (
      'CLOSE',
      'SESSION',
      'TODAY',
      'DURATION',
      'CAMPAIGN'
    )),
  session_key text NULL,
  suppress_until timestamptz NULL,
  campaign_revision text NULL,
  timezone text NOT NULL DEFAULT 'Asia/Manila',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_popup_user_suppressions_actor_check CHECK (
    user_id IS NOT NULL OR anonymous_device_key IS NOT NULL
  )
);

COMMENT ON TABLE public.platform_popup_user_suppressions IS
  'CUT 1 suppression SSOT. TODAY = campaign TZ local calendar day end, NOT now+24h. Logged-in: user_id canonical.';

CREATE INDEX IF NOT EXISTS platform_popup_user_suppressions_user_campaign_idx
  ON public.platform_popup_user_suppressions (user_id, campaign_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS platform_popup_user_suppressions_anon_campaign_idx
  ON public.platform_popup_user_suppressions (anonymous_device_key, campaign_id, created_at DESC)
  WHERE anonymous_device_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS platform_popup_user_suppressions_until_idx
  ON public.platform_popup_user_suppressions (suppress_until)
  WHERE suppress_until IS NOT NULL;

-- RLS: no broad client write; admin SELECT via is_platform_admin; user SELECT own suppressions only.
ALTER TABLE public.platform_popup_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_popup_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_popup_campaign_surfaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_popup_campaign_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_popup_user_suppressions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.platform_popup_campaigns FROM PUBLIC;
REVOKE ALL ON TABLE public.platform_popup_campaigns FROM anon, authenticated;
GRANT SELECT ON TABLE public.platform_popup_campaigns TO authenticated;
GRANT ALL ON TABLE public.platform_popup_campaigns TO service_role;

REVOKE ALL ON TABLE public.platform_popup_creatives FROM PUBLIC;
REVOKE ALL ON TABLE public.platform_popup_creatives FROM anon, authenticated;
GRANT SELECT ON TABLE public.platform_popup_creatives TO authenticated;
GRANT ALL ON TABLE public.platform_popup_creatives TO service_role;

REVOKE ALL ON TABLE public.platform_popup_campaign_surfaces FROM PUBLIC;
REVOKE ALL ON TABLE public.platform_popup_campaign_surfaces FROM anon, authenticated;
GRANT SELECT ON TABLE public.platform_popup_campaign_surfaces TO authenticated;
GRANT ALL ON TABLE public.platform_popup_campaign_surfaces TO service_role;

REVOKE ALL ON TABLE public.platform_popup_campaign_events FROM PUBLIC;
REVOKE ALL ON TABLE public.platform_popup_campaign_events FROM anon, authenticated;
-- Events: no authenticated SELECT of commercial analytics by default.
GRANT ALL ON TABLE public.platform_popup_campaign_events TO service_role;

REVOKE ALL ON TABLE public.platform_popup_user_suppressions FROM PUBLIC;
REVOKE ALL ON TABLE public.platform_popup_user_suppressions FROM anon, authenticated;
GRANT SELECT ON TABLE public.platform_popup_user_suppressions TO authenticated;
GRANT ALL ON TABLE public.platform_popup_user_suppressions TO service_role;

DROP POLICY IF EXISTS platform_popup_campaigns_admin_select ON public.platform_popup_campaigns;
CREATE POLICY platform_popup_campaigns_admin_select
  ON public.platform_popup_campaigns
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS platform_popup_creatives_admin_select ON public.platform_popup_creatives;
CREATE POLICY platform_popup_creatives_admin_select
  ON public.platform_popup_creatives
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS platform_popup_surfaces_admin_select ON public.platform_popup_campaign_surfaces;
CREATE POLICY platform_popup_surfaces_admin_select
  ON public.platform_popup_campaign_surfaces
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS platform_popup_suppressions_own_select ON public.platform_popup_user_suppressions;
CREATE POLICY platform_popup_suppressions_own_select
  ON public.platform_popup_user_suppressions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS platform_popup_suppressions_admin_select ON public.platform_popup_user_suppressions;
CREATE POLICY platform_popup_suppressions_admin_select
  ON public.platform_popup_user_suppressions
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

COMMIT;
