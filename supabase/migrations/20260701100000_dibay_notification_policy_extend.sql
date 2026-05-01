-- DiBaY 알림 정책 확장: user_notification_settings / web_push_subscriptions / notifications / 관리자 캠페인
-- 기존 컬럼·RLS는 유지하고 ADD만 수행한다.

-- 1) 사용자 알림 설정 (푸시 종류·방해금지 DB 기준)
ALTER TABLE public.user_notification_settings
  ADD COLUMN IF NOT EXISTS service_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS trade_events_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS community_social_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notice_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS marketing_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quiet_hours_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quiet_hours_start time NULL,
  ADD COLUMN IF NOT EXISTS quiet_hours_end time NULL;

COMMENT ON COLUMN public.user_notification_settings.service_enabled IS '서비스 푸시 총스위치(인앱·WS와 별개; web push 게이트에 사용)';

-- 2) Web Push 구독 메타 (토큰=endpoint; 로그아웃 시에만 연결 해제)
ALTER TABLE public.web_push_subscriptions
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS device_name text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.web_push_subscriptions
  DROP CONSTRAINT IF EXISTS web_push_subscriptions_platform_check;
ALTER TABLE public.web_push_subscriptions
  ADD CONSTRAINT web_push_subscriptions_platform_check CHECK (platform IN ('web', 'pwa', 'android', 'ios'));

-- 3) notifications 인박스 확장 (이미 있으면 스킵)
DO $$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL THEN
    ALTER TABLE public.notifications
      ADD COLUMN IF NOT EXISTS push_kind text,
      ADD COLUMN IF NOT EXISTS read_at timestamptz,
      ADD COLUMN IF NOT EXISTS image_url text,
      ADD COLUMN IF NOT EXISTS sender_id uuid;
    ALTER TABLE public.notifications
      DROP CONSTRAINT IF EXISTS notifications_push_kind_check;
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_push_kind_check CHECK (
        push_kind IS NULL
        OR push_kind IN ('chat', 'trade', 'delivery', 'community', 'notice', 'marketing', 'system')
      );
    CREATE INDEX IF NOT EXISTS notifications_user_push_kind_created_idx
      ON public.notifications (user_id, push_kind, created_at DESC)
      WHERE push_kind IS NOT NULL;
  END IF;
END $$;

-- 4) 관리자 알림 캠페인 (service_role·서버 API 전용 — 정책 없음 = JWT 직접 접근 불가)
CREATE TABLE IF NOT EXISTS public.admin_notification_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  type text NOT NULL CHECK (type IN ('notice', 'marketing', 'system')),
  target_type text NOT NULL DEFAULT 'all' CHECK (
    target_type IN ('all', 'selected_users', 'segment', 'marketing_opt_in', 'active_users', 'region')
  ),
  target_url text,
  image_url text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sent', 'failed')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  send_progress_offset int NOT NULL DEFAULT 0,
  segment_region_code text,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_notification_campaigns_status_idx
  ON public.admin_notification_campaigns (status, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_notification_campaigns_type_idx
  ON public.admin_notification_campaigns (type);

CREATE TABLE IF NOT EXISTS public.admin_notification_campaign_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.admin_notification_campaigns (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  failure_reason text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, user_id)
);

CREATE INDEX IF NOT EXISTS admin_notification_campaign_targets_campaign_idx
  ON public.admin_notification_campaign_targets (campaign_id, status);

ALTER TABLE public.admin_notification_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_notification_campaign_targets ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.admin_notification_campaigns IS '관리자 인앱/푸시 캠페인 (Next API service_role만 접근)';
COMMENT ON TABLE public.admin_notification_campaign_targets IS '캠페인별 수신자 발송 결과';
