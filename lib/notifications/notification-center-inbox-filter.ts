/**
 * Notification Center list filter.
 *
 * - Default tabs: Member A only (Bell digit contributors for N).
 * - marketing / 혜택: display-only marketing rows — NEVER Member A / Bell digit.
 *
 * LOCK: 혜택 목록 ≠ Bell digit. Do not route marketing through A eligibility.
 */
import { filterMemberNotificationAInboxRows } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-projection";
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

/**
 * Rows shown in `/notifications` for the active tab.
 * Marketing tab keeps marketing events; all other tabs use A projection.
 */
export function filterNotificationCenterListRows<T extends {
  notification_type?: string | null;
  type?: string | null;
  category?: string | null;
  id?: string | null;
  is_read?: boolean | null;
  meta?: unknown;
  room_id?: string | null;
  dedupe_key?: string | null;
}>(rows: readonly T[], tab: InboxPushKindFilter): T[] {
  if (tab === "marketing") {
    return rows.filter((r) => isMarketingInboxDisplayRow(r));
  }
  return filterMemberNotificationAInboxRows(rows) as T[];
}
