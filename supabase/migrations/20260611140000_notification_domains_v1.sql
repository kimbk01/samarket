-- 알림 도메인 v1: 사용자·관리자 설정 + notifications 확장
-- 기존 notifications 행은 domain/ref_id NULL 로 유지 (호환)

CREATE TABLE IF NOT EXISTS public.user_notification_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  trade_chat_enabled boolean NOT NULL DEFAULT true,
  community_chat_enabled boolean NOT NULL DEFAULT true,
  order_enabled boolean NOT NULL DEFAULT true,
  store_enabled boolean NOT NULL DEFAULT true,
  sound_enabled boolean NOT NULL DEFAULT true,
  vibration_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_notification_settings (
  type text PRIMARY KEY CHECK (
    type IN ('trade_chat', 'community_chat', 'order', 'store')
  ),
  sound_url text,
  volume numeric NOT NULL DEFAULT 0.7 CHECK (volume >= 0 AND volume <= 1),
  repeat_count int NOT NULL DEFAULT 1 CHECK (repeat_count >= 1 AND repeat_count <= 5),
  cooldown_seconds int NOT NULL DEFAULT 3 CHECK (cooldown_seconds >= 0 AND cooldown_seconds <= 600),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.admin_notification_settings (type)
VALUES
  ('trade_chat'),
  ('community_chat'),
  ('order'),
  ('store')
ON CONFLICT (type) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'notifications'
  ) THEN
    ALTER TABLE public.notifications
      ADD COLUMN IF NOT EXISTS domain text CHECK (
        domain IS NULL
        OR domain IN ('trade_chat', 'community_chat', 'order', 'store')
      );
    ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS ref_id text;
    CREATE INDEX IF NOT EXISTS notifications_user_domain_ref_created_idx
      ON public.notifications (user_id, domain, ref_id, created_at DESC)
      WHERE domain IS NOT NULL AND ref_id IS NOT NULL;
  END IF;
END $$;

ALTER TABLE public.user_notification_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_notification_settings_select_own" ON public.user_notification_settings;
CREATE POLICY "user_notification_settings_select_own"
  ON public.user_notification_settings FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_notification_settings_insert_own" ON public.user_notification_settings;
CREATE POLICY "user_notification_settings_insert_own"
  ON public.user_notification_settings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_notification_settings_update_own" ON public.user_notification_settings;
CREATE POLICY "user_notification_settings_update_own"
  ON public.user_notification_settings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.user_notification_settings IS '사용자별 인앱·푸시·진동 도메인 스위치';
COMMENT ON TABLE public.admin_notification_settings IS '관리자 알림음·쿨다운·반복 (도메인별)';

ALTER TABLE public.admin_notification_settings ENABLE ROW LEVEL SECURITY;
