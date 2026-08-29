-- P2-A6 — Owner account-level + Admin per-user preference storage authority
-- Does NOT cut over push/sound consumers.
-- Does NOT repurpose admin_notification_settings (asset/config SSOT).

BEGIN;

-- ---------------------------------------------------------------------------
-- Owner optional delivery preferences (ACCOUNT = user_id, not store_id)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.owner_notification_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  optional_push_enabled boolean NULL,
  optional_sound_enabled boolean NULL,
  quiet_hours_enabled boolean NOT NULL DEFAULT false,
  quiet_hours_start text NULL,
  quiet_hours_end text NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.owner_notification_settings IS
  'P2-A6 Owner optional notification preferences (account-level). No row = P2-A3 optimistic optional fallback. store_id is event context only.';

COMMENT ON COLUMN public.owner_notification_settings.optional_push_enabled IS
  'NULL = unset (compat optimistic enabled). true/false = explicit Owner optional push preference.';
COMMENT ON COLUMN public.owner_notification_settings.optional_sound_enabled IS
  'NULL = unset (compat optimistic enabled). true/false = explicit Owner optional sound preference.';

ALTER TABLE public.owner_notification_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS owner_notification_settings_select_own ON public.owner_notification_settings;
CREATE POLICY owner_notification_settings_select_own
  ON public.owner_notification_settings FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS owner_notification_settings_insert_own ON public.owner_notification_settings;
CREATE POLICY owner_notification_settings_insert_own
  ON public.owner_notification_settings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS owner_notification_settings_update_own ON public.owner_notification_settings;
CREATE POLICY owner_notification_settings_update_own
  ON public.owner_notification_settings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON TABLE public.owner_notification_settings FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.owner_notification_settings TO authenticated;
GRANT ALL ON TABLE public.owner_notification_settings TO service_role;

-- ---------------------------------------------------------------------------
-- Admin Ops per-admin sound preference (NOT admin_notification_settings assets)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  sound_enabled boolean NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.admin_notification_preferences IS
  'P2-A6 per-admin Ops sound preference. Distinct from admin_notification_settings (global sound asset/config). No row = P2-A3 adminOps.soundEnabled undefined (compat default enabled at resolver). Does not affect ADMIN_Q.';

COMMENT ON COLUMN public.admin_notification_preferences.sound_enabled IS
  'NULL = unset (compat). true/false = explicit Admin Ops sound preference.';

ALTER TABLE public.admin_notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_notification_preferences_select_own ON public.admin_notification_preferences;
CREATE POLICY admin_notification_preferences_select_own
  ON public.admin_notification_preferences FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS admin_notification_preferences_insert_own ON public.admin_notification_preferences;
CREATE POLICY admin_notification_preferences_insert_own
  ON public.admin_notification_preferences FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS admin_notification_preferences_update_own ON public.admin_notification_preferences;
CREATE POLICY admin_notification_preferences_update_own
  ON public.admin_notification_preferences FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND public.is_platform_admin(auth.uid()))
  WITH CHECK (auth.uid() = user_id AND public.is_platform_admin(auth.uid()));

REVOKE ALL ON TABLE public.admin_notification_preferences FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.admin_notification_preferences TO authenticated;
GRANT ALL ON TABLE public.admin_notification_preferences TO service_role;

COMMIT;
