import type { SupabaseClient } from "@supabase/supabase-js";
import {
  markNotificationEventsReadByCategory,
  markOrderNotificationEventsRead,
} from "@/lib/notifications/core/notification-event-repository";
import {
  mapNotificationEventToInboxRow,
  type InboxNotificationRow,
  type NotificationEventInboxSource,
} from "@/lib/notifications/inbox-events-merge";
import { markNotificationRead, markNotificationThreadRead } from "@/lib/notifications/pipeline/notify-read-service";
import { invalidateNotificationUnreadCountCache } from "@/lib/notifications/notification-unread-count-cache";
import { invalidateNotificationBadgeCache } from "@/lib/notifications/pipeline/notify-badge-service";
import {
  clearNotificationTargetsAfterThreadRead,
  clearNotificationTargetsForLegacyInboxRow,
} from "@/lib/notifications/notification-target-read-bridge";
import { legacyNotificationsSelect } from "@/lib/notifications/legacy-inbox-compatibility-adapter";

export type PartitionInboxReadIdsResult = {
  legacyIds: string[];
  eventIds: string[];
};

export type InboxBellThreadReadPlan = {
  threadId: string;
  threadType: "chat_room" | "trade_room" | "order" | "community_post";
  readReason:
    | "community_post_opened"
    | "trade_detail_opened"
    | "order_detail_opened"
    | "chat_room_visible";
  categories?: string[];
};

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function metaRecord(row: InboxNotificationRow): Record<string, unknown> {
  return row.meta && typeof row.meta === "object" ? (row.meta as Record<string, unknown>) : {};
}

export function extractRoomIdFromInboxLink(linkUrl: string | null | undefined): string | null {
  const u = trimText(linkUrl);
  if (!u) return null;
  let path = u;
  if (u.startsWith("http://") || u.startsWith("https://")) {
    try {
      path = new URL(u).pathname;
    } catch {
      path = u;
    }
  }
  const patterns = [
    /\/community-messenger\/rooms\/([^/?#]+)/,
    /\/chats\/([^/?#]+)/,
    /\/mypage\/trade\/chat\/([^/?#]+)/,
  ];
  for (const re of patterns) {
    const m = path.match(re);
    if (m?.[1]) return decodeURIComponent(m[1]);
  }
  return null;
}

function tradeOfferEvent(meta: Record<string, unknown>): string | null {
  for (const key of ["notification_type", "event", "spec_type"] as const) {
    const v = trimText(meta[key]);
    if (v === "offer_created" || v === "offer_accepted" || v === "offer_rejected") return v;
  }
  return null;
}

/** Tier1 bell inbox row → thread read + target clear plan (Legacy P0). */
export function resolveInboxBellThreadRead(row: InboxNotificationRow): InboxBellThreadReadPlan | null {
  const meta = metaRecord(row);
  const kind = trimText(meta.kind);
  const pushKind = trimText(row.push_kind).toLowerCase();
  const postId = trimText(meta.post_id) || trimText(meta.community_post_id);
  const orderId = trimText(meta.order_id) || trimText(row.ref_id);
  const productId = trimText(meta.product_id);
  const roomId =
    trimText(meta.room_id) ||
    trimText(meta.chat_room_id) ||
    extractRoomIdFromInboxLink(row.link_url);

  if (
    postId &&
    (pushKind === "community" ||
      row.notification_type === "report" ||
      trimText(row.domain).toLowerCase() === "community")
  ) {
    return {
      threadId: postId,
      threadType: "community_post",
      readReason: "community_post_opened",
    };
  }

  if (row.notification_type === "commerce" && orderId) {
    return {
      threadId: orderId,
      threadType: "order",
      readReason: "order_detail_opened",
    };
  }

  const tradeOffer = kind === "trade_offer" ? tradeOfferEvent(meta) : null;
  if (tradeOffer === "offer_accepted") {
    const acceptedRoom =
      trimText(meta.chat_room_id) || trimText(meta.room_id) || roomId;
    if (acceptedRoom) {
      return {
        threadId: acceptedRoom,
        threadType: "trade_room",
        readReason: "chat_room_visible",
        categories: ["trade_message"],
      };
    }
  }

  if (
    productId &&
    (pushKind === "trade" || kind === "trade_offer" || row.notification_type === "status")
  ) {
    if (kind === "trade_chat" || (row.notification_type === "chat" && pushKind === "trade")) {
      if (roomId) {
        return {
          threadId: roomId,
          threadType: "trade_room",
          readReason: "chat_room_visible",
          categories: ["trade_message"],
        };
      }
    }
    return {
      threadId: productId,
      threadType: "trade_room",
      readReason: "trade_detail_opened",
      categories: ["trade_status", "trade_message"],
    };
  }

  if (
    roomId &&
    (row.notification_type === "chat" ||
      pushKind === "chat" ||
      kind === "missed_call" ||
      kind === "community_chat" ||
      kind === "group_chat" ||
      kind === "trade_chat")
  ) {
    const isTradeChat = kind === "trade_chat" || pushKind === "trade";
    return {
      threadId: roomId,
      threadType: isTradeChat ? "trade_room" : "chat_room",
      readReason: "chat_room_visible",
      categories: isTradeChat ? ["trade_message"] : ["chat_message", "group_message"],
    };
  }

  return null;
}

export function inboxBellThreadReadDedupeKey(plan: InboxBellThreadReadPlan): string {
  const cats = [...(plan.categories ?? [])].sort().join(",");
  return `${plan.threadType}:${plan.threadId}:${plan.readReason}:${cats}`;
}

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
    legacyNotificationsSelect(sb).select("id").eq("user_id", userId).in("id", unique),
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

const INBOX_ROW_SELECT =
  "id, notification_type, title, body, link_url, is_read, created_at, meta, domain, ref_id, push_kind";
const EVENT_ROW_SELECT =
  "id, type, category, title, body, display_payload, read_at, created_at, dedupe_key, room_id";

export async function fetchInboxRowsForIds(
  sb: SupabaseClient,
  userId: string,
  ids: string[]
): Promise<InboxNotificationRow[]> {
  const unique = [...new Set(ids.map((x) => x.trim()).filter(Boolean))];
  if (unique.length === 0) return [];

  const [legacyRes, eventRes] = await Promise.all([
    legacyNotificationsSelect(sb).select(INBOX_ROW_SELECT).eq("user_id", userId).in("id", unique),
    sb
      .from("notification_events")
      .select(EVENT_ROW_SELECT)
      .eq("user_id", userId)
      .in("id", unique),
  ]);

  const legacyById = new Map<string, InboxNotificationRow>();
  for (const row of legacyRes.data ?? []) {
    const id = trimText((row as { id?: unknown }).id);
    if (!id) continue;
    legacyById.set(id, {
      ...(row as InboxNotificationRow),
      source: "legacy",
    });
  }

  const eventById = new Map<string, InboxNotificationRow>();
  for (const row of eventRes.data ?? []) {
    const mapped = mapNotificationEventToInboxRow(row as NotificationEventInboxSource);
    eventById.set(mapped.id, mapped);
  }

  const out: InboxNotificationRow[] = [];
  for (const id of unique) {
    const row = eventById.get(id) ?? legacyById.get(id);
    if (row) out.push(row);
  }
  return out;
}

export async function clearNotificationTargetsForInboxRows(
  sb: SupabaseClient,
  userId: string,
  rows: InboxNotificationRow[]
): Promise<void> {
  const seen = new Set<string>();
  for (const row of rows) {
    const plan = resolveInboxBellThreadRead(row);
    if (plan) {
      const key = inboxBellThreadReadDedupeKey(plan);
      if (seen.has(key)) continue;
      seen.add(key);
      await clearNotificationTargetsAfterThreadRead(sb, userId, plan);
      continue;
    }
    if (row.source !== "event") {
      await clearNotificationTargetsForLegacyInboxRow(sb, userId, row);
    }
  }
}

async function dismissNotificationEventFromInbox(
  sb: SupabaseClient,
  userId: string,
  eventId: string
): Promise<boolean> {
  const uid = userId.trim();
  const eid = eventId.trim();
  if (!uid || !eid) return false;

  const { data: existing, error: readErr } = await sb
    .from("notification_events")
    .select("display_payload")
    .eq("user_id", uid)
    .eq("id", eid)
    .maybeSingle();
  if (readErr || !existing) return false;

  const now = new Date().toISOString();
  const prevPayload =
    existing.display_payload && typeof existing.display_payload === "object"
      ? (existing.display_payload as Record<string, unknown>)
      : {};
  const nextPayload = {
    ...prevPayload,
    inbox_dismissed_at: now,
    deleted_at: now,
  };

  const { error } = await sb
    .from("notification_events")
    .update({
      unread: false,
      read_at: now,
      opened_at: now,
      display_payload: nextPayload,
    })
    .eq("user_id", uid)
    .eq("id", eid);
  return !error;
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

  const rows = await fetchInboxRowsForIds(sb, userId, unique);
  const { legacyIdSet, eventIdSet } = await lookupInboxReadIdSets(sb, userId, unique);
  const { legacyIds, eventIds } = partitionInboxReadIdsFromLookup(unique, legacyIdSet, eventIdSet);

  let updated = 0;

  const eventRows = rows.filter((r) => eventIds.includes(r.id));
  const threadPlans = new Map<string, InboxBellThreadReadPlan>();
  for (const row of eventRows) {
    const plan = resolveInboxBellThreadRead(row);
    if (!plan) continue;
    threadPlans.set(inboxBellThreadReadDedupeKey(plan), plan);
  }

  for (const plan of threadPlans.values()) {
    const count = await markNotificationThreadRead(sb, userId, plan.threadId, {
      threadType: plan.threadType,
      readReason: plan.readReason,
      categories: plan.categories,
    });
    if (count > 0) updated += count;
    else updated += 1;
  }

  const plannedRowIds = new Set(
    eventRows
      .filter((row) => resolveInboxBellThreadRead(row))
      .map((row) => row.id)
  );
  for (const row of eventRows) {
    if (plannedRowIds.has(row.id)) continue;
    const ok = await markNotificationRead(sb, userId, row.id, { openedAt: true });
    if (ok) updated += 1;
    await clearNotificationTargetsForInboxRows(sb, userId, [row]);
  }

  if (legacyIds.length > 0) {
    const { error } = await legacyNotificationsSelect(sb)
      .update({ is_read: true })
      .eq("user_id", userId)
      .in("id", legacyIds);
    if (error) return { ok: false, error: error.message };
    updated += legacyIds.length;
    const legacyRows = rows.filter((r) => legacyIds.includes(r.id));
    await clearNotificationTargetsForInboxRows(sb, userId, legacyRows);
  }

  invalidateNotificationUnreadCountCache(userId);
  invalidateNotificationBadgeCache(userId);

  return { ok: true, updated };
}

export async function patchInboxNotificationIdsDelete(
  sb: SupabaseClient,
  userId: string,
  ids: string[]
): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  const unique = [...new Set(ids.map((x) => x.trim()).filter(Boolean))];
  if (unique.length === 0) {
    return { ok: false, error: "delete_ids_required" };
  }

  const readResult = await patchInboxNotificationIdsRead(sb, userId, unique);
  if (!readResult.ok) return readResult;

  const { legacyIdSet, eventIdSet } = await lookupInboxReadIdSets(sb, userId, unique);
  const { legacyIds, eventIds } = partitionInboxReadIdsFromLookup(unique, legacyIdSet, eventIdSet);

  let deleted = 0;

  for (const eventId of eventIds) {
    const ok = await dismissNotificationEventFromInbox(sb, userId, eventId);
    if (ok) deleted += 1;
  }

  if (legacyIds.length > 0) {
    const { data: deletedRows, error } = await legacyNotificationsSelect(sb)
      .delete()
      .eq("user_id", userId)
      .in("id", legacyIds)
      .select("id");
    if (error) return { ok: false, error: error.message };
    deleted += deletedRows?.length ?? 0;
  }

  invalidateNotificationUnreadCountCache(userId);
  invalidateNotificationBadgeCache(userId);

  return { ok: true, deleted };
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
    .select("id, category, type, display_payload, room_id")
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

  const rowsToMark = data.filter((row) => {
    const category = String(row.category ?? "");
    const type = String(row.type ?? "");
    if (CHAT_EVENT_CATEGORIES.has(category) || CHAT_EVENT_TYPES.has(type)) return false;
    // Member mark-all must not clear missed calls (B axis / call tab).
    if (type === "missed_call" || category === "missed_call") return false;
    const mapped = mapNotificationEventToInboxRow(
      row as Parameters<typeof mapNotificationEventToInboxRow>[0]
    );
    if (isInAppChatMessageNotificationRow(mapped)) return false;
    // Store Operational Identity — never cleared by member mark-all.
    if (isOwnerStoreCommerceNotificationRow(mapped)) return false;
    return true;
  });

  const idsToMark = rowsToMark
    .map((row) => String(row.id ?? "").trim())
    .filter(Boolean);

  if (idsToMark.length === 0) {
    const adminOnly = await markNotificationEventsReadByCategory(sb, userId, "admin_notice");
    if (adminOnly > 0) invalidateNotificationBadgeCache(userId);
    return adminOnly;
  }

  const now = new Date().toISOString();
  const { data: updated, error: uErr } = await sb
    .from("notification_events")
    .update({ unread: false, read_at: now, opened_at: now })
    .eq("user_id", userId.trim())
    .in("id", idsToMark)
    .select("id");
  if (uErr) return 0;
  let count = updated?.length ?? 0;

  const mappedRows = rowsToMark.map((row) =>
    mapNotificationEventToInboxRow(row as Parameters<typeof mapNotificationEventToInboxRow>[0])
  );
  await clearNotificationTargetsForInboxRows(sb, userId, mappedRows);

  const adminNoticeMarked = await markNotificationEventsReadByCategory(sb, userId, "admin_notice");
  if (adminNoticeMarked > 0) count += adminNoticeMarked;

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

/**
 * Member A 전체 삭제 — dismiss A events only (not chat/missed/owner).
 * B rooms and orphan missed stay.
 */
export async function deleteAllMemberANotificationEvents(
  sb: SupabaseClient,
  userId: string
): Promise<number> {
  const { data, error } = await sb
    .from("notification_events")
    .select("id, category, type, display_payload, room_id")
    .eq("user_id", userId.trim())
    .limit(500);
  if (error || !data?.length) return 0;

  const { mapNotificationEventToInboxRow } = await import("@/lib/notifications/inbox-events-merge");
  const { isOwnerStoreCommerceNotificationRow } = await import(
    "@/lib/notifications/owner-store-commerce-notification-meta"
  );
  const { isInAppChatMessageNotificationRow } = await import(
    "@/lib/notifications/inapp-chat-message-notification"
  );

  const idsToDelete = data
    .filter((row) => {
      const category = String(row.category ?? "");
      const type = String(row.type ?? "");
      if (CHAT_EVENT_CATEGORIES.has(category) || CHAT_EVENT_TYPES.has(type)) return false;
      if (type === "missed_call" || category === "missed_call") return false;
      const mapped = mapNotificationEventToInboxRow(
        row as Parameters<typeof mapNotificationEventToInboxRow>[0]
      );
      if (isInAppChatMessageNotificationRow(mapped)) return false;
      if (isOwnerStoreCommerceNotificationRow(mapped)) return false;
      const payload =
        row.display_payload && typeof row.display_payload === "object"
          ? (row.display_payload as Record<string, unknown>)
          : null;
      if (payload?.inbox_dismissed_at || payload?.deleted_at) return false;
      return true;
    })
    .map((row) => String(row.id ?? "").trim())
    .filter(Boolean);

  let deleted = 0;
  for (const id of idsToDelete) {
    if (await dismissNotificationEventFromInbox(sb, userId, id)) deleted += 1;
  }
  if (deleted > 0) {
    invalidateNotificationUnreadCountCache(userId);
    invalidateNotificationBadgeCache(userId);
  }
  return deleted;
}

export async function clearChatInboxTargetsAfterMarkAll(
  sb: SupabaseClient,
  userId: string
): Promise<void> {
  const { data, error } = await sb
    .from("notification_events")
    .select("id, type, category, title, body, display_payload, read_at, created_at, dedupe_key, room_id")
    .eq("user_id", userId.trim())
    .not("room_id", "is", null)
    .limit(500);
  if (error || !data?.length) return;

  const mapped = data.map((row) =>
    mapNotificationEventToInboxRow(row as NotificationEventInboxSource)
  );
  await clearNotificationTargetsForInboxRows(sb, userId, mapped);
}
