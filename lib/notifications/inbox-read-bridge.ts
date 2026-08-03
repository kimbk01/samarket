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

  // Gate 3 Step 10 — Canonical-only write. Legacy `notifications` update FORBIDDEN.
  // Temporary adapter is read-only; backfill before mutating historical rows.
  void legacyIds;

  invalidateNotificationUnreadCountCache(userId);
  invalidateNotificationBadgeCache(userId);

  return { ok: true, updated };
}

/**
 * Gate 3 Step 8 — dismiss Notification Center events (soft deleted_at / inbox_dismissed_at).
 * Never deletes source trade/order/announcement rows.
 * Targets only Member A list-eligible events for current user.
 */
export async function dismissMemberNotificationCenterEvents(
  sb: SupabaseClient,
  userId: string,
  mode: "all" | "read_only"
): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  const uid = userId.trim();
  if (!uid) return { ok: false, error: "unauthorized" };

  const { isMemberNotificationAListItem } = await import(
    "@/lib/notifications/badge-authority-rebuild/member-notification-a-eligibility"
  );

  const { data, error } = await sb
    .from("notification_events")
    .select("id, type, category, unread, read_at, room_id, dedupe_key, display_payload, muted_snapshot")
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return { ok: false, error: error.message };

  const ids: string[] = [];
  for (const row of data ?? []) {
    if (!isMemberNotificationAListItem(row)) continue;
    const unread =
      row.unread !== false && !(row.read_at != null && String(row.read_at).trim() !== "");
    if (mode === "read_only" && unread) continue;
    const id = String(row.id ?? "").trim();
    if (id) ids.push(id);
  }
  if (ids.length === 0) return { ok: true, deleted: 0 };
  return patchInboxNotificationIdsDelete(sb, uid, ids);
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

  // Gate 3 Step 10 — Canonical-only soft dismiss. Legacy table hard-delete FORBIDDEN.
  void legacyIds;

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

/**
 * Gate 3 Step 4 — Member Bell mark-all (canonical A only).
 * legacyUpdated is always 0 (Gate 2 dual-write end).
 */
export type MemberAMarkAllResult = Readonly<{
  legacyUpdated: number;
  eventUpdated: number;
  /** Sum of store counts — UI Bell must use A projection resync, not subtract this. */
  updated: number;
}>;

export function aggregateMemberAMarkAllUpdated(
  legacyUpdated: number,
  eventUpdated: number
): MemberAMarkAllResult {
  const legacy = Math.max(0, Math.floor(Number(legacyUpdated) || 0));
  const event = Math.max(0, Math.floor(Number(eventUpdated) || 0));
  return { legacyUpdated: legacy, eventUpdated: event, updated: legacy + event };
}

/**
 * Gate 3 Step 4 — Mark-all for Header / My Bell (canonical A only).
 * Dual-write to legacy `notifications` is FORBIDDEN.
 * Mutates exactly canonical A event ids from resolveMemberNotificationAuthoritySet.
 */
export async function markMemberANotificationsAllRead(
  sb: SupabaseClient,
  userId: string,
  opts?: {
    /** Test seam — defaults to markCanonicalMemberANotificationEventsRead. */
    markEvents?: (sb: SupabaseClient, userId: string) => Promise<number>;
  }
): Promise<MemberAMarkAllResult | { ok: false; error: string }> {
  const uid = userId.trim();
  const markEvents = opts?.markEvents ?? markCanonicalMemberANotificationEventsRead;
  const eventUpdated = await markEvents(sb, uid);
  invalidateNotificationUnreadCountCache(uid);
  invalidateNotificationBadgeCache(uid);
  return aggregateMemberAMarkAllUpdated(0, eventUpdated);
}

/**
 * Gate 3 Step 4 — mark exactly canonical A event ids (no legacy, no category blast).
 */
export async function markCanonicalMemberANotificationEventsRead(
  sb: SupabaseClient,
  userId: string
): Promise<number> {
  const { loadBellExplainUnreadEventRows } = await import(
    "@/lib/notifications/load-bell-explain-unread-events"
  );
  const { resolveMemberNotificationAuthorityFromRows } = await import(
    "@/lib/notifications/badge-authority-rebuild/member-notification-a-authority"
  );
  const { mapNotificationEventToInboxRow } = await import(
    "@/lib/notifications/inbox-events-merge"
  );

  const uid = userId.trim();
  const rows = await loadBellExplainUnreadEventRows(sb, uid);
  const authority = resolveMemberNotificationAuthorityFromRows(rows, uid);
  const idsToMark = [...authority.eventIds];
  if (idsToMark.length === 0) return 0;

  const now = new Date().toISOString();
  const { data: updated, error: uErr } = await sb
    .from("notification_events")
    .update({ unread: false, read_at: now, opened_at: now })
    .eq("user_id", uid)
    .in("id", idsToMark)
    .select("id");
  if (uErr) return 0;
  const count = updated?.length ?? 0;

  const idSet = new Set(idsToMark);
  const mappedRows = rows
    .filter((row) => idSet.has(String(row.id ?? "").trim()))
    .map((row) =>
      mapNotificationEventToInboxRow(row as Parameters<typeof mapNotificationEventToInboxRow>[0])
    );
  await clearNotificationTargetsForInboxRows(sb, uid, mappedRows);

  if (count > 0) invalidateNotificationBadgeCache(uid);
  return count;
}

/** @deprecated Use markCanonicalMemberANotificationEventsRead — alias for callers. */
export async function markNonChatNonOwnerNotificationEventsRead(
  sb: SupabaseClient,
  userId: string
): Promise<number> {
  return markCanonicalMemberANotificationEventsRead(sb, userId);
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
 * Gate 3 Step 10 — Owner commerce mark-all on notification_events only (no legacy table).
 */
export async function markAllOwnerStoreCommerceNotificationEventsRead(
  sb: SupabaseClient,
  userId: string
): Promise<number> {
  const { isOwnerStoreCommerceNotificationRow } = await import(
    "@/lib/notifications/owner-store-commerce-notification-meta"
  );
  const { mapNotificationEventToInboxRow } = await import(
    "@/lib/notifications/inbox-events-merge"
  );

  const uid = userId.trim();
  if (!uid) return 0;

  const { data, error } = await sb
    .from("notification_events")
    .select(
      "id, type, category, title, body, display_payload, unread, read_at, created_at, dedupe_key, room_id"
    )
    .eq("user_id", uid)
    .eq("unread", true)
    .is("read_at", null)
    .limit(500);
  if (error || !data?.length) return 0;

  const orderIds = new Set<string>();
  const mappedRows: InboxNotificationRow[] = [];
  for (const row of data) {
    const mapped = mapNotificationEventToInboxRow(
      row as NotificationEventInboxSource
    );
    if (!isOwnerStoreCommerceNotificationRow(mapped)) continue;
    mappedRows.push(mapped);
    const meta = mapped.meta;
    const oid =
      meta && typeof meta === "object"
        ? String((meta as Record<string, unknown>).order_id ?? mapped.ref_id ?? "").trim()
        : "";
    if (oid) orderIds.add(oid);
  }

  let total = 0;
  if (orderIds.size > 0) {
    total = await markOwnerStoreCommerceNotificationEventsRead(sb, uid, [...orderIds]);
  } else if (mappedRows.length > 0) {
    const now = new Date().toISOString();
    const ids = mappedRows.map((r) => r.id).filter(Boolean);
    const { data: updated } = await sb
      .from("notification_events")
      .update({ unread: false, read_at: now, opened_at: now })
      .eq("user_id", uid)
      .in("id", ids)
      .select("id");
    total = updated?.length ?? 0;
  }

  if (mappedRows.length > 0) {
    await clearNotificationTargetsForInboxRows(sb, uid, mappedRows);
  }
  if (total > 0) {
    invalidateNotificationUnreadCountCache(uid);
    invalidateNotificationBadgeCache(uid);
  }
  return total;
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
