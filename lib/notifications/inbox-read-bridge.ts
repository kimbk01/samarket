import type { SupabaseClient } from "@supabase/supabase-js";
import {
  markNotificationEventsReadByCategory,
  markOrderNotificationEventsRead,
} from "@/lib/notifications/core/notification-event-repository";
import { markNotificationRead } from "@/lib/notifications/pipeline/notify-read-service";
import { invalidateNotificationUnreadCountCache } from "@/lib/notifications/notification-unread-count-cache";
import { invalidateNotificationBadgeCache } from "@/lib/notifications/pipeline/notify-badge-service";

export type PartitionInboxReadIdsResult = {
  legacyIds: string[];
  eventIds: string[];
};

export function partitionInboxReadIdsFromLookup(
  ids: string[],
  legacyIdSet: Set<string>,
  eventIdSet: Set<string>
): PartitionInboxReadIdsResult {
  const legacyIds: string[] = [];
  const eventIds: string[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (!id) continue;
    if (eventIdSet.has(id)) {
      eventIds.push(id);
    } else if (legacyIdSet.has(id)) {
      legacyIds.push(id);
    } else {
      // Unknown id — try events first on PATCH (events-only inbox rows).
      eventIds.push(id);
    }
  }
  return { legacyIds, eventIds };
}

export async function lookupInboxReadIdSets(
  sb: SupabaseClient,
  userId: string,
  ids: string[]
): Promise<{ legacyIdSet: Set<string>; eventIdSet: Set<string> }> {
  const unique = [...new Set(ids.map((x) => x.trim()).filter(Boolean))];
  const legacyIdSet = new Set<string>();
  const eventIdSet = new Set<string>();
  if (unique.length === 0) return { legacyIdSet, eventIdSet };

  const [legacyRes, eventRes] = await Promise.all([
    sb.from("notifications").select("id").eq("user_id", userId).in("id", unique),
    sb.from("notification_events").select("id").eq("user_id", userId).in("id", unique),
  ]);

  for (const row of legacyRes.data ?? []) {
    const id = trimText((row as { id?: unknown }).id);
    if (id) legacyIdSet.add(id);
  }
  for (const row of eventRes.data ?? []) {
    const id = trimText((row as { id?: unknown }).id);
    if (id) eventIdSet.add(id);
  }

  return { legacyIdSet, eventIdSet };
}

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function patchInboxNotificationIdsRead(
  sb: SupabaseClient,
  userId: string,
  ids: string[]
): Promise<{ ok: true; updated: number } | { ok: false; error: string }> {
  const unique = [...new Set(ids.map((x) => x.trim()).filter(Boolean))];
  if (unique.length === 0) {
    return { ok: false, error: "ids_or_mark_all_required" };
  }

  const { legacyIdSet, eventIdSet } = await lookupInboxReadIdSets(sb, userId, unique);
  const { legacyIds, eventIds } = partitionInboxReadIdsFromLookup(unique, legacyIdSet, eventIdSet);

  let updated = 0;

  if (legacyIds.length > 0) {
    const { error } = await sb
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .in("id", legacyIds);
    if (error) return { ok: false, error: error.message };
    updated += legacyIds.length;
  }

  for (const eventId of eventIds) {
    const ok = await markNotificationRead(sb, userId, eventId, { openedAt: true });
    if (ok) updated += 1;
  }

  invalidateNotificationUnreadCountCache(userId);
  if (eventIds.length > 0) {
    invalidateNotificationBadgeCache(userId);
  }

  return { ok: true, updated };
}

export async function markAllNotificationEventsRead(
  sb: SupabaseClient,
  userId: string
): Promise<number> {
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("notification_events")
    .update({ unread: false, read_at: now, opened_at: now })
    .eq("user_id", userId.trim())
    .eq("unread", true)
    .is("read_at", null)
    .select("id");
  if (error) return 0;
  const count = data?.length ?? 0;
  if (count > 0) invalidateNotificationBadgeCache(userId);
  return count;
}

export async function markChatNotificationEventsRead(sb: SupabaseClient, userId: string): Promise<number> {
  let total = 0;
  for (const category of ["chat_message", "group_message", "chat", "group"] as const) {
    total += await markNotificationEventsReadByCategory(sb, userId, category);
  }
  return total;
}

const CHAT_EVENT_CATEGORIES = new Set(["chat_message", "group_message", "chat", "group"]);
const CHAT_EVENT_TYPES = new Set([
  "chat_message",
  "group_message",
  "mention_message",
  "pin_message",
  "trade_message",
  "store_order_message",
]);

export async function markNonChatNonOwnerNotificationEventsRead(
  sb: SupabaseClient,
  userId: string
): Promise<number> {
  const { data, error } = await sb
    .from("notification_events")
    .select("id, category, type, display_payload")
    .eq("user_id", userId.trim())
    .eq("unread", true)
    .is("read_at", null)
    .limit(500);
  if (error || !data?.length) return 0;

  const { mapNotificationEventToInboxRow } = await import("@/lib/notifications/inbox-events-merge");
  const { isOwnerStoreCommerceNotificationRow } = await import(
    "@/lib/notifications/owner-store-commerce-notification-meta"
  );
  const { isInAppChatMessageNotificationRow } = await import(
    "@/lib/notifications/inapp-chat-message-notification"
  );

  const idsToMark = data
    .filter((row) => {
      const category = String(row.category ?? "");
      const type = String(row.type ?? "");
      if (CHAT_EVENT_CATEGORIES.has(category) || CHAT_EVENT_TYPES.has(type)) return false;
      const mapped = mapNotificationEventToInboxRow(
        row as Parameters<typeof mapNotificationEventToInboxRow>[0]
      );
      if (isInAppChatMessageNotificationRow(mapped)) return false;
      if (isOwnerStoreCommerceNotificationRow(mapped)) return false;
      return true;
    })
    .map((row) => String(row.id ?? "").trim())
    .filter(Boolean);

  if (idsToMark.length === 0) return 0;

  const now = new Date().toISOString();
  const { data: updated, error: uErr } = await sb
    .from("notification_events")
    .update({ unread: false, read_at: now, opened_at: now })
    .eq("user_id", userId.trim())
    .in("id", idsToMark)
    .select("id");
  if (uErr) return 0;
  const count = updated?.length ?? 0;
  if (count > 0) invalidateNotificationBadgeCache(userId);
  return count;
}

export async function markOwnerStoreCommerceNotificationEventsRead(
  sb: SupabaseClient,
  userId: string,
  orderIds: string[]
): Promise<number> {
  let total = 0;
  for (const orderId of orderIds) {
    total += await markOrderNotificationEventsRead(sb, userId, orderId);
  }
  return total;
}
