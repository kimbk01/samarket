-- DIBAY Manner Battery SSOT (manner_trade_v1)
-- Immutable trust_events → policy → calculator → member_trust_snapshots
-- Domain architecture: trade | community | delivery | platform
-- Scoring v1: TRADE ACTIVE only; community/delivery domains present but inactive.

CREATE TABLE IF NOT EXISTS public.trust_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  domain text NOT NULL CHECK (domain IN ('trade', 'community', 'delivery', 'platform')),
  event_type text NOT NULL,
  source_type text NOT NULL,
  source_id uuid,
  counterparty_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('positive', 'neutral', 'negative', 'ops')),
  severity text NOT NULL DEFAULT 'none'
    CHECK (severity IN ('none', 'low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'reversed')),
  occurred_at timestamptz NOT NULL,
  confirmed_at timestamptz,
  idempotency_key text NOT NULL,
  policy_version text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trust_events_idempotency_key_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS trust_events_member_occurred_idx
  ON public.trust_events (member_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS trust_events_member_domain_status_idx
  ON public.trust_events (member_id, domain, status);

CREATE INDEX IF NOT EXISTS trust_events_source_idx
  ON public.trust_events (source_type, source_id);

COMMENT ON TABLE public.trust_events IS
  'DIBAY Manner Battery immutable trust event ledger (SSOT history).';

CREATE TABLE IF NOT EXISTS public.trust_score_policy (
  policy_version text PRIMARY KEY,
  active boolean NOT NULL DEFAULT false,
  range_min numeric NOT NULL DEFAULT 0,
  range_max numeric NOT NULL DEFAULT 100,
  neutral_score numeric NOT NULL DEFAULT 50,
  window_days integer NOT NULL DEFAULT 365,
  trade_active boolean NOT NULL DEFAULT true,
  community_active boolean NOT NULL DEFAULT false,
  delivery_active boolean NOT NULL DEFAULT false,
  calculator_kind text NOT NULL,
  calculator_params jsonb NOT NULL DEFAULT '{}'::jsonb,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.trust_score_policy (
  policy_version,
  active,
  range_min,
  range_max,
  neutral_score,
  window_days,
  trade_active,
  community_active,
  delivery_active,
  calculator_kind,
  calculator_params
) VALUES (
  'manner_trade_v1',
  true,
  0,
  100,
  50,
  365,
  true,
  false,
  false,
  'bounded_evidence_ratio',
  jsonb_build_object(
    'amplitude', 50,
    'prior', 5,
    'bad_weight', 0.5,
    'recency_multiplier', 1.0,
    'rationale',
      'amplitude=50 spans full 0..100 around neutral; prior=5 keeps single-event moves modest; bad_weight=0.5 encodes LOW severity vs one positive unit; recency_multiplier=1.0 inside 365d window'
  )
)
ON CONFLICT (policy_version) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS trust_score_policy_one_active
  ON public.trust_score_policy ((1))
  WHERE active = true;

CREATE TABLE IF NOT EXISTS public.member_trust_snapshots (
  member_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  manner_battery_percent numeric NOT NULL DEFAULT 50,
  policy_version text NOT NULL,
  active_domains text[] NOT NULL DEFAULT ARRAY['trade']::text[],
  eligible_event_count integer NOT NULL DEFAULT 0,
  trade_completed_count integer NOT NULL DEFAULT 0,
  review_good_count integer NOT NULL DEFAULT 0,
  review_normal_count integer NOT NULL DEFAULT 0,
  review_bad_count integer NOT NULL DEFAULT 0,
  unique_counterparty_count integer NOT NULL DEFAULT 0,
  reliability_component numeric,
  feedback_component numeric,
  confidence numeric,
  window_started_at timestamptz,
  calculated_as_of timestamptz NOT NULL,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.member_trust_snapshots IS
  'DIBAY Manner Battery projection (read authority). History SSOT remains trust_events.';

ALTER TABLE public.trust_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trust_score_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_trust_snapshots ENABLE ROW LEVEL SECURITY;

-- Service role / backend writes; authenticated may read own snapshot.
DROP POLICY IF EXISTS member_trust_snapshots_select_own ON public.member_trust_snapshots;
CREATE POLICY member_trust_snapshots_select_own
  ON public.member_trust_snapshots
  FOR SELECT
  TO authenticated
  USING (auth.uid() = member_id);

DROP POLICY IF EXISTS trust_score_policy_select_authenticated ON public.trust_score_policy;
CREATE POLICY trust_score_policy_select_authenticated
  ON public.trust_score_policy
  FOR SELECT
  TO authenticated
  USING (true);

-- trust_events: no direct client writes; service role bypasses RLS.
DROP POLICY IF EXISTS trust_events_select_own ON public.trust_events;
CREATE POLICY trust_events_select_own
  ON public.trust_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = member_id);

REVOKE ALL ON TABLE public.trust_events FROM PUBLIC;
REVOKE ALL ON TABLE public.trust_score_policy FROM PUBLIC;
REVOKE ALL ON TABLE public.member_trust_snapshots FROM PUBLIC;

GRANT SELECT ON TABLE public.member_trust_snapshots TO authenticated;
GRANT SELECT ON TABLE public.trust_score_policy TO authenticated;
GRANT SELECT ON TABLE public.trust_events TO authenticated;

GRANT ALL ON TABLE public.trust_events TO service_role;
GRANT ALL ON TABLE public.trust_score_policy TO service_role;
GRANT ALL ON TABLE public.member_trust_snapshots TO service_role;
