-- FD1: restore public.user_sessions (session registry)
-- Project: ckdosyydvgzqwpbwuhon
--
-- ROOT CAUSE (forensic): APPLIED_THEN_DROPPED
--   - schema_migrations has 20260426033500 + 20260426044500
--   - sibling objects from those migrations still exist
--     (profiles auth columns, account_deletion_requests, auth_duplicate_login_policy)
--   - no repo DROP TABLE user_sessions after create
--   - table removed by untracked DDL after successful apply
--
-- Canonical contract = union of original migrations + current app writers:
--   lib/auth/user-session-registry.ts (service_role)
--   lib/admin/admin-user-server.ts invalidateAllUserSessions (service_role)
--
-- Data: ephemeral/reconstructable via syncUserSessionRegistry — no row backfill.
-- DO NOT re-run old migrations; DO NOT touch migration drift 218/1.

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  session_id text NOT NULL UNIQUE,
  device_info text,
  login_identifier text,
  device_key text,
  browser_key text,
  ip_address text,
  active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  invalidated_at timestamptz,
  invalidation_reason text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx
  ON public.user_sessions (user_id);

CREATE INDEX IF NOT EXISTS user_sessions_user_active_idx
  ON public.user_sessions (user_id, active);

CREATE INDEX IF NOT EXISTS user_sessions_user_active_device_idx
  ON public.user_sessions (user_id, active, device_key);

CREATE INDEX IF NOT EXISTS user_sessions_user_active_browser_idx
  ON public.user_sessions (user_id, active, browser_key);

CREATE INDEX IF NOT EXISTS user_sessions_user_active_ip_idx
  ON public.user_sessions (user_id, active, ip_address);

-- Service-role registry writer only (same harden pattern as rls_disabled close).
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.user_sessions TO service_role;

COMMENT ON TABLE public.user_sessions IS
  'DIBAY session registry + duplicate-login rotation. RLS FORCE; service_role only. Restored FD1 20270120130000.';

COMMIT;
