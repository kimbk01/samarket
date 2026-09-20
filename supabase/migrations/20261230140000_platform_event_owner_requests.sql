-- Owner Event/Promotion REQUEST SSOT (OWNED promotion — not paid Ads).
-- Reuses popup Owner request lifecycle statuses.
-- Approve ≠ Event publish ≠ Push send ≠ Distribution ON.
-- Production apply: NO until Owner Phase.

BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_event_owner_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  request_status text NOT NULL DEFAULT 'draft'
    CHECK (request_status IN (
      'draft',
      'submitted',
      'under_review',
      'revision_required',
      'approved',
      'rejected',
      'cancelled'
    )),
  title text NOT NULL DEFAULT '',
  subtitle text NULL,
  hero_image_url text NULL,
  hero_image_path text NULL,
  body text NULL,
  benefit_title text NULL,
  benefit_body text NULL,
  requested_starts_at timestamptz NULL,
  requested_ends_at timestamptz NULL,
  timezone text NOT NULL DEFAULT 'Asia/Manila',
  -- Suggested destination (store-scoped). Canonical public CTA decided at Event.
  destination_type text NOT NULL DEFAULT 'store'
    CHECK (destination_type IN (
      'store',
      'product',
      'internal_page',
      'external_url'
    )),
  destination_target text NOT NULL DEFAULT '',
  -- Suggested channels only (Admin Distribution remains canonical).
  requested_popup boolean NOT NULL DEFAULT false,
  requested_banner boolean NOT NULL DEFAULT false,
  requested_push boolean NOT NULL DEFAULT false,
  requested_bell boolean NOT NULL DEFAULT false,
  rejection_reason text NULL,
  revision_reason text NULL,
  platform_event_id uuid NULL REFERENCES public.platform_events (id) ON DELETE SET NULL,
  approve_idempotency_key text NULL,
  submitted_at timestamptz NULL,
  reviewed_at timestamptz NULL,
  reviewed_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_event_owner_requests_window_check CHECK (
    requested_starts_at IS NULL
    OR requested_ends_at IS NULL
    OR requested_starts_at < requested_ends_at
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_event_owner_requests_approve_idem_uq
  ON public.platform_event_owner_requests (approve_idempotency_key)
  WHERE approve_idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS platform_event_owner_requests_owner_store_idx
  ON public.platform_event_owner_requests (owner_user_id, store_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS platform_event_owner_requests_status_idx
  ON public.platform_event_owner_requests (request_status, submitted_at DESC NULLS LAST);

COMMENT ON TABLE public.platform_event_owner_requests IS
  'Owner OWNED promotion REQUEST. Not public Event. Approve adapter → platform_events. Push never auto-sends.';

-- Traceability on Event content SSOT (Admin still owns publish/distribution).
ALTER TABLE public.platform_events
  ADD COLUMN IF NOT EXISTS source_owner_request_id uuid NULL
    REFERENCES public.platform_event_owner_requests (id) ON DELETE SET NULL;

ALTER TABLE public.platform_events
  ADD COLUMN IF NOT EXISTS source_store_id uuid NULL
    REFERENCES public.stores (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS platform_events_source_owner_request_idx
  ON public.platform_events (source_owner_request_id)
  WHERE source_owner_request_id IS NOT NULL;

ALTER TABLE public.platform_event_owner_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.platform_event_owner_requests FROM PUBLIC;
GRANT ALL ON TABLE public.platform_event_owner_requests TO service_role;

-- Owner may read own rows only (writes via service-role API with ownership gate).
DROP POLICY IF EXISTS platform_event_owner_requests_owner_select ON public.platform_event_owner_requests;
CREATE POLICY platform_event_owner_requests_owner_select
  ON public.platform_event_owner_requests
  FOR SELECT
  TO authenticated
  USING (owner_user_id = auth.uid());

GRANT SELECT ON TABLE public.platform_event_owner_requests TO authenticated;

COMMIT;
