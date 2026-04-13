/** `admin_messenger_call_sound_settings` 단일 행 조회용 */
export const ADMIN_MESSENGER_CALL_SOUND_SETTINGS_SELECT =
  "id, updated_at, voice_incoming_enabled, voice_incoming_sound_url, voice_outgoing_ringback_enabled, voice_outgoing_ringback_url, video_incoming_enabled, video_incoming_sound_url, video_outgoing_ringback_enabled, video_outgoing_ringback_url, missed_notification_enabled, missed_notification_sound_url, call_end_enabled, call_end_sound_url, use_custom_sounds, default_fallback_sound_url";

/** `admin_notification_settings` 목록 */
export const ADMIN_NOTIFICATION_SETTINGS_SELECT =
  "type, sound_url, volume, repeat_count, cooldown_seconds, enabled, updated_at";
