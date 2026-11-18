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
    /** 기기 저장공간 S1 — 닫을 때마다 늘던 배열을 최근 500개로(오래된 id 는 이미 목록에 없는 알림) */
    const capped = ids.length > 500 ? ids.slice(ids.length - 500) : ids;
    localStorage.setItem(CM_NOTIFICATION_DISMISSED_IDS_KEY, JSON.stringify(capped));
  } catch {
    /* ignore quota */
  }
}
