/**
 * Gate 3 Step 9 — Push Routing Transport (pure).
 *
 * FCM/APNs is a transport layer only:
 *   FCM Payload → Canonical Event → Authority (A/B/C) → Projection → UI → Native echo
 *
 * FORBIDDEN:
 *   FCM → badge++ / Bell invent / Bottom invent / App Icon invent
 *   Push creating a parallel unread ledger
 *   Owner store push mutating Member A / App Icon
 *
 * DO NOT import Capacitor / Android / iOS runtime here.
 */

import { isOwnerStoreOperationMetaKind } from "@/lib/notifications/badge-authority-rebuild/phase1-authority-contract";

export const PUSH_ROUTING_TRANSPORT = "push_routing_transport_v1" as const;

export type PushRecipientScope = "member" | "store" | "delivery_only";

export type PushAuthorityPipeline =
  | "member_notification_a"
  | "conversation_b"
  | "owner_c"
  | "delivery_only"
  | "call_signaling";

export type PushTransportClassification = Readonly<{
  authority: typeof PUSH_ROUTING_TRANSPORT;
  recipientScope: PushRecipientScope;
  pipeline: PushAuthorityPipeline;
  recipientMemberId: string | null;
  recipientStoreId: string | null;
  /** Absolute App Icon echo only — never a second ledger. */
  badgeCountRole: "absolute_echo";
  /** Tap may mark Member A notification_events read. */
  allowsMemberAReadOnTap: boolean;
  /** Tap alone must NOT zero conversation B (room ACK owns B). */
  allowsConversationBZeroOnTap: false;
  /** Tap must not invent App Icon / Bell / Bottom digits. */
  allowsDirectSurfaceBadgeMutation: false;
}>;

export type PushTransportClassifyInput = Readonly<{
  type?: string | null;
  url?: string | null;
  path?: string | null;
  userId?: string | null;
  recipientMemberId?: string | null;
  recipientStoreId?: string | null;
  storeId?: string | null;
  roomId?: string | null;
  metaKind?: string | null;
  notificationType?: string | null;
  deeplinkResolverKey?: string | null;
  campaignId?: string | null;
  /** admin_marketing_banner / push-only promo without persistent A event */
  pushOnlyPromotion?: boolean | null;
  /** P0 envelope eventClass (admin_notice | admin_marketing | owner_operation). */
  eventClass?: string | null;
  campaignChannel?: string | null;
}>;

function trim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function pathFromInput(input: PushTransportClassifyInput): string {
  const path = trim(input.path) || trim(input.url);
  if (!path) return "";
  if (path.startsWith("/")) return path;
  try {
    const u = new URL(path);
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return path;
  }
}

function looksOwnerAdminPath(path: string): boolean {
  return (
    path.includes("/owner/") ||
    path.startsWith("/business/") ||
    path.includes("/store-admin/") ||
    path.includes("/owner-store")
  );
}

function isCallType(type: string): boolean {
  return (
    type === "incoming_call" ||
    type === "missed_call" ||
    type === "call_canceled" ||
    type === "call_rejected" ||
    type === "call_ended" ||
    type === "call_answered_elsewhere"
  );
}

function isConversationType(type: string): boolean {
  return (
    type === "chat_message" ||
    type === "group_message" ||
    type === "trade_message" ||
    type === "delivery_order"
  );
}

/**
 * Classify FCM/APNs transport into A / B / C / delivery_only / call pipelines.
 */
export function classifyPushTransport(
  input: PushTransportClassifyInput
): PushTransportClassification {
  const type = trim(input.type) || trim(input.notificationType);
  const eventClass = trim(input.eventClass);
  const path = pathFromInput(input);
  const metaKind = trim(input.metaKind);
  const storeId =
    trim(input.recipientStoreId) || trim(input.storeId) || null;
  const memberId = trim(input.recipientMemberId) || trim(input.userId) || null;
  const roomId = trim(input.roomId);

  const base = {
    authority: PUSH_ROUTING_TRANSPORT,
    badgeCountRole: "absolute_echo" as const,
    allowsConversationBZeroOnTap: false as const,
    allowsDirectSurfaceBadgeMutation: false as const,
  };

  if (
    input.pushOnlyPromotion === true ||
    type === "admin_marketing_banner" ||
    eventClass === "admin_marketing"
  ) {
    return {
      ...base,
      recipientScope: "delivery_only",
      pipeline: "delivery_only",
      recipientMemberId: memberId,
      recipientStoreId: null,
      allowsMemberAReadOnTap: false,
    };
  }

  if (eventClass === "owner_operation") {
    return {
      ...base,
      recipientScope: "store",
      pipeline: "owner_c",
      recipientMemberId: null,
      recipientStoreId: storeId,
      allowsMemberAReadOnTap: false,
    };
  }

  if (eventClass === "admin_notice") {
    return {
      ...base,
      recipientScope: "member",
      pipeline: "member_notification_a",
      recipientMemberId: memberId,
      recipientStoreId: null,
      allowsMemberAReadOnTap: true,
    };
  }

  if (isCallType(type)) {
    return {
      ...base,
      recipientScope: "member",
      pipeline: "call_signaling",
      recipientMemberId: memberId,
      recipientStoreId: null,
      allowsMemberAReadOnTap: type === "missed_call",
    };
  }

  const ownerMeta =
    Boolean(metaKind && isOwnerStoreOperationMetaKind(metaKind)) ||
    (metaKind.startsWith("store_order") &&
      (metaKind.includes("owner") || looksOwnerAdminPath(path)));
  if (
    ownerMeta ||
    (storeId && looksOwnerAdminPath(path)) ||
    (type === "delivery_order" && looksOwnerAdminPath(path))
  ) {
    return {
      ...base,
      recipientScope: "store",
      pipeline: "owner_c",
      recipientMemberId: null,
      recipientStoreId: storeId,
      allowsMemberAReadOnTap: false,
    };
  }

  if (
    isConversationType(type) ||
    roomId ||
    path.startsWith("/community-messenger/rooms/") ||
    path.startsWith("/chats/")
  ) {
    // Customer delivery_order (buyer) is conversation B when room-bound; status-only is A.
    if (type === "delivery_order" && !roomId && !path.includes("/community-messenger/rooms/")) {
      return {
        ...base,
        recipientScope: "member",
        pipeline: "member_notification_a",
        recipientMemberId: memberId,
        recipientStoreId: null,
        allowsMemberAReadOnTap: true,
      };
    }
    return {
      ...base,
      recipientScope: "member",
      pipeline: "conversation_b",
      recipientMemberId: memberId,
      recipientStoreId: null,
      allowsMemberAReadOnTap: false,
    };
  }

  return {
    ...base,
    recipientScope: "member",
    pipeline: "member_notification_a",
    recipientMemberId: memberId,
    recipientStoreId: null,
    allowsMemberAReadOnTap: true,
  };
}

/**
 * Gate 2/3 — OS tap may mark Member A only when transport says so.
 * Chat B zeroing requires room timeline mount + read cursor ACK.
 */
export function shouldApplyMemberNotificationReadOnPushTap(input: {
  path?: string | null;
  recipientScope?: string | null;
  pipeline?: string | null;
  type?: string | null;
  eventClass?: string | null;
}): boolean {
  const eventClass = trim(input.eventClass);
  if (eventClass === "owner_operation") return false;
  if (eventClass === "admin_notice" || eventClass === "admin_system" || eventClass === "admin_marketing") return true;

  const scope = trim(input.recipientScope);
  const pipeline = trim(input.pipeline);
  if (scope === "store" || scope === "delivery_only") return false;
  if (pipeline === "conversation_b" || pipeline === "owner_c" || pipeline === "delivery_only") {
    return false;
  }
  if (pipeline === "call_signaling") {
    return trim(input.type) === "missed_call";
  }
  if (pipeline === "member_notification_a") return true;

  return classifyPushTransport({
    path: input.path,
    type: input.type,
    eventClass: input.eventClass,
  }).allowsMemberAReadOnTap;
}

/** Envelope keys Gate 2 requires on FCM data (transport identity). */
export const PUSH_TRANSPORT_ENVELOPE_KEYS = [
  "eventId",
  "eventType",
  "recipientScope",
  "recipientMemberId",
  "recipientStoreId",
  "storeId",
  "chatDomain",
  "roomId",
  "notificationId",
  "targetRoute",
  "dedupeKey",
  "pipeline",
] as const;

/**
 * Apply transport envelope onto FCM data fields (absolute badge echo unchanged).
 */
export function applyPushTransportEnvelope(
  fields: Record<string, unknown>,
  input: PushTransportClassifyInput & {
    eventId?: string | null;
    eventType?: string | null;
    notificationId?: string | null;
    dedupeKey?: string | null;
    chatDomain?: string | null;
  }
): Record<string, unknown> {
  const classified = classifyPushTransport({
    ...input,
    type: input.eventType ?? input.type,
    url: input.path ?? input.url ?? String(fields.url ?? ""),
    storeId: input.storeId ?? (typeof fields.storeId === "string" ? fields.storeId : null),
    roomId: input.roomId ?? (typeof fields.roomId === "string" ? fields.roomId : null),
  });

  const eventId =
    trim(input.eventId) ||
    trim(fields.notificationEventId) ||
    trim(fields.notificationId) ||
    trim(input.notificationId);
  const eventType = trim(input.eventType) || trim(input.type) || trim(fields.type);
  const notificationId =
    trim(input.notificationId) || trim(fields.notificationId) || eventId;
  const targetRoute =
    trim(input.path) || trim(input.url) || trim(fields.url) || trim(fields.routeUrl);
  const roomId =
    trim(input.roomId) || trim(fields.roomId) || trim(fields.room_id) || null;
  const storeId = classified.recipientStoreId;
  const chatDomain = trim(input.chatDomain) || null;
  const dedupeKey = trim(input.dedupeKey) || eventId || notificationId;

  fields.eventId = eventId;
  fields.eventType = eventType;
  fields.recipientScope = classified.recipientScope;
  fields.pipeline = classified.pipeline;
  if (classified.recipientMemberId) {
    fields.recipientMemberId = classified.recipientMemberId;
  }
  if (storeId) {
    fields.recipientStoreId = storeId;
    fields.storeId = storeId;
  }
  if (roomId) fields.roomId = roomId;
  if (chatDomain) fields.chatDomain = chatDomain;
  if (notificationId) fields.notificationId = notificationId;
  if (targetRoute) fields.targetRoute = targetRoute;
  if (dedupeKey) fields.dedupeKey = dedupeKey;

  // badgeCount remains absolute echo — never invent / never relative.
  return fields;
}

/** Forbidden local surface ops from Push transport. */
export const PUSH_FORBIDDEN_SURFACE_OPS = [
  "FCM_BADGE_PLUS_ONE",
  "FCM_BADGE_MINUS_ONE",
  "PUSH_BELL_INVENT",
  "PUSH_BOTTOM_INVENT",
  "PUSH_APP_ICON_INVENT",
  "PUSH_OWNER_TO_MEMBER_A",
] as const;

export function isForbiddenPushSurfaceOp(op: string): boolean {
  return (PUSH_FORBIDDEN_SURFACE_OPS as readonly string[]).includes(op);
}
