/**
 * 고객 문의 SSOT §4 (F11) — 고객지원 알림(support_*)이 새로 왔을 때만 보내는 브라우저 신호.
 * FAB 숫자는 이 신호에서만 다시 읽는다(채팅·주문 등 다른 알림마다 문의 목록을 다시 읽지 않는다).
 */
export const SUPPORT_NOTIFICATION_ARRIVED_EVENT = "dibay:support-notification-arrived";

/** Realtime 알림 행(notification_events 를 옛 행 모양으로 바꾼 것 포함)이 고객지원 알림인지 */
export function isSupportNotificationRealtimeRow(row: Record<string, unknown> | null | undefined): boolean {
  if (!row) return false;
  const type = String(row.type ?? row.event_type ?? "").trim();
  return type.startsWith("support_");
}

export function dispatchSupportNotificationArrived(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SUPPORT_NOTIFICATION_ARRIVED_EVENT));
}
