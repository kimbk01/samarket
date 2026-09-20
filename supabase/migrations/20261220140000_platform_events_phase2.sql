-- Phase 2 — Platform Event content SSOT (Owner FINAL PROGRAM).
-- Additive. Do NOT apply to Production until Phase 7.
-- Does NOT rewrite Phase 1 benefit_dialog migration.

BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subtitle text NULL,
  hero_image_url text NULL,
  hero_image_path text NULL,
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  terms text NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'unpublished')),
  starts_at timestamptz NULL,
  ends_at timestamptz NULL,
  timezone text NOT NULL DEFAULT 'Asia/Manila',
  cta_label text NULL,
  cta_type text NULL
    CHECK (
      cta_type IS NULL
      OR cta_type IN (
        'trade_listing',
        'community_post',
        'store',
        'internal_page',
        'external_url',
        'event_detail'
      )
    ),
  cta_target text NOT NULL DEFAULT '',
  cta_external_url text NULL,
  published_at timestamptz NULL,
  created_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_events_window_check CHECK (
    starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at
  )
);

COMMENT ON TABLE public.platform_events IS
  'Phase 2 Event content SSOT. Popup/Banner/Push/Bell distribute; they do not store Event body.';

CREATE INDEX IF NOT EXISTS platform_events_status_updated_idx
  ON public.platform_events (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS platform_events_active_window_idx
  ON public.platform_events (status, starts_at, ends_at)
  WHERE status = 'published';

ALTER TABLE public.platform_events ENABLE ROW LEVEL SECURITY;

-- Public/member: published + in window only (select).
DROP POLICY IF EXISTS platform_events_public_select ON public.platform_events;
CREATE POLICY platform_events_public_select
  ON public.platform_events
  FOR SELECT
  TO anon, authenticated
  USING (
    status = 'published'
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now())
  );

-- Admin writes via service_role API (no client service-role).
REVOKE ALL ON TABLE public.platform_events FROM PUBLIC;
GRANT SELECT ON TABLE public.platform_events TO anon, authenticated;
GRANT ALL ON TABLE public.platform_events TO service_role;

-- Popup CTA may target EVENT_DETAIL.
ALTER TABLE public.platform_popup_campaigns
  DROP CONSTRAINT IF EXISTS platform_popup_campaigns_cta_type_check;

ALTER TABLE public.platform_popup_campaigns
  ADD CONSTRAINT platform_popup_campaigns_cta_type_check
  CHECK (cta_type IN (
    'trade_listing',
    'community_post',
    'store',
    'internal_page',
    'external_url',
    'event_detail'
  ));

-- Media bucket for Event hero/section images (Admin upload).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'platform-event-media',
  'platform-event-media',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
