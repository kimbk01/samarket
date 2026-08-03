import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationEventRow } from "@/lib/notifications/core/notification-event-schema";
import { buildChatRoomWebPath, buildGroupChatWebPath } from "@/lib/notifications/policy/notification-deeplink-policy";
import { isInAppChatMessageNotificationRow } from "@/lib/notifications/inapp-chat-message-notification";
import { isOwnerStoreCommerceNotificationRow } from "@/lib/notifications/owner-store-commerce-notification-meta";
import { filterOwnerStoreCommerceByStoreId } from "@/lib/notifications/filter-owner-store-commerce-notifications";
import { defaultInboxFallbackHref } from "@/lib/notifications/resolve-notification-inbox-href";
import type { InboxPushKindFilter } from "@/lib/me/fetch-me-notifications-deduped";
import { resolveSafeNotificationInternalRoute } from "@/lib/notifications/policy/notification-internal-route";

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
  /** Canonical Bell row presentation (Phase 2) — not legacy notification_type. */
  bell_presentation_type?: BellPresentationType;
  /** Canonical notification_events.type (not collapsed legacy notification_type). */
  event_type?: string | null;
  /** Admin campaign type when present in display_payload.campaignType. */
  campaign_type?: string | null;
};

/** Bell Inbox presentation SSOT — digit/list share notification_events; UI subtypes here. */
export type BellPresentationType =
  | "general_message"
  | "group_message"
  | "trade_message"
  | "customer_order_message"
  | "owner_order_message"
  | "trade_status"
  | "order_status"
  | "customer_order_status"
  | "owner_order_status"
  | "delivery_status"
  | "missed_call"
  | "admin_notice"
  /** Admin campaign type=system (same event.type admin_notice; presentation only). */
  | "admin_system"
  | "admin_marketing"
  | "system_important"
  | "unsupported";

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

const INBOX_EXCLUDED_EVENT_TYPES = new Set([
  "incoming_call_signal",
  "admin_test",
]);

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

  const campaignType = trimText(payload?.campaignType).toLowerCase();
  if (campaignType === "marketing") return "marketing";
  if (campaignType === "system") return "system";
  if (campaignType === "notice") return "notice";

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
  if (roomKind) {
    if (roomKind === "group") meta.kind = "group_chat";
    else if (roomKind === "trade" || roomKind === "trade_legacy") meta.kind = "trade_chat";
    else if (roomKind === "store_order") meta.kind = "store_order_message";
    else meta.kind = "community_chat";
  }
  if (event.room_id) meta.room_id = event.room_id;
  return Object.keys(meta).length > 0 ? meta : null;
}

function isOwnerOrderSide(event: NotificationEventInboxSource, meta: Record<string, unknown> | null): boolean {
  const payload = payloadRecord(event.display_payload);
  const role = trimText(
    payload?.viewerRole ?? payload?.viewer_role ?? meta?.viewer_role ?? meta?.role ?? meta?.owner_role
  ).toLowerCase();
  if (role === "owner" || role === "admin" || role === "store_owner") return true;
  if (payload?.ownerSide === true || payload?.owner_side === true) return true;
  if (meta?.owner_store_commerce === true || meta?.is_owner === true) return true;
  if (trimText(meta?.kind) === "owner_store_commerce") return true;
  if (isOwnerStoreCommerceNotificationRow({ meta })) return true;
  const kind = trimText(meta?.kind);
  if (kind.startsWith("store_point_")) return true;
  const route = trimText(payload?.routeUrl ?? payload?.link_url ?? meta?.link_url);
  if (route.includes("/stores/owner")) return true;
  return false;
}

/**
 * Maps canonical notification_events.type (+ payload roomKind) to Bell UI subtype.
 * DO NOT invent new event types here — presentation only.
 */
export function resolveBellPresentationType(event: NotificationEventInboxSource): BellPresentationType {
  const type = trimText(event.type);
  const category = trimText(event.category);
  const payload = payloadRecord(event.display_payload);
  const roomKind = trimText(payload?.roomKind).toLowerCase();
  const meta = metaFromEvent(event);
  const kind = trimText(meta?.kind).toLowerCase();

  // Explicit event.type first (status vs message — do not let leftover roomKind win).
  if (type === "missed_call") return "missed_call";
  if (type === "admin_notice") {
    const campaignType = trimText(payload?.campaignType).toLowerCase();
    if (campaignType === "system") return "admin_system";
    return "admin_notice";
  }
  if (type === "trade_status") return "trade_status";
  if (type === "delivery_status") return "delivery_status";
  if (type === "order_status") {
    return isOwnerOrderSide(event, meta) ? "owner_order_status" : "customer_order_status";
  }
  if (type === "trade_message") return "trade_message";
  if (type === "group_message" || type === "mention_message" || type === "pin_message") return "group_message";
  if (type === "store_order_message") {
    return isOwnerOrderSide(event, meta) ? "owner_order_message" : "customer_order_message";
  }
  if (type === "chat_message") return "general_message";
  if (type === "community_activity") return "system_important";
  if (type === "admin_marketing_banner") return "admin_marketing";
  if (type === "admin_test" || type === "incoming_call_signal") {
    return "unsupported";
  }

  // Payload roomKind / meta when type is absent or legacy-shaped.
  if (category === "missed_call" || kind === "missed_call") return "missed_call";
  if (
    roomKind === "trade" ||
    roomKind === "trade_legacy" ||
    kind === "trade_chat"
  ) {
    return "trade_message";
  }
  if (roomKind === "group" || kind === "group_chat") return "group_message";
  if (roomKind === "store_order" || kind === "store_order_message") {
    return isOwnerOrderSide(event, meta) ? "owner_order_message" : "customer_order_message";
  }
  if (roomKind === "direct" || kind === "community_chat") return "general_message";
  if (category === "trade_status") return "trade_status";
  if (category === "delivery_status") return "delivery_status";
  if (category === "order_status") {
    return isOwnerOrderSide(event, meta) ? "owner_order_status" : "customer_order_status";
  }
  return "unsupported";
}

export function resolveEventInboxLinkUrl(event: NotificationEventInboxSource): string {
  const payload = payloadRecord(event.display_payload);
  const routeUrl = trimText(payload?.routeUrl);
  if (routeUrl) {
    return resolveSafeNotificationInternalRoute(
      routeUrl,
      defaultInboxFallbackHref()
    )!;
  }
  const linkUrl = trimText(payload?.link_url);
  if (linkUrl) {
    return resolveSafeNotificationInternalRoute(
      linkUrl,
      defaultInboxFallbackHref()
    )!;
  }

  const meta = metaFromEvent(event);
  const metaKind = trimText(meta?.kind);
  // Friend-request product path retired (Contact SSOT). Ignore legacy meta kinds.

  const roomId = trimText(event.room_id);
  const type = trimText(event.type);
  if (roomId) {
    if (type === "group_message" || metaKind === "group_chat") return buildGroupChatWebPath(roomId);
    // Trade canonical = CM room path (same as FCM / resolveNotificationDestination trade_room).
    // DO NOT use /chats/:id legacy for new Bell rows — alias may redirect but is not SSOT.
    if (type === "trade_message" || metaKind === "trade_chat") return buildChatRoomWebPath(roomId);
    return buildChatRoomWebPath(roomId);
  }

  const postId = trimText(meta?.post_id ?? meta?.community_post_id);
  if (postId) return `/philife/${encodeURIComponent(postId)}`;

  const orderId =
    trimText(meta?.order_id) ||
    trimText(payload?.legacyRefId);
  if ((type === "order_status" || type === "delivery_status") && orderId) {
    if (isOwnerOrderSide(event, meta)) {
      const storeId = trimText(meta?.store_id) || trimText(payload?.storeId) || trimText(payload?.store_id);
      const sp = new URLSearchParams();
      if (storeId) sp.set("storeId", storeId);
      sp.set("order_id", orderId);
      sp.set("ack_owner_notifications", "1");
      return `/stores/owner/orders?${sp.toString()}`;
    }
    return `/mypage/store-orders/${encodeURIComponent(orderId)}`;
  }
  if (type === "order_status" || type === "delivery_status") {
    if (isOwnerOrderSide(event, meta)) return "/stores/owner/orders";
    return "/my/store-orders";
  }
  if (type === "community_activity") return "/philife";
  if (type === "admin_marketing_banner") {
    const landing = trimText(payload?.deeplinkUrl ?? payload?.webUrl ?? payload?.landing_url);
    if (landing) {
      return resolveSafeNotificationInternalRoute(
        landing,
        defaultInboxFallbackHref()
      )!;
    }
  }
  const noteThreadId = trimText(payload?.noteThreadId);
  if (noteThreadId) {
    return `/notifications/notes/${encodeURIComponent(noteThreadId)}`;
  }

  return defaultInboxFallbackHref();
}

export function mapNotificationEventToInboxRow(event: NotificationEventInboxSource): InboxNotificationRow {
  const payload = payloadRecord(event.display_payload);
  const meta = metaFromEvent(event);
  const refId = trimText(payload?.legacyRefId) || null;
  const campaignType = trimText(payload?.campaignType) || null;

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
    bell_presentation_type: resolveBellPresentationType(event),
    event_type: trimText(event.type) || null,
    campaign_type: campaignType,
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
  return mergeInboxNotificationRowsEventsPrimary(eventRows, legacyRows);
}

export function mergeInboxNotificationRowsEventsPrimary(
  eventRows: InboxNotificationRow[],
  legacyCompatibilityRows: InboxNotificationRow[]
): InboxNotificationRow[] {
  /**
   * Historical dual-read helper. Product Bell GET must NOT call this with legacy
   * rows (Phase 2 LOCK — events-only). Kept for regression / quarantine tooling.
   */
  const eventDedupeKeys = new Set(
    eventRows.map((r) => trimText(r.dedupe_key)).filter(Boolean)
  );

  const filteredLegacy = legacyCompatibilityRows.filter((row) => {
    const key = legacyDedupeKey(row);
    if (key && eventDedupeKeys.has(key)) return false;
    return true;
  });

  const merged = [
    ...eventRows,
    ...filteredLegacy.map((row) => ({
      ...row,
      source: row.source ?? ("legacy" as const),
    })),
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
  const bell = trimText(row.bell_presentation_type).toLowerCase();
  if (pushKind === "chat") return pk === "chat" || nt === "chat";
  if (pushKind === "delivery") return pk === "delivery" || (pk === "" && nt === "commerce");
  // Product 「시스템」 tab = persistent system + admin_notice (push_kind notice).
  if (pushKind === "system") {
    return (
      pk === "system" ||
      pk === "notice" ||
      nt === "system" ||
      bell === "admin_notice" ||
      bell === "system_important"
    );
  }
  if (pushKind === "notice") {
    return pk === "notice" || bell === "admin_notice";
  }
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
