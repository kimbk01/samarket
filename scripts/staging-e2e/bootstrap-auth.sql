-- B+ UI staging bootstrap (CI only, disposable local Supabase) — applied after bootstrap-schema.sql.
-- Structure-only copies of the production tables the admin login/session/authorization path reads
-- (read from the production catalog on 2026-10-05; no rows). Lets a freshly created TEST admin pass
-- the app's real guards (requireAuth → validateActiveSession → requireAdmin) with no bypass.

CREATE TABLE public.admin_memberships (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role = ANY (ARRAY['admin'::text, 'super_admin'::text])),
  status text NOT NULL CHECK (status = ANY (ARRAY['active'::text, 'suspended'::text, 'revoked'::text])),
  admin_tier text CHECK ((admin_tier IS NULL) OR (admin_tier = ANY (ARRAY['operator'::text, 'manager'::text]))),
  granted_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoke_reason text,
  bootstrap_seed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX admin_memberships_user_status_idx ON public.admin_memberships USING btree (user_id, status);
CREATE INDEX admin_memberships_role_active_idx ON public.admin_memberships USING btree (role) WHERE (status = 'active'::text);

CREATE TABLE public.admin_staff_permissions (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

CREATE TABLE public.auth_duplicate_login_policy (
  id text NOT NULL PRIMARY KEY,
  compare_same_login_id boolean NOT NULL DEFAULT true,
  compare_same_device boolean NOT NULL DEFAULT true,
  compare_same_browser boolean NOT NULL DEFAULT true,
  compare_same_ip boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE public.user_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id text NOT NULL UNIQUE,
  device_info text,
  login_identifier text,
  device_key text,
  browser_key text,
  ip_address text,
  active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  invalidated_at timestamptz,
  invalidation_reason text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX user_sessions_user_id_idx ON public.user_sessions USING btree (user_id);
CREATE INDEX user_sessions_user_active_idx ON public.user_sessions USING btree (user_id, active);

-- Server-only tables (service role); same as production: RLS on (client policies are not needed by the server-side guards).
ALTER TABLE public.admin_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_staff_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_duplicate_login_policy ENABLE ROW LEVEL SECURITY;
