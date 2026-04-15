const CM_NOTIFICATION_DISMISSED_IDS_KEY = "samarket:cm_notification_dismissed_ids";

export function readDismissedCommunityMessengerNotificationIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CM_NOTIFICATION_DISMISSED_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

export function writeDismissedCommunityMessengerNotificationIds(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CM_NOTIFICATION_DISMISSED_IDS_KEY, JSON.stringify(ids));
  } catch {
    /* ignore quota */
  }
}
