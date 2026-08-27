import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationEventRow } from "@/lib/notifications/core/notification-event-schema";
import { buildChatRoomWebPath, buildGroupChatWebPath } from "@/lib/notifications/policy/notification-deeplink-policy";
import { isInAppChatMessageNotificationRow } from "@/lib/notifications/inapp-chat-message-notification";
import { isOwnerStoreCommerceNotificationRow } from "@/lib/notifications/owner-store-commerce-notification-meta";
import { filterOwnerStoreCommerceByStoreId } from "@/lib/notifications/filter-owner-store-commerce-notifications";
import {
  buildNotificationDetailHref,
  defaultInboxFallbackHref,
  isBareNotificationsCenterHref,
} from "@/lib/notifications/resolve-notification-inbox-href";
import type { InboxPushKindFilter } from "@/lib/me/fetch-me-notifications-deduped";
import { resolveSafeNotificationInternalRoute } from "@/lib/notifications/policy/notification-internal-route";
import {
  isCustomerCenterContentType,
  type CustomerCenterContentType,
} from "@/lib/notices/customer-center-content";
import { buildCustomerCenterBoardDetailPath } from "@/lib/notices/customer-center-content-paths";
import { buildCommunityPostNotificationPath } from "@/lib/notifications/community-post-notification-destination";
import { classifyMemberNotificationDomain } from "@/lib/notifications/member-notification-domain";
import { buildOwnerCareAdminNoteRoute } from "@/lib/notifications/member-admin-notes";

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
  /** Community social (comment / like / reply) — not System. */
  | "community_activity"
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
  // Phase 5 Slice 1 — Inquiry/Inbox typed events (Customer Center threads — not notice tab filter).
  if (type === "inquiry_answered" || type === "inbox_message_received") return "cs";
  // Phase 5 Slice 2 — Campaign notice/system typed event.
  if (type === "notice_published") {
    const campaignType = trimText(payload?.campaignType).toLowerCase();
    if (campaignType === "system") return "system";
    return "notice";
  }
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
  const base: Record<string, unknown> =
    legacyMeta && typeof legacyMeta === "object"
      ? { ...(legacyMeta as Record<string, unknown>) }
      : {};
  if (event.type === "missed_call") base.kind = "missed_call";
  const roomKind = trimText(payload?.roomKind);
  if (roomKind) {
    if (roomKind === "group") base.kind = "group_chat";
    else if (roomKind === "trade" || roomKind === "trade_legacy") base.kind = "trade_chat";
    else if (roomKind === "store_order") base.kind = "store_order_message";
    else base.kind = "community_chat";
  }
  if (event.room_id) base.room_id = event.room_id;

  // Preserve Customer Center content bind for destination activate (not notification-only).
  const contentId = trimText(payload?.content_id ?? payload?.appNoticeId ?? payload?.app_notice_id);
  if (contentId) {
    base.content_id = contentId;
    base.appNoticeId = contentId;
  }
  const contentType = trimText(payload?.content_type) || trimText(payload?.campaignType);
  if (contentType) base.content_type = contentType;
  const canonicalRoute = trimText(payload?.canonical_route);
  if (canonicalRoute) base.canonical_route = canonicalRoute;

  return Object.keys(base).length > 0 ? base : null;
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
  // Phase 5 Slice 1 — typed Inquiry/Inbox; Bell presentation stays admin_notice (system tab).
  // Legacy dual-read: admin_notice + previewKind=member_admin_note still handled below.
  if (type === "inquiry_answered" || type === "inbox_message_received") {
    return "admin_notice";
  }
  // Phase 5 Slice 2 — Campaign notice/system; presentation via campaignType (legacy admin_notice dual-read kept).
  if (type === "notice_published") {
    const campaignType = trimText(payload?.campaignType).toLowerCase();
    if (campaignType === "system") return "admin_system";
    return "admin_notice";
  }
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
  if (type === "community_activity") return "community_activity";
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

/**
 * Infer Customer Center board type for content-bound notification destinations.
 * content_id / appNoticeId = app_notices.id (Content SSOT). Never notification event id.
 */
function resolveCustomerCenterContentTypeForDestination(
  event: NotificationEventInboxSource,
  payload: Record<string, unknown> | null
): CustomerCenterContentType | null {
  const explicit = trimText(payload?.content_type);
  if (isCustomerCenterContentType(explicit)) return explicit;
  const campaignType = trimText(payload?.campaignType).toLowerCase();
  if (isCustomerCenterContentType(campaignType)) return campaignType;
  const type = trimText(event.type);
  if (type === "admin_marketing_banner") return "marketing";
  if (type === "admin_system") return "system";
  if (type === "admin_notice" || type === "notice_published") return "notice";
  return null;
}

/**
 * Direct Content Detail href — Push / Bell / Full Inbox share this via link_url + resolveNotificationDestination.
 * No /mypage/notices bridge (that page client-redirects = INTERMEDIATE).
 */
function resolveCustomerCenterBoardHrefFromEvent(
  event: NotificationEventInboxSource
): string | null {
  const payload = payloadRecord(event.display_payload);
  const canonicalRoute = trimText(payload?.canonical_route);
  if (canonicalRoute) {
    return resolveSafeNotificationInternalRoute(canonicalRoute, defaultInboxFallbackHref())!;
  }
  const contentId = trimText(
    payload?.content_id ?? payload?.appNoticeId ?? payload?.app_notice_id
  );
  if (!contentId) return null;
  const contentType = resolveCustomerCenterContentTypeForDestination(event, payload);
  if (!contentType) return null;
  return buildCustomerCenterBoardDetailPath(contentType, contentId);
}

function isNotificationOnlyEvent(event: NotificationEventInboxSource): boolean {
  const payload = payloadRecord(event.display_payload);
  const campaignType = trimText(payload?.campaignType).toLowerCase();
  if (campaignType === "notice" || campaignType === "system" || campaignType === "marketing") {
    return true;
  }
  const type = trimText(event.type);
  return type === "notice_published" || type === "admin_marketing_banner";
}

function notificationOnlyDetailOrFallback(event: NotificationEventInboxSource): string {
  if (!isNotificationOnlyEvent(event)) return defaultInboxFallbackHref();
  return buildNotificationDetailHref(event.id) ?? defaultInboxFallbackHref();
}

export function resolveEventInboxLinkUrl(event: NotificationEventInboxSource): string {
  const payload = payloadRecord(event.display_payload);
  const boardHref = resolveCustomerCenterBoardHrefFromEvent(event);
  if (boardHref) return boardHref;

  /** Phase 3 — Inquiry/Inbox CS path before routeUrl (legacy /notifications/notes poison). */
  const noteThreadIdEarly = trimText(payload?.noteThreadId);
  if (noteThreadIdEarly) {
    const startedBy = trimText(payload?.startedBy) || "member";
    const ownerStoreId = trimText(payload?.ownerStoreId);
    if (ownerStoreId || payload?.ownerCareRoute === true) {
      return buildOwnerCareAdminNoteRoute(noteThreadIdEarly, startedBy, ownerStoreId || null);
    }
    const base = startedBy === "admin" ? "/mypage/inbox" : "/mypage/inquiries";
    return `${base}/${encodeURIComponent(noteThreadIdEarly)}`;
  }
  const routeUrl = trimText(payload?.routeUrl);
  if (routeUrl) {
    if (isBareNotificationsCenterHref(routeUrl)) {
      return notificationOnlyDetailOrFallback(event);
    }
    return resolveSafeNotificationInternalRoute(
      routeUrl,
      defaultInboxFallbackHref()
    )!;
  }
  const linkUrl = trimText(payload?.link_url);
  if (linkUrl) {
    if (isBareNotificationsCenterHref(linkUrl)) {
      return notificationOnlyDetailOrFallback(event);
    }
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
  if (postId) return buildCommunityPostNotificationPath(postId);

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
  if (type === "community_activity") return "/community";

  const tradeProductId =
    trimText(meta?.product_id) ||
    trimText(meta?.item_id) ||
    trimText(meta?.post_id) ||
    trimText(payload?.productId) ||
    trimText(payload?.product_id);
  if (type === "trade_status" || event.category === "trade_status") {
    if (tradeProductId) return `/post/${encodeURIComponent(tradeProductId)}`;
    return "/market";
  }

  if (type === "admin_marketing_banner") {
    const landing = trimText(payload?.deeplinkUrl ?? payload?.webUrl ?? payload?.landing_url);
    if (landing) {
      return resolveSafeNotificationInternalRoute(
        landing,
        defaultInboxFallbackHref()
      )!;
    }
  }

  if (isNotificationOnlyEvent(event)) {
    return notificationOnlyDetailOrFallback(event);
  }

  // Content-bound notice/system/marketing without content id → explicit unavailable (not list hub).
  if (type === "admin_notice" || type === "admin_system" || event.category === "admin_notice") {
    return defaultInboxFallbackHref();
  }

  // Explicit fallback only — never silent bare /notifications.
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
  // Chat is not a member domain filter — keep explicit match.
  if (pushKind === "chat") return pk === "chat" || nt === "chat";
  // Member domain filters: ONE EVENT → ONE DOMAIN (notice ≠ system).
  if (
    pushKind === "notice" ||
    pushKind === "delivery" ||
    pushKind === "trade" ||
    pushKind === "community" ||
    pushKind === "marketing" ||
    pushKind === "system"
  ) {
    return (
      classifyMemberNotificationDomain({
        push_kind: row.push_kind,
        notification_type: row.notification_type,
        type: row.notification_type,
        category: typeof row.meta?.category === "string" ? row.meta.category : null,
        event_type: row.event_type,
        bell_presentation_type: row.bell_presentation_type,
        campaign_type: row.campaign_type,
      }) === pushKind
    );
  }
  return false;
}

/**
 * Eligibility / exclude filters only — no page window.
 * DO NOT apply raw pagination before this (J8 explainability).
 */
export function applyInboxEligibilityFilters(
  rows: InboxNotificationRow[],
  opts: FetchNotificationEventsForInboxOpts
): InboxNotificationRow[] {
  let list = rows;
  if (opts.ownerStoreId) {
    list = filterOwnerStoreCommerceByStoreId(list, opts.ownerStoreId);
  } else if (opts.excludeOwnerList) {
    list = list.filter((r) => !isOwnerStoreCommerceNotificationRow(r));
  }
  if (opts.excludeChatMessageList) {
    list = list.filter((r) => !isInAppChatMessageNotificationRow(r));
  }
  if (opts.inboxPushKind && opts.inboxPushKind !== "all") {
    list = list.filter((r) => matchesInboxPushKind(r, opts.inboxPushKind!));
  }
  return list;
}

export function filterMappedInboxEventRows(
  rows: InboxNotificationRow[],
  opts: FetchNotificationEventsForInboxOpts
): InboxNotificationRow[] {
  const eligible = applyInboxEligibilityFilters(rows, opts);
  if (opts.ownerStoreId) {
    const cap = Math.min(200, Math.max(0, Math.floor(Number(opts.fetchUpper) || 200)));
    return eligible.slice(0, cap);
  }
  const target = Math.max(0, Math.floor(Number(opts.fetchUpper) || 0));
  return eligible.slice(0, target > 0 ? target : eligible.length);
}

/** Raw batch size while scanning for eligible rows after exclude. */
export const INBOX_ELIGIBLE_FILL_BATCH = 80;
/**
 * Scan ceiling while filling eligible rows — aligned with Member A load limit.
 * This is NOT a product display limit (do not treat as "raise limit to 2000").
 */
export const INBOX_ELIGIBLE_FILL_SCAN_MAX = 2000;

/**
 * Consume newest-first batches → eligibility/exclude → dedupe first-win
 * until `target` eligible rows or batches exhausted.
 *
 * CONTRACT (J8): page window is applied to eligible rows, never to raw recent N.
 */
export function fillEligibleInboxRowsUntilLimit(
  batches: readonly InboxNotificationRow[][],
  opts: FetchNotificationEventsForInboxOpts,
  target: number
): InboxNotificationRow[] {
  const want = Math.max(0, Math.min(INBOX_ELIGIBLE_FILL_SCAN_MAX, Math.floor(Number(target) || 0)));
  if (want <= 0) return [];

  const seenIds = new Set<string>();
  const seenDedupe = new Set<string>();
  const out: InboxNotificationRow[] = [];

  for (const batch of batches) {
    const eligible = applyInboxEligibilityFilters(batch, opts);
    for (const row of eligible) {
      const id = trimText(row.id);
      if (!id || seenIds.has(id)) continue;
      const dk = trimText(row.dedupe_key);
      if (dk) {
        if (seenDedupe.has(dk)) continue;
        seenDedupe.add(dk);
      }
      seenIds.add(id);
      out.push(row);
      if (out.length >= want) return out;
    }
  }
  return out;
}

function mapRawNotificationEventRows(data: unknown[]): InboxNotificationRow[] {
  return (data ?? [])
    .filter((row) => !INBOX_EXCLUDED_EVENT_TYPES.has(trimText((row as NotificationEventInboxSource).type)))
    .filter((row) => !isInboxDismissedNotificationEvent(row as NotificationEventInboxSource))
    .map((row) => mapNotificationEventToInboxRow(row as NotificationEventInboxSource));
}

/**
 * Bell / NC inbox list loader.
 * Fills eligible visible rows after chat/owner exclude — not a single raw `limit(N)` cut.
 */
export async function fetchNotificationEventsForInbox(
  sb: SupabaseClient,
  userId: string,
  opts: FetchNotificationEventsForInboxOpts
): Promise<InboxNotificationRow[]> {
  const uid = userId.trim();
  if (!uid) return [];

  const target = Math.max(
    1,
    Math.min(INBOX_ELIGIBLE_FILL_SCAN_MAX, Math.floor(Number(opts.fetchUpper) || 80))
  );

  const seenIds = new Set<string>();
  const seenDedupe = new Set<string>();
  const filled: InboxNotificationRow[] = [];
  let offset = 0;

  while (filled.length < target && offset < INBOX_ELIGIBLE_FILL_SCAN_MAX) {
    const batchSize = Math.min(INBOX_ELIGIBLE_FILL_BATCH, INBOX_ELIGIBLE_FILL_SCAN_MAX - offset);
    const { data, error } = await sb
      .from("notification_events")
      .select("id, type, category, title, body, display_payload, read_at, created_at, dedupe_key, room_id")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .range(offset, offset + batchSize - 1);

    if (error) {
      if (error.message?.includes("notification_events") && error.message.includes("does not exist")) {
        return filled;
      }
      console.warn("[fetchNotificationEventsForInbox]", error.message);
      return filled;
    }

    const raw = data ?? [];
    if (raw.length === 0) break;
    offset += raw.length;

    const mapped = mapRawNotificationEventRows(raw);
    const eligible = applyInboxEligibilityFilters(mapped, opts);
    for (const row of eligible) {
      const id = trimText(row.id);
      if (!id || seenIds.has(id)) continue;
      const dk = trimText(row.dedupe_key);
      if (dk) {
        if (seenDedupe.has(dk)) continue;
        seenDedupe.add(dk);
      }
      seenIds.add(id);
      filled.push(row);
      if (filled.length >= target) break;
    }

    if (raw.length < batchSize) break;
  }

  return filled.slice(0, target);
}
