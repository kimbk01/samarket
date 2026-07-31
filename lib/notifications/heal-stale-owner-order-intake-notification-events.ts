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
import { resolveNotificationAttentionKey } from "@/lib/notifications/core/notification-attention-key";

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
export function orderStillNeedsOwnerIntake(status: string): boolean {
  return status === "pending";
}

export type StaleOwnerIntakeHealCandidate = {
  event_id: string;
  order_id: string;
  dedupe_key: string | null;
  attention_key: string;
  order_status: string | null;
  reason: string;
};

export type StaleOwnerIntakeHealResult = {
  dry_run: boolean;
  scanned: number;
  candidates: StaleOwnerIntakeHealCandidate[];
  orderIdsEnded: string[];
  eventsMarked: number;
  skipped: Array<{ event_id: string; reason: string }>;
};

export async function healStaleOwnerOrderIntakeNotificationEvents(
  sb: SupabaseClient,
  userId: string,
  opts?: { dryRun?: boolean }
): Promise<StaleOwnerIntakeHealResult> {
  const dryRun = opts?.dryRun === true;
  const uid = userId.trim();
  const empty: StaleOwnerIntakeHealResult = {
    dry_run: dryRun,
    scanned: 0,
    candidates: [],
    orderIdsEnded: [],
    eventsMarked: 0,
    skipped: [],
  };
  if (!uid) return empty;

  const { data, error } = await sb
    .from("notification_events")
    .select("id, type, display_payload, unread, read_at, dedupe_key")
    .eq("user_id", uid)
    .eq("unread", true)
    .is("read_at", null)
    .eq("type", "order_status")
    .limit(500);

  if (error || !data?.length) {
    return empty;
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

  const skipped: StaleOwnerIntakeHealResult["skipped"] = [];
  const withOrder: Array<(typeof intakeRows)[number] & { order_id: string }> = [];
  for (const row of intakeRows) {
    const oid = orderIdFromEvent(row);
    if (!oid) {
      skipped.push({ event_id: String(row.id), reason: "missing_order_id" });
      continue;
    }
    withOrder.push({ ...row, order_id: oid });
  }

  const orderIds = [...new Set(withOrder.map((r) => r.order_id))];
  if (orderIds.length === 0) {
    return { ...empty, scanned: intakeRows.length, skipped };
  }

  const { data: orders } = await sb
    .from("store_orders")
    .select("id, order_status")
    .in("id", orderIds);

  const statusById = new Map(
    (orders ?? []).map((o) => [String(o.id), trim(o.order_status)])
  );

  const candidates: StaleOwnerIntakeHealCandidate[] = [];
  const endedSet = new Set<string>();

  for (const row of withOrder) {
    const st = statusById.get(row.order_id);
    if (st == null) {
      skipped.push({ event_id: String(row.id), reason: "order_not_found" });
      continue;
    }
    if (orderStillNeedsOwnerIntake(st)) {
      skipped.push({
        event_id: String(row.id),
        reason: `still_actionable_pending:${st}`,
      });
      continue;
    }
    endedSet.add(row.order_id);
    candidates.push({
      event_id: String(row.id),
      order_id: row.order_id,
      dedupe_key: row.dedupe_key == null ? null : String(row.dedupe_key),
      attention_key: resolveNotificationAttentionKey({
        type: "order_status",
        dedupe_key: row.dedupe_key,
        display_payload: row.display_payload,
      }),
      order_status: st,
      reason: `business_status_not_pending:${st}`,
    });
  }

  if (dryRun) {
    return {
      dry_run: true,
      scanned: intakeRows.length,
      candidates,
      orderIdsEnded: [...endedSet],
      eventsMarked: 0,
      skipped,
    };
  }

  let eventsMarked = 0;
  for (const oid of endedSet) {
    eventsMarked += await markOrderNotificationEventsRead(sb, uid, oid);
  }
  if (eventsMarked > 0) invalidateNotificationBadgeCache(uid);

  return {
    dry_run: false,
    scanned: intakeRows.length,
    candidates,
    orderIdsEnded: [...endedSet],
    eventsMarked,
    skipped,
  };
}
