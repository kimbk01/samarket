-- 알림 도메인 확장: community_chat -> 1:1 / group 분리 설정
-- 기존 notifications.domain 값은 유지하고, 재생 라우팅에서 meta.kind 기준 분기한다.

ALTER TABLE public.admin_notification_settings
  DROP CONSTRAINT IF EXISTS admin_notification_settings_type_check;

ALTER TABLE public.admin_notification_settings
  ADD CONSTRAINT admin_notification_settings_type_check CHECK (
    type IN (
      'trade_chat',
      'community_chat',
      'community_direct_chat',
      'community_group_chat',
      'order',
      'store'
    )
  );

INSERT INTO public.admin_notification_settings (type)
VALUES
  ('community_direct_chat'),
  ('community_group_chat')
ON CONFLICT (type) DO NOTHING;
