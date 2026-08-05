-- Customer Platform Notice SSOT (board). Campaigns/Bell are arrival only — not the notice original.
BEGIN;

CREATE TABLE IF NOT EXISTS public.app_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz NULL,
  ends_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_notices_active_created
  ON public.app_notices (is_active, created_at DESC);

COMMENT ON TABLE public.app_notices IS
  'DIBAY Customer Platform notice board SSOT. Push/Bell use notification_events + campaigns; do not treat inbox as notice history.';

COMMIT;
