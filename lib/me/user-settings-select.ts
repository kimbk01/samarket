/**
 * public.user_settings — `UserSettingsRow` 와 1:1 (스키마 drift 시 마이그레이션으로 맞춤).
 * 예외: 옛 열 `marketing_push_enabled` 는 읽지 않는다(혜택·이벤트 동의 정본 = `user_notification_settings.marketing_enabled` ·
 * 운영자 알림 최종 감사 M-2). 열은 DB 에 남아 있다.
 */
export const USER_SETTINGS_ROW_SELECT =
  "user_id, push_enabled, chat_push_enabled, do_not_disturb_enabled, do_not_disturb_start, do_not_disturb_end, video_autoplay_mode, preferred_language, preferred_country, personalization_enabled, chat_preview_enabled, app_banner_hidden, updated_at";
