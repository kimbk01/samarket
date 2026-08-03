/**
 * Notification Center list helpers.
 *
 * LOCK: 혜택 목록 ≠ Bell digit.
 * Marketing display only here — Member A filtering stays in allowlisted call sites
 * (`MyNotificationsView`) so Slice 2-1 isolation is preserved.
 */
import type { InboxPushKindFilter } from "@/lib/me/fetch-me-notifications-deduped";

export function isMarketingInboxDisplayRow(row: {
  notification_type?: string | null;
  type?: string | null;
  category?: string | null;
}): boolean {
  const type = String(row.notification_type ?? row.type ?? "").trim();
  const category = String(row.category ?? "").trim();
  return type === "admin_marketing_banner" || category === "admin_marketing_banner";
}

export function isNotificationCenterStoreTab(tab: InboxPushKindFilter | "store"): boolean {
  return tab === "store";
}

/** Marketing tab rows only (never A eligibility). */
export function filterMarketingInboxDisplayRows<T extends {
  notification_type?: string | null;
  type?: string | null;
  category?: string | null;
}>(rows: readonly T[]): T[] {
  return rows.filter((r) => isMarketingInboxDisplayRow(r));
}
