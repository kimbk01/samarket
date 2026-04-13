/**
 * public.user_settings — `UserSettingsRow` 와 1:1 (스키마 drift 시 마이그레이션으로 맞춤).
 */
export const USER_SETTINGS_ROW_SELECT =
  "user_id, push_enabled, chat_push_enabled, marketing_push_enabled, do_not_disturb_enabled, do_not_disturb_start, do_not_disturb_end, video_autoplay_mode, preferred_language, preferred_country, personalization_enabled, chat_preview_enabled, app_banner_hidden, updated_at";
