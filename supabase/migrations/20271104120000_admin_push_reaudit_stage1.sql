-- 운영자 알림·혜택 동의 재감사 단계 1 (Owner 「단계 1 구현」 2026-11-03)
-- 설계: docs/audit/admin-push-consent-full-reaudit-design-2026-11-03.md
--
-- A-1: 같은 캠페인을 다시 보내면(테스트 발송 2회차·반복 발송 2회차·재발송) 받는 사람 기록이 캠페인 단위
--      고유 인덱스에 걸려 조용히 버려졌다. 기록 고유성은 「회차(occurrence)」 단위로만 둔다.
--      회차 없는 예전 행은 캠페인 단위 고유성을 그대로 유지(부분 인덱스).
-- D-3: 어드민이 만든 회원·직원 계정의 혜택·이벤트 동의 출처 `admin_created` (동의 받은 적 없음 = OFF).

-- A-1 -----------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ncd_legacy_campaign_user_device_channel_uidx
  ON public.notification_campaign_deliveries (
    campaign_id,
    user_id,
    COALESCE(device_id, '00000000-0000-0000-0000-000000000000'::uuid),
    channel
  )
  WHERE occurrence_id IS NULL;

-- 이름이 63자를 넘어 운영에는 `..._u` 로 잘려 저장돼 있다 — DROP 도 같은 규칙으로 잘린다.
DROP INDEX IF EXISTS public.notification_campaign_deliveries_campaign_user_device_channel_uidx;

-- D-3 -----------------------------------------------------------------------
ALTER TABLE public.user_notification_settings
  DROP CONSTRAINT IF EXISTS user_notification_settings_marketing_consent_source_check;
ALTER TABLE public.user_notification_settings
  ADD CONSTRAINT user_notification_settings_marketing_consent_source_check
  CHECK (
    marketing_consent_source IS NULL
    OR marketing_consent_source IN ('signup', 'existing_member_default', 'settings', 'admin_created')
  );

COMMENT ON COLUMN public.user_notification_settings.marketing_consent_source IS
  'signup | existing_member_default | settings | admin_created';
