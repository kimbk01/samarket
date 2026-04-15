/**
 * Messenger notification phased rollout.
 *
 * NEXT_PUBLIC_MESSENGER_NOTIFICATION_ROLLOUT (build-time):
 * - 0 | legacy — pathname-only same-room; background may still play in-app tone (old behavior)
 * - 1 | sound — NotificationSurface + tab visibility; no in-app message banner
 * - 2 | full (default) — 1 + top in-app message banner
 * - 3 | scroll — 2 + per-room scroll store, "N new messages" chip, same-room sound only when scrolled up
 *
 * Later: 4+ for admin JSON, push batching, etc.
 */

export type MessengerNotificationRolloutLevel = 0 | 1 | 2 | 3;

export function getMessengerNotificationRolloutLevel(): MessengerNotificationRolloutLevel {
  const raw = (process.env.NEXT_PUBLIC_MESSENGER_NOTIFICATION_ROLLOUT ?? "").trim().toLowerCase();
  if (raw === "0" || raw === "legacy") return 0;
  if (raw === "1" || raw === "sound") return 1;
  if (raw === "2" || raw === "full" || raw === "") return 2;
  if (raw === "3" || raw === "scroll") return 3;
  const parsed = Number(raw);
  if (parsed === 0 || parsed === 1 || parsed === 2 || parsed === 3) return parsed as MessengerNotificationRolloutLevel;
  return 2;
}

export function messengerRolloutShowsInAppMessageBanner(): boolean {
  return getMessengerNotificationRolloutLevel() >= 2;
}

export function messengerRolloutUsesSurfaceAndVisibilityForSound(): boolean {
  return getMessengerNotificationRolloutLevel() >= 1;
}

export function messengerRolloutUsesRoomScrollHints(): boolean {
  return getMessengerNotificationRolloutLevel() >= 3;
}
