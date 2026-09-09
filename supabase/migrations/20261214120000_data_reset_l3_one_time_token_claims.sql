-- DIBAY Data Reset — L3 one-time token consume SSOT
-- Stateful claim record for confirmationLevel >= 3 only.
-- Stores token_hash only (never raw token). Service-role writer.

BEGIN;

CREATE TABLE IF NOT EXISTS public.data_reset_l3_token_claims (
  token_hash text PRIMARY KEY,
  plan_id uuid NOT NULL,
  plan_hash text NOT NULL,
  actor_user_id uuid NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT data_reset_l3_token_claims_plan_id_uidx UNIQUE (plan_id)
);

COMMENT ON TABLE public.data_reset_l3_token_claims IS
  'Data Reset L3 one-time token claims — atomic consume before destructive execute';
COMMENT ON COLUMN public.data_reset_l3_token_claims.token_hash IS
  'SHA-256 of raw L3 token material; raw token never stored';
COMMENT ON COLUMN public.data_reset_l3_token_claims.consumed_at IS
  'Claim time (Option A: claim before mutation). Replay blocked by PK + plan_id UNIQUE';

CREATE INDEX IF NOT EXISTS data_reset_l3_token_claims_actor_idx
  ON public.data_reset_l3_token_claims (actor_user_id, consumed_at DESC);

ALTER TABLE public.data_reset_l3_token_claims ENABLE ROW LEVEL SECURITY;

-- No authenticated policies: client JWT cannot read/write claims.
-- Service role (Admin Data Reset execute) bypasses RLS.

REVOKE ALL ON TABLE public.data_reset_l3_token_claims FROM PUBLIC;
REVOKE ALL ON TABLE public.data_reset_l3_token_claims FROM anon;
REVOKE ALL ON TABLE public.data_reset_l3_token_claims FROM authenticated;
GRANT SELECT, INSERT ON TABLE public.data_reset_l3_token_claims TO service_role;

COMMIT;
