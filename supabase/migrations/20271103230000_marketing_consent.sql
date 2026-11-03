-- 혜택·이벤트 수신 동의 (Owner 지시 2026-11-03 「기존 회원은 마켓팅 수신의 동의로 하고 신규부분부터 동의 화면」)
-- 계획: docs/audit/marketing-consent-and-push-audience-plan-2026-11-03.md
-- 1) 동의 정본 = user_notification_settings.marketing_enabled 하나 + 동의 시각·출처·문서 버전
-- 2) 어드민 문서 종류 marketing(선택 동의 문구) + 첫 게시 문서 ko/en
-- 3) 기존 회원(이 마이그레이션 시점에 profiles 가 있는 회원) = 동의 ON (출처 existing_member_default)
--    user_settings.marketing_push_enabled 는 더 이상 판정에 쓰지 않지만 같은 값으로 맞춰 둔다.

BEGIN;

ALTER TABLE public.user_notification_settings
  ADD COLUMN IF NOT EXISTS marketing_consent_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS marketing_consent_source text NULL,
  ADD COLUMN IF NOT EXISTS marketing_consent_version text NULL;

ALTER TABLE public.user_notification_settings
  DROP CONSTRAINT IF EXISTS user_notification_settings_marketing_consent_source_check;
ALTER TABLE public.user_notification_settings
  ADD CONSTRAINT user_notification_settings_marketing_consent_source_check
  CHECK (marketing_consent_source IS NULL OR marketing_consent_source IN ('signup', 'existing_member_default', 'settings'));

COMMENT ON COLUMN public.user_notification_settings.marketing_enabled IS
  '혜택·이벤트 푸시 수신 동의 정본 (2026-11-03). 알림함은 동의와 무관하게 전원.';
COMMENT ON COLUMN public.user_notification_settings.marketing_consent_at IS '마지막 동의·거부 시각';
COMMENT ON COLUMN public.user_notification_settings.marketing_consent_source IS 'signup | existing_member_default | settings';
COMMENT ON COLUMN public.user_notification_settings.marketing_consent_version IS '동의 당시 app_legal_documents(kind=marketing, ko) version';

ALTER TABLE public.app_legal_documents DROP CONSTRAINT IF EXISTS app_legal_documents_kind_check;
ALTER TABLE public.app_legal_documents
  ADD CONSTRAINT app_legal_documents_kind_check CHECK (kind IN ('terms', 'privacy', 'marketing'));

INSERT INTO public.app_legal_documents (kind, locale, title, body, version, status, effective_at, published_at)
VALUES
  (
    'marketing', 'ko', '혜택·이벤트 알림 받기',
    E'DIBAY 가 진행하는 이벤트, 할인·쿠폰 등 혜택 소식을 앱 푸시 알림으로 보내 드립니다.\n\n동의하지 않아도 DIBAY 의 모든 서비스를 이용할 수 있습니다. 공지사항·시스템 안내·업데이트 소식은 동의와 관계없이 받으며, 혜택·이벤트 소식도 앱 알림함에서는 언제든 볼 수 있습니다.\n\n동의는 내정보 › 알림 설정 › 혜택·이벤트 알림에서 언제든 끄거나 다시 켤 수 있습니다.',
    '2026-11-03', 'published', now(), now()
  ),
  (
    'marketing', 'en', 'Receive benefits & events notifications',
    E'DIBAY sends news about events, discounts, coupons and other benefits as app push notifications.\n\nYou can use every DIBAY service without agreeing. Notices, system notices and update news are sent regardless, and benefits & events news is always available in the in-app notification inbox.\n\nYou can turn this off or back on at any time in My info › Notification settings › Benefits & events notifications.',
    '2026-11-03', 'published', now(), now()
  )
ON CONFLICT (kind, locale, version) DO NOTHING;

-- 기존 회원 = 동의 ON
INSERT INTO public.user_notification_settings (user_id, marketing_enabled, marketing_consent_at, marketing_consent_source, marketing_consent_version, updated_at)
SELECT p.id, true, now(), 'existing_member_default', '2026-11-03', now()
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
ON CONFLICT (user_id) DO UPDATE
  SET marketing_enabled = true,
      marketing_consent_at = EXCLUDED.marketing_consent_at,
      marketing_consent_source = EXCLUDED.marketing_consent_source,
      marketing_consent_version = EXCLUDED.marketing_consent_version,
      updated_at = EXCLUDED.updated_at;

INSERT INTO public.user_settings (user_id, marketing_push_enabled, updated_at)
SELECT p.id, true, now()
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
ON CONFLICT (user_id) DO UPDATE
  SET marketing_push_enabled = true,
      updated_at = EXCLUDED.updated_at;

COMMIT;
