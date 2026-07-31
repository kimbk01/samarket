/**
 * Heal: owner intake notification_events left unread after business already left `pending`.
 *
 * Root cause (Notification Event SSOT): status transitions used to notify buyers without
 * ending owner `commerce:owner:new_order:*` attentions → Bell inflation (e.g. 20 completed
 * orders still unread as "새 매장 주문").
 *
 * Forward fix: `applyStoreOrderStatusTransition` → `markOrderNotificationsRead` for owner.
 * This heal closes historical rows only — does not delete history.
 *
 * @see docs/notifications/notification-event-ssot.md
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { markOrderNotificationEventsRead } from "@/lib/notifications/core/notification-event-repository";
import { invalidateNotificationBadgeCache } from "@/lib/notifications/pipeline/notify-badge-service";
import { isOwnerStoreCommerceNotificationRow } from "@/lib/notifications/owner-store-commerce-notification-meta";

function trim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function orderIdFromEvent(row: {
  display_payload?: unknown;
}): string {
  const p =
    row.display_payload && typeof row.display_payload === "object"
      ? (row.display_payload as Record<string, unknown>)
      : null;
  if (!p) return "";
  const meta =
    p.legacyMeta && typeof p.legacyMeta === "object"
      ? (p.legacyMeta as Record<string, unknown>)
      : null;
  return trim(meta?.order_id) || trim(p.legacyRefId) || trim(p.orderId) || trim(p.order_id);
}

/** Orders still requiring owner intake attention in Bell. */
function orderStillNeedsOwnerIntake(status: string): boolean {
  return status === "pending";
}

export async function healStaleOwnerOrderIntakeNotificationEvents(
  sb: SupabaseClient,
  userId: string
): Promise<{ scanned: number; orderIdsEnded: string[]; eventsMarked: number }> {
  const uid = userId.trim();
  if (!uid) return { scanned: 0, orderIdsEnded: [], eventsMarked: 0 };

  const { data, error } = await sb
    .from("notification_events")
    .select("id, type, display_payload, unread, read_at, dedupe_key")
    .eq("user_id", uid)
    .eq("unread", true)
    .is("read_at", null)
    .eq("type", "order_status")
    .limit(500);

  if (error || !data?.length) {
    return { scanned: 0, orderIdsEnded: [], eventsMarked: 0 };
  }

  const intakeRows = data.filter((row) => {
    const meta =
      row.display_payload &&
      typeof row.display_payload === "object" &&
      (row.display_payload as { legacyMeta?: unknown }).legacyMeta
        ? { meta: (row.display_payload as { legacyMeta: unknown }).legacyMeta }
        : { meta: null };
    if (isOwnerStoreCommerceNotificationRow(meta)) return true;
    const dk = trim(row.dedupe_key);
    return dk.includes(":owner:new_order:") || dk.includes(":owner:buyer_cancel:");
  });

  const orderIds = [
    ...new Set(intakeRows.map((r) => orderIdFromEvent(r)).filter(Boolean)),
  ];
  if (orderIds.length === 0) {
    return { scanned: intakeRows.length, orderIdsEnded: [], eventsMarked: 0 };
  }

  const { data: orders } = await sb
    .from("store_orders")
    .select("id, order_status")
    .in("id", orderIds);

  const ended: string[] = [];
  for (const o of orders ?? []) {
    const st = trim(o.order_status);
    if (!orderStillNeedsOwnerIntake(st)) {
      ended.push(String(o.id));
    }
  }

  let eventsMarked = 0;
  for (const oid of ended) {
    eventsMarked += await markOrderNotificationEventsRead(sb, uid, oid);
  }
  if (eventsMarked > 0) invalidateNotificationBadgeCache(uid);

  return { scanned: intakeRows.length, orderIdsEnded: ended, eventsMarked };
}
