-- Phase 3 — Promotion Distribution orchestration SSOT.
-- Additive. Links Event/Promotion CONTENT to existing channel engines.
-- Does NOT add channel columns to platform_events.
-- Does NOT rewrite Phase 2 migration.
-- Production apply: NO until Owner Phase 7.

BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_promotion_distributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type text NOT NULL
    CHECK (content_type IN ('platform_event')),
  content_id uuid NOT NULL REFERENCES public.platform_events (id) ON DELETE CASCADE,
  channel text NOT NULL
    CHECK (channel IN ('popup', 'banner', 'push', 'bell')),
  enabled boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'configured', 'active', 'disabled')),
  -- Existing engine ownership (not Event body):
  -- popup → platform_popup_campaigns
  -- banner → feed_ad_campaigns (ADMIN_DIRECT owned promo; not paid member request billing)
  -- push|bell → admin_notification_campaigns (separate rows; never merge to push_and_in_app here)
  channel_ref_type text NULL
    CHECK (
      channel_ref_type IS NULL
      OR channel_ref_type IN (
        'platform_popup_campaign',
        'feed_ad_campaign',
        'admin_notification_campaign'
      )
    ),
  channel_ref_id uuid NULL,
  -- Orchestration intent only (adapter applies into channel engines).
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_promotion_distributions_content_channel_uq
    UNIQUE (content_type, content_id, channel)
);

COMMENT ON TABLE public.platform_promotion_distributions IS
  'Phase 3 Distribution orchestration. Event=content; channels=independent engines. Save ≠ Push send.';

CREATE INDEX IF NOT EXISTS platform_promotion_distributions_content_idx
  ON public.platform_promotion_distributions (content_type, content_id);

CREATE INDEX IF NOT EXISTS platform_promotion_distributions_channel_enabled_idx
  ON public.platform_promotion_distributions (channel, enabled)
  WHERE enabled = true;

ALTER TABLE public.platform_promotion_distributions ENABLE ROW LEVEL SECURITY;

-- No public read of orchestration rows. Runtime uses channel engines only.
REVOKE ALL ON TABLE public.platform_promotion_distributions FROM PUBLIC;
GRANT ALL ON TABLE public.platform_promotion_distributions TO service_role;

COMMIT;
