/**
 * 알림 UI·시뮬 패널용 — Supabase 연동 시 서버 액션으로 대체하기 쉬운 진입점
 */
export {
  markNotificationRead,
  markAllNotificationsReadForTarget,
  listNotificationsForTarget,
  countUnreadForTarget,
  countUnreadByTypes,
  resetSharedNotifications,
} from "./shared-notification-store";

export {
  getNotificationPreferences,
  updateNotificationPreferences,
  resetNotificationSettingsToDefaults,
} from "./notification-settings-store";
