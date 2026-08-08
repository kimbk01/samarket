-- Forward reconciliation: Production drift recovery for R10 account deletion.
-- History already marks 20260426033500 applied, but public.account_deletion_requests
-- is missing. Recreate ONLY that table + index (exact copy of 20260426033500 defs).
-- DO NOT touch profiles, provider CHECKs, user_sessions, RLS, functions, or grants.

CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'processing', 'completed', 'rejected', 'cancelled')),
  confirmation_text text,
  reason text,
  requested_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  processed_at timestamptz,
  processed_by uuid REFERENCES auth.users(id),
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS account_deletion_requests_user_id_idx
  ON public.account_deletion_requests (user_id, requested_at DESC);
