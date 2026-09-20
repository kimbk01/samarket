-- Cross-channel lifecycle: same-Event intentional open coordinates interruptive Popup eligibility.
-- Does NOT replace platform_popup_user_suppressions (campaign frequency remains authority).
-- DIRECT visits are not written here (promotion-originated channels only).

CREATE TABLE IF NOT EXISTS public.platform_promotion_content_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.platform_events (id) ON DELETE CASCADE,
  user_id uuid NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  anonymous_device_key text NULL,
  source_channel text NOT NULL
    CHECK (source_channel IN ('POPUP', 'BANNER', 'PUSH', 'BELL')),
  distribution_id uuid NULL,
  session_key text NOT NULL,
  visited_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_promotion_content_visits_actor_check CHECK (
    (user_id IS NOT NULL AND anonymous_device_key IS NULL)
    OR (user_id IS NULL AND anonymous_device_key IS NOT NULL)
  )
);

COMMENT ON TABLE public.platform_promotion_content_visits IS
  'Promotion-originated Event destination opens. Session-scoped same-Event popup coordination. Not analytics; not frequency dismiss.';

CREATE INDEX IF NOT EXISTS platform_promotion_content_visits_user_session_event_idx
  ON public.platform_promotion_content_visits (user_id, session_key, event_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS platform_promotion_content_visits_anon_session_event_idx
  ON public.platform_promotion_content_visits (anonymous_device_key, session_key, event_id)
  WHERE anonymous_device_key IS NOT NULL;

ALTER TABLE public.platform_promotion_content_visits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.platform_promotion_content_visits FROM PUBLIC;
REVOKE ALL ON TABLE public.platform_promotion_content_visits FROM anon, authenticated;
GRANT SELECT ON TABLE public.platform_promotion_content_visits TO authenticated;
GRANT ALL ON TABLE public.platform_promotion_content_visits TO service_role;

DROP POLICY IF EXISTS platform_promotion_content_visits_own_select ON public.platform_promotion_content_visits;
CREATE POLICY platform_promotion_content_visits_own_select
  ON public.platform_promotion_content_visits
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
