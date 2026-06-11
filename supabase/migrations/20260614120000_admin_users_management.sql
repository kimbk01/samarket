-- Admin users management: audit logs, moderation events, staff permissions, role backfill

-- 1) audit_logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type text NOT NULL CHECK (actor_type IN ('admin', 'user', 'system')),
  actor_id uuid,
  target_type text NOT NULL,
  target_id text NOT NULL,
  action text NOT NULL,
  before_json jsonb,
  after_json jsonb,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS audit_logs_target_idx
  ON public.audit_logs (target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx
  ON public.audit_logs (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx
  ON public.audit_logs (created_at DESC);

COMMENT ON TABLE public.audit_logs IS 'Platform admin audit trail';

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_select_admin ON public.audit_logs;
CREATE POLICY audit_logs_select_admin ON public.audit_logs
  FOR SELECT
  USING (public.is_platform_admin(auth.uid()));

-- 2) user_moderation_events
CREATE TABLE IF NOT EXISTS public.user_moderation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (
    action IN ('warn', 'suspend', 'ban', 'restore', 'soft_delete', 'hard_delete')
  ),
  from_status text,
  to_status text,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS user_moderation_events_user_idx
  ON public.user_moderation_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_moderation_events_action_idx
  ON public.user_moderation_events (user_id, action, created_at DESC);

COMMENT ON TABLE public.user_moderation_events IS 'User moderation and deletion event log';

ALTER TABLE public.user_moderation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_moderation_events_select_admin ON public.user_moderation_events;
CREATE POLICY user_moderation_events_select_admin ON public.user_moderation_events
  FOR SELECT
  USING (public.is_platform_admin(auth.uid()));

-- 3) admin_staff_permissions
CREATE TABLE IF NOT EXISTS public.admin_staff_permissions (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  permission_key text NOT NULL,
  granted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (user_id, permission_key)
);

CREATE INDEX IF NOT EXISTS admin_staff_permissions_user_idx
  ON public.admin_staff_permissions (user_id);

COMMENT ON TABLE public.admin_staff_permissions IS 'Granular admin permissions per staff user';

ALTER TABLE public.admin_staff_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_staff_permissions_select_admin ON public.admin_staff_permissions;
CREATE POLICY admin_staff_permissions_select_admin ON public.admin_staff_permissions
  FOR SELECT
  USING (public.is_platform_admin(auth.uid()));

-- 4) profiles.admin_tier
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_tier text;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_admin_tier_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_admin_tier_check
  CHECK (admin_tier IS NULL OR admin_tier IN ('operator', 'manager'));

-- 5) role backfill: special/master -> valid CHECK values
UPDATE public.profiles
SET
  role = 'user',
  member_type = COALESCE(NULLIF(member_type, ''), 'premium'),
  is_special_member = true
WHERE lower(COALESCE(role, '')) IN ('special', 'premium');

UPDATE public.profiles
SET role = 'super_admin'
WHERE lower(COALESCE(role, '')) = 'master';
