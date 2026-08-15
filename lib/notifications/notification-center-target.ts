import {
  matchesNotificationCenterMemberTab,
  type NotificationCenterCategoryTab,
} from "@/lib/notifications/notification-center-tab-match";

export type NotificationCenterTargetRow = {
  id: string;
  push_kind?: string | null;
  notification_type?: string | null;
  type?: string | null;
  category?: string | null;
  event_type?: string | null;
  bell_presentation_type?: string | null;
};

export type NotificationCenterFilterKey = NotificationCenterCategoryTab | "all";

export function normalizeNotificationCenterTargetId(value: string | null | undefined): string | null {
  const id = String(value ?? "").trim();
  return id || null;
}

export function findNotificationCenterTargetRow<T extends NotificationCenterTargetRow>(
  rows: readonly T[],
  notificationId: string | null | undefined
): T | null {
  const id = normalizeNotificationCenterTargetId(notificationId);
  if (!id) return null;
  return rows.find((row) => String(row.id ?? "").trim() === id) ?? null;
}

export function shouldShowNotificationCenterRowForTarget(
  row: NotificationCenterTargetRow,
  activeFilter: NotificationCenterFilterKey,
  targetNotificationId: string | null | undefined
): boolean {
  const targetId = normalizeNotificationCenterTargetId(targetNotificationId);
  if (targetId && String(row.id ?? "").trim() === targetId) return true;
  if (activeFilter === "all") return true;
  return matchesNotificationCenterMemberTab(row, activeFilter);
}

