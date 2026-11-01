-- 알림 항목 관리 (notification-admin-item-ssot-audit-2026-11-02 §3-3 · Owner 설계 승인 2026-11-02).
-- 항목 정의는 코드 SSOT(`lib/notifications/notification-item-registry.ts`)에 있고, 이 표는 어드민이 바꾼 값만 담는다.
-- 행이 없으면 항목표 기본값(= 지금 동작). 서버(service role)만 읽고 쓴다(RLS 켜고 정책 없음).

CREATE TABLE IF NOT EXISTS public.notification_item_settings (
  item_key text PRIMARY KEY CHECK (char_length(item_key) BETWEEN 1 AND 64),
  push_enabled boolean NOT NULL DEFAULT true,
  inbox_enabled boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL
);

ALTER TABLE public.notification_item_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.notification_item_settings FROM anon, authenticated;

COMMENT ON TABLE public.notification_item_settings IS
  '알림 항목별 어드민 설정(푸시·종 표시). 항목 정의 = lib/notifications/notification-item-registry.ts. 행 없음 = 기본값.';

-- down: DROP TABLE IF EXISTS public.notification_item_settings;
