-- DIBAY Gift Admin M3: single gift_admin_events audit authority

BEGIN;

CREATE TABLE IF NOT EXISTS public.gift_admin_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL
    CHECK (entity_type IN (
      'product',
      'instance',
      'application',
      'cash_out',
      'conversion',
      'recovery',
      'redemption',
      'system'
    )),
  entity_id text NOT NULL,
  event_type text NOT NULL,
  operator_id uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  reason text NULL,
  before_json jsonb NULL,
  after_json jsonb NULL,
  reference text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gift_admin_events_entity_idx
  ON public.gift_admin_events (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS gift_admin_events_type_idx
  ON public.gift_admin_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS gift_admin_events_created_idx
  ON public.gift_admin_events (created_at DESC);

COMMENT ON TABLE public.gift_admin_events IS
  'Canonical Gift Admin audit event store (DESIGN LOCK Phase H).';

ALTER TABLE public.gift_admin_events ENABLE ROW LEVEL SECURITY;

-- Admin APIs use service role; deny direct client writes.
REVOKE ALL ON public.gift_admin_events FROM PUBLIC;
GRANT SELECT, INSERT ON public.gift_admin_events TO service_role;

COMMIT;
