import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationEventRow } from "@/lib/notifications/core/notification-event-schema";
import { buildChatRoomWebPath, buildGroupChatWebPath, buildTradeLegacyChatWebPath } from "@/lib/notifications/policy/notification-deeplink-policy";
import { isInAppChatMessageNotificationRow } from "@/lib/notifications/inapp-chat-message-notification";
import { isOwnerStoreCommerceNotificationRow } from "@/lib/notifications/owner-store-commerce-notification-meta";
import { filterOwnerStoreCommerceByStoreId } from "@/lib/notifications/filter-owner-store-commerce-notifications";
import { defaultInboxFallbackHref } from "@/lib/notifications/resolve-notification-inbox-href";
import type { InboxPushKindFilter } from "@/lib/me/fetch-me-notifications-deduped";

export type InboxNotificationRow = {
  id: string;
  source?: "legacy" | "event";
  notification_type: string;
  title: string;
  body: string | null;
  link_url: string | null;
  is_read: boolean;
  created_at: string;
  meta?: Record<string, unknown> | null;
  domain?: string | null;
  ref_id?: string | null;
  push_kind?: string | null;
  dedupe_key?: string | null;
};

export type NotificationEventInboxSource = Pick<
  NotificationEventRow,
  | "id"
  | "type"
  | "category"
  | "title"
  | "body"
  | "display_payload"
  | "read_at"
  | "created_at"
  | "dedupe_key"
  | "room_id"
>;

const INBOX_EXCLUDED_EVENT_TYPES = new Set(["incoming_call_signal"]);

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function payloadRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null;
  return payload as Record<string, unknown>;
}

function legacyNotificationTypeFromEvent(event: NotificationEventInboxSource): string {
  const payload = payloadRecord(event.display_payload);
  const legacy = trimText(payload?.legacyNotificationType);
  if (legacy) return legacy;

  const type = trimText(event.type);
  const category = trimText(event.category);
  if (type === "chat_message" || type === "group_message" || type === "mention_message" || type === "pin_message" || type === "store_order_message") {
    return "chat";
  }
  if (type === "trade_message") return "chat";
  if (type === "order_status" || type === "delivery_status" || category === "order_status" || category === "delivery_status" || category === "store") {
    return "commerce";
  }
  if (type === "community_activity" || category === "community_activity") return "report";
  if (type === "trade_status" || category === "trade_status" || category === "trade") return "status";
  if (type === "missed_call" || category === "missed_call") return "system";
  if (type === "admin_marketing_banner") return "system";
  return "system";
}

function pushKindFromEvent(event: NotificationEventInboxSource): string | null {
  const payload = payloadRecord(event.display_payload);
  const legacy = trimText(payload?.legacyPushKind);
  if (legacy) return legacy;

  const type = trimText(event.type);
  const category = trimText(event.category);
  if (type === "chat_message" || type === "group_message" || type === "mention_message" || type === "pin_message" || type === "store_order_message" || type === "trade_message" || category === "chat" || category === "group") {
    return "chat";
  }
  if (type === "trade_status" || category === "trade" || category === "trade_status") return "trade";
  if (type === "order_status" || type === "delivery_status" || category === "store" || category === "order_status" || category === "delivery_status") {
    return "delivery";
  }
  if (type === "community_activity" || category === "community_activity") return "community";
  if (type === "admin_marketing_banner") return "marketing";
  if (type === "admin_notice") return "notice";
  return "system";
}

function payloadTime(payload: unknown, keys: string[]): number | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value !== "string" || !value.trim()) continue;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function payloadFlag(payload: unknown, keys: string[]): boolean | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "boolean") return value;
  }
  return null;
}

export function isInboxDismissedNotificationEvent(event: NotificationEventInboxSource): boolean {
  const payload = payloadRecord(event.display_payload);
  if (payloadFlag(payload, ["deleted", "isDeleted"]) === true) return true;
  if (payloadTime(payload, ["deleted_at", "deletedAt", "inbox_dismissed_at"]) != null) return true;
  return false;
}

function metaFromEvent(event: NotificationEventInboxSource): Record<string, unknown> | null {
  const payload = payloadRecord(event.display_payload);
  const legacyMeta = payload?.legacyMeta;
  if (legacyMeta && typeof legacyMeta === "object") {
    return legacyMeta as Record<string, unknown>;
  }
  const meta: Record<string, unknown> = {};
  if (event.type === "missed_call") meta.kind = "missed_call";
  const roomKind = trimText(payload?.roomKind);
  if (roomKind) meta.kind = roomKind === "group" ? "group_chat" : roomKind === "trade" ? "trade_chat" : "community_chat";
  if (event.room_id) meta.room_id = event.room_id;
  return Object.keys(meta).length > 0 ? meta : null;
}

export function resolveEventInboxLinkUrl(event: NotificationEventInboxSource): string {
  const payload = payloadRecord(event.display_payload);
  const routeUrl = trimText(payload?.routeUrl);
  if (routeUrl) return routeUrl;
  const linkUrl = trimText(payload?.link_url);
  if (linkUrl) return linkUrl;

  const meta = metaFromEvent(event);
  const metaKind = trimText(meta?.kind);
  if (metaKind === "friend_request" || metaKind === "friend_accepted" || metaKind === "friend_rejected") {
    return "/community-messenger?section=friends";
  }

  const roomId = trimText(event.room_id);
  const type = trimText(event.type);
  if (roomId) {
    if (type === "group_message" || metaKind === "group_chat") return buildGroupChatWebPath(roomId);
    if (type === "trade_message" || metaKind === "trade_chat") return buildTradeLegacyChatWebPath(roomId);
    return buildChatRoomWebPath(roomId);
  }

  const postId = trimText(meta?.post_id ?? meta?.community_post_id);
  if (postId) return `/philife/${encodeURIComponent(postId)}`;

  const orderId =
    trimText(meta?.order_id) ||
    trimText(payload?.legacyRefId);
  if ((type === "order_status" || type === "delivery_status") && orderId) {
    return `/mypage/store-orders/${encodeURIComponent(orderId)}`;
  }
  if (type === "order_status" || type === "delivery_status") return "/my/store-orders";
  if (type === "community_activity") return "/philife";
  if (type === "admin_marketing_banner") {
    const landing = trimText(payload?.deeplinkUrl ?? payload?.webUrl ?? payload?.landing_url);
    if (landing) return landing;
  }

  return defaultInboxFallbackHref();
}

export function mapNotificationEventToInboxRow(event: NotificationEventInboxSource): InboxNotificationRow {
  const payload = payloadRecord(event.display_payload);
  const meta = metaFromEvent(event);
  const refId = trimText(payload?.legacyRefId) || null;

  return {
    id: event.id,
    source: "event",
    notification_type: legacyNotificationTypeFromEvent(event),
    title: event.title,
    body: event.body ?? null,
    link_url: resolveEventInboxLinkUrl(event),
    is_read: Boolean(event.read_at),
    created_at: event.created_at,
    meta,
    domain: trimText(payload?.legacyDomain) || null,
    ref_id: refId,
    push_kind: pushKindFromEvent(event),
    dedupe_key: event.dedupe_key,
  };
}

function legacyDedupeKey(row: InboxNotificationRow): string | null {
  const explicit = trimText(row.dedupe_key);
  if (explicit) return explicit;
  const refId = trimText(row.ref_id);
  if (refId) return `legacy:${row.notification_type}:${refId}`;
  return null;
}

export function mergeInboxNotificationRows(
  legacyRows: InboxNotificationRow[],
  eventRows: InboxNotificationRow[]
): InboxNotificationRow[] {
  const eventDedupeKeys = new Set(
    eventRows.map((r) => trimText(r.dedupe_key)).filter(Boolean)
  );

  const filteredLegacy = legacyRows.filter((row) => {
    const key = legacyDedupeKey(row);
    if (key && eventDedupeKeys.has(key)) return false;
    return true;
  });

  const merged = [
    ...filteredLegacy.map((row) => ({ ...row, source: row.source ?? ("legacy" as const) })),
    ...eventRows,
  ];

  merged.sort((a, b) => {
    const ta = Date.parse(a.created_at);
    const tb = Date.parse(b.created_at);
    if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return tb - ta;
    return b.id.localeCompare(a.id);
  });

  return merged;
}

export type FetchNotificationEventsForInboxOpts = {
  fetchUpper: number;
  inboxPushKind?: InboxPushKindFilter | null;
  excludeOwnerList?: boolean;
  excludeChatMessageList?: boolean;
  ownerStoreId?: string;
};

function matchesInboxPushKind(row: InboxNotificationRow, pushKind: InboxPushKindFilter): boolean {
  if (pushKind === "all") return true;
  const pk = trimText(row.push_kind).toLowerCase();
  const nt = trimText(row.notification_type).toLowerCase();
  if (pushKind === "chat") return pk === "chat" || nt === "chat";
  if (pushKind === "delivery") return pk === "delivery" || (pk === "" && nt === "commerce");
  return pk === pushKind;
}

export function filterMappedInboxEventRows(
  rows: InboxNotificationRow[],
  opts: FetchNotificationEventsForInboxOpts
): InboxNotificationRow[] {
  let list = rows;
  if (opts.ownerStoreId) {
    list = filterOwnerStoreCommerceByStoreId(list, opts.ownerStoreId).slice(0, 200);
  } else if (opts.excludeOwnerList) {
    list = list.filter((r) => !isOwnerStoreCommerceNotificationRow(r));
  }
  if (opts.excludeChatMessageList) {
    list = list.filter((r) => !isInAppChatMessageNotificationRow(r));
  }
  if (opts.inboxPushKind && opts.inboxPushKind !== "all") {
    list = list.filter((r) => matchesInboxPushKind(r, opts.inboxPushKind!));
  }
  return list.slice(0, opts.fetchUpper);
}

export async function fetchNotificationEventsForInbox(
  sb: SupabaseClient,
  userId: string,
  opts: FetchNotificationEventsForInboxOpts
): Promise<InboxNotificationRow[]> {
  const uid = userId.trim();
  if (!uid) return [];

  const { data, error } = await sb
    .from("notification_events")
    .select("id, type, category, title, body, display_payload, read_at, created_at, dedupe_key, room_id")
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .limit(Math.max(opts.fetchUpper, 80));

  if (error) {
    if (error.message?.includes("notification_events") && error.message.includes("does not exist")) {
      return [];
    }
    console.warn("[fetchNotificationEventsForInbox]", error.message);
    return [];
  }

  const mapped = (data ?? [])
    .filter((row) => !INBOX_EXCLUDED_EVENT_TYPES.has(trimText((row as NotificationEventInboxSource).type)))
    .filter((row) => !isInboxDismissedNotificationEvent(row as NotificationEventInboxSource))
    .map((row) => mapNotificationEventToInboxRow(row as NotificationEventInboxSource));

  return filterMappedInboxEventRows(mapped, opts);
}
